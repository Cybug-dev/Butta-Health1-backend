import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import env from '../config/env.js';
import { AuthError } from '../auth/errors.js';

export const authRequestSecurity: RequestHandler = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'POST') {
    const origin = req.get('Origin');
    if (origin !== undefined && origin !== env.CLIENT_URL) {
      throw new AuthError(403, 'ORIGIN_NOT_ALLOWED', 'Request origin is not allowed.');
    }
    // Credential submissions require JSON; logout consumes no request body.
    if (req.path !== '/logout' && !req.is('application/json')) {
      throw new AuthError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.');
    }
  }
  next();
};

function authRateLimiter(limit: number) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      success: false,
      error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Please try again later.' },
    },
  });
}

export const registerLimiter = authRateLimiter(5);
export const loginLimiter = authRateLimiter(10);
