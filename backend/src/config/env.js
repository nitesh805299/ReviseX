import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGO_URI: z.string().optional(),
  USE_INMEMORY_MONGO: z.string().optional(),
  JWT_SECRET: z.string().min(16).optional(),
  JWT_EXPIRES_IN: z.string().default('7d'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().optional(),
  WORKER_URL: z.string().default('http://localhost:4001'),
  WORKER_SHARED_SECRET: z.string().optional(),
  REDIS_URL: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),
});

const parsed = envSchema.parse(process.env);

if (parsed.NODE_ENV === 'production' && !parsed.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production (minimum 16 characters).');
}

export const env = {
  ...parsed,
  JWT_SECRET: parsed.JWT_SECRET || 'revisex-dev-jwt-secret-change-in-production-2026',
  CORS_ORIGINS_LIST: parsed.CORS_ORIGINS
    ? parsed.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
    : [parsed.FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
};
