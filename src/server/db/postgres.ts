import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config/config';
import { logger } from '../utils/logger';

export class PostgresDatabase {
  private static instance: PostgresDatabase;
  private pool: Pool | null = null;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): PostgresDatabase {
    if (!PostgresDatabase.instance) {
      PostgresDatabase.instance = new PostgresDatabase();
    }
    return PostgresDatabase.instance;
  }

  /**
   * Initializes connection pool and ensures the target database exists.
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized && this.pool) {
      return;
    }

    try {
      // Step 1: Ensure database exists only for standalone local setups (managed cloud databases like Supabase pre-exist)
      if (!config.databaseUrl) {
        await this.ensureDatabaseExists();
      }

      // Step 2: Auto-detect SSL requirement for Supabase, Cloud DBs, or when explicitly requested
      const isCloudTarget = !!(
        config.databaseUrl &&
        (config.databaseUrl.includes('supabase') ||
          config.databaseUrl.includes('pooler') ||
          config.databaseUrl.includes('sslmode=require') ||
          config.databaseUrl.includes('render.com') ||
          config.databaseUrl.includes('amazonaws.com') ||
          config.env === 'production')
      );
      const requiresSsl = config.dbSsl || isCloudTarget;
      const sslConfig = requiresSsl ? { rejectUnauthorized: false } : undefined;

      // Step 3: Initialize primary connection pool
      const poolConfig = config.databaseUrl
        ? {
            connectionString: config.databaseUrl,
            ssl: sslConfig,
            min: config.dbPoolMin,
            max: config.dbPoolMax,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 15000
          }
        : {
            host: config.dbHost,
            port: config.dbPort,
            database: config.dbDatabase,
            user: config.dbUsername,
            password: config.dbPassword,
            ssl: sslConfig,
            min: config.dbPoolMin,
            max: config.dbPoolMax,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 15000
          };

      this.pool = new Pool(poolConfig);

      this.pool.on('error', (err) => {
        logger.error('Unexpected error on idle PostgreSQL client pool', { error: err.message, stack: err.stack });
      });

      // Step 4: Test connection
      const client = await this.pool.connect();
      try {
        const res = await client.query('SELECT version(), NOW() AS server_time, current_database() AS db_name');
        logger.info('PostgreSQL database connected successfully', {
          version: res.rows[0].version.split(' on ')[0],
          database: res.rows[0].db_name || config.dbDatabase,
          ssl: !!sslConfig,
          mode: config.databaseUrl ? 'Cloud / Supabase Connection URI' : 'Direct Parameters'
        });
      } finally {
        client.release();
      }

      this.isInitialized = true;
    } catch (err: any) {
      logger.error('Failed to initialize PostgreSQL connection pool', { error: err.message, stack: err.stack });
      throw err;
    }
  }

  private async ensureDatabaseExists(): Promise<void> {
    if (config.databaseUrl) {
      return; // Skip on managed cloud databases (Supabase, Neon, RDS)
    }

    const adminPool = new Pool({
      host: config.dbHost,
      port: config.dbPort,
      database: 'postgres',
      user: config.dbUsername,
      password: config.dbPassword,
      ssl: config.dbSsl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 5000
    });

    try {
      const dbCheck = await adminPool.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [config.dbDatabase]
      );

      if (dbCheck.rows.length === 0) {
        logger.info(`Database "${config.dbDatabase}" does not exist. Creating database...`);
        // Escape database name safely
        const safeDbName = config.dbDatabase.replace(/"/g, '""');
        await adminPool.query(`CREATE DATABASE "${safeDbName}" WITH ENCODING = 'UTF8'`);
        logger.info(`Database "${config.dbDatabase}" created successfully.`);
      }
    } catch (e: any) {
      logger.warn('Database existence verification warning (proceeding with pool init):', { message: e.message });
    } finally {
      await adminPool.end().catch(() => {});
    }
  }

  public getPool(): Pool {
    if (!this.pool) {
      throw new Error('PostgreSQL pool has not been initialized. Call initialize() first.');
    }
    return this.pool;
  }

  /**
   * Executes a parameterized SQL query safely.
   */
  public async query<R extends QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<R>> {
    const pool = this.getPool();
    const start = Date.now();
    try {
      const result = await pool.query<R>(text, params);
      const duration = Date.now() - start;
      if (duration > 500) {
        logger.warn('Slow query detected', { text, duration, rows: result.rowCount });
      }
      return result;
    } catch (err: any) {
      logger.error('PostgreSQL query execution error', { text, params, error: err.message });
      throw err;
    }
  }

  /**
   * Executes operations within an ACID transaction.
   * Automatically executes BEGIN, COMMIT, and ROLLBACK upon error.
   */
  public async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const pool = this.getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Health check returning connection status and pool statistics.
   */
  public async healthCheck(): Promise<{
    ok: boolean;
    latencyMs: number;
    pool: { total: number; idle: number; waiting: number };
    error?: string;
  }> {
    if (!this.pool) {
      return { ok: false, latencyMs: 0, pool: { total: 0, idle: 0, waiting: 0 }, error: 'Pool not initialized' };
    }

    const start = Date.now();
    try {
      await this.pool.query('SELECT 1');
      const latencyMs = Date.now() - start;
      return {
        ok: true,
        latencyMs,
        pool: {
          total: this.pool.totalCount,
          idle: this.pool.idleCount,
          waiting: this.pool.waitingCount
        }
      };
    } catch (err: any) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        pool: {
          total: this.pool.totalCount,
          idle: this.pool.idleCount,
          waiting: this.pool.waitingCount
        },
        error: err.message
      };
    }
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.isInitialized = false;
      logger.info('PostgreSQL connection pool closed');
    }
  }
}

export const postgresDb = PostgresDatabase.getInstance();
