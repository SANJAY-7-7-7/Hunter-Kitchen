import { OutboxEvent } from '../models/productionTypes';
import { postgresDb } from '../db/postgres';
import { logger } from '../utils/logger';

class OutboxRepository {
  async insert(event: OutboxEvent): Promise<void> {
    try {
      await postgresDb.query(
        `INSERT INTO outbox_events (
          id, aggregate_type, aggregate_id, event_type, payload, status,
          retry_count, max_retries, last_error, processing_started_at,
          created_at, processed_at, next_retry_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET
          payload = EXCLUDED.payload,
          status = EXCLUDED.status,
          retry_count = EXCLUDED.retry_count,
          last_error = EXCLUDED.last_error,
          processing_started_at = EXCLUDED.processing_started_at,
          processed_at = EXCLUDED.processed_at,
          next_retry_at = EXCLUDED.next_retry_at`,
        [
          event.id,
          event.aggregateType,
          event.aggregateId,
          event.eventType,
          JSON.stringify(event.payload || {}),
          event.status || 'PENDING',
          event.retryCount || 0,
          event.maxRetries || 3,
          event.lastError || null,
          event.processingStartedAt ? new Date(event.processingStartedAt) : null,
          event.createdAt || new Date().toISOString(),
          event.processedAt ? new Date(event.processedAt) : null,
          event.nextRetryAt ? new Date(event.nextRetryAt) : null
        ]
      );
    } catch (e: any) {
      logger.error('Failed to insert outbox event into PostgreSQL', { error: e.message });
      throw e;
    }
  }

  async getPendingEvents(limit: number = 20): Promise<OutboxEvent[]> {
    const res = await postgresDb.query(
      `SELECT * FROM outbox_events
       WHERE (status = 'PENDING' OR status = 'FAILED')
         AND (next_retry_at IS NULL OR next_retry_at <= NOW())
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit]
    );
    return res.rows.map(this.rowToEvent);
  }

  /**
   * Concurrency-safe atomic event claiming for horizontal multi-instance scaling
   */
  async claimPendingEvents(limit: number = 10): Promise<OutboxEvent[]> {
    const res = await postgresDb.query(
      `WITH batch AS (
         SELECT id FROM outbox_events
         WHERE (status = 'PENDING' OR status = 'FAILED')
           AND (next_retry_at IS NULL OR next_retry_at <= NOW())
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE outbox_events
       SET status = 'PROCESSING',
           processing_started_at = NOW()
       FROM batch
       WHERE outbox_events.id = batch.id
       RETURNING outbox_events.*`,
      [limit]
    );
    return res.rows.map(this.rowToEvent);
  }

  async update(id: string, updates: Partial<OutboxEvent>): Promise<OutboxEvent | undefined> {
    const current = await this.getById(id);
    if (!current) return undefined;

    const merged = { ...current, ...updates };

    const res = await postgresDb.query(
      `UPDATE outbox_events SET
        status = $1, retry_count = $2, max_retries = $3, last_error = $4,
        processing_started_at = $5, processed_at = $6, next_retry_at = $7
      WHERE id = $8 RETURNING *`,
      [
        merged.status,
        merged.retryCount,
        merged.maxRetries,
        merged.lastError || null,
        merged.processingStartedAt ? new Date(merged.processingStartedAt) : null,
        merged.processedAt ? new Date(merged.processedAt) : null,
        merged.nextRetryAt ? new Date(merged.nextRetryAt) : null,
        id
      ]
    );

    if (res.rows.length === 0) return undefined;
    return this.rowToEvent(res.rows[0]);
  }

  async getById(id: string): Promise<OutboxEvent | undefined> {
    const res = await postgresDb.query('SELECT * FROM outbox_events WHERE id = $1', [id]);
    if (res.rows.length === 0) return undefined;
    return this.rowToEvent(res.rows[0]);
  }

  async getAll(limit: number = 50): Promise<OutboxEvent[]> {
    const res = await postgresDb.query('SELECT * FROM outbox_events ORDER BY created_at DESC LIMIT $1', [limit]);
    return res.rows.map(this.rowToEvent);
  }

  async recoverStaleProcessing(timeoutMs: number = 60000): Promise<number> {
    const cutoff = new Date(Date.now() - timeoutMs);
    const res = await postgresDb.query(
      `UPDATE outbox_events SET status = 'PENDING', processing_started_at = NULL
       WHERE status = 'PROCESSING' AND (processing_started_at IS NULL OR processing_started_at < $1)`,
      [cutoff]
    );
    return res.rowCount || 0;
  }

  private rowToEvent(r: any): OutboxEvent {
    const parseJson = (v: any) => (typeof v === 'string' ? JSON.parse(v) : v);
    return {
      id: r.id,
      aggregateType: r.aggregate_type,
      aggregateId: r.aggregate_id,
      eventType: r.event_type,
      payload: parseJson(r.payload),
      status: r.status,
      retryCount: Number(r.retry_count || 0),
      maxRetries: Number(r.max_retries || 3),
      lastError: r.last_error || undefined,
      processingStartedAt: r.processing_started_at ? new Date(r.processing_started_at).toISOString() : undefined,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      processedAt: r.processed_at ? new Date(r.processed_at).toISOString() : undefined,
      nextRetryAt: r.next_retry_at ? new Date(r.next_retry_at).toISOString() : undefined
    };
  }
}

export const outboxRepository = new OutboxRepository();
