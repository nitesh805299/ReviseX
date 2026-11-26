import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/auth.routes.js';
import projectRoutes from './routes/project.routes.js';
import browserRoutes from './routes/browser.routes.js';
import changeRoutes from './routes/change.routes.js';
import revisionRoutes from './routes/revision.routes.js';
import shareRoutes from './routes/share.routes.js';
import assetRoutes from './routes/asset.routes.js';
import docsRoutes from './routes/docs.routes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
          fontSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'ws:', 'wss:', ...env.CORS_ORIGINS_LIST],
          frameSrc: ["'self'", 'blob:', 'data:'],
          objectSrc: ["'none'"],
        },
      },
    })
  );

  app.use(
    cors({
      origin: env.CORS_ORIGINS_LIST,
      credentials: true,
    })
  );

  if (env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Static uploads directory (when S3 is not configured)
  app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'revisex-backend', timestamp: new Date().toISOString() });
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/browser', browserRoutes);
  app.use('/api', changeRoutes);
  app.use('/api', revisionRoutes);
  app.use('/api', shareRoutes);
  app.use('/api', assetRoutes);
  app.use('/api', docsRoutes);

  if (process.env.SERVE_FRONTEND === 'true') {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const distDir = path.resolve(__dirname, '../../frontend/dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
          return next();
        }
        return res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
