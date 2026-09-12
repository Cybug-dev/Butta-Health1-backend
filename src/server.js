function start() {
  const env = require('./config/env');
  const app = require('./app');
  const server = app.listen(env.PORT, () => {
    console.log(`Butta Health API listening on port ${env.PORT}.`);
  });

  server.on('error', (error) => {
    const message = error.code === 'EADDRINUSE'
      ? 'PORT is already in use.'
      : error.code === 'EACCES'
        ? 'Permission denied for PORT.'
        : 'Unable to start HTTP server.';
    console.error(`Startup failed: ${message}`);
    process.exitCode = 1;
  });

  let shuttingDown = false;
  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    const timeout = setTimeout(() => {
      server.closeAllConnections();
      process.exit(1);
    }, 10_000);
    timeout.unref();
    server.close((error) => {
      clearTimeout(timeout);
      if (error) process.exitCode = 1;
    });
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

try {
  start();
} catch (error) {
  console.error(error.code === 'ENV_CONFIG' ? error.message : 'Startup failed: unable to initialize application.');
  process.exitCode = 1;
}
