import type { RequestHandler } from 'express';
import { unauthorized } from '../auth/errors.js';
import { ApiError } from '../errors/api-error.js';
import { aiConsentInputSchema } from '../schemas/ai-consent.schemas.js';
import { getAiConsent, setAiConsent } from '../services/ai-consent.service.js';

function authenticatedUserId(userId: string | undefined) {
  if (!userId) throw unauthorized();
  return userId;
}

export const getOwnAiConsent: RequestHandler = async (req, res) => {
  const consent = await getAiConsent(authenticatedUserId(req.auth?.userId));
  res.json({ success: true, data: { consent } });
};

export const putOwnAiConsent: RequestHandler = async (req, res) => {
  const parsed = aiConsentInputSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Provide a valid consent value.');
  const consent = await setAiConsent(authenticatedUserId(req.auth?.userId), parsed.data.granted);
  res.json({ success: true, data: { consent } });
};
