// ---------------------------------------------------------------------------
// Express application factory.
// Kept separate from server.js so the app can be imported for testing without
// binding to a network port.
// ---------------------------------------------------------------------------
import express from 'express';
import cors from 'cors';
import env from './config/env.js';
import apiRouter from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  // --- Core middleware ---
  const corsOptions = env.corsOrigin
    ? { origin: env.corsOrigin.split(',').map((o) => o.trim()) }
    : {}; // default: reflect request origin (fine for local dev)
  app.use(cors(corsOptions));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // --- API routes ---
  app.use('/api', apiRouter);

  // --- 404 + error handling (must be last) ---
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
