const express = require('express');
const { z } = require('zod');
const crypto = require('crypto');
const argon2 = require('argon2');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { validateBody, validateQuery } = require('../utils/validate');

const router = express.Router();

const listQuerySchema = z.object({
  role: z.enum(['admin', 'researcher', 'staff']).optional(),
  orgId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid orgId').optional(),
  isActive: z
    .string()
    .transform((value) => {
      if (value === undefined) return undefined;
      return value === 'true';
    })
    .optional(),
});

router.get(
  '/',
  auth,
  requireRole('admin', 'researcher'),
  validateQuery(listQuerySchema),
  async (req, res, next) => {
    try {
      const filter = {};
      if (req.user.role === 'superadmin') {
        if (req.validatedQuery.orgId) {
          filter.orgId = req.validatedQuery.orgId;
        }
      } else {
        filter.orgId = req.user.orgId;
      }

      if (req.user.role === 'researcher') {
        // Researchers can only list staff to handle assignments
        if (req.validatedQuery.role && req.validatedQuery.role !== 'staff') {
          const error = new Error('Forbidden');
          error.status = 403;
          throw error;
        }
        filter.role = 'staff';
      } else if (req.validatedQuery.role) {
        filter.role = req.validatedQuery.role;
      }

      if (typeof req.validatedQuery.isActive === 'boolean') {
        filter.isActive = req.validatedQuery.isActive;
      }

      const selection =
        req.user.role === 'researcher'
          ? 'displayName email role category isActive'
          : '-passwordHash -refreshTokens';
      const users = await User.find(filter).select(selection);
      res.json({ users });
    } catch (error) {
      next(error);
    }
  }
);

const createSchema = z.object({
  email: z.string().email(),
  role: z.enum(['researcher', 'staff']),
  displayName: z.string().min(2),
  category: z.string().max(120).optional(),
});

router.post(
  '/',
  auth,
  requireRole('admin'),
  validateBody(createSchema),
  async (req, res, next) => {
    try {
      if (req.user.role === 'superadmin') {
        const error = new Error('Super admins must specify an organization to create users.');
        error.status = 400;
        throw error;
      }
      const { email, role, displayName } = req.validatedBody;
      const existing = await User.findOne({ email: email.toLowerCase() });
      if (existing) {
        const error = new Error('Email already in use');
        error.status = 409;
        throw error;
      }

      const tempPassword = crypto.randomBytes(6).toString('base64url');
      const passwordHash = await argon2.hash(tempPassword);

      const user = await User.create({
        email: email.toLowerCase(),
        role,
        displayName,
        category: req.validatedBody.category,
        passwordHash,
        orgId: req.user.orgId,
        isActive: true,
      });

      // eslint-disable-next-line no-console
      console.log('[invite:user]', {
        email: user.email,
        tempPassword,
      });

      res.status(201).json({
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          displayName: user.displayName,
          isActive: user.isActive,
          category: user.category,
        },
        tempPassword: process.env.NODE_ENV === 'production' ? undefined : tempPassword,
      });
    } catch (error) {
      next(error);
    }
  }
);

const updateSchema = z.object({
  role: z.enum(['researcher', 'staff', 'admin']).optional(),
  isActive: z.boolean().optional(),
  displayName: z.string().min(2).optional(),
  category: z.union([z.string().max(120), z.null()]).optional(),
  email: z.string().email().optional(),
});

router.patch(
  '/:id',
  auth,
  requireRole('admin'),
  validateBody(updateSchema),
  async (req, res, next) => {
    try {
      if (req.user.role === 'superadmin') {
        const error = new Error('Super admins must manage admins through the dedicated endpoints.');
        error.status = 400;
        throw error;
      }
      const { id } = req.params;
      const user = await User.findOne({ _id: id, orgId: req.user.orgId });
      if (!user) {
        const error = new Error('User not found');
        error.status = 404;
        throw error;
      }

      if (
        typeof req.validatedBody.isActive === 'boolean' &&
        String(user._id) === String(req.user._id) &&
        req.validatedBody.isActive === false
      ) {
        const error = new Error('You cannot deactivate your own account.');
        error.status = 400;
        throw error;
      }

      if (req.validatedBody.role) {
        user.role = req.validatedBody.role;
      }
      if (typeof req.validatedBody.isActive === 'boolean') {
        user.isActive = req.validatedBody.isActive;
      }
      if (req.validatedBody.displayName) {
        user.displayName = req.validatedBody.displayName;
      }
      if (Object.prototype.hasOwnProperty.call(req.validatedBody, 'category')) {
        user.category = req.validatedBody.category || undefined;
      }
      if (req.validatedBody.email) {
        const nextEmail = req.validatedBody.email.toLowerCase();
        if (nextEmail !== user.email) {
          const existing = await User.findOne({
            email: nextEmail,
            orgId: req.user.orgId,
            _id: { $ne: user._id },
          });
          if (existing) {
            const error = new Error('Email already in use');
            error.status = 409;
            throw error;
          }
          user.email = nextEmail;
        }
      }

      await user.save();
      res.json({
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          displayName: user.displayName,
          isActive: user.isActive,
          category: user.category,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/:id',
  auth,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      if (req.user.role === 'superadmin') {
        const error = new Error('Super admins must manage admins through the dedicated endpoints.');
        error.status = 400;
        throw error;
      }
      const { id } = req.params;
      const user = await User.findOne({ _id: id, orgId: req.user.orgId });
      if (!user) {
        const error = new Error('User not found');
        error.status = 404;
        throw error;
      }

      if (String(user._id) === String(req.user._id)) {
        const error = new Error('You cannot delete your own account.');
        error.status = 400;
        throw error;
      }

      await User.deleteOne({ _id: id, orgId: req.user.orgId });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
