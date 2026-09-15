import { Router } from 'express';
import {
  getOwnTodayCheckIn,
  listOwnCheckIns,
  respondToOwnCheckIn,
} from '../controllers/check-in.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { preventSensitiveResponseCaching, requireTrustedJsonWrite } from '../middleware/request-security.middleware.js';

const router = Router();
router.use(preventSensitiveResponseCaching);
router.use(requireAuth);
router.get('/today', getOwnTodayCheckIn);
router.get('/history', listOwnCheckIns);
router.post('/:id/respond', requireTrustedJsonWrite, respondToOwnCheckIn);

export default router;
