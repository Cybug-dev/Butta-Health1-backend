import type { RequestHandler } from 'express';
import { unauthorized } from '../auth/errors.js';
import { ApiError } from '../errors/api-error.js';
import { healthProfileSchema } from '../schemas/health-profile.schemas.js';
import { getHealthProfile, putHealthProfile } from '../services/health-profile.service.js';

export const getOwnHealthProfile: RequestHandler = async (req, res) => {
  if (!req.auth) throw unauthorized();
  res.json({ success: true, data: { profile: await getHealthProfile(req.auth.userId) } });
};

export const replaceOwnHealthProfile: RequestHandler = async (req, res) => {
  if (!req.auth) throw unauthorized();
  const parsed = healthProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Provide a valid health profile.');
  }
  res.json({ success: true, data: { profile: await putHealthProfile(req.auth.userId, parsed.data) } });
};
