import http from 'node:http';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { createApp } from './app.js';
import { initSocketServer } from './services/socketService.js';

async function startServer() {
  await connectDatabase();
  const app = createApp();
  const httpServer = http.createServer(app);
  initSocketServer(httpServer);

  httpServer.listen(env.PORT, () => {
    console.log(`[ReviseX Backend] Listening on http://localhost:${env.PORT}`);
  });

  const shutdown = async () => {
    httpServer.close();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((err) => {
  console.error('[ReviseX Backend] Failed to start:', err);
  process.exit(1);
});
