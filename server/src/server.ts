import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectMongo, disconnectMongo } from './db/connect.js';
import { logger } from './observability/logger.js';

/**
 * Process entry point: validate config → connect DB → start HTTP → handle shutdown.
 */
async function main(): Promise<void> {
  const config = env();

  await connectMongo(config.MONGODB_URI);

  const app = createApp({ corsOrigins: config.CORS_ORIGINS });
  const httpServer = createServer(app);
  // Socket.IO is attached to this same httpServer in Phase 4.

  httpServer.listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'ConvoDesk API listening');
  });

  registerShutdown(async () => {
    // 1) stop accepting new connections and let in-flight requests finish
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    // 2) then release the DB pool
    await disconnectMongo();
  });
}

/**
 * Graceful shutdown. Render sends SIGTERM on every deploy/restart and waits ~30s.
 * We finish in-flight work, close the DB, and exit 0. If something hangs we force-exit
 * after 10s so the platform is never blocked by us.
 */
function registerShutdown(cleanup: () => Promise<void>): void {
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down gracefully');

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    cleanup()
      .then(() => {
        logger.info('Shutdown complete');
        process.exit(0);
      })
      .catch((err: unknown) => {
        logger.error({ err }, 'Error during shutdown');
        process.exit(1);
      });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});

main().catch((err: unknown) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
