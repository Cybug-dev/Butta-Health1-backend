import { Router } from 'express';
import { getOwnHealthProfile, replaceOwnHealthProfile } from '../controllers/health-profile.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  preventSensitiveResponseCaching,
  requireTrustedJsonWrite,
} from '../middleware/request-security.middleware.js';

const router = Router();
router.use(preventSensitiveResponseCaching);
router.use(requireAuth);
router.get('/', getOwnHealthProfile);
router.put('/', requireTrustedJsonWrite, replaceOwnHealthProfile);

export default router;
