import type { RequestHandler } from 'express';
import { unauthorized } from '../auth/errors.js';
import { ApiError } from '../errors/api-error.js';
import {
  createHealthEventSchema,
  healthEventIdSchema,
  healthEventQuerySchema,
  updateHealthEventSchema,
} from '../schemas/health-event.schemas.js';
import {
  createHealthEvent,
  deleteHealthEvent,
  getHealthEvent,
  listHealthEvents,
  updateHealthEvent,
} from '../services/health-event.service.js';

function authenticatedUserId(userId: string | undefined) {
  if (!userId) throw unauthorized();
  return userId;
}

function eventId(value: unknown) {
  const parsed = healthEventIdSchema.safeParse(value);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Provide a valid health event ID.');
  return parsed.data;
}

export const listOwnHealthEvents: RequestHandler = async (req, res) => {
  const parsed = healthEventQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Provide valid health event filters.');
  const data = await listHealthEvents(authenticatedUserId(req.auth?.userId), parsed.data);
  res.json({ success: true, data });
};

export const getOwnHealthEvent: RequestHandler = async (req, res) => {
  const healthEvent = await getHealthEvent(
    authenticatedUserId(req.auth?.userId),
    eventId(req.params.id),
  );
  res.json({ success: true, data: { healthEvent } });
};

export const createOwnHealthEvent: RequestHandler = async (req, res) => {
  const parsed = createHealthEventSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Provide a valid health event.');
  const healthEvent = await createHealthEvent(authenticatedUserId(req.auth?.userId), parsed.data);
  res.status(201).json({ success: true, data: { healthEvent } });
};

export const updateOwnHealthEvent: RequestHandler = async (req, res) => {
  const parsed = updateHealthEventSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Provide a valid health event update.');
  const healthEvent = await updateHealthEvent(
    authenticatedUserId(req.auth?.userId),
    eventId(req.params.id),
    parsed.data,
  );
  res.json({ success: true, data: { healthEvent } });
};

export const deleteOwnHealthEvent: RequestHandler = async (req, res) => {
  await deleteHealthEvent(authenticatedUserId(req.auth?.userId), eventId(req.params.id));
  res.json({ success: true, data: { message: 'Health event deleted.' } });
};
