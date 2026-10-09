import crypto from 'crypto';
import { outboxRepository } from '../repositories/outboxRepository';
import { OutboxEvent } from '../models/productionTypes';
import { eventHub } from '../services/eventHub';
import { logger } from '../utils/logger';
import { config } from '../config/config';

class OutboxWorker {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private isRunning = false;

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('Outbox background worker started with atomic concurrency claims');

    this.timer = setInterval(() => {
      // Periodically recover any jobs stuck in PROCESSING longer than 60s
      outboxRepository.recoverStaleProcessing(60000).catch(() => {});

      this.processOutboxBatch().catch((err) => {
        logger.error('Error in outbox processing cycle', err);
      });
    }, config.outboxPollIntervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    logger.info('Outbox background worker stopped gracefully');
  }

  private async processOutboxBatch(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Concurrency-safe atomic event claiming using FOR UPDATE SKIP LOCKED
      const pendingEvents = await outboxRepository.claimPendingEvents(10);
      if (pendingEvents.length === 0) {
        this.isProcessing = false;
        return;
      }

      for (const event of pendingEvents) {
        await this.processEvent(event);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async processEvent(event: OutboxEvent): Promise<void> {
    try {
      // 1. Dispatch through real-time SSE Hub to subscribed web clients
      eventHub.broadcast(event.eventType, {
        aggregateId: event.aggregateId,
        aggregateType: event.aggregateType,
        payload: event.payload,
        timestamp: new Date().toISOString()
      });

      // 2. Outgoing webhook dispatch if targeted or configured
      if (event.payload?.webhookUrl || event.eventType.startsWith('WEBHOOK.') || process.env.OUTGOING_WEBHOOK_URL) {
        const targetUrl = event.payload?.webhookUrl || process.env.OUTGOING_WEBHOOK_URL;
        if (targetUrl) {
          const bodyPayload = JSON.stringify({
            eventId: event.id,
            eventType: event.eventType,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            payload: event.payload,
            timestamp: new Date().toISOString()
          });

          const signature = crypto
            .createHmac('sha256', config.webhookSecret || 'secret')
            .update(bodyPayload)
            .digest('hex');

          try {
            await fetch(targetUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Hunters-Signature': signature,
                'X-Hunters-Event': event.eventType,
                'User-Agent': "Hunter's Kitchen Webhook Dispatcher/1.0"
              },
              body: bodyPayload,
              signal: AbortSignal.timeout(6000)
            });
            logger.info(`Successfully dispatched outgoing webhook to ${targetUrl} for ${event.eventType}`);
          } catch (netErr: any) {
            logger.warn(`Webhook endpoint delivery failed: ${targetUrl}`, { error: netErr.message });
          }
        }
      }

      logger.info(`[Outbox Worker] Successfully processed event ${event.eventType} for ${event.aggregateType}#${event.aggregateId}`, {
        eventId: event.id,
        eventType: event.eventType
      });

      // Mark completed
      await outboxRepository.update(event.id, {
        status: 'COMPLETED',
        processedAt: new Date().toISOString()
      });
    } catch (err: any) {
      const retryCount = event.retryCount + 1;
      const isDeadLetter = retryCount >= event.maxRetries;

      // Exponential backoff: 2s, 4s, 8s
      const backoffSec = Math.pow(2, retryCount);
      const nextRetryAt = new Date(Date.now() + backoffSec * 1000).toISOString();

      await outboxRepository.update(event.id, {
        status: isDeadLetter ? 'DEAD_LETTER' : 'FAILED',
        retryCount,
        lastError: err.message || 'Unknown dispatch error',
        nextRetryAt: isDeadLetter ? undefined : nextRetryAt
      });

      logger.warn(`Outbox event failed to process [Attempt ${retryCount}/${event.maxRetries}]: ${event.id}`, {
        eventId: event.id,
        error: err.message
      });
    }
  }
}

export const outboxWorker = new OutboxWorker();
