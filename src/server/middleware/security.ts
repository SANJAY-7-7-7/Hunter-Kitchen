import { Request, Response, NextFunction } from 'express';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { redisService } from '../services/redisService';

// In-Memory Multi-Tier Rate Limiting Bucket
interface RateLimitBucket {
  count: number;
  resetTime: number;
}

const generalRateLimitStore = new Map<string, RateLimitBucket>();
const authRateLimitStore = new Map<string, RateLimitBucket>();
const otpRateLimitStore = new Map<string, RateLimitBucket>();
const orderRateLimitStore = new Map<string, RateLimitBucket>();
const activeSSEConnections = new Map<string, number>();

/**
 * Evaluates rate limit against Redis (cluster distributed) or in-memory fallback
 */
async function evaluateRateLimit(
  bucketKey: string,
  limit: number,
  windowMs: number,
  localStore: Map<string, RateLimitBucket>
): Promise<{ allowed: boolean; remaining: number; retryAfterSec: number }> {
  const windowSec = Math.ceil(windowMs / 1000);

  // 1. If Redis is active, use cluster-wide atomic increment
  if (redisService.isConnected) {
    try {
      const redisKey = `ratelimit:${bucketKey}`;
      const count = await redisService.incr(redisKey, windowSec);
      const allowed = count <= limit;
      const remaining = Math.max(0, limit - count);
      return { allowed, remaining, retryAfterSec: windowSec };
    } catch {
      // Degrade silently to in-memory store
    }
  }

  // 2. High-performance in-memory bucket fallback
  const now = Date.now();
  let bucket = localStore.get(bucketKey);
  if (!bucket || now > bucket.resetTime) {
    bucket = { count: 1, resetTime: now + windowMs };
    localStore.set(bucketKey, bucket);
    return { allowed: true, remaining: limit - 1, retryAfterSec: windowSec };
  }

  bucket.count++;
  const remaining = Math.max(0, limit - bucket.count);
  const retryAfterSec = Math.max(1, Math.ceil((bucket.resetTime - now) / 1000));
  return { allowed: bucket.count <= limit, remaining, retryAfterSec };
}

// Periodic cleanup of expired rate limit keys
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of generalRateLimitStore.entries()) {
    if (now > bucket.resetTime) generalRateLimitStore.delete(key);
  }
  for (const [key, bucket] of authRateLimitStore.entries()) {
    if (now > bucket.resetTime) authRateLimitStore.delete(key);
  }
  for (const [key, bucket] of otpRateLimitStore.entries()) {
    if (now > bucket.resetTime) otpRateLimitStore.delete(key);
  }
  for (const [key, bucket] of orderRateLimitStore.entries()) {
    if (now > bucket.resetTime) orderRateLimitStore.delete(key);
  }
}, 60000);

export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  // 1. Content Security Policy (Hardened - No unsafe-eval, strict frame-ancestors)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://checkout.razorpay.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https: wss:; frame-src https://api.razorpay.com; frame-ancestors 'none';"
  );

  // 2. Clickjacking protection
  res.setHeader('X-Frame-Options', 'DENY');

  // 3. HTTP Strict Transport Security (HSTS)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  // 4. Prevent MIME-sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 5. Modern Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // 6. Restrictive Permissions Policy
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');

  next();
}

/**
 * Multi-Tier Rate Limiting Middleware
 * - Auth endpoints: 15 req/15 min (strictly defends against credential stuffing & brute-force)
 * - Order placement: 30 orders/10 min (defends against automated order flooding)
 * - General APIs: 300 req/min (high throughput for menu, categories, browsing)
 */
