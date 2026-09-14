import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openapi } from '../docs/openapi.js';

const router = Router();
router.get('/openapi.json', (_req, res) => { res.json(openapi); });
router.use('/', swaggerUi.serve, swaggerUi.setup(openapi, {
  customSiteTitle: 'Butta Health API documentation',
  swaggerOptions: { supportedSubmitMethods: [], validatorUrl: null, persistAuthorization: false },
}));
export default router;
