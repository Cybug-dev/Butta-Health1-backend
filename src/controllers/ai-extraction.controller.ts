import type { RequestHandler } from 'express';
import { unauthorized } from '../auth/errors.js';
import { ApiError } from '../errors/api-error.js';
import { extractionRequestSchema } from '../schemas/ai-extraction.schemas.js';
import { extractHealthEvent } from '../services/ai-extraction.service.js';
import { getHealthAiProvider } from '../ai/provider-registry.js';

function authenticatedUserId(userId: string | undefined) {
  if (!userId) throw unauthorized();
  return userId;
}

export const extractOwnHealthEvent: RequestHandler = async (req, res) => {
  const parsed = extractionRequestSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Provide a valid observation and source.');
  const data = await extractHealthEvent(getHealthAiProvider(), authenticatedUserId(req.auth?.userId), parsed.data);
  res.json({ success: true, data });
};
