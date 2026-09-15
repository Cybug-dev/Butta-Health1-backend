import { Router } from 'express';
import { getOwnAiConsent, putOwnAiConsent } from '../controllers/ai-consent.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { preventSensitiveResponseCaching, requireTrustedJsonWrite } from '../middleware/request-security.middleware.js';

const router = Router();
router.use(preventSensitiveResponseCaching);
router.use(requireAuth);
router.get('/', getOwnAiConsent);
router.put('/', requireTrustedJsonWrite, putOwnAiConsent);

export default router;
