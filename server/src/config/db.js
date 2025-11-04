const mongoose = require('mongoose');
const config = require('./env');

mongoose.set('strictQuery', true);

const connectDb = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  await mongoose.connect(config.mongoUri, {
    autoIndex: config.nodeEnv !== 'production',
  });
  return mongoose.connection;
};

const disconnectDb = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};

module.exports = {
  connectDb,
  disconnectDb,
};
