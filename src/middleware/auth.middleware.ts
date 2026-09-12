import type { RequestHandler } from 'express';
import { parseCookie } from 'cookie';
import { authCookieName } from '../auth/cookie.js';
import { verifyAuthToken } from '../auth/token.js';
import { unauthorized } from '../auth/errors.js';
import { prisma } from '../config/database.js';

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = parseCookie(req.headers.cookie ?? '')[authCookieName];
  if (!token || token.length > 4096) throw unauthorized();

  let userId: string;
  try {
    userId = await verifyAuthToken(token);
  } catch {
    throw unauthorized();
  }

  // Database failures remain server errors, rather than pretending a token was invalid.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw unauthorized();
  req.auth = Object.freeze({ userId: user.id });
  next();
};
