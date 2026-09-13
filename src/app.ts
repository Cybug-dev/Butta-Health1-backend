import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import env from './config/env.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import healthProfileRoutes from './routes/health-profile.routes.js';
import { authRequestSecurity } from './middleware/auth-security.middleware.js';
import { ApiError } from './errors/api-error.js';

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    callback(null, origin === env.CLIENT_URL);
  },
  credentials: true,
}));
app.use('/api/auth', authRequestSecurity);
app.use(express.json({ limit: '100kb' }));

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/health-profile', healthProfileRoutes);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found.' },
  });
});

const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) return next(error);

  let status = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected error occurred.';

  const errorType = typeof error === 'object' && error !== null && 'type' in error
    && typeof error.type === 'string' ? error.type : undefined;

  if (error instanceof ApiError) {
    status = error.status;
    code = error.code;
    message = error.message;
  } else if (errorType === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Request body must contain valid JSON.';
  } else if (errorType === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body is too large.';
  } else if (errorType === 'encoding.unsupported' || errorType === 'charset.unsupported') {
    status = 415;
    code = 'UNSUPPORTED_ENCODING';
    message = 'Request body encoding is not supported.';
  }

  if (status === 500) console.error('Request failed: INTERNAL_SERVER_ERROR.');
  res.status(status).json({ success: false, error: { code, message } });
};

app.use(errorHandler);

export default app;
