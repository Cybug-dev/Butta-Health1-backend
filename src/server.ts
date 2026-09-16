async function start() {
  // Dynamic imports let startup report configuration errors without a stack trace.
  const { default: env } = await import('./config/env.js');
  const { default: app } = await import('./app.js');
  const { prisma } = await import('./config/database.js');
  const server = app.listen(env.PORT, () => {
    console.log(`Butta Health API listening on port ${env.PORT}.`);
    // Logs only the provider name (never keys/URLs) so a misconfigured or
    // not-yet-deployed AI_PROVIDER value is visible in startup logs instead
    // of only surfacing later as an opaque AI_PROVIDER_UNAVAILABLE response.
    console.log(`NODE_ENV=${env.NODE_ENV}, AI_PROVIDER=${env.AI_PROVIDER}.`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
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
    server.close(async (error) => {
      try {
        await prisma.$disconnect();
      } catch {
        process.exitCode = 1;
      } finally {
        clearTimeout(timeout);
      }
      if (error) process.exitCode = 1;
    });
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

try {
  await start();
} catch (error) {
  console.error(error instanceof Error && 'code' in error && error.code === 'ENV_CONFIG'
    ? error.message : 'Startup failed: unable to initialize application.');
  process.exitCode = 1;
}
