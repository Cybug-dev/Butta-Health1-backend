import type { CookieOptions, Response } from 'express';
import env from '../config/env.js';

export const authCookieName = env.NODE_ENV === 'production' ? '__Host-butta_auth' : 'butta_auth';

export const authCookieOptions: CookieOptions = Object.freeze({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  // The deployed frontend (Vercel) and backend (Render) are on different
  // registrable domains, so requests between them are cross-site. Lax
  // cookies are dropped on cross-site fetch/XHR, which logs the user out
  // immediately after a successful login. None (requires Secure, already
  // true in production) lets the cookie survive those requests. Locally the
  // frontend and backend share an origin family, so Lax is kept there to
  // avoid requiring HTTPS in development.
  sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/',
});

export function setAuthCookie(res: Response, token: string) {
  res.cookie(authCookieName, token, {
    ...authCookieOptions,
    maxAge: env.JWT_EXPIRES_IN_SECONDS * 1000,
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(authCookieName, authCookieOptions);
}
