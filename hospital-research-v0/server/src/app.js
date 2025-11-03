const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const config = require('./config/env');
const authRoutes = require('./routes/auth.routes');
const orgRoutes = require('./routes/org.routes');
const usersRoutes = require('./routes/users.routes');
const patientsRoutes = require('./routes/patients.routes');
const studiesRoutes = require('./routes/studies.routes');
const formsRoutes = require('./routes/forms.routes');
const tasksRoutes = require('./routes/tasks.routes');
const { notFoundHandler, errorHandler } = require('./middleware/error');

const app = express();

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
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

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

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
