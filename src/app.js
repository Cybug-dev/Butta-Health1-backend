const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const env = require('./config/env');
const healthRoutes = require('./routes/health.routes');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    callback(null, origin === env.CLIENT_URL);
  },
  credentials: true,
}));
app.use(express.json({ limit: '100kb' }));

app.use('/api/health', healthRoutes);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found.' },
  });
});

app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);

  let status = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected error occurred.';

  if (error.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Request body must contain valid JSON.';
  } else if (error.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body is too large.';
  } else if (['encoding.unsupported', 'charset.unsupported'].includes(error.type)) {
    status = 415;
    code = 'UNSUPPORTED_ENCODING';
    message = 'Request body encoding is not supported.';
  }

  if (status === 500) console.error('Request failed: INTERNAL_SERVER_ERROR.');
  res.status(status).json({ success: false, error: { code, message } });
});

module.exports = app;
