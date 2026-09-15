import type { RequestHandler } from 'express';
import { unauthorized } from '../auth/errors.js';
import { ApiError } from '../errors/api-error.js';
import { timezoneQuerySchema } from '../schemas/milestone-two.schemas.js';
import { getDashboard } from '../services/dashboard.service.js';

export const getOwnDashboard: RequestHandler = async (req, res) => {
  if (!req.auth) throw unauthorized();
  const parsed = timezoneQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Provide a valid dashboard timezone.');
  res.json({ success: true, data: { dashboard: await getDashboard(req.auth.userId, parsed.data.timezone) } });
};
