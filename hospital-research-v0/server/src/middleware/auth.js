const { verifyAccessToken } = require('../utils/jwt');
const User = require('../models/User');

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
    req.auth = decoded;
    req.user = user;
    return next();
  } catch (err) {
    const error = new Error('Invalid or expired token');
    error.status = 401;
    return next(error);
  }
};

module.exports = authMiddleware;
