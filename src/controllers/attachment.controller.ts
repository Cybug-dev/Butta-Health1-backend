import type { RequestHandler } from 'express';
import { unauthorized } from '../auth/errors.js';
import { ApiError } from '../errors/api-error.js';
import { healthEventIdSchema } from '../schemas/health-event.schemas.js';
import { attachHealthEventSchema } from '../schemas/attachment.schemas.js';
import {
  attachToHealthEvent,
  createPendingAttachment,
} from '../services/attachment.service.js';

function authenticatedUserId(userId: string | undefined) {
  if (!userId) throw unauthorized();
  return userId;
}

export const uploadOwnAttachments: RequestHandler = async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Attach at least one image file.');
  }

  const userId = authenticatedUserId(req.auth?.userId);
  const attachments = await Promise.all(
    files.map((file) => createPendingAttachment(userId, {
      storageKey: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    })),
  );

  res.status(201).json({ success: true, data: { attachments } });
};

export const attachOwnAttachmentsToHealthEvent: RequestHandler = async (req, res) => {
  const eventId = healthEventIdSchema.safeParse(req.params.id);
  if (!eventId.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Provide a valid health event ID.');

  const parsed = attachHealthEventSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Provide valid attachment IDs.');

  const attachments = await attachToHealthEvent(
    authenticatedUserId(req.auth?.userId),
    eventId.data,
    parsed.data.attachmentIds,
  );
  res.json({ success: true, data: { attachments } });
};
