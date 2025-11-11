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
} = require('../utils/jwt');

const { validateBody } = require('../utils/validate');

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

/**
 * Gate: allow superadmin always.
 * For non-superadmin, require a valid org that isActive === true.
 * We do NOT require org.status === 'approved' to avoid blocking fresh orgs.
 */
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
      // eslint-disable-next-line no-console
      console.info('[auth:login] attempt', {
        body: req.body,
        headers: {
          origin: req.headers.origin,
          referer: req.headers.referer,
          'user-agent': req.headers['user-agent'],
        },
      });

      const { email, password } = req.validatedBody;
      // eslint-disable-next-line no-console
      console.info('[auth:login] validatedBody', { email, bodyKeys: Object.keys(req.body || {}) });

      const user = await User.findOne({ email: email.toLowerCase() });

      if (!user || !user.isActive) {
        const error = new Error('Invalid credentials');
        error.status = 401;
        throw error;
      }

      if (!user.passwordHash) {
        // eslint-disable-next-line no-console
        console.warn('[auth:login] missing password hash', {
          userId: user._id,
          email: user.email,
        });
        const error = new Error('Invalid credentials');
        error.status = 401;
        throw error;
      }

      let passwordValid = false;
      try {
        passwordValid = await argon2.verify(user.passwordHash, password);
      } catch (_verifyError) {
        const error = new Error('Invalid credentials');
        error.status = 401;
        throw error;
      }
      if (!passwordValid) {
        const error = new Error('Invalid credentials');
        error.status = 401;
        throw error;
      }

      await ensureActiveOrganization(user);

      const accessToken = signAccessToken(user);
      const refreshToken = await createRefreshToken(user);

      // eslint-disable-next-line no-console
      console.info('[auth:login] success', {
        userId: user._id,
        role: user.role,
        orgId: user.orgId,
      });

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
      // eslint-disable-next-line no-console
      console.error('[auth:login] failed', {
        message: error.message,
        stack: error.stack,
        status: error.status,
        code: error.code,
      });
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
      // eslint-disable-next-line no-console
      console.info('[auth:refresh] attempt', {
        headers: {
          origin: req.headers.origin,
          referer: req.headers.referer,
          'user-agent': req.headers['user-agent'],
        },
      });

      const { refreshToken } = req.validatedBody;
      const decoded = jwt.decode(refreshToken);
      if (!decoded?.sub) {
        const error = new Error('Invalid session');
        error.status = 401;
        throw error;
      }
      const user = await User.findById(decoded.sub);
      if (!user) {
        const error = new Error('Invalid session');
        error.status = 401;
        throw error;
      }
      if (!user.isActive) {
        const error = new Error('Account disabled');
        error.status = 401;
        throw error;
      }

      await ensureActiveOrganization(user);

      const verified = await verifyRefreshToken(refreshToken, user);

      // rotate
      const accessToken = signAccessToken(user);
      const newRefreshToken = await createRefreshToken(user);

      // revoke the one we just used
      const { revokeRefreshToken } = require('../utils/jwt');
      await revokeRefreshToken(user, verified.tid);

      // eslint-disable-next-line no-console
      console.info('[auth:refresh] success', {
        userId: user._id,
        role: user.role,
        orgId: user.orgId,
      });

      res.json({ accessToken, refreshToken: newRefreshToken });
    } catch (error) {
      const normalized = normalizeDbError(error);
      normalized.status = normalized.status || 401;
      // eslint-disable-next-line no-console
      console.error('[auth:refresh] failed', {
        message: normalized.message,
        stack: normalized.stack,
        status: normalized.status,
        code: normalized.code,
      });
      next(normalized);
    }
  }
);

router.post(
  '/logout',
  validateBody(refreshSchema),
  async (req, res, next) => {
    try {
      // eslint-disable-next-line no-console
      console.info('[auth:logout] attempt', {
        headers: {
          origin: req.headers.origin,
          referer: req.headers.referer,
          'user-agent': req.headers['user-agent'],
        },
      });

      const { refreshToken } = req.validatedBody;
      const decoded = jwt.decode(refreshToken);
      if (!decoded?.sub) {
        return res.status(200).json({ ok: true });
      }
      const user = await User.findById(decoded.sub);
      if (!user) {
        return res.status(200).json({ ok: true });
      }
      const { verifyRefreshToken, revokeRefreshToken } = require('../utils/jwt');
      const verified = await verifyRefreshToken(refreshToken, user);
      await revokeRefreshToken(user, verified.tid);
      // eslint-disable-next-line no-console
      console.info('[auth:logout] success', { userId: user._id });
      return res.json({ ok: true });
    } catch (error) {
      const normalized = normalizeDbError(error);
      // eslint-disable-next-line no-console
      console.error('[auth:logout] failed', {
        message: normalized.message,
        stack: normalized.stack,
        status: normalized.status,
        code: normalized.code,
      });
      return next(normalized);
    }
  }
);

module.exports = router;
