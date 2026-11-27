import http from 'node:http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import { initSocketServer } from '../src/services/socketService.js';
import { setWorkerBaseUrl } from '../src/services/browserClient.js';
import { createWorkerApp } from '../../worker/src/index.js';

describe('ReviseX End-to-End Browser UI Workflow', () => {
  let appServer;
  let appUrl;
  let workerServer;
  let workerSessionManager;
  let fixtureServer;
  let fixtureUrl;
  let uiBrowser;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_TEST_LOOPBACK = 'true';
    process.env.SERVE_FRONTEND = 'true';

    await connectDatabase();

    // Start isolated Worker
    const workerSetup = createWorkerApp();
    workerSessionManager = workerSetup.sessionManager;
    workerServer = workerSetup.app.listen(0, '127.0.0.1');
    await new Promise((r) => workerServer.once('listening', r));
    setWorkerBaseUrl(`http://127.0.0.1:${workerServer.address().port}`);

    // Start Backend + Built Frontend server
    const app = createApp();
    appServer = http.createServer(app);
    initSocketServer(appServer);
    appServer.listen(0, '127.0.0.1');
    await new Promise((r) => appServer.once('listening', r));
    appUrl = `http://127.0.0.1:${appServer.address().port}`;

    // Start Target Website Fixture
    fixtureServer = http.createServer((req, res) => {
      if (req.url === '/login') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Demo Login</title></head>
            <body style="margin:0;padding:0;font-family:sans-serif;">
              <form onsubmit="event.preventDefault(); if (document.getElementById('demo-pass').value === 'pass123') { document.cookie = 'demo_auth=1; path=/'; window.location.href = '/dashboard'; }">
                <input id="demo-pass" type="password" style="position:fixed;left:40px;top:40px;width:240px;height:40px;" />
                <button type="submit" style="position:fixed;left:40px;top:100px;width:140px;height:40px;">Login</button>
              </form>
            </body>
          </html>
        `);
        return;
      }
      if (req.url === '/dashboard') {
        const hasAuth = (req.headers.cookie || '').includes('demo_auth=1');
        if (!hasAuth) {
          res.writeHead(401, { 'Content-Type': 'text/html' });
          res.end('<html><body>Unauthorized</body></html>');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>User Desktop</title></head>
            <body style="font-family: sans-serif; padding: 40px;">
              <h1 id="dash-h1">Welcome To User Desktop</h1>
            </body>
          </html>
        `);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head><title>Client Demo Site</title></head>
          <body style="font-family: sans-serif; padding: 40px;">
            <h1 id="hero-h1">Original Client Headline</h1>
            <p id="hero-p">Original description copy on live site.</p>
            <img id="hero-logo" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" width="80" height="80" alt="Logo" />
          </body>
        </html>
      `);
    });
    await new Promise((r) => fixtureServer.listen(0, '127.0.0.1', r));
    fixtureUrl = `http://127.0.0.1:${fixtureServer.address().port}`;

    uiBrowser = await workerSessionManager.ensureBrowser();
  }, 60000);

  afterAll(async () => {
    await workerSessionManager?.shutdown();
    if (appServer) await new Promise((r) => appServer.close(r));
    if (workerServer) await new Promise((r) => workerServer.close(r));
    if (fixtureServer) await new Promise((r) => fixtureServer.close(r));
    await disconnectDatabase();
  }, 30000);

  it('registers, creates a project, edits heading in visual canvas, undoes/redoes, and opens share link read-only', async () => {
    const context = await uiBrowser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // 1. Register via real UI
    await page.goto(`${appUrl}/register`, { waitUntil: 'networkidle' });
    await page.fill('input[placeholder="Alex Morgan"]', 'UI Test Client');
    await page.fill('input[placeholder="alex@company.com"]', 'uiclient@revisex.test');
    await page.fill('input[placeholder="••••••••"]', 'StrongPass123!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/dashboard', { timeout: 15000 });
    await page.waitForSelector('text=Visual Website Review Workspace');

    // 2. Create project via quick URL bar
    await page.fill('input[placeholder="https://your-client-website.com"]', fixtureUrl);
    await page.click('button:has-text("Start Editing")');

    await page.waitForURL('**/editor/**', { timeout: 20000 });

    // 3. Wait for sandboxed preview iframe to render target website
    const iframeLocator = page.frameLocator('iframe[title="ReviseX Visual Website Canvas"]');
    await iframeLocator.locator('#hero-h1').waitFor({ state: 'visible', timeout: 20000 });
    expect(await iframeLocator.locator('#hero-h1').textContent()).toBe('Original Client Headline');

    // 4. Click heading in iframe to select it, then edit text in Right Inspector
    await iframeLocator.locator('#hero-h1').click();
    const textarea = page.locator('textarea[placeholder="Enter proposed text..."]');
    await textarea.waitFor({ state: 'visible', timeout: 10000 });
    await textarea.fill('Proposed Launch Headline');

    // Verify preview updates immediately inside iframe
    await expect.poll(async () => iframeLocator.locator('#hero-h1').textContent()).toBe(
      'Proposed Launch Headline'
    );

    // 5. Test Undo & Redo buttons
    await page.click('button[title="Undo"]');
    await expect.poll(async () => iframeLocator.locator('#hero-h1').textContent()).toBe(
      'Original Client Headline'
    );
    await page.click('button[title="Redo"]');
    await expect.poll(async () => iframeLocator.locator('#hero-h1').textContent()).toBe(
      'Proposed Launch Headline'
    );

    // 5b. Toggle Original vs Edited website in editor toolbar
    await page.click('button[title="View original website before any edits"]');
    await expect.poll(async () => iframeLocator.locator('#hero-h1').textContent()).toBe(
      'Original Client Headline'
    );
    await page.click('button[title="View edited website with your changes applied"]');
    await expect.poll(async () => iframeLocator.locator('#hero-h1').textContent()).toBe(
      'Proposed Launch Headline'
    );

    // Wait for exact autosave "Saved" indicator (not "Unsaved")
    await page.getByText('Saved', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });

    // 6. Generate Share Link
    await page.click('button:has-text("Share")');
    await page.click('button:has-text("Generate Share Link")');
    const shareInput = page.locator('input[readonly]');
    await shareInput.waitFor({ state: 'visible', timeout: 10000 });
    const shareUrl = await shareInput.inputValue();
    expect(shareUrl).toContain('/share/');

    await context.close();

    // 7. Open Share Link in a fresh unauthenticated browser context twice
    for (let attempt = 0; attempt < 2; attempt++) {
      const devContext = await uiBrowser.newContext({ viewport: { width: 1440, height: 900 } });
      const devPage = await devContext.newPage();
      await devPage.goto(shareUrl, { waitUntil: 'networkidle' });

      await devPage.waitForSelector('text=PROPOSED CHANGES — NOT LIVE ON ORIGINAL WEBSITE', {
        timeout: 15000,
      });
      await devPage.waitForSelector('text=Proposed Launch Headline');

      const devIframe = devPage.frameLocator('iframe[title="Shared Website Preview"]');
      await devIframe.locator('#hero-h1').waitFor({ state: 'visible', timeout: 15000 });
      await expect.poll(async () => devIframe.locator('#hero-h1').textContent()).toBe(
        'Proposed Launch Headline'
      );

      // Toggle to Original Site comparison
      await devPage.click('button:has-text("Original Site")');
      await expect.poll(async () => devIframe.locator('#hero-h1').textContent()).toBe(
        'Original Client Headline'
      );

      await devContext.close();
    }
  }, 60000);

  it('logs into a protected website in Live Login mode and captures the post-login dashboard for editing', async () => {
    const context = await uiBrowser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // Sign in as the existing UI user
    await page.goto(`${appUrl}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', 'uiclient@revisex.test');
    await page.fill('input[type="password"]', 'StrongPass123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    // Create a project pointing to the protected /login fixture URL
    await page.fill('input[placeholder="https://your-client-website.com"]', `${fixtureUrl}/login`);
    await page.click('button:has-text("Start Editing")');
    await page.waitForURL('**/editor/**', { timeout: 20000 });

    // Switch to Live Login mode
    await page.click('button:has-text("Live Login")');
    const streamImg = page.locator('img[alt="Live isolated Chromium stream"]');
    await streamImg.waitFor({ state: 'visible', timeout: 15000 });

    // Click inside the fixed-position password field (left: 40px, top: 40px -> center ~100, 60)
    const box = await streamImg.boundingBox();
    expect(box).toBeTruthy();
    const clickX = box.x + (100 / 1440) * box.width;
    const clickY = box.y + (60 / 900) * box.height;
    await page.mouse.click(clickX, clickY);

    // Type password via the quick-type bar and submit with Enter
    await page.fill('input[placeholder="Click a field below, then type or paste text here..."]', 'pass123');
    await page.click('button:has-text("Type")');
    await page.click('button[title="Press Enter key"]');

    // Wait for live browser URL sub-bar to reflect /dashboard
    await page.waitForSelector(`text=${fixtureUrl}/dashboard`, { timeout: 15000 });

    // Capture the logged-in dashboard page into the Visual DOM Editor
    await page.click('button:has-text("Capture & Edit This Page")');

    const iframeLocator = page.frameLocator('iframe[title="ReviseX Visual Website Canvas"]');
    await iframeLocator.locator('#dash-h1').waitFor({ state: 'visible', timeout: 15000 });
    expect(await iframeLocator.locator('#dash-h1').textContent()).toBe('Welcome To User Desktop');

    // Edit the post-login dashboard heading
    await iframeLocator.locator('#dash-h1').click();
    const textarea = page.locator('textarea[placeholder="Enter proposed text..."]');
    await textarea.waitFor({ state: 'visible', timeout: 10000 });
    await textarea.fill('Updated Post-Login Desktop');

    await expect.poll(async () => iframeLocator.locator('#dash-h1').textContent()).toBe(
      'Updated Post-Login Desktop'
    );

    await context.close();
  }, 60000);
});
