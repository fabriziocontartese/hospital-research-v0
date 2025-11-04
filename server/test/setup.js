const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const config = require('../src/config/env');
const { connectDb, disconnectDb } = require('../src/config/db');

let mongo;

beforeAll(async () => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  process.env.JWT_ACCESS_TTL = '15m';
  process.env.JWT_REFRESH_TTL = '7d';

  mongo = await MongoMemoryServer.create({
    instance: {
      ip: '127.0.0.1',
      bindIp: '127.0.0.1',
      port: 0,
    },
  });
  process.env.MONGO_URI = mongo.getUri();
  config.mongoUri = process.env.MONGO_URI;
  await connectDb();
});

afterEach(async () => {
  const collections = await mongoose.connection.db.collections();
  // eslint-disable-next-line no-restricted-syntax
  for (const collection of collections) {
    // eslint-disable-next-line no-await-in-loop
    await collection.deleteMany({});
  }
});

afterAll(async () => {
  await disconnectDb();
  if (mongo) {
    await mongo.stop();
  }
});
