const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const config = require('./config/env');
const authRoutes = require('./routes/auth.routes');
const orgRoutes = require('./routes/org.routes');
const usersRoutes = require('./routes/users.routes');
const patientsRoutes = require('./routes/patients.routes');
const studiesRoutes = require('./routes/studies.routes');
const formsRoutes = require('./routes/forms.routes');
const tasksRoutes = require('./routes/tasks.routes');
const superadminRoutes = require('./routes/superadmin.routes');
const { notFoundHandler, errorHandler } = require('./middleware/error');

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

const corsOptions = {
  origin(origin, callback) {
    if (!origin || config.corsAllowlist.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(
  helmet({
    contentSecurityPolicy: config.nodeEnv === 'production' ? undefined : false,
    crossOriginResourcePolicy: false,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const sanitizeRequest = (req, _res, next) => {
  const fieldsToSanitize = ['body', 'params', 'headers'];
  fieldsToSanitize.forEach((key) => {
    if (req[key]) {
      mongoSanitize.sanitize(req[key]);
    }
  });
  if (req.query) {
    mongoSanitize.sanitize(req.query);
  }
  next();
};

app.use(sanitizeRequest);

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many attempts, please try again later.',
});

if (config.nodeEnv !== 'test') {
  app.use(globalLimiter);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/refresh', authLimiter);
}

if (config.nodeEnv !== 'test') {
  app.use(morgan('dev'));
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/org', orgRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/patients', patientsRoutes);
app.use('/api/studies', studiesRoutes);
app.use('/api/forms', formsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/superadmin', superadminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
