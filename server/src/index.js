const config = require('./config/env');
const { connectDb } = require('./config/db');
const app = require('./app');

const start = async () => {
  // bind HTTP first
  const server = app.listen(config.port, () => {
    console.log(`HTTP listening on ${config.port}`);
  });
  server.on('error', (err) => {
    console.error('HTTP server error:', err);
    process.exit(1);
  });

  // connect DB with retry and clear logs
  const maxRetries = 5;
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      console.log(`[db] connect attempt ${attempt}/${maxRetries}`);
      await connectDb();
      console.log('[db] connected');
      break;
    } catch (err) {
      console.error('[db] connect failed:', err?.name, err?.code || '', err?.message);
      if (attempt === maxRetries) {
        console.error('[db] giving up after max retries');
        // keep HTTP alive so /health works
        break;
      }
      await delay(2000 * attempt);
    }
  }
};

start();
