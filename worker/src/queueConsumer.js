import { Worker } from 'bullmq';
import IORedis from 'ioredis';

export const BROWSER_QUEUE_NAME = 'revisex-browser-jobs';

export function startQueueConsumer(sessionManager) {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return null;
  }

  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const worker = new Worker(
    BROWSER_QUEUE_NAME,
    async (job) => {
      const { action, payload } = job.data || {};
      switch (action) {
        case 'createSession':
          return sessionManager.createSession(payload);
        case 'navigate':
          return sessionManager.navigateAndExtract(payload.sessionId, payload.url, payload.patches || []);
        case 'setViewport':
          return sessionManager.setViewport(payload.sessionId, payload.viewport, payload.patches || []);
        case 'replayPatches':
          return sessionManager.applyPatchesAndCapture(payload.sessionId, payload.patches || []);
        case 'closeSession':
          return sessionManager.closeSession(payload.sessionId);
        default:
          throw new Error(`Unknown worker job action: ${action}`);
      }
    },
    { connection, concurrency: 4 }
  );

  worker.on('error', (err) => {
    console.error('[Worker Queue] Error:', err.message);
  });

  return { worker, connection };
}
