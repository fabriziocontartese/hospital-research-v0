const config = require('./config/env');
const { connectDb } = require('./config/db');
const app = require('./app');

const start = async () => {
  await connectDb();
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on port ${config.port}`);
  });
};

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server', error);
  process.exit(1);
});