export async function rateLimiterMiddleware(req: Request, res: Response, next: NextFunction) {
  // Rate limiting strictly applies to API routes only; bypass for all static/Vite/frontend module assets
  if (
    !req.path.startsWith('/api') ||
    req.path.startsWith('/assets') ||
    req.path.startsWith('/src') ||
    req.path.startsWith('/@') ||
    req.path === '/api/health' ||
    req.path === '/api/events/stream'
  ) {
    return next();
  }

  const clientIp = req.ip || '127.0.0.1';
  const now = Date.now();

  // Tier 1a: Real-Time OTP Dispatch Rate Limiting (POST /api/auth/otp/send)
  if (req.path === '/api/auth/otp/send' && req.method === 'POST') {
    const otpLimit = 5;
    const otpWindowMs = 10 * 60 * 1000; // 5 OTPs per 10 mins per IP
    const { allowed, remaining, retryAfterSec } = await evaluateRateLimit(
      `otp_${clientIp}`,
      otpLimit,
      otpWindowMs,
      otpRateLimitStore
    );

    res.setHeader('X-RateLimit-Limit', otpLimit);
    res.setHeader('X-RateLimit-Remaining', remaining);

    if (!allowed) {
      res.setHeader('Retry-After', retryAfterSec);
      logger.warn(`OTP send rate limit exceeded for IP: ${clientIp}`, { requestId: req.requestId, path: req.path });
      return res.status(429).json({
        success: false,
        error: {
          code: 'OTP_RATE_LIMIT_EXCEEDED',
          message: `Too many OTP requests from this network. Please wait ${Math.ceil(retryAfterSec / 60)} minute(s) before requesting a new code.`
        },
        requestId: req.requestId,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Tier 1b: All Authentication & Credential Endpoints
  if (
    req.path.startsWith('/api/auth/login') ||
    req.path.startsWith('/api/auth/register') ||
    req.path.startsWith('/api/auth/otp') ||
    req.path.startsWith('/api/auth/forgot-password') ||
    req.path.startsWith('/api/auth/reset-password')
  ) {
    const isLocalhost = config.env !== 'production' && (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1');
    const authLimit = isLocalhost ? 500 : 25;
    const authWindowMs = 15 * 60 * 1000; // 15 mins
    const { allowed, remaining, retryAfterSec } = await evaluateRateLimit(
      `auth_${clientIp}`,
      authLimit,
      authWindowMs,
      authRateLimitStore
    );

    res.setHeader('X-RateLimit-Limit', authLimit);
    res.setHeader('X-RateLimit-Remaining', remaining);

    if (!allowed) {
      res.setHeader('Retry-After', retryAfterSec);
      logger.warn(`Auth rate limit exceeded for IP: ${clientIp}`, { requestId: req.requestId, path: req.path });
      return res.status(429).json({
        success: false,
        error: {
          code: 'AUTH_RATE_LIMIT_EXCEEDED',
          message: `Too many authentication attempts. Please retry after ${Math.ceil(retryAfterSec / 60)} minutes.`
        },
        requestId: req.requestId,
        timestamp: new Date().toISOString()
      });
    }
    return next();
  }

  // Tier 2: Order Mutation Endpoints (POST /api/orders)
  if (req.path === '/api/orders' && req.method === 'POST') {
    const orderLimit = 30;
    const orderWindowMs = 10 * 60 * 1000; // 10 mins
    const { allowed, remaining, retryAfterSec } = await evaluateRateLimit(
      `orders_${clientIp}`,
      orderLimit,
      orderWindowMs,
      orderRateLimitStore
    );

    res.setHeader('X-RateLimit-Limit', orderLimit);
    res.setHeader('X-RateLimit-Remaining', remaining);

    if (!allowed) {
      res.setHeader('Retry-After', retryAfterSec);
      logger.warn(`Order placement rate limit exceeded for IP: ${clientIp}`, { requestId: req.requestId });
      return res.status(429).json({
        success: false,
        error: {
          code: 'ORDER_RATE_LIMIT_EXCEEDED',
          message: `Order placement rate limit exceeded. Please wait ${retryAfterSec} seconds before submitting again.`
        },
        requestId: req.requestId,
        timestamp: new Date().toISOString()
      });
    }
    return next();
  }

  // Tier 3: General API Endpoints
  const generalLimit = config.rateLimitMaxRequests || 300;
  const generalWindowMs = config.rateLimitWindowMs || 60000;
  const { allowed, remaining, retryAfterSec } = await evaluateRateLimit(
    `gen_${clientIp}`,
    generalLimit,
    generalWindowMs,
    generalRateLimitStore
  );

  res.setHeader('X-RateLimit-Limit', generalLimit);
  res.setHeader('X-RateLimit-Remaining', remaining);

  if (!allowed) {
    res.setHeader('Retry-After', retryAfterSec);
    logger.warn(`General rate limit exceeded for IP: ${clientIp}`, { requestId: req.requestId, path: req.path });
    return res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests from this IP. Please retry after ${retryAfterSec} seconds.`
      },
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  }

  next();
}

/**
 * SSE Connection Limiter to prevent socket exhaustion (max 5 active streams per IP)
 */
export function sseConnectionTracker(req: Request, res: Response): boolean {
  const clientIp = req.ip || '127.0.0.1';
  const current = activeSSEConnections.get(clientIp) || 0;
  if (current >= 5) {
    return false; // Exceeded max concurrent streams
  }
  activeSSEConnections.set(clientIp, current + 1);
  res.on('close', () => {
    const active = activeSSEConnections.get(clientIp) || 1;
    if (active <= 1) {
      activeSSEConnections.delete(clientIp);
    } else {
      activeSSEConnections.set(clientIp, active - 1);
    }
  });
  return true;
}

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
  res.on('finish', () => {
    const durationMs = Date.now() - (req.startTime || Date.now());
    if (!req.path.startsWith('/assets') && req.path !== '/api/events/stream') {
      logger.info(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs}ms)`, {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs,
        ip: req.ip
      });
    }
  });
  next();
}

export function getRateLimitMetrics() {
  return {
    engine: redisService.isConnected ? 'REDIS_CLUSTER_DISTRIBUTED' : 'IN_MEMORY_FALLBACK',
    authRateLimit: {
      maxRequests: 25,
      windowMinutes: 15,
      activeTrackingIps: authRateLimitStore.size
    },
    orderRateLimit: {
      maxRequests: 30,
      windowMinutes: 10,
      activeTrackingIps: orderRateLimitStore.size
    },
    generalApiRateLimit: {
      maxRequests: config.rateLimitMaxRequests || 300,
      windowMinutes: 1,
      activeTrackingIps: generalRateLimitStore.size
    },
    activeSSEStreams: Array.from(activeSSEConnections.values()).reduce((a, b) => a + b, 0)
  };
}
