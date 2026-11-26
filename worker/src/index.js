import 'dotenv/config';
import express from 'express';
import { z } from 'zod';
import { BrowserSessionManager } from './browserManager.js';
import { validateExternalUrl, SsrfError } from './ssrfGuard.js';
import { startQueueConsumer } from './queueConsumer.js';

export function createWorkerApp(sessionManager = new BrowserSessionManager()) {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Internal worker shared secret check (only if WORKER_SHARED_SECRET is configured)
  app.use((req, res, next) => {
    const secret = process.env.WORKER_SHARED_SECRET;
    if (secret && req.path !== '/health') {
      const provided = req.headers['x-worker-secret'];
      if (provided !== secret) {
        return res.status(401).json({ error: 'Unauthorized worker call' });
      }
    }
    return next();
  });

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'revisex-worker',
      activeSessions: sessionManager.sessions.size,
    });
  });

  app.post('/validate-url', async (req, res, next) => {
    try {
      const { url, allowLoopbackForTest } = z
        .object({
          url: z.string().min(1),
          allowLoopbackForTest: z.boolean().optional(),
        })
        .parse(req.body);
      const result = await validateExternalUrl(url, { allowLoopbackForTest });
      res.json({ valid: true, ...result });
    } catch (err) {
      next(err);
    }
  });

  app.post('/sessions', async (req, res, next) => {
    try {
      const payload = z
        .object({
          sessionId: z.string().min(1),
          url: z.string().min(1),
          viewport: z.enum(['desktop', 'tablet', 'mobile']).optional(),
          patches: z.array(z.any()).optional(),
          allowLoopbackForTest: z.boolean().optional(),
        })
        .parse(req.body);
      const result = await sessionManager.createSession(payload);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post('/sessions/:sessionId/navigate', async (req, res, next) => {
    try {
      const { url, patches } = z
        .object({
          url: z.string().min(1),
          patches: z.array(z.any()).optional(),
        })
        .parse(req.body);
      const result = await sessionManager.navigateAndExtract(req.params.sessionId, url, patches || []);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post('/sessions/:sessionId/viewport', async (req, res, next) => {
    try {
      const { viewport, patches } = z
        .object({
          viewport: z.enum(['desktop', 'tablet', 'mobile']),
          patches: z.array(z.any()).optional(),
        })
        .parse(req.body);
      const result = await sessionManager.setViewport(req.params.sessionId, viewport, patches || []);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post('/sessions/:sessionId/replay', async (req, res, next) => {
    try {
      const { patches } = z.object({ patches: z.array(z.any()) }).parse(req.body);
      const result = await sessionManager.applyPatchesAndCapture(req.params.sessionId, patches);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.get('/sessions/:sessionId', (req, res) => {
    const status = sessionManager.getSessionStatus(req.params.sessionId);
    if (!status) {
      return res.status(404).json({ error: 'Browser session not found or expired' });
    }
    return res.json(status);
  });

  app.get('/sessions/:sessionId/frame', async (req, res, next) => {
    try {
      const frame = await sessionManager.captureFrame(req.params.sessionId);
      res.json(frame);
    } catch (err) {
      next(err);
    }
  });

  app.post('/sessions/:sessionId/action', async (req, res, next) => {
    try {
      const action = z
        .object({
          type: z.enum(['scroll', 'click']),
          x: z.number().optional(),
          y: z.number().optional(),
          deltaX: z.number().optional(),
          deltaY: z.number().optional(),
        })
        .parse(req.body);
      const result = await sessionManager.remoteAction(req.params.sessionId, action);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.delete('/sessions/:sessionId', async (req, res) => {
    const closed = await sessionManager.closeSession(req.params.sessionId);
    res.json({ closed });
  });

  app.use((err, _req, res, _next) => {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid worker request', details: err.errors });
    }
    if (err instanceof SsrfError) {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    const status = err.statusCode || 500;
    return res.status(status).json({
      error: err.message || 'Worker error',
      code: err.code || 'WORKER_ERROR',
    });
  });

  return { app, sessionManager };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const port = Number(process.env.WORKER_PORT || process.env.PORT || 4001);
  const sessionManager = new BrowserSessionManager();
  const { app } = createWorkerApp(sessionManager);
  const queueHandle = startQueueConsumer(sessionManager);

  const server = app.listen(port, () => {
    console.log(`[ReviseX Worker] Listening on http://localhost:${port}`);
  });

  const shutdown = async () => {
    server.close();
    if (queueHandle) {
      await queueHandle.worker.close().catch(() => {});
      await queueHandle.connection.quit().catch(() => {});
    }
    await sessionManager.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
