import type { RequestHandler } from 'express';
import path from 'node:path';
import { unauthorized } from '../auth/errors.js';
import { ApiError } from '../errors/api-error.js';
import { attachmentIdSchema } from '../schemas/attachment.schemas.js';
import { getAttachmentFile } from '../services/attachment.service.js';
import { UPLOADS_DIR } from '../middleware/attachment-upload.middleware.js';

export const getOwnAttachmentFile: RequestHandler = async (req, res) => {
  const parsed = attachmentIdSchema.safeParse(req.params.id);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Provide a valid attachment ID.');

  const userId = req.auth?.userId;
  if (!userId) throw unauthorized();

  const attachment = await getAttachmentFile(userId, parsed.data);
  res.sendFile(path.join(UPLOADS_DIR, attachment.storageKey), {
    headers: { 'Content-Type': attachment.mimeType },
  });
};
