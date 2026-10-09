import { Response } from 'express';
import { logger } from '../utils/logger';
import { redisService } from './redisService';
import Redis from 'ioredis';

interface SSEClient {
  id: string;
  res: Response;
  role?: string;
  userId?: string;
  lastEventId?: string;
  connectedAt: string;
}

interface BufferedEvent {
  id: string;
  eventType: string;
  data: any;
  filter?: { role?: string; userId?: string };
  timestamp: string;
}

const REDIS_PUB_SUB_CHANNEL = 'hunters:realtime:events';

class EventHub {
  private nodeId: string;
  private clients: SSEClient[] = [];
  private eventHistory: BufferedEvent[] = [];
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private subscriber: Redis | null = null;
  private isSubscribed = false;

  constructor() {
    this.nodeId = `node_${process.pid}_${Math.random().toString(36).substring(2, 8)}`;

    // Keepalive heartbeat every 25 seconds to keep proxies and firewalls from timing out
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, 25000);

    // Initialize Redis Pub/Sub subscriber for horizontal scale propagation
    this.initRedisPubSub();
  }

  private async initRedisPubSub() {
    try {
      this.subscriber = redisService.createSubscriber();
      if (!this.subscriber) return;

      await this.subscriber.connect().catch(() => {});

      this.subscriber.subscribe(REDIS_PUB_SUB_CHANNEL, (err) => {
        if (err) {
          logger.warn('Failed to subscribe to Redis real-time event channel, relying on local dispatch', { error: err.message });
        } else {
          this.isSubscribed = true;
          logger.info(`Subscribed to Redis event bus (${REDIS_PUB_SUB_CHANNEL}) on node ${this.nodeId}`);
        }
      });

      this.subscriber.on('message', (channel, message) => {
        if (channel === REDIS_PUB_SUB_CHANNEL) {
          try {
            const parsed = JSON.parse(message);
            // Ignore events initiated by this same process to avoid duplicates
            if (parsed.originNodeId === this.nodeId) return;

            this.dispatchLocal(parsed.id, parsed.eventType, parsed.data, parsed.filter, false);
          } catch (e: any) {
            logger.warn('Failed to parse incoming Redis broadcast message', { error: e.message });
          }
        }
      });

      this.subscriber.on('error', (err) => {
        this.isSubscribed = false;
      });
    } catch (err: any) {
      logger.warn('Redis pub/sub initialization bypassed (standalone mode active)');
    }
  }

  private sendHeartbeat() {
    const pingPayload = `: keep-alive ${new Date().toISOString()}\n\n`;
    const deadClients: string[] = [];

    for (const client of this.clients) {
      try {
        client.res.write(pingPayload);
      } catch (e) {
        deadClients.push(client.id);
      }
    }

    for (const deadId of deadClients) {
      this.removeClient(deadId);
    }
  }

  addClient(id: string, res: Response, role?: string, userId?: string, lastEventId?: string) {
    const client: SSEClient = {
      id,
      res,
      role,
      userId,
      lastEventId,
      connectedAt: new Date().toISOString()
    };
    this.clients.push(client);

    // Initial connected handshake
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId: id, timestamp: new Date().toISOString() })}\n\n`);

    // If reconnecting with Last-Event-ID, replay missed events
    if (lastEventId) {
      this.replayMissedEvents(client, lastEventId);
    }

    logger.debug(`SSE Client connected: ${id} (Role: ${role || 'ALL'}, Total: ${this.clients.length})`);
  }

  private replayMissedEvents(client: SSEClient, lastEventId: string) {
    const lastIndex = this.eventHistory.findIndex((e) => e.id === lastEventId);
    if (lastIndex !== -1 && lastIndex < this.eventHistory.length - 1) {
      const missed = this.eventHistory.slice(lastIndex + 1);
      for (const ev of missed) {
        if (ev.filter?.role && client.role && client.role !== ev.filter.role && client.role !== 'OWNER') continue;
        if (ev.filter?.userId && client.userId && client.userId !== ev.filter.userId) continue;

        try {
          client.res.write(`id: ${ev.id}\nevent: ${ev.eventType}\ndata: ${JSON.stringify(ev.data)}\n\n`);
        } catch (e) {
          this.removeClient(client.id);
          break;
        }
      }
    }
  }

  removeClient(id: string) {
    this.clients = this.clients.filter((c) => c.id !== id);
    logger.debug(`SSE Client disconnected: ${id} (Remaining: ${this.clients.length})`);
  }

  /**
   * Broadcasts real-time event to all connected clients and across Redis cluster nodes
   */
  broadcast(eventType: string, data: any, filter?: { role?: string; userId?: string }) {
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const buffered: BufferedEvent = {
      id: eventId,
      eventType,
      data,
      filter,
      timestamp: new Date().toISOString()
    };

    // Store in circular history buffer (max 100 events)
    this.eventHistory.push(buffered);
    if (this.eventHistory.length > 100) {
      this.eventHistory = this.eventHistory.slice(-100);
    }

    // 1. Dispatch locally to all connected clients on this instance
    this.dispatchLocal(eventId, eventType, data, filter, true);

    // 2. Publish to Redis Pub/Sub for horizontal scaling across other server instances
    const envelope = {
      originNodeId: this.nodeId,
      id: eventId,
      eventType,
      data,
      filter,
      timestamp: buffered.timestamp
    };
    redisService.publish(REDIS_PUB_SUB_CHANNEL, JSON.stringify(envelope)).catch(() => {});
  }

  private dispatchLocal(
    eventId: string,
    eventType: string,
    data: any,
    filter?: { role?: string; userId?: string },
    isOrigin = true
  ) {
    const payload = `id: ${eventId}\nevent: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    const deadClients: string[] = [];

    this.clients.forEach((client) => {
      if (filter?.role && client.role && client.role !== filter.role && client.role !== 'OWNER') {
        return;
      }
      if (filter?.userId && client.userId && client.userId !== filter.userId) {
        return;
      }

      try {
        client.res.write(payload);
      } catch (e) {
        deadClients.push(client.id);
      }
    });

    for (const deadId of deadClients) {
      this.removeClient(deadId);
    }
  }

  getClientCount(): number {
    return this.clients.length;
  }

  /**
   * Graceful shutdown of all active SSE streams and Redis subscriber
   */
  closeAll() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.subscriber) {
      try {
        this.subscriber.quit().catch(() => this.subscriber?.disconnect());
      } catch {}
      this.subscriber = null;
      this.isSubscribed = false;
    }

    const shutdownPayload = `event: server_shutdown\ndata: ${JSON.stringify({ message: 'Server shutting down' })}\n\n`;
    for (const client of this.clients) {
      try {
        client.res.write(shutdownPayload);
        client.res.end();
      } catch (e) {
        // Ignore closing errors
      }
    }
    this.clients = [];
    logger.info('All SSE client streams gracefully closed');
  }
}

export const eventHub = new EventHub();
