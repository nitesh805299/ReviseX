import { ZodError } from 'zod';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
    });
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Uploaded file exceeds maximum allowed size (5 MB).' });
  }

  const status = err.statusCode || err.status || 500;
  if (status >= 500) {
    console.error('[ReviseX API Error]', err);
  }

  return res.status(status).json({
    error: err.message || 'Internal server error',
    code: err.code || undefined,
  });
}
