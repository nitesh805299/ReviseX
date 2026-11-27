import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env.js';

let workerBaseUrlOverride = null;
let queueInstance = null;
let queueEventsInstance = null;

export function setWorkerBaseUrl(url) {
  workerBaseUrlOverride = url;
}

function getWorkerBaseUrl() {
  return (workerBaseUrlOverride || env.WORKER_URL).replace(/\/$/, '');
}

function getQueue() {
  if (!env.REDIS_URL) return null;
  if (!queueInstance) {
    const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
    queueInstance = new Queue('revisex-browser-jobs', { connection });
    queueEventsInstance = new QueueEvents('revisex-browser-jobs', { connection });
  }
  return { queue: queueInstance, queueEvents: queueEventsInstance };
}

async function callWorkerHttp(path, method = 'POST', body = undefined) {
  const headers = { 'Content-Type': 'application/json' };
  if (env.WORKER_SHARED_SECRET) {
    headers['x-worker-secret'] = env.WORKER_SHARED_SECRET;
  }

  let response;
  try {
    response = await fetch(`${getWorkerBaseUrl()}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    const connErr = new Error(`Browser worker unavailable: ${err.message}`);
    connErr.statusCode = 503;
    throw connErr;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.error || `Browser worker error (${response.status})`);
    err.statusCode = response.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

export const browserClient = {
  async createSession(payload) {
    const q = getQueue();
    if (q && process.env.USE_BULLMQ === 'true') {
      const job = await q.queue.add('createSession', { action: 'createSession', payload });
      return job.waitUntilFinished(q.queueEvents, 35000);
    }
    return callWorkerHttp('/sessions', 'POST', payload);
  },

  async navigate(sessionId, payload) {
    return callWorkerHttp(`/sessions/${encodeURIComponent(sessionId)}/navigate`, 'POST', payload);
  },

  async capturePage(sessionId, payload = {}) {
    return callWorkerHttp(`/sessions/${encodeURIComponent(sessionId)}/capture`, 'POST', payload);
  },

  async setViewport(sessionId, payload) {
    return callWorkerHttp(`/sessions/${encodeURIComponent(sessionId)}/viewport`, 'POST', payload);
  },

  async replayPatches(sessionId, patches) {
    return callWorkerHttp(`/sessions/${encodeURIComponent(sessionId)}/replay`, 'POST', { patches });
  },

  async getSessionStatus(sessionId) {
    return callWorkerHttp(`/sessions/${encodeURIComponent(sessionId)}`, 'GET');
  },

  async captureFrame(sessionId) {
    return callWorkerHttp(`/sessions/${encodeURIComponent(sessionId)}/frame`, 'GET');
  },

  async remoteAction(sessionId, action) {
    return callWorkerHttp(`/sessions/${encodeURIComponent(sessionId)}/action`, 'POST', action);
  },

  async closeSession(sessionId) {
    return callWorkerHttp(`/sessions/${encodeURIComponent(sessionId)}`, 'DELETE');
  },
};
