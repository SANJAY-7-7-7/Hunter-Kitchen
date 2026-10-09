import { Server } from 'http';
import { outboxWorker } from '../workers/outboxWorker';
import { eventHub } from '../services/eventHub';
import { postgresDb } from '../db/postgres';
import { redisService } from '../services/redisService';
import { logger } from './logger';

export function setupGracefulShutdown(server: Server, cleanupIntervals: NodeJS.Timeout[] = []) {
  let isShuttingDown = false;

  const handleShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`Received ${signal}. Initiating graceful production shutdown...`);

    // 0. Stop periodic timer workers
    cleanupIntervals.forEach((interval) => clearInterval(interval));

    // 1. Stop background workers
    outboxWorker.stop();

    // 2. Terminate real-time SSE streams cleanly
    eventHub.closeAll();

    // 3. Drain and close PostgreSQL connection pool
    try {
      await postgresDb.close();
    } catch (e: any) {
      logger.error('Error closing PostgreSQL pool during shutdown', { error: e.message });
    }

    // 4. Disconnect Redis client
    try {
      await redisService.close();
    } catch (e: any) {
      logger.error('Error closing Redis connection during shutdown', { error: e.message });
    }

    // 4. Stop accepting new HTTP connections and drain active ones
    server.close((err) => {
      if (err) {
        logger.error('Error closing HTTP server during shutdown', err);
        process.exit(1);
      }
      logger.info('Closed all active HTTP connections cleanly. Exiting.');
      process.exit(0);
    });

    // Force exit after 10s if connections refuse to drain
    setTimeout(() => {
      logger.warn('Graceful shutdown timeout exceeded (10s). Forcing termination.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}
