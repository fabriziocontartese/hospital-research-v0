const dotenv = require('dotenv');

dotenv.config();

const requiredEnv = (key, defaultValue) => {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required env var ${key}`);
  }
  return value;
};

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  mongoUri: requiredEnv('MONGO_URI', 'mongodb://127.0.0.1:27017/hospital-research'),
  jwt: {
    accessSecret: requiredEnv('JWT_ACCESS_SECRET', 'dev-access-secret'),
    refreshSecret: requiredEnv('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL || '7d',
  },
  corsAllowlist: (process.env.CORS_ALLOWLIST || 'http://localhost:5173,http://localhost:3000')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
};
