import type { RequestHandler } from 'express';
import { unauthorized } from '../auth/errors.js';
import { ApiError } from '../errors/api-error.js';
import { notificationPreferenceSchema } from '../schemas/milestone-two.schemas.js';
import {
  getNotificationPreference,
  putNotificationPreference,
} from '../services/notification-preference.service.js';

export const getOwnNotificationPreference: RequestHandler = async (req, res) => {
  if (!req.auth) throw unauthorized();
  const preferences = await getNotificationPreference(req.auth.userId);
  res.json({ success: true, data: { preferences } });
};

export const replaceOwnNotificationPreference: RequestHandler = async (req, res) => {
  if (!req.auth) throw unauthorized();
  const parsed = notificationPreferenceSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Provide valid notification preferences.');
  const preferences = await putNotificationPreference(req.auth.userId, parsed.data);
  res.json({ success: true, data: { preferences } });
};
