import type { CookieOptions, Response } from 'express';
import env from '../config/env.js';

export const authCookieName = env.NODE_ENV === 'production' ? '__Host-butta_auth' : 'butta_auth';

export const authCookieOptions: CookieOptions = Object.freeze({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
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
