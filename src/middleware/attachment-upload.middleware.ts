import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { ApiError } from '../errors/api-error.js';

export const attachmentUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'TOO_MANY_REQUESTS', message: 'Too many upload requests. Please try again later.' },
  },
});

export const UPLOADS_DIR = fileURLToPath(new URL('../../uploads', import.meta.url));
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

const extensionForMimeType: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
};

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, UPLOADS_DIR),
  filename: (_req, file, callback) => {
    const extension = extensionForMimeType[file.mimetype] ?? '';
    callback(null, `${randomUUID()}${extension}`);
  },
});

export const attachmentUpload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 6 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'Only JPEG, PNG, WEBP, and HEIC images are accepted.'));
      return;
    }
    callback(null, true);
  },
});
