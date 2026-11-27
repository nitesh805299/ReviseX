import http from 'node:http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { validateExternalUrl, SsrfError } from '../src/ssrfGuard.js';
import { BrowserSessionManager } from '../src/browserManager.js';

describe('Worker SSRF Protection', () => {
  it('blocks localhost, loopback, private IPs, metadata endpoints, and non-HTTP protocols', async () => {
    const blockedUrls = [
      'http://localhost:3000',
      'http://127.0.0.1:8080/admin',
      'http://[::1]/',
      'http://169.254.169.254/latest/meta-data/',
      'http://metadata.google.internal/computeMetadata/v1/',
      'http://10.0.0.5/secret',
      'http://192.168.1.1/',
      'http://172.16.5.4/',
      'file:///etc/passwd',
      'ftp://example.com/resource',
      'http://admin:secret@example.com/',
      'http://internal.local/dashboard',
    ];

    for (const url of blockedUrls) {
      await expect(validateExternalUrl(url)).rejects.toThrow(SsrfError);
    }
  });

  it('blocks domains whose DNS resolves to private or loopback IPs (DNS rebinding defense)', async () => {
    const fakeLookup = async () => [{ address: '127.0.0.1', family: 4 }];
    await expect(validateExternalUrl('https://evil-rebind.example.com', { lookupFn: fakeLookup })).rejects.toThrow(
      SsrfError
    );

    const metadataLookup = async () => [{ address: '169.254.169.254', family: 4 }];
    await expect(validateExternalUrl('https://meta.example.com', { lookupFn: metadataLookup })).rejects.toThrow(
      SsrfError
    );
  });

  it('allows valid public domains resolving to unicast public IPs', async () => {
    const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
    const result = await validateExternalUrl('https://example.com/about', { lookupFn: publicLookup });
    expect(result.hostname).toBe('example.com');
    expect(result.resolvedIps).toEqual(['93.184.216.34']);
  });
});

