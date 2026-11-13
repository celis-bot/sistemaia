import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import env from '../config/env.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // Errores de validacion de zod
  if (err?.name === 'ZodError') {
    return res.status(400).json({ error: 'Datos invalidos', code: 'VALIDATION_ERROR', details: err.errors });
  }

  logger.error({ err }, 'Error no controlado');
  const status = err.status || err.statusCode || 500;
  res.status(status >= 400 && status < 600 ? status : 500).json({
    error: env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message,
    code: 'INTERNAL_ERROR',
  });
}
