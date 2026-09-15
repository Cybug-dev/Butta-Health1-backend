import type { RequestHandler } from 'express';
import { loginSchema, registerSchema } from '../schemas/auth.schemas.js';
import { registerUser, loginUser, currentUser } from '../services/auth.service.js';
import { setAuthCookie, clearAuthCookie } from '../auth/cookie.js';
import { createAuthToken } from '../auth/token.js';
import { AuthError, unauthorized } from '../auth/errors.js';

export const register: RequestHandler = async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AuthError(400, 'VALIDATION_ERROR', 'Provide valid names, email, and a password of 8 to 128 characters.');
  }
  const user = await registerUser(parsed.data);
  setAuthCookie(res, await createAuthToken(user.id));
  res.status(201).json({ success: true, data: { user } });
};

export const login: RequestHandler = async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AuthError(400, 'VALIDATION_ERROR', 'Provide a valid email and password.');
  }
  const user = await loginUser(parsed.data);
  setAuthCookie(res, await createAuthToken(user.id));
  res.json({ success: true, data: { user } });
};

export const logout: RequestHandler = (_req, res) => {
  clearAuthCookie(res);
  res.json({ success: true, data: { message: 'Logged out.' } });
};

export const me: RequestHandler = async (req, res) => {
  if (!req.auth) throw unauthorized();
  res.json({ success: true, data: { user: await currentUser(req.auth.userId) } });
};
