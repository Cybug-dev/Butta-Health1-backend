import fs from 'node:fs/promises';
import path from 'node:path';
import { UPLOADS_DIR } from '../middleware/attachment-upload.middleware.js';

export async function deleteAttachmentFiles(storageKeys: string[]) {
  await Promise.all(storageKeys.map(async (storageKey) => {
    try {
      await fs.unlink(path.join(UPLOADS_DIR, storageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }));
}
