import { Router } from 'express';
import { extractOwnHealthEvent } from '../controllers/ai-extraction.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { preventSensitiveResponseCaching, requireTrustedJsonWrite } from '../middleware/request-security.middleware.js';
import { aiExtractionLimiter } from '../middleware/ai-security.middleware.js';

const router = Router();
router.use(preventSensitiveResponseCaching);
router.use(requireAuth);
router.post('/', aiExtractionLimiter, requireTrustedJsonWrite, extractOwnHealthEvent);

export default router;
