import { Router } from 'express';
import {
  createOwnHealthEvent,
  deleteOwnHealthEvent,
  getOwnHealthEvent,
  listOwnHealthEvents,
  updateOwnHealthEvent,
} from '../controllers/health-event.controller.js';
import { attachOwnAttachmentsToHealthEvent } from '../controllers/attachment.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  preventSensitiveResponseCaching,
  requireTrustedJsonWrite,
  requireTrustedOrigin,
} from '../middleware/request-security.middleware.js';

const router = Router();
router.use(preventSensitiveResponseCaching);
router.use(requireAuth);
router.get('/', listOwnHealthEvents);
router.post('/', requireTrustedJsonWrite, createOwnHealthEvent);
router.get('/:id', getOwnHealthEvent);
router.patch('/:id', requireTrustedJsonWrite, updateOwnHealthEvent);
router.delete('/:id', requireTrustedOrigin, deleteOwnHealthEvent);
router.post('/:id/attachments', requireTrustedJsonWrite, attachOwnAttachmentsToHealthEvent);

export default router;
