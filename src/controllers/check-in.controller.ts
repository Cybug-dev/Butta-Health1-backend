import type { RequestHandler } from 'express';
import { unauthorized } from '../auth/errors.js';
import { ApiError } from '../errors/api-error.js';
import {
  checkInIdSchema,
  checkInResponseSchema,
  timezoneQuerySchema,
} from '../schemas/milestone-two.schemas.js';
import { getTodayCheckIn, listCheckIns, respondToCheckIn } from '../services/check-in.service.js';

function authenticatedUserId(userId: string | undefined) {
  if (!userId) throw unauthorized();
  return userId;
}

export const getOwnTodayCheckIn: RequestHandler = async (req, res) => {
  const query = timezoneQuerySchema.safeParse(req.query);
  if (!query.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Provide a valid check-in timezone.');
  const checkIn = await getTodayCheckIn(authenticatedUserId(req.auth?.userId), query.data.timezone);
  res.json({ success: true, data: { checkIn } });
};

export const respondToOwnCheckIn: RequestHandler = async (req, res) => {
  const id = checkInIdSchema.safeParse(req.params.id);
  const input = checkInResponseSchema.safeParse(req.body);
  if (!id.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Provide a valid check-in ID.');
  if (!input.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Provide a valid check-in response.');
  const result = await respondToCheckIn(authenticatedUserId(req.auth?.userId), id.data, input.data);
  res.status(201).json({ success: true, data: result });
};

export const listOwnCheckIns: RequestHandler = async (req, res) => {
  res.json({ success: true, data: { checkIns: await listCheckIns(authenticatedUserId(req.auth?.userId)) } });
};
