import http from 'node:http';
import crypto from 'node:crypto';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import { setWorkerBaseUrl } from '../src/services/browserClient.js';
import { Share } from '../src/models/Share.js';
import { createWorkerApp } from '../../worker/src/index.js';

describe('ReviseX Full Backend & Worker Integration Tests', () => {
  let app;
  let workerHttpServer;
  let workerSessionManager;
  let fixtureServer;
  let fixtureUrl;

  let ownerToken;
  let otherToken;
  let projectId;
  let browserSessionId;
  let revision1Id;
  let shareToken;
  let shareId;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.USE_INMEMORY_MONGO = 'true';
    await connectDatabase();

    // Start isolated Worker HTTP server on ephemeral port
    const workerSetup = createWorkerApp();
    workerSessionManager = workerSetup.sessionManager;
    workerHttpServer = workerSetup.app.listen(0, '127.0.0.1');
    await new Promise((resolve) => workerHttpServer.once('listening', resolve));
    const workerPort = workerHttpServer.address().port;
    setWorkerBaseUrl(`http://127.0.0.1:${workerPort}`);

    // Start target website fixture server
    fixtureServer = http.createServer((req, res) => {
      if (req.url === '/pricing') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>Pricing Plans</h1><p>Simple transparent pricing.</p></body></html>');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html', 'X-Frame-Options': 'SAMEORIGIN' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head><title>Acme SaaS</title></head>
          <body>
            <header><a href="/pricing">Pricing</a></header>
            <main>
              <h1 id="main-headline">Build Better Products</h1>
              <p class="subtitle">Launch faster with modern tools.</p>
              <img id="banner-img" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="Banner" />
            </main>
          </body>
        </html>
      `);
    });
    await new Promise((resolve) => fixtureServer.listen(0, '127.0.0.1', resolve));
    fixtureUrl = `http://127.0.0.1:${fixtureServer.address().port}`;

    app = createApp();
  }, 60000);

  afterAll(async () => {
    await workerSessionManager?.shutdown();
    if (workerHttpServer) await new Promise((r) => workerHttpServer.close(r));
    if (fixtureServer) await new Promise((r) => fixtureServer.close(r));
    await disconnectDatabase();
  }, 30000);

  it('registers, logs in, fetches profile, and handles password reset', async () => {
    const regRes = await request(app).post('/api/auth/register').send({
      name: 'Alice Owner',
      email: 'alice@revisex.test',
      password: 'Password123!',
    });
    expect(regRes.status).toBe(201);
    expect(regRes.body.token).toBeTruthy();
    ownerToken = regRes.body.token;

    // Register second user for ownership tests
    const otherRes = await request(app).post('/api/auth/register').send({
      name: 'Bob Intruder',
      email: 'bob@revisex.test',
      password: 'Password123!',
    });
    expect(otherRes.status).toBe(201);
    otherToken = otherRes.body.token;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe('alice@revisex.test');

    // Forgot + reset password flow
    const forgotRes = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'alice@revisex.test' });
    expect(forgotRes.status).toBe(200);
    expect(forgotRes.body.devResetToken).toBeTruthy();

    const resetRes = await request(app).post('/api/auth/reset-password').send({
      token: forgotRes.body.devResetToken,
      password: 'NewPassword123!',
    });
    expect(resetRes.status).toBe(200);

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'alice@revisex.test',
      password: 'NewPassword123!',
    });
    expect(loginRes.status).toBe(200);
    ownerToken = loginRes.body.token;
  });

  it('blocks SSRF project URLs and creates a valid project with ownership enforcement', async () => {
    const ssrfTargets = [
      'http://localhost:4000/api/auth/me',
      'http://127.0.0.1:4001/health',
      'http://169.254.169.254/latest/meta-data/',
      'ftp://example.com',
    ];
    for (const url of ssrfTargets) {
      const bad = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ originalUrl: url });
      expect(bad.status).toBe(400);
    }

    const createRes = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Acme Review',
        originalUrl: fixtureUrl,
        allowLoopbackForTest: true,
      });
    expect(createRes.status).toBe(201);
    projectId = createRes.body.project._id;

    // Unauthorized user cannot access project
    const forbidden = await request(app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(forbidden.status).toBe(403);
  });

  it('opens isolated browser session, navigates, switches viewport, and saves/replays changes', async () => {
    const sessionRes = await request(app)
      .post('/api/browser/sessions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        projectId,
        viewport: 'desktop',
        allowLoopbackForTest: true,
      });
    expect(sessionRes.status).toBe(201);
    browserSessionId = sessionRes.body.session._id;
    expect(sessionRes.body.snapshotHtml).toContain('Build Better Products');
    expect(sessionRes.body.thumbnail).toMatch(/^data:image\/jpeg;base64,/);

    const h1El = Object.values(sessionRes.body.elements).find((e) => e.tagName === 'h1');
    const imgEl = Object.values(sessionRes.body.elements).find((e) => e.tagName === 'img');
    expect(h1El).toBeDefined();
    expect(imgEl).toBeDefined();

    // Save proposed text, image, and style changes
    const saveChangesRes = await request(app)
      .post(`/api/projects/${projectId}/changes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        replaceAll: true,
        changes: [
          {
            pageUrl: sessionRes.body.page.originalUrl,
            elementId: h1El.elementId,
            elementFingerprint: h1El.fingerprint,
            type: 'text',
            originalValue: 'Build Better Products',
            proposedValue: 'Ship World-Class SaaS',
          },
          {
            pageUrl: sessionRes.body.page.originalUrl,
            elementId: imgEl.elementId,
            elementFingerprint: imgEl.fingerprint,
            type: 'image',
            originalValue: { src: imgEl.src, alt: 'Banner' },
            proposedValue: { src: 'https://example.com/new-banner.png', alt: 'Updated Banner' },
          },
          {
            pageUrl: sessionRes.body.page.originalUrl,
            elementId: h1El.elementId,
            elementFingerprint: h1El.fingerprint,
            type: 'style',
            originalValue: { color: 'rgb(0, 0, 0)' },
            proposedValue: { color: '#2563eb', fontSize: '48px' },
          },
        ],
      });
    expect(saveChangesRes.status).toBe(201);
    expect(saveChangesRes.body.changesCount).toBe(3);

    // Replay patches in Playwright
    const replayRes = await request(app)
      .post(`/api/browser/sessions/${browserSessionId}/replay`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(replayRes.status).toBe(200);
    expect(replayRes.body.replayResult.applied.length).toBe(3);

    // Switch viewport to mobile
    const vpRes = await request(app)
      .post(`/api/browser/sessions/${browserSessionId}/viewport`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ viewport: 'mobile' });
    expect(vpRes.status).toBe(200);
    expect(vpRes.body.viewport).toBe('mobile');

    // Navigate to subpage
    const navRes = await request(app)
      .post(`/api/browser/sessions/${browserSessionId}/navigate`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ url: `${fixtureUrl}/pricing` });
    expect(navRes.status).toBe(200);
    expect(navRes.body.snapshotHtml).toContain('Pricing Plans');

    // Close session
    const closeRes = await request(app)
      .delete(`/api/browser/sessions/${browserSessionId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.closed).toBe(true);
  }, 45000);

  it('creates revisions and restores an earlier revision cleanly', async () => {
    const rev1 = await request(app)
      .post(`/api/projects/${projectId}/revisions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ label: 'Initial client copy' });
    expect(rev1.status).toBe(201);
    revision1Id = rev1.body.revision._id;

    // Clear changes
    await request(app)
      .post(`/api/projects/${projectId}/changes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ replaceAll: true, changes: [] });

    const afterClear = await request(app)
      .get(`/api/projects/${projectId}/changes`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(afterClear.body.changes.length).toBe(0);

    // Restore Revision #1
    const restoreRes = await request(app)
      .post(`/api/projects/${projectId}/revisions/${revision1Id}/restore`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.changes.length).toBe(3);
  });

  it('supports unlimited-open passwordless share links, hashed storage, read-only permissions, and revocation', async () => {
    const createShare = await request(app)
      .post(`/api/projects/${projectId}/shares`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});
    expect(createShare.status).toBe(201);
    expect(createShare.body.token).toBeTruthy();
    expect(createShare.body.share.expiresAt).toBeNull();
    expect(createShare.body.share.hasPassword).toBe(false);
    shareToken = createShare.body.token;
    shareId = createShare.body.share.id;

    // Verify DB stores tokenHash, NOT raw token
    const tokenHash = crypto.createHash('sha256').update(shareToken).digest('hex');
    const stored = await Share.findById(shareId).lean();
    expect(stored.tokenHash).toBe(tokenHash);

    // Open share link 5 times without auth, password, or limit
    for (let i = 0; i < 5; i++) {
      const openRes = await request(app).get(`/api/shares/${shareToken}`);
      expect(openRes.status).toBe(200);
      expect(openRes.body.notice).toBe('PROPOSED CHANGES — NOT LIVE ON ORIGINAL WEBSITE');
      expect(openRes.body.permission).toBe('read-only');
      expect(openRes.body.changes.length).toBe(3);
      expect(openRes.body.share.accessCount).toBe(i + 1);
    }

    // Read-only share guard rejects mutations
    const mutateRes = await request(app).post(`/api/shares/${shareToken}/mutate`).send({});
    expect(mutateRes.status).toBe(403);

    // Revoke share link and confirm 410 Gone
    const revokeRes = await request(app)
      .delete(`/api/shares/${shareId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(revokeRes.status).toBe(200);

    const revokedOpen = await request(app).get(`/api/shares/${shareToken}`);
    expect(revokedOpen.status).toBe(410);
  });

  it('validates asset uploads (accepts PNG, rejects non-image types)', async () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const okUpload = await request(app)
      .post('/api/assets/upload')
      .set('Authorization', `Bearer ${ownerToken}`)
      .field('projectId', projectId)
      .attach('file', pngHeader, { filename: 'logo.png', contentType: 'image/png' });
    expect(okUpload.status).toBe(201);
    expect(okUpload.body.asset.url).toContain('/uploads/');

    const badUpload = await request(app)
      .post('/api/assets/upload')
      .set('Authorization', `Bearer ${ownerToken}`)
      .field('projectId', projectId)
      .attach('file', Buffer.from('alert(1)'), { filename: 'evil.js', contentType: 'application/javascript' });
    expect(badUpload.status).toBe(400);
  });
});
