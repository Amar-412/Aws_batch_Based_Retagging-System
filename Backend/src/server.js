// ---------------------------------------------------------------------------
// Server entry point. Boots the Express app and starts listening.
// ---------------------------------------------------------------------------
import { createApp } from './app.js';
import env, { warnOnMissingAwsConfig } from './config/env.js';

const app = createApp();

// Warn (but don't crash) if AWS config is incomplete so /api/health still works.
warnOnMissingAwsConfig();

const server = app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[server] S3 Batch Retagging backend running on http://localhost:${env.port} (${env.nodeEnv})`
  );
  // eslint-disable-next-line no-console
  console.log(`[server] Health check: http://localhost:${env.port}/api/health`);
});

// Graceful shutdown on termination signals.
function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`[server] Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    // eslint-disable-next-line no-console
    console.log('[server] Closed all connections. Bye.');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default server;
