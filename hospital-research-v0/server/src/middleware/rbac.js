const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) {
    const error = new Error('Authentication required');
    error.status = 401;
    return next(error);
  }

  if (!roles.includes(req.user.role)) {
    const error = new Error('Forbidden');
    error.status = 403;
    return next(error);
  }

  return next();
};

const scopeStudyAccess = (user, baseQuery = {}) => {
  if (!user) {
    throw new Error('User context missing');
  }

  if (user.role === 'admin') {
    return {
      ...baseQuery,
      orgId: user.orgId,
    };
  }

  if (user.role === 'researcher') {
    return {
      ...baseQuery,
      orgId: user.orgId,
      $or: [{ createdBy: user._id }, { assignedStaff: user._id }],
    };
  }

  return {
    ...baseQuery,
    orgId: user.orgId,
    assignedStaff: user._id,
  };
};

const ensureOrgAccess = (user, resourceOrgId) => {
  if (!user) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  if (!resourceOrgId || user.role === 'admin') {
    return;
  }

  if (user.orgId && resourceOrgId && user.orgId.toString() !== resourceOrgId.toString()) {
    const error = new Error('Forbidden');
    error.status = 403;
    throw error;
  }
};

module.exports = {
  requireRole,
  scopeStudyAccess,
  ensureOrgAccess,
};
