const express = require('express');
const { z } = require('zod');
const Organization = require('../models/Organization');
const User = require('../models/User');
const { validateBody } = require('../utils/validate');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();

const registerSchema = z.object({
  name: z.string().min(3),
  country: z.string().min(2),
  contactEmail: z.string().email(),
  message: z.string().max(1000).optional(),
});

router.post(
  '/register',
  validateBody(registerSchema),
  async (req, res, next) => {
    try {
      const org = await Organization.create({
        ...req.validatedBody,
        status: 'pending',
        isActive: false,
      });
      res.status(202).json({
        id: org._id,
        status: org.status,
      });
    } catch (error) {
      next(error);
    }
  }
);

const statusSchema = z.object({
  status: z.enum(['approved', 'rejected', 'pending', 'suspended']).optional(),
});

router.patch(
  '/:id/status',
  auth,
  requireRole('admin'),
  validateBody(statusSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      if (req.user.role !== 'superadmin' && String(req.user.orgId) !== id) {
        const error = new Error('Forbidden');
        error.status = 403;
        throw error;
      }

      const updates = {
        status: req.validatedBody.status || 'approved',
      };

      if (updates.status === 'rejected' || updates.status === 'suspended') {
        updates.isActive = false;
      } else if (updates.status === 'approved') {
        updates.isActive = true;
      }

      const org = await Organization.findByIdAndUpdate(
        id,
        updates,
        { new: true }
      );

      if (!org) {
        const error = new Error('Organization not found');
        error.status = 404;
        throw error;
      }

      if (Object.prototype.hasOwnProperty.call(updates, 'isActive')) {
        if (updates.isActive === false) {
          await User.updateMany({ orgId: org._id }, { $set: { isActive: false, refreshTokens: [] } });
        } else if (updates.isActive === true) {
          await User.updateMany({ orgId: org._id }, { $set: { isActive: true } });
        }
      }

      res.json({ id: org._id, status: org.status });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
