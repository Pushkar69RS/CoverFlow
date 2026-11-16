import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

export interface IDbClient {
  query(text: string, params?: any[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface IDbTransactionClient extends IDbClient {
  release(): void;
}

class DatabaseManager {
  private pool: Pool | null = null;
  private pglite: PGlite | null = null;
  private isPgLiteMode: boolean = false;
  private initialized: boolean = false;
  private pgliteMutex: Promise<void> = Promise.resolve();

  private async tryPostgresConnection(): Promise<boolean> {
    const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/coverflow_db';
    const testPool = new Pool({
      connectionString,
      connectionTimeoutMillis: 1500,
      idleTimeoutMillis: 10000,
    });

    try {
      const client = await testPool.connect();
      await client.query('SELECT 1');
      client.release();
      this.pool = testPool;
      this.isPgLiteMode = false;
      console.log('✅ Connected to PostgreSQL 16 server at', connectionString.split('@')[1] || 'localhost');
      return true;
    } catch {
      await testPool.end().catch(() => {});
      return false;
    }
  }

  public async init(): Promise<void> {
    if (this.initialized) return;

    // Check if Postgres is reachable
    const pgSuccess = await this.tryPostgresConnection();
    if (!pgSuccess) {
      console.warn('⚠️  PostgreSQL server not detected on port 5432. Initializing embedded PostgreSQL 16 (PGlite)...');
      const dataDir = path.resolve(__dirname, '../../../data/pglite');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      this.pglite = new PGlite(dataDir);
      this.isPgLiteMode = true;
      console.log('✅ Embedded PostgreSQL 16 (PGlite) active at', dataDir);
    }
    this.initialized = true;
  }

  public isEmbedded(): boolean {
    return this.isPgLiteMode;
  }

  public async query(text: string, params?: any[]): Promise<{ rows: any[]; rowCount: number | null }> {
    await this.init();
    if (this.isPgLiteMode && this.pglite) {
      const res = await this.pglite.query(text, params);
      return { rows: res.rows, rowCount: res.rows.length };
    } else if (this.pool) {
      const res = await this.pool.query(text, params);
      return { rows: res.rows, rowCount: res.rowCount };
    }
    throw new Error('Database not initialized');
  }

  public async exec(script: string): Promise<void> {
    await this.init();
    if (this.isPgLiteMode && this.pglite) {
      await this.pglite.exec(script);
    } else if (this.pool) {
      await this.pool.query(script);
    } else {
      throw new Error('Database not initialized');
    }
  }

  public async getTransactionClient(): Promise<IDbTransactionClient> {
    await this.init();

    if (this.isPgLiteMode && this.pglite) {
      const pglite = this.pglite;

      // Acquire mutex so concurrent transactions on PGlite run sequentially
      let releaseMutex!: () => void;
      const mutexPromise = new Promise<void>((resolve) => {
        releaseMutex = resolve;
      });

      const previousMutex = this.pgliteMutex;
      this.pgliteMutex = this.pgliteMutex.then(() => mutexPromise);
      await previousMutex;

      await pglite.query('BEGIN');
      let committedOrRolledBack = false;

      return {
        async query(text: string, params?: any[]) {
          const res = await pglite.query(text, params);
          if (text.trim().toUpperCase() === 'COMMIT' || text.trim().toUpperCase() === 'ROLLBACK') {
            committedOrRolledBack = true;
          }
          return { rows: res.rows, rowCount: res.rows.length };
        },
        release() {
          if (!committedOrRolledBack) {
            pglite.query('ROLLBACK').catch(() => {});
          }
          releaseMutex();
        }
      };
    } else if (this.pool) {
      const client = await this.pool.connect();
      await client.query('BEGIN');
      return {
        query: (t: string, p?: any[]) => client.query(t, p),
        release: () => client.release()
      };
    }
    throw new Error('Database not initialized');
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
    if (this.pglite) {
      await this.pglite.close();
    }
    this.initialized = false;
  }
}

export const db = new DatabaseManager();
