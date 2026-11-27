import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { env } from './env.js';

let memoryServer = null;

export async function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (env.MONGO_URI && env.USE_INMEMORY_MONGO !== 'true') {
    await mongoose.connect(env.MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
    });
    console.log('[ReviseX DB] Connected to MongoDB');
    return mongoose.connection;
  }

  if (env.NODE_ENV === 'production') {
    throw new Error('MONGO_URI is required in production');
  }

  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const dbOpts = {};
  if (env.NODE_ENV === 'development') {
    const dataDir = path.resolve(process.cwd(), '.revisex-mongo-data');
    fs.mkdirSync(dataDir, { recursive: true });
    dbOpts.instance = { dbPath: dataDir, storageEngine: 'wiredTiger' };
  }

  memoryServer = await MongoMemoryServer.create(dbOpts);
  const uri = memoryServer.getUri('revisex');
  await mongoose.connect(uri);
  console.log(`[ReviseX DB] Connected to local MongoDB instance (${env.NODE_ENV})`);
  return mongoose.connection;
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}
