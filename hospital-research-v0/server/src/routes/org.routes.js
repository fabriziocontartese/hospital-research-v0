const express = require('express');
const { z } = require('zod');
const Organization = require('../models/Organization');
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
  status: z.enum(['approved', 'rejected', 'pending']).optional(),
});

router.patch(
  '/:id/status',
  auth,
  requireRole('admin'),
  validateBody(statusSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const org = await Organization.findByIdAndUpdate(
        id,
        { status: req.validatedBody.status || 'approved' },
        { new: true }
      );

      if (!org) {
        const error = new Error('Organization not found');
        error.status = 404;
        throw error;
      }

      res.json({ id: org._id, status: org.status });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
