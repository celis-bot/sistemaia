export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

export const badRequest = (msg, details) => new AppError(msg, 400, 'BAD_REQUEST', details);
export const unauthorized = (msg = 'No autenticado') => new AppError(msg, 401, 'UNAUTHORIZED');
export const forbidden = (msg = 'Sin permisos') => new AppError(msg, 403, 'FORBIDDEN');
export const notFound = (msg = 'Recurso no encontrado') => new AppError(msg, 404, 'NOT_FOUND');
export const upstream = (msg, details) => new AppError(msg, 502, 'UPSTREAM_ERROR', details);
