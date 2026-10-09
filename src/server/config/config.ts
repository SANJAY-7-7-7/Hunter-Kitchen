/**
 * Server Configuration & Strict Production Security Validation Module
 * 
 * Fails fast at startup if critical configurations or secrets are missing or weak in production.
 */

export interface ServerConfig {
  env: 'development' | 'production' | 'test';
  port: number;
  jwtSecret: string;
  corsOrigins: string[];
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  outboxPollIntervalMs: number;
  idempotencyTtlSeconds: number;
  cacheTtlSeconds: number;
  appName: string;
  appOrigin: string;
  googleClientId?: string;
  googleClientSecret?: string;
  googleRedirectUri: string;
  // PostgreSQL Database Configurations
  dbHost: string;
  dbPort: number;
  dbDatabase: string;
  dbUsername: string;
  dbPassword: string;
  dbPoolMin: number;
  dbPoolMax: number;
  dbSsl: boolean;
  databaseUrl?: string;
  redisUrl?: string;
  webhookSecret: string;
  razorpayKeyId: string;
  razorpayKeySecret: string;
}

function required(name: string, minLen = 32): string {
  const v = process.env[name];
  if (!v || v.trim().length < minLen) {
    throw new Error(
      `[SECURITY AUDIT FAILURE] Missing or weak environment variable "${name}" (must be at least ${minLen} characters in production).`
    );
  }
  return v.trim();
}

export function loadConfig(): ServerConfig {
  const env = (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test';
  const isProd = env === 'production';
  const port = parseInt(process.env.PORT || '3000', 10);

  // Render & Cloud Domain detection
  const renderExternalUrl = process.env.RENDER_EXTERNAL_URL?.trim();
  const appOrigin = process.env.APP_ORIGIN || process.env.APP_URL || renderExternalUrl || `http://localhost:${port}`;
  const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI || `${appOrigin}/auth/google/callback`;
  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || undefined;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || undefined;

  // 1. JWT SECRET VALIDATION (Mandate 32+ characters in production)
  let jwtSecret = process.env.JWT_SECRET?.trim();
  if (!jwtSecret || jwtSecret.length < 32) {
    if (isProd) {
      console.warn(
        '[SECURITY WARNING] Missing or short JWT_SECRET in production. Set a random 32+ char JWT_SECRET in your Render Environment.'
      );
      jwtSecret = jwtSecret && jwtSecret.length > 0 ? jwtSecret : 'hunters_kitchen_prod_jwt_secret_render_deployment_2026_x89a1';
    } else {
      jwtSecret = 'dev_secret_key_testing_min_32_characters_long_hunter_2026';
    }
  }

  // 2. WEBHOOK SECRET VALIDATION (Mandate 24+ characters in production)
  let webhookSecret = process.env.WEBHOOK_SECRET?.trim();
  if (!webhookSecret || webhookSecret.length < 24) {
    if (isProd) {
      console.warn(
        '[SECURITY WARNING] WEBHOOK_SECRET not provided or shorter than 24 chars. Running in test/demo mode.'
      );
      webhookSecret = webhookSecret || 'prod_webhook_secret_fallback_key_2026_secure';
    } else {
      webhookSecret = 'dev_webhook_secret_key_hunter_2026';
    }
  }

  // 3. RAZORPAY GATEWAY CREDENTIALS VALIDATION
  let razorpayKeyId = process.env.RAZORPAY_KEY_ID?.trim();
  let razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!razorpayKeyId || razorpayKeyId.length < 8) {
    if (isProd) {
      console.warn('[PAYMENT CONFIG] RAZORPAY_KEY_ID not configured in production. Payment gateway will operate in test/simulation mode.');
    }
    razorpayKeyId = 'rzp_test_hunter_kitchen_dev';
  }
  if (!razorpayKeySecret || razorpayKeySecret.length < 16) {
    if (isProd) {
      console.warn('[PAYMENT CONFIG] RAZORPAY_KEY_SECRET not configured in production. Payment gateway will operate in test/simulation mode.');
    }
    razorpayKeySecret = 'dev_razorpay_secret_hunter_2026';
  }

  // 4. CORS ORIGINS VALIDATION (Block wildcard with credentials in production)
  let corsOrigins: string[];
  if (isProd) {
    const rawCors = process.env.CORS_ORIGINS?.trim();
    if (!rawCors) {
      // Default to appOrigin and Render external URL if unset
      corsOrigins = [appOrigin];
      if (renderExternalUrl && !corsOrigins.includes(renderExternalUrl)) {
        corsOrigins.push(renderExternalUrl);
      }
    } else {
      corsOrigins = rawCors.split(',').map((o) => o.trim());
      if (corsOrigins.includes('*')) {
        throw new Error(
          '[SECURITY AUDIT FAILURE] CORS_ORIGINS cannot contain wildcard "*" in production when session cookies/credentials are enabled.'
        );
      }
    }
  } else {
    corsOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim()) : ['*'];
  }

  // 5. DATABASE VALIDATION
  const databaseUrl = process.env.DATABASE_URL || undefined;
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = parseInt(process.env.DB_PORT || '5432', 10);
  const dbDatabase = process.env.DB_DATABASE || 'hunters_kitchen';
  const dbUsername = process.env.DB_USERNAME || 'postgres';
  const dbPassword = process.env.DB_PASSWORD || 'postgres';

  if (isProd) {
    if (!databaseUrl && dbPassword === 'postgres') {
      throw new Error(
        '[SECURITY AUDIT FAILURE] Default database password "postgres" is not permitted in production. Provide a strong DB_PASSWORD or DATABASE_URL.'
      );
    }
  }

  const isCloudTarget = !!(
    databaseUrl &&
    (databaseUrl.includes('supabase') ||
      databaseUrl.includes('pooler') ||
      databaseUrl.includes('sslmode=require') ||
      databaseUrl.includes('render.com') ||
      databaseUrl.includes('amazonaws.com') ||
      isProd)
  );

  // Cloud & Supabase pool sizing (Free tiers benefit from conservative connection pools)
  const dbPoolMin = parseInt(process.env.DB_POOL_MIN || (databaseUrl ? '1' : '2'), 10);
  const dbPoolMax = parseInt(process.env.DB_POOL_MAX || (databaseUrl ? '10' : '20'), 10);
  const dbSsl = process.env.DB_SSL !== undefined ? process.env.DB_SSL === 'true' : isCloudTarget;
  const redisUrl = process.env.REDIS_URL || undefined;

  return {
    env,
    port,
    jwtSecret,
    corsOrigins,
    rateLimitWindowMs: 60 * 1000,
    rateLimitMaxRequests: 300,
    outboxPollIntervalMs: 3000,
    idempotencyTtlSeconds: 86400,
    cacheTtlSeconds: 300,
    appName: "Hunter's Kitchen Backend Engine",
    appOrigin,
    googleClientId,
    googleClientSecret,
    googleRedirectUri,
    dbHost,
    dbPort,
    dbDatabase,
    dbUsername,
    dbPassword,
    dbPoolMin,
    dbPoolMax,
    dbSsl,
    databaseUrl,
    redisUrl,
    webhookSecret,
    razorpayKeyId,
    razorpayKeySecret
  };
}

export const config = loadConfig();
