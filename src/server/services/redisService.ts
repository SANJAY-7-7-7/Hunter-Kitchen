import Redis from 'ioredis';
import { config } from '../config/config';
import { logger } from '../utils/logger';

interface CacheEntry {
  value: string;
  expiresAt: number | null;
}

export class RedisService {
  private client: Redis | null = null;
  private memoryStore: Map<string, CacheEntry> = new Map();
  private hits = 0;
  private misses = 0;
  private isRedisReady = false;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private lastFallbackWarnTime = 0;

  constructor() {
    this.init();
  }

  private warnFallback(reason: string, key?: string) {
    const now = Date.now();
    if (now - this.lastFallbackWarnTime > 30000) {
      this.lastFallbackWarnTime = now;
      logger.warn(`[REDIS FALLBACK ALERT] Redis cache/session fallback active: ${reason}${key ? ` (key: ${key})` : ''}. Operating on node in-memory cache.`);
    }
  }

  private async init() {
    // 1. Start in-memory cleanup timer for fallback entries
    this.cleanupTimer = setInterval(() => {
      this.evictExpiredKeys();
    }, 30000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }

    // 2. Connect to real Redis if REDIS_URL or config is provided
    const redisUrl = config.redisUrl || process.env.REDIS_URL;
    const redisPassword = process.env.REDIS_PASSWORD?.trim() || undefined;
    if (redisUrl) {
      try {
        this.client = new Redis(redisUrl, {
          lazyConnect: true,
          connectTimeout: 5000,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          ...(redisPassword ? { password: redisPassword } : {}),
          retryStrategy(times) {
            // Exponential backoff capped at 10 seconds
            return Math.min(times * 500, 10000);
          }
        });

        this.client.on('connect', () => {
          logger.info('Connecting to Redis cluster / server...');
        });

        this.client.on('ready', () => {
          this.isRedisReady = true;
          logger.info('Connected to Redis engine successfully (Production Mode)');
        });

        this.client.on('error', (err) => {
          if (this.isRedisReady) {
            logger.warn('Redis connection issue encountered, falling back to resilient in-memory store', {
              error: err.message
            });
          }
          this.isRedisReady = false;
        });

        this.client.on('close', () => {
          this.isRedisReady = false;
        });

        // Attempt initial connection asynchronously without blocking server startup
        this.isConnecting = true;
        this.client.connect().catch((err) => {
          logger.warn(`Could not connect to Redis at ${redisUrl}. Engaging high-speed in-memory fallback.`, {
            error: err.message
          });
          this.isRedisReady = false;
        }).finally(() => {
          this.isConnecting = false;
        });
      } catch (err: any) {
        logger.warn('Failed to initialize Redis client, using in-memory store', { error: err.message });
        this.isRedisReady = false;
      }
    } else {
      logger.info('No REDIS_URL configured; running in standalone resilient in-memory cache mode');
    }
  }

