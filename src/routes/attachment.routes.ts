import { Router } from 'express';
import { uploadOwnAttachments } from '../controllers/attachment.controller.js';
import { getOwnAttachmentFile } from '../controllers/attachment-file.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { attachmentUpload, attachmentUploadLimiter } from '../middleware/attachment-upload.middleware.js';
import { preventSensitiveResponseCaching, requireTrustedOrigin } from '../middleware/request-security.middleware.js';

const router = Router();
router.use(preventSensitiveResponseCaching);
router.use(requireAuth);

router.post('/', attachmentUploadLimiter, requireTrustedOrigin, attachmentUpload.array('files', 6), uploadOwnAttachments);
router.get('/:id/file', getOwnAttachmentFile);

export default router;
