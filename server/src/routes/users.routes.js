const express = require('express');
const { z } = require('zod');
const crypto = require('crypto');
const argon2 = require('argon2');
const mongoose = require('mongoose');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { validateBody, validateQuery } = require('../utils/validate');
const { revokeAllRefreshTokens } = require('../utils/jwt');

const router = express.Router();

/* ---------------- list ---------------- */

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

/* ---------------- create ---------------- */

const createSchema = z.object({
  email: z.string().email(),
  role: z.enum(['researcher', 'staff', 'admin']).default('researcher'),
  displayName: z.string().min(2),
  category: z.string().max(120).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
});

router.post(
  '/',
  auth,
  requireRole('admin'),
  validateBody(createSchema),
  async (req, res, next) => {
    try {
      // org scoping: admins must belong to an org; superadmin can also create (any org not auto-assigned)
      const { email, role, displayName, category, password } = req.validatedBody;

      const existing = await User.findOne({ email: email.toLowerCase() });
      if (existing) {
        const error = new Error('Email already in use');
        error.status = 409;
        throw error;
      }

      let tempPassword = null;
      const finalPassword =
        typeof password === 'string' && password.trim().length >= 8
          ? password.trim()
          : (tempPassword = generateTempPassword());

      const passwordHash = await argon2.hash(finalPassword);

      const doc = {
        email: email.toLowerCase(),
        role,
        displayName,
        category,
        passwordHash,
        isActive: true,
      };

      if (req.user.role !== 'superadmin') {
        doc.orgId = req.user.orgId;
      }

      const user = await User.create(doc);

      // eslint-disable-next-line no-console
      console.log('[invite:user]', { email: user.email, tempPassword: tempPassword || '(custom set)' });

      res.status(201).json({
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          displayName: user.displayName,
          isActive: user.isActive,
          category: user.category,
        },
        tempPassword:
          tempPassword && process.env.NODE_ENV !== 'production' ? tempPassword : undefined,
      });
    } catch (error) {
      next(error);
    }
  }
);

function generateTempPassword() {
  // 14 chars, mixed classes, no ambiguous Base64 symbols
  const raw = crypto.randomBytes(12).toString('base64').replace(/[+/=]/g, '');
  const sets = [
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'abcdefghijklmnopqrstuvwxyz',
    '0123456789',
    '!@#$%^&*()-_=+[]{}:,<.>/?',
  ];
  const picks = sets.map((set) => set[Math.floor(Math.random() * set.length)]).join('');
  return (raw + picks).split('').sort(() => Math.random() - 0.5).join('').slice(0, 14);
}

/* ---------------- reset password ---------------- */

router.post(
  '/:id/reset-password',
  auth,
  requireRole('admin'), // admin or superadmin
  async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!mongoose.isValidObjectId(id)) {
        const e = new Error('Invalid user id');
        e.status = 400;
        throw e;
      }

      // scope: admins → same org; superadmin → any
      const finder =
        req.user.role === 'superadmin'
          ? { _id: id }
          : { _id: id, orgId: req.user.orgId };

      const target = await User.findOne(finder);
      if (!target) {
        const e = new Error('User not found');
        e.status = 404;
        throw e;
      }

      // avoid self-lock
      if (String(target._id) === String(req.user._id)) {
        const e = new Error('Use your Account page to change your own password.');
        e.status = 400;
        throw e;
      }

      const tempPassword = generateTempPassword();
      target.passwordHash = await argon2.hash(tempPassword);
      await revokeAllRefreshTokens(target); // invalidate sessions
      await target.save();

      // eslint-disable-next-line no-console
      console.log('[reset:user-password]', { email: target.email });

      return res.json({
        ok: true,
        user: { id: target._id, email: target.email },
        tempPassword: process.env.NODE_ENV !== 'production' ? tempPassword : undefined,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/* ---------------- update ---------------- */

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
      const { id } = req.params;

      const finder =
        req.user.role === 'superadmin'
          ? { _id: id }
          : { _id: id, orgId: req.user.orgId };

      const user = await User.findOne(finder);
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
            _id: { $ne: user._id },
            ...(req.user.role === 'superadmin' ? {} : { orgId: req.user.orgId }),
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

/* ---------------- delete ---------------- */

router.delete(
  '/:id',
  auth,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const finder =
        req.user.role === 'superadmin'
          ? { _id: id }
          : { _id: id, orgId: req.user.orgId };

      const user = await User.findOne(finder);
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

      await User.deleteOne(finder);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
