import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Project } from '../models/Project.js';
import { browserClient } from './browserClient.js';

let ioInstance = null;

export function getIO() {
  return ioInstance;
}

export function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGINS_LIST,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }
      const payload = jwt.verify(token, env.JWT_SECRET);
      socket.userId = payload.sub;
      return next();
    } catch {
      return next(new Error('Invalid socket authentication token'));
    }
  });

  io.on('connection', (socket) => {
    const streamTimers = new Map();

    socket.on('join-project', async ({ projectId }) => {
      if (!projectId) return;
      const project = await Project.findById(projectId).select('ownerId').lean();
      if (!project || project.ownerId.toString() !== socket.userId) {
        socket.emit('editor-error', { error: 'Unauthorized project room' });
        return;
      }
      socket.join(`project:${projectId}`);
      socket.emit('joined-project', { projectId });
    });

    socket.on('leave-project', ({ projectId }) => {
      if (projectId) socket.leave(`project:${projectId}`);
    });

    socket.on('patch-sync', ({ projectId, change }) => {
      if (!projectId || !change) return;
      socket.to(`project:${projectId}`).emit('patch-synced', { change });
    });

    socket.on('element-selected', ({ projectId, elementId }) => {
      if (!projectId) return;
      socket.to(`project:${projectId}`).emit('peer-element-selected', {
        userId: socket.userId,
        elementId,
      });
    });

    // Live browser frame streaming over Socket.IO
    socket.on('stream-start', ({ sessionId, intervalMs = 600 }) => {
      if (!sessionId) return;
      if (streamTimers.has(sessionId)) {
        clearInterval(streamTimers.get(sessionId));
      }
      const safeInterval = Math.max(300, Math.min(2000, Number(intervalMs) || 600));
      const timer = setInterval(async () => {
        try {
          const frameData = await browserClient.captureFrame(sessionId);
          socket.emit('stream-frame', frameData);
        } catch {
          clearInterval(timer);
          streamTimers.delete(sessionId);
        }
      }, safeInterval);
      streamTimers.set(sessionId, timer);
    });

    socket.on('stream-stop', ({ sessionId }) => {
      const timer = streamTimers.get(sessionId);
      if (timer) {
        clearInterval(timer);
        streamTimers.delete(sessionId);
      }
    });

    // WebRTC signaling relay for remote browser streaming sessions
    socket.on('webrtc-signal', ({ projectId, targetSocketId, signal }) => {
      if (targetSocketId) {
        io.to(targetSocketId).emit('webrtc-signal', { from: socket.id, signal });
      } else if (projectId) {
        socket.to(`project:${projectId}`).emit('webrtc-signal', { from: socket.id, signal });
      }
    });

    socket.on('disconnect', () => {
      for (const timer of streamTimers.values()) {
        clearInterval(timer);
      }
      streamTimers.clear();
    });
  });

  ioInstance = io;
  return io;
}
