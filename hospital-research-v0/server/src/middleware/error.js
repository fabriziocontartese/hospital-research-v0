const notFoundHandler = (_req, res) => {
  res.status(404).json({
    error: 'Not Found',
    code: 'not_found',
  });
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, _req, res, _next) => {
  const status = err.status || 500;
  const code = err.code || (status >= 500 ? 'internal_error' : 'request_error');

  res.status(status).json({
    error: err.message || 'Unexpected error',
    code,
    details: err.details,
  });
};

module.exports = {
  notFoundHandler,
  errorHandler,
};
