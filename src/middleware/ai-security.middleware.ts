import { rateLimit } from 'express-rate-limit';

export const aiExtractionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'TOO_MANY_REQUESTS', message: 'Too many AI extraction requests. Please try again later.' },
  },
});
