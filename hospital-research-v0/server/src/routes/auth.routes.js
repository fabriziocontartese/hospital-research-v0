const express = require('express');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const User = require('../models/User');
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

      const passwordValid = await argon2.verify(user.passwordHash, password);
      if (!passwordValid) {
        const error = new Error('Invalid credentials');
        error.status = 401;
        throw error;
      }

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
      next(error);
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
      if (!user) {
        const error = new Error('Invalid session');
        error.status = 401;
        throw error;
      }
      const verified = await verifyRefreshToken(refreshToken, user);
      await revokeRefreshToken(user, verified.tid);

      const accessToken = signAccessToken(user);
      const newRefreshToken = await createRefreshToken(user);
      res.json({ accessToken, refreshToken: newRefreshToken });
    } catch (error) {
      error.status = error.status || 401;
      next(error);
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
      if (!decoded?.sub) {
        return res.status(200).json({ ok: true });
      }
      const user = await User.findById(decoded.sub);
      if (!user) {
        return res.status(200).json({ ok: true });
      }
      const verified = await verifyRefreshToken(refreshToken, user);
      await revokeRefreshToken(user, verified.tid);
      return res.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;
