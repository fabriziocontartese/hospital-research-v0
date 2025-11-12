const { verifyAccessToken } = require('../utils/jwt');
const User = require('../models/User');
const Organization = require('../models/Organization');

const authMiddleware = async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    const error = new Error('Authentication required');
    error.status = 401;
    return next(error);
  }

  try {
    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.sub);
    if (!user || !user.isActive) {
      const error = new Error('Invalid user session');
      error.status = 401;
      throw error;
    }

    if (user.role !== 'superadmin') {
      const org = await Organization.findById(user.orgId);
      // Allow any active org; do not require status === 'approved'
      if (!org || !org.isActive) {
        const error = new Error('Organization is not active');
        error.status = 403;
        throw error;
      }
    }

    req.auth = decoded;
    req.user = user;
    return next();
  } catch (err) {
    const error = new Error(err.message || 'Invalid or expired token');
    error.status = err.status || 401;
    return next(error);
  }
};

module.exports = authMiddleware;
