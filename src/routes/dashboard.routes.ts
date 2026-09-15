import { Router } from 'express';
import { getOwnDashboard } from '../controllers/dashboard.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { preventSensitiveResponseCaching } from '../middleware/request-security.middleware.js';

const router = Router();
router.use(preventSensitiveResponseCaching);
router.use(requireAuth);
router.get('/', getOwnDashboard);

export default router;
