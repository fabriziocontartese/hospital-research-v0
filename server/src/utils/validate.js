const { ZodError } = require('zod');

const parseSchema = (schema, data) => {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const details = error.errors.map((err) => ({
        path: err.path.join('.'),
        message: err.message,
      }));
      const validationError = new Error('ValidationError');
      validationError.status = 400;
      validationError.details = details;
      throw validationError;
    }
    throw error;
  }
};

const validateBody = (schema) => (req, _res, next) => {
  try {
    req.validatedBody = parseSchema(schema, req.body);
    return next();
  } catch (error) {
    return next(error);
  }
};

const validateQuery = (schema) => (req, _res, next) => {
  try {
    req.validatedQuery = parseSchema(schema, req.query);
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  parseSchema,
  validateBody,
  validateQuery,
};
