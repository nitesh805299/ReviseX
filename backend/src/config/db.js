import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;
const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const initialMigration = '001_initial.sql';

let pool = null;
let connectPromise = null;

async function createPool() {
  if (env.NODE_ENV === 'test') {
    const { newDb } = await import('pg-mem');
    const database = newDb({ autoCreateForeignKeyIndices: true });
    const TestPool = database.adapters.createPg().Pool;
    return new TestPool();
  }

  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Add your Neon connection string to backend/.env.');
  }

  const databasePool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: true },
    max: env.NODE_ENV === 'production' ? 5 : 10,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });
  databasePool.on('error', (error) => {
    console.error('[ReviseX DB] Idle PostgreSQL connection error:', error);
  });
  return databasePool;
}

async function runMigrations(databasePool) {
  const client = await databasePool.connect();
  try {
    await client.query('BEGIN');
    if (env.NODE_ENV !== 'test') await client.query('SELECT pg_advisory_xact_lock($1)', [738194205]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "schema_migrations" (
        "version" TEXT PRIMARY KEY,
        "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const applied = await client.query(
      'SELECT 1 FROM "schema_migrations" WHERE "version" = $1',
      [initialMigration]
    );

    if (applied.rowCount === 0) {
      const migration = await fs.readFile(path.join(migrationsDir, initialMigration), 'utf8');
      await client.query(migration);
      await client.query('INSERT INTO "schema_migrations" ("version") VALUES ($1)', [initialMigration]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function connectDatabase() {
  if (pool) return pool;
  if (!connectPromise) {
    connectPromise = (async () => {
      const databasePool = await createPool();
      try {
        await databasePool.query('SELECT 1');
        await runMigrations(databasePool);
        pool = databasePool;
        console.log(
          env.NODE_ENV === 'test'
            ? '[ReviseX DB] Connected to in-memory PostgreSQL test database'
            : '[ReviseX DB] Connected to PostgreSQL'
        );
        return pool;
      } catch (error) {
        await databasePool.end();
        throw error;
      }
    })().catch((error) => {
      connectPromise = null;
      throw error;
    });
  }
  return connectPromise;
}

export async function query(text, values) {
  const databasePool = pool || (await connectDatabase());
  return databasePool.query(text, values);
}

export async function disconnectDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
    connectPromise = null;
  }
}
