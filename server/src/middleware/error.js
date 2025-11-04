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
  const showDebugMessage = status >= 500 && process.env.NODE_ENV !== 'production';
  const message =
    showDebugMessage || status < 500 ? err.message || 'Request failed' : 'Internal server error';

  if (process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.error('[error-handler]', {
      message: err.message,
      stack: err.stack,
      status: err.status,
      code: err.code,
      details: err.details,
    });
  }

  const response = {
    error: message,
    code,
    details: status < 500 ? err.details : undefined,
  };

  if (status >= 500 && process.env.NODE_ENV !== 'production') {
    response.details = err.details || [
      {
        message: err.message,
      },
    ];
    response.debug = {
      message: err.message,
      stack: err.stack,
      status: err.status,
      code: err.code,
    };
  }

  res.status(status).json(response);
};

module.exports = {
  notFoundHandler,
  errorHandler,
};
