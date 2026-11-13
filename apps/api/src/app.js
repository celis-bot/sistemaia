import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { pinoHttp } from 'pino-http';
import env from './config/env.js';
import { logger } from './lib/logger.js';
import routes from './routes/index.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './lib/errors.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // necesario detras de Vercel / nginx
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors({
    origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
  }));
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(pinoHttp({ logger, autoLogging: env.NODE_ENV !== 'test' }));

  app.use('/api', apiLimiter, routes);

  app.use((_req, _res, next) => next(notFound('Ruta no encontrada')));
  app.use(errorHandler);

  return app;
}

export default createApp;
