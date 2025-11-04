const { verifyAccessToken } = require('../utils/jwt');
const User = require('../models/User');
const Organization = require('../models/Organization');

const authMiddleware = async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    console.error('No Authorization header or invalid format'); // Debugging log
    const error = new Error('Authentication required');
    error.status = 401;
    return next(error);
  }

  console.log('Received token:', token); // Debugging log

  try {
    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.sub);
    if (!user || !user.isActive) {
      console.error('Invalid user session'); // Debugging log
      const error = new Error('Invalid user session');
      error.status = 401;
      throw error;
    }
    if (user.role !== 'superadmin') {
      const org = await Organization.findById(user.orgId);
      if (!org || !org.isActive || org.status !== 'approved') {
        console.error('Organization is not active'); // Debugging log
        const error = new Error('Organization is not active');
        error.status = 403;
        throw error;
      }
    }
    req.auth = decoded;
    req.user = user;
    return next();
  } catch (err) {
    console.error('Token verification failed:', err.message); // Debugging log
    const error = new Error('Invalid or expired token');
    error.status = 401;
    return next(error);
  }
};

module.exports = authMiddleware;
