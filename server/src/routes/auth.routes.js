const express = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const Organization = require('../models/Organization');

const {
  signAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
} = require('../utils/jwt');

const { validateBody } = require('../utils/validate');

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const ensureActiveOrganization = async (user) => {
  if (user.role === 'superadmin') return;

  if (!user.orgId) {
    const error = new Error('Organization is not active');
    error.status = 403;
    throw error;
  }

  let organization;
  try {
    organization = await Organization.findById(user.orgId);
  } catch (lookupError) {
    if (lookupError?.name === 'CastError') {
      const error = new Error('Organization is not active');
      error.status = 403;
      throw error;
    }
    throw lookupError;
  }

  if (!organization || !organization.isActive) {
    const error = new Error('Organization is not active');
    error.status = 403;
    throw error;
  }
};

const normalizeDbError = (error) => {
  if (error instanceof mongoose.Error && !error.status) {
    const normalized = error;
    normalized.status = 503;
    normalized.code = 'database_unavailable';
    normalized.details = [
      {
        path: 'database',
        message: error.message,
        error: error.name,
      },
    ];
    normalized.originalMessage = error.message;
    normalized.message = 'Database is currently unavailable';
    return normalized;
  }
  return error;
};

router.post(
  '/login',
  validateBody(loginSchema),
  async (req, res, next) => {
    try {
      const { email, password } = req.validatedBody;

      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user || !user.isActive) {
        const error = new Error('Invalid credentials');
        error.status = 401;
        throw error;
      }
      if (!user.passwordHash) {
        const error = new Error('Invalid credentials');
        error.status = 401;
        throw error;
      }

      const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
      if (!ok) {
        const error = new Error('Invalid credentials');
        error.status = 401;
        throw error;
      }

      await ensureActiveOrganization(user);

      const accessToken = signAccessToken(user);
      const refreshToken = await createRefreshToken(user);

      res.json({
        accessToken,
        refreshToken,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          displayName: user.displayName,
          orgId: user.orgId,
        },
      });
    } catch (error) {
      next(normalizeDbError(error));
    }
  }
);

const refreshSchema = z.object({
  refreshToken: z.string(),
});

router.post(
  '/refresh',
  validateBody(refreshSchema),
  async (req, res, next) => {
    try {
      const { refreshToken } = req.validatedBody;
      const decoded = jwt.decode(refreshToken);
      if (!decoded?.sub) {
        const error = new Error('Invalid session');
        error.status = 401;
        throw error;
      }
      const user = await User.findById(decoded.sub);
      if (!user || !user.isActive) {
        const error = new Error('Invalid session');
        error.status = 401;
        throw error;
      }

      await ensureActiveOrganization(user);

      const verified = await verifyRefreshToken(refreshToken, user);

      const accessToken = signAccessToken(user);
      const newRefreshToken = await createRefreshToken(user);

      await revokeRefreshToken(user, verified.tid);

      res.json({ accessToken, refreshToken: newRefreshToken });
    } catch (error) {
      const normalized = normalizeDbError(error);
      normalized.status = normalized.status || 401;
      next(normalized);
    }
  }
);

router.post(
  '/logout',
  validateBody(refreshSchema),
  async (req, res, next) => {
    try {
      const { refreshToken } = req.validatedBody;
      const decoded = jwt.decode(refreshToken);
      if (!decoded?.sub) return res.status(200).json({ ok: true });

      const user = await User.findById(decoded.sub);
      if (!user) return res.status(200).json({ ok: true });

      const verified = await verifyRefreshToken(refreshToken, user);
      await revokeRefreshToken(user, verified.tid);

      return res.json({ ok: true });
    } catch (error) {
      next(normalizeDbError(error));
    }
  }
);

module.exports = router;
