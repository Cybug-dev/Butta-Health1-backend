import type { RequestHandler } from 'express';
import env from '../config/env.js';
import { ApiError } from '../errors/api-error.js';

export const preventSensitiveResponseCaching: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

export const requireTrustedJsonWrite: RequestHandler = (req, _res, next) => {
  const origin = req.get('Origin');
  if (origin !== undefined && origin !== env.CLIENT_URL) {
    throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Request origin is not allowed.');
  }
  if (!req.is('application/json')) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.');
  }
  next();
};