describe('Worker Browser Rendering & Patch Replay POC', () => {
  let fixtureServer;
  let fixtureUrl;
  let sessionManager;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    fixtureServer = http.createServer((req, res) => {
      if (req.url === '/about') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>About Us</h1><p>Second page</p></body></html>');
        return;
      }
      if (req.url === '/login') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Login</title></head>
            <body style="margin:0;padding:20px;">
              <form onsubmit="event.preventDefault(); if (document.getElementById('pwd').value === 'secret123') { document.cookie = 'auth=1'; window.location.href = '/dashboard'; }">
                <input id="pwd" type="password" style="position:fixed;left:20px;top:20px;width:220px;height:36px;" />
                <button id="login-btn" type="submit" style="position:fixed;left:20px;top:70px;width:120px;height:36px;">Sign In</button>
              </form>
            </body>
          </html>
        `);
        return;
      }
      if (req.url === '/dashboard') {
        const hasAuth = (req.headers.cookie || '').includes('auth=1');
        if (!hasAuth) {
          res.writeHead(401, { 'Content-Type': 'text/html' });
          res.end('<html><body>Unauthorized</body></html>');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><head><title>Dashboard</title></head><body><h1 id="dash-title">Post-Login Desktop</h1></body></html>');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'X-Frame-Options': 'DENY',
      });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head><title>Fixture Site</title></head>
          <body>
            <header><nav><a href="/about">About</a></nav></header>
            <main>
              <h1 id="hero-title" style="color: rgb(15, 23, 42);">Original Hero Heading</h1>
              <p class="lead">Original paragraph text for editing.</p>
              <img id="hero-img" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="Hero" />
              <button class="cta-btn">Get Started</button>
            </main>
            <script>window.__untrustedScriptExecuted = true;</script>
          </body>
        </html>
      `);
    });

    await new Promise((resolve) => fixtureServer.listen(0, '127.0.0.1', resolve));
    const addr = fixtureServer.address();
    fixtureUrl = `http://127.0.0.1:${addr.port}`;
    sessionManager = new BrowserSessionManager();
  }, 30000);

  afterAll(async () => {
    await sessionManager?.shutdown();
    if (fixtureServer) {
      await new Promise((resolve) => fixtureServer.close(resolve));
    }
  });

  it('rejects localhost when allowLoopbackForTest is false', async () => {
    await expect(
      sessionManager.createSession({
        sessionId: 'ssrf-test',
        url: fixtureUrl,
        allowLoopbackForTest: false,
      })
    ).rejects.toThrow(SsrfError);
  });

  it('renders page in isolated Chromium, strips scripts, extracts fingerprints, and replays verified patches', async () => {
    const result = await sessionManager.createSession({
      sessionId: 'poc-session-1',
      url: fixtureUrl,
      viewport: 'desktop',
      allowLoopbackForTest: true,
    });

    expect(result.title).toBe('Fixture Site');
    expect(result.snapshotHtml).not.toContain('<script>');
    expect(result.snapshotHtml).toContain('Original Hero Heading');
    expect(result.thumbnail).toMatch(/^data:image\/jpeg;base64,/);
    expect(result.navLinks.some((l) => l.pathname === '/about')).toBe(true);

    // Find the H1 element and IMG element from extracted elements
    const h1Entry = Object.values(result.elements).find((el) => el.tagName === 'h1');
    const imgEntry = Object.values(result.elements).find((el) => el.tagName === 'img');
    expect(h1Entry).toBeDefined();
    expect(imgEntry).toBeDefined();

    // Replay verified patches and one mismatched/unresolved patch
    const patches = [
      {
        id: 'patch-text-1',
        elementId: h1Entry.elementId,
        elementFingerprint: h1Entry.fingerprint,
        type: 'text',
        originalValue: 'Original Hero Heading',
        proposedValue: 'Updated No-Code Heading',
      },
      {
        id: 'patch-style-1',
        elementId: h1Entry.elementId,
        elementFingerprint: h1Entry.fingerprint,
        type: 'style',
        originalValue: { color: 'rgb(15, 23, 42)' },
        proposedValue: { color: 'rgb(37, 99, 235)' },
      },
      {
        id: 'patch-unresolved-1',
        elementId: 'rx-el-9999',
        elementFingerprint: { tagName: 'section', domId: 'missing-id', cssPath: 'section#missing' },
        type: 'text',
        originalValue: 'Old',
        proposedValue: 'Should not apply',
      },
    ];

    const replay = await sessionManager.applyPatchesAndCapture('poc-session-1', patches);
    expect(replay.replayResult.applied.length).toBe(2);
    expect(replay.replayResult.unresolved.length).toBe(1);
    expect(replay.replayResult.unresolved[0].changeId).toBe('patch-unresolved-1');

    // Verify DOM inside Playwright actually reflects the updated heading
    const session = sessionManager.sessions.get('poc-session-1');
    const updatedHeading = await session.page.textContent('#hero-title');
    expect(updatedHeading).toBe('Updated No-Code Heading');

    await sessionManager.closeSession('poc-session-1');
    expect(sessionManager.getSessionStatus('poc-session-1')).toBeNull();
  }, 30000);

  it('supports interactive live login (click, type, press) and captures post-login page snapshot', async () => {
    await sessionManager.createSession({
      sessionId: 'login-session-1',
      url: `${fixtureUrl}/login`,
      viewport: 'desktop',
      allowLoopbackForTest: true,
    });

    // Click password input, type password, press Enter to log in
    await sessionManager.remoteAction('login-session-1', { type: 'click', x: 80, y: 38 });
    await sessionManager.remoteAction('login-session-1', { type: 'type', text: 'secret123' });
    const afterLogin = await sessionManager.remoteAction('login-session-1', { type: 'press', key: 'Enter' });

    expect(afterLogin.url).toBe(`${fixtureUrl}/dashboard`);

    const captured = await sessionManager.captureCurrentPage('login-session-1', []);
    expect(captured.url).toBe(`${fixtureUrl}/dashboard`);
    expect(captured.title).toBe('Dashboard');
    expect(captured.snapshotHtml).toContain('Post-Login Desktop');

    await sessionManager.closeSession('login-session-1');
  }, 30000);
});
