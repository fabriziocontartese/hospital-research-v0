const jwt = require('jsonwebtoken');
const argon2 = require('argon2');
const crypto = require('crypto');
const config = require('../config/env');

const signAccessToken = (user) => {
  const payload = {
    sub: user._id.toString(),
    role: user.role,
    orgId: user.orgId ? user.orgId.toString() : null,
  };

  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessTtl,
  });
};

const createRefreshToken = async (user) => {
  const tokenId = crypto.randomUUID();
  const payload = {
    sub: user._id.toString(),
    tid: tokenId,
    role: user.role,
    orgId: user.orgId ? user.orgId.toString() : null,
  };

  const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshTtl,
  });

  const decoded = jwt.decode(refreshToken);
  const expiresAt = decoded && decoded.exp ? new Date(decoded.exp * 1000) : null;
  const tokenHash = await argon2.hash(refreshToken);

  user.refreshTokens = (user.refreshTokens || []).filter((item) => {
    if (!item.expiresAt) return true;
    return item.expiresAt > new Date();
  });
  user.refreshTokens.push({
    tokenId,
    tokenHash,
    createdAt: new Date(),
    expiresAt,
  });

  await user.save();

  return refreshToken;
};

const verifyAccessToken = (token) => jwt.verify(token, config.jwt.accessSecret);

const verifyRefreshToken = async (refreshToken, user) => {
  const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
  if (!decoded?.tid) {
    throw new Error('Invalid refresh token');
  }
  const entry = (user.refreshTokens || []).find((item) => item.tokenId === decoded.tid);
  if (!entry) {
    throw new Error('Refresh token revoked');
  }
  const matches = await argon2.verify(entry.tokenHash, refreshToken);
  if (!matches) {
    throw new Error('Refresh token mismatch');
  }

  return decoded;
};

const revokeRefreshToken = async (user, tokenId) => {
  user.refreshTokens = (user.refreshTokens || []).filter((item) => item.tokenId !== tokenId);
  await user.save();
};

const revokeAllRefreshTokens = async (user) => {
  user.refreshTokens = [];
  await user.save();
};

module.exports = {
  signAccessToken,
  createRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
};