  private evictExpiredKeys() {
    const now = Date.now();
    for (const [key, entry] of this.memoryStore.entries()) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        this.memoryStore.delete(key);
      }
    }
  }

  public get isConnected(): boolean {
    return this.isRedisReady;
  }

  public getClient(): Redis | null {
    return this.client;
  }

  /**
   * Spawns an isolated subscriber client for Redis Pub/Sub streams
   */
  public createSubscriber(): Redis | null {
    const redisUrl = config.redisUrl || process.env.REDIS_URL;
    const redisPassword = process.env.REDIS_PASSWORD?.trim() || undefined;
    if (!redisUrl) return null;

    try {
      const sub = new Redis(redisUrl, {
        lazyConnect: true,
        connectTimeout: 5000,
        maxRetriesPerRequest: 1,
        ...(redisPassword ? { password: redisPassword } : {}),
        retryStrategy(times) {
          return Math.min(times * 500, 10000);
        }
      });
      return sub;
    } catch {
      return null;
    }
  }

  public async publish(channel: string, message: string): Promise<number> {
    if (this.isRedisReady && this.client) {
      try {
        return await this.client.publish(channel, message);
      } catch (e: any) {
        logger.warn(`Redis publish failed on channel ${channel}, using in-process dispatch`, { error: e.message });
      }
    }
    return 0;
  }

  public async get(key: string): Promise<string | null> {
    if (this.isRedisReady && this.client) {
      try {
        const val = await this.client.get(key);
        if (val !== null) {
          this.hits++;
          return val;
        }
        this.misses++;
        return null;
      } catch (err: any) {
        this.warnFallback(`GET failure: ${err.message}`, key);
      }
    } else {
      this.warnFallback('Engine disconnected', key);
    }

    const entry = this.memoryStore.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.memoryStore.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.value;
  }

  public async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.isRedisReady && this.client) {
      try {
        if (ttlSeconds && ttlSeconds > 0) {
          await this.client.set(key, value, 'EX', ttlSeconds);
        } else {
          await this.client.set(key, value);
        }
        return;
      } catch (err: any) {
        this.warnFallback(`SET failure: ${err.message}`, key);
      }
    } else {
      this.warnFallback('Engine disconnected', key);
    }

    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.memoryStore.set(key, { value, expiresAt });
  }

  public async del(key: string): Promise<number> {
    if (this.isRedisReady && this.client) {
      try {
        return await this.client.del(key);
      } catch (err: any) {
        this.warnFallback(`DEL failure: ${err.message}`, key);
      }
    } else {
      this.warnFallback('Engine disconnected', key);
    }

    const existed = this.memoryStore.has(key);
    this.memoryStore.delete(key);
    return existed ? 1 : 0;
  }

  public async exists(key: string): Promise<boolean> {
    if (this.isRedisReady && this.client) {
      try {
        const count = await this.client.exists(key);
        return count > 0;
      } catch (err: any) {
        this.warnFallback(`EXISTS failure: ${err.message}`, key);
      }
    } else {
      this.warnFallback('Engine disconnected', key);
    }

    const val = await this.get(key);
    return val !== null;
  }

  public async incr(key: string, ttlSeconds?: number): Promise<number> {
    if (this.isRedisReady && this.client) {
      try {
        const newVal = await this.client.incr(key);
        if (ttlSeconds && newVal === 1) {
          await this.client.expire(key, ttlSeconds);
        }
        return newVal;
      } catch (err) {
        // Fall back to memoryStore
      }
    }

    const current = await this.get(key);
    const newVal = current ? parseInt(current, 10) + 1 : 1;
    await this.set(key, String(newVal), ttlSeconds);
    return newVal;
  }

  // Real-Time OTP store with default 10-minute expiration
  public async storeOTP(
    email: string,
    otp: string,
    ttlSeconds: number = 600,
    purpose: 'LOGIN' | 'FORGOT_PASSWORD' | 'EMAIL_CHANGE' = 'FORGOT_PASSWORD'
  ): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const prefix = purpose === 'LOGIN' ? 'otp:login' : purpose === 'EMAIL_CHANGE' ? 'otp:email_change' : 'otp:pwd_reset';
    const key = `${prefix}:${normalized}`;
    const attemptsKey = `${key}:attempts`;
    await this.set(key, otp, ttlSeconds);
    await this.del(attemptsKey);
    logger.info(`Stored OTP for ${normalized} (${purpose}) in Redis/Cache with ${ttlSeconds}s TTL`);
  }

  // Detailed OTP verification with friendly attempt tracking & second chance management
  public async verifyOtpDetailed(
    email: string,
    otp: string,
    purpose: 'LOGIN' | 'FORGOT_PASSWORD' | 'EMAIL_CHANGE' = 'FORGOT_PASSWORD',
    maxAttempts: number = 5
  ): Promise<{
    valid: boolean;
    status: 'SUCCESS' | 'INCORRECT' | 'EXPIRED' | 'MAX_ATTEMPTS_EXCEEDED';
    attemptsRemaining?: number;
    message: string;
  }> {
    const normalized = email.trim().toLowerCase();
    const prefix = purpose === 'LOGIN' ? 'otp:login' : purpose === 'EMAIL_CHANGE' ? 'otp:email_change' : 'otp:pwd_reset';
    const key = `${prefix}:${normalized}`;
    const attemptsKey = `${key}:attempts`;
    const stored = await this.get(key);

    if (!stored) {
      return {
        valid: false,
        status: 'EXPIRED',
        message: 'This verification code has expired. Please click "Resend code" to receive a fresh PIN in your Gmail.'
      };
    }

    const currentAttempts = parseInt((await this.get(attemptsKey)) || '0', 10);
    if (currentAttempts >= maxAttempts) {
      await this.del(key);
      await this.del(attemptsKey);
      return {
        valid: false,
        status: 'MAX_ATTEMPTS_EXCEEDED',
        attemptsRemaining: 0,
        message: 'Too many incorrect attempts. For your security, this verification code has been deactivated. Please click "Resend code" to get a new PIN.'
      };
    }

    if (stored.trim() === otp.trim()) {
      // Consume OTP immediately to prevent replay attacks
      await this.del(key);
      await this.del(attemptsKey);
      return {
        valid: true,
        status: 'SUCCESS',
        message: 'Verification code verified successfully.'
      };
    }

    // Incorrect code entered: record attempt and give user another chance
    const newAttempts = currentAttempts + 1;
    const remaining = Math.max(0, maxAttempts - newAttempts);
    await this.set(attemptsKey, String(newAttempts), 600);

    if (remaining === 0) {
      await this.del(key);
      await this.del(attemptsKey);
      return {
        valid: false,
        status: 'MAX_ATTEMPTS_EXCEEDED',
        attemptsRemaining: 0,
        message: 'Too many incorrect attempts. For your account security, please request a new verification code.'
      };
    }

    return {
      valid: false,
      status: 'INCORRECT',
      attemptsRemaining: remaining,
      message: `Incorrect 6-digit PIN. Please check your Gmail and try again (${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} remaining).`
    };
  }

  public async verifyAndConsumeOTP(
    email: string,
    otp: string,
    purpose: 'LOGIN' | 'FORGOT_PASSWORD' | 'EMAIL_CHANGE' = 'FORGOT_PASSWORD'
  ): Promise<boolean> {
    const result = await this.verifyOtpDetailed(email, otp, purpose);
    return result.valid;
  }

  /**
   * Health Check with latency ping for diagnostic monitoring
   */
  public async healthCheck(): Promise<{
    ok: boolean;
    status: 'HEALTHY' | 'DEGRADED_FALLBACK' | 'UNHEALTHY';
    mode: 'STANDALONE_REDIS' | 'IN_MEMORY_FALLBACK';
    latencyMs: number;
    error?: string;
  }> {
    if (this.isRedisReady && this.client) {
      const start = Date.now();
      try {
        await this.client.ping();
        return {
          ok: true,
          status: 'HEALTHY',
          mode: 'STANDALONE_REDIS',
          latencyMs: Date.now() - start
        };
      } catch (err: any) {
        return {
          ok: true, // Degraded to memory mode without breaking app
          status: 'DEGRADED_FALLBACK',
          mode: 'IN_MEMORY_FALLBACK',
          latencyMs: Date.now() - start,
          error: err.message
        };
      }
    }

    return {
      ok: true,
      status: 'HEALTHY',
      mode: 'IN_MEMORY_FALLBACK',
      latencyMs: 0
    };
  }

  // Diagnostic Stats for Observability
  public getStats() {
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? `${((this.hits / totalRequests) * 100).toFixed(1)}%` : '100%';
    return {
      status: this.isRedisReady ? 'HEALTHY' : 'IN_MEMORY_FALLBACK',
      mode: this.isRedisReady ? 'REDIS_ENGINE' : 'IN_MEMORY_CLUSTER',
      activeKeys: this.memoryStore.size,
      hits: this.hits,
      misses: this.misses,
      hitRate,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryBytes: Math.round(process.memoryUsage().heapUsed)
    };
  }

  public async close(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
      this.client = null;
      this.isRedisReady = false;
    }
  }
}

export const redisService = new RedisService();
