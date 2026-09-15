import { Router } from 'express';
import {
  getOwnNotificationPreference,
  replaceOwnNotificationPreference,
} from '../controllers/notification-preference.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { preventSensitiveResponseCaching, requireTrustedJsonWrite } from '../middleware/request-security.middleware.js';

const router = Router();
router.use(preventSensitiveResponseCaching);
router.use(requireAuth);
router.get('/', getOwnNotificationPreference);
router.put('/', requireTrustedJsonWrite, replaceOwnNotificationPreference);

export default router;
