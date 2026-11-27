import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';
import { VIEWPORTS } from './shared/patchEngine.js';
import { validateExternalUrl, SsrfError } from './ssrfGuard.js';
import { detectCompatibilityIssues, extractPageSnapshot } from './domExtractor.js';
import { replayPatchesInPlaywright } from './patchReplayer.js';

const MAX_CONCURRENT_SESSIONS = Number(process.env.WORKER_MAX_SESSIONS || 8);
const SESSION_TTL_MS = Number(process.env.WORKER_SESSION_TTL_MS || 20 * 60 * 1000);
const NAVIGATION_TIMEOUT_MS = Number(process.env.WORKER_NAV_TIMEOUT_MS || 25000);

function findFallbackExecutable() {
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH && fs.existsSync(process.env.PLAYWRIGHT_EXECUTABLE_PATH)) {
    return process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  }
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const msPlaywrightDir = path.join(localAppData, 'ms-playwright');
  if (fs.existsSync(msPlaywrightDir)) {
    const entries = fs.readdirSync(msPlaywrightDir).sort().reverse();
    for (const entry of entries) {
      if (entry.startsWith('chromium_headless_shell-')) {
        const candidate = path.join(msPlaywrightDir, entry, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
        if (fs.existsSync(candidate)) return candidate;
      }
      if (entry.startsWith('chromium-')) {
        const candidate = path.join(msPlaywrightDir, entry, 'chrome-win64', 'chrome.exe');
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  const systemCandidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ];
  return systemCandidates.find((p) => fs.existsSync(p));
}

export class BrowserSessionManager {
  constructor() {
    this.browser = null;
    this.sessions = new Map();
    this.cleanupTimer = setInterval(() => this.cleanupExpiredSessions(), 60 * 1000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  async ensureBrowser() {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-sync',
      '--no-first-run',
    ];
    try {
      this.browser = await chromium.launch({
        headless: true,
        executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
        args: launchArgs,
      });
    } catch (err) {
      const fallbackPath = findFallbackExecutable();
      if (!fallbackPath) throw err;
      this.browser = await chromium.launch({
        headless: true,
        executablePath: fallbackPath,
        args: launchArgs,
      });
    }
    return this.browser;
  }

  async createSession({ sessionId, url, viewport = 'desktop', patches = [], allowLoopbackForTest = false }) {
    if (this.sessions.size >= MAX_CONCURRENT_SESSIONS) {
      await this.cleanupExpiredSessions(true);
      if (this.sessions.size >= MAX_CONCURRENT_SESSIONS) {
        const err = new Error('Worker browser capacity reached. Please close an existing session or retry shortly.');
        err.statusCode = 503;
        throw err;
      }
    }

    const validated = await validateExternalUrl(url, { allowLoopbackForTest });
    const vp = VIEWPORTS[viewport] || VIEWPORTS.desktop;
    const browser = await this.ensureBrowser();

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.deviceScaleFactor || 1,
      isMobile: Boolean(vp.isMobile),
      javaScriptEnabled: true,
      bypassCSP: false,
      acceptDownloads: false,
      ignoreHTTPSErrors: false,
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 ReviseXPreview/1.0',
    });

    // Strict outgoing request & redirect SSRF guard inside the isolated browser context
    await context.route('**/*', async (route) => {
      const req = route.request();
      const reqUrl = req.url();
      const resourceType = req.resourceType();

      // Allow safe inline data/blob URLs for rendered media
      if (reqUrl.startsWith('data:') || reqUrl.startsWith('blob:')) {
        return route.continue();
      }

      try {
        await validateExternalUrl(reqUrl, { allowLoopbackForTest });
      } catch (err) {
        if (err instanceof SsrfError) {
          return route.abort('blockedbyclient');
        }
        return route.abort('failed');
      }

      // Limit heavy unnecessary media/websocket background traffic to preserve worker resources
      if (resourceType === 'media' || resourceType === 'websocket' || resourceType === 'eventsource') {
        return route.abort('blockedbyclient');
      }

      return route.continue();
    });

    const page = await context.newPage();
    page.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);

    const sessionRecord = {
      sessionId,
      context,
      page,
      currentUrl: validated.url,
      viewport,
      allowLoopbackForTest,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
      lastSnapshot: null,
    };
    this.sessions.set(sessionId, sessionRecord);

    try {
      const result = await this.navigateAndExtract(sessionId, validated.url, patches);
      return result;
    } catch (err) {
      await this.closeSession(sessionId);
      throw err;
    }
  }

  async navigateAndExtract(sessionId, targetUrl, patches = []) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      const err = new Error('Browser session not found or expired.');
      err.statusCode = 404;
      throw err;
    }

    const validated = await validateExternalUrl(targetUrl, {
      allowLoopbackForTest: session.allowLoopbackForTest,
    });

    session.expiresAt = Date.now() + SESSION_TTL_MS;
    const { page } = session;

    let mainResponse = null;
    try {
      mainResponse = await page.goto(validated.url, {
        waitUntil: 'domcontentloaded',
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      // Allow hydration/stylesheets to settle briefly without hanging on long-polling sites
      await page.waitForLoadState('networkidle', { timeout: 4500 }).catch(() => {});
      await page.waitForTimeout(250);
    } catch (err) {
      const compatErr = new Error(
        `Could not load "${validated.url}" inside the isolated browser: ${err.message}`
      );
      compatErr.statusCode = 502;
      throw compatErr;
    }

    // Revalidate final URL after any server-side redirects
    const finalUrl = page.url();
    await validateExternalUrl(finalUrl, {
      allowLoopbackForTest: session.allowLoopbackForTest,
    });
    session.currentUrl = finalUrl;

    const status = mainResponse ? mainResponse.status() : 200;
    const compat = await detectCompatibilityIssues(page, status);
    if (!compat.compatible) {
      const err = new Error(compat.message);
      err.statusCode = 422;
      err.code = compat.code;
      throw err;
    }

    // Extract baseline snapshot (with stable data-revisex-id tags)
    const snapshot = await extractPageSnapshot(page, finalUrl);

    // Replay saved patches inside Playwright DOM for verification & thumbnail accuracy
    const replayResult = await replayPatchesInPlaywright(page, patches);

    const screenshotBuffer = await page.screenshot({
      type: 'jpeg',
      quality: 72,
      fullPage: false,
    });
    const thumbnail = `data:image/jpeg;base64,${screenshotBuffer.toString('base64')}`;

    session.lastSnapshot = snapshot;

    return {
      sessionId,
      url: finalUrl,
      title: snapshot.title,
      viewport: session.viewport,
      snapshotHtml: snapshot.snapshotHtml,
      elements: snapshot.elements,
      layers: snapshot.layers,
      navLinks: snapshot.navLinks,
      elementCount: snapshot.elementCount,
      replayResult,
      thumbnail,
      expiresAt: new Date(session.expiresAt).toISOString(),
    };
  }

  async captureCurrentPage(sessionId, patches = []) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      const err = new Error('Browser session not found or expired.');
      err.statusCode = 404;
      throw err;
    }

    session.expiresAt = Date.now() + SESSION_TTL_MS;
    const { page } = session;

    await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(200);

    const finalUrl = page.url();
    await validateExternalUrl(finalUrl, {
      allowLoopbackForTest: session.allowLoopbackForTest,
    });
    session.currentUrl = finalUrl;

    const compat = await detectCompatibilityIssues(page, 200);
    if (!compat.compatible) {
      const err = new Error(compat.message);
      err.statusCode = 422;
      err.code = compat.code;
      throw err;
    }

    const snapshot = await extractPageSnapshot(page, finalUrl);
    const matchingPatches = Array.isArray(patches)
      ? patches.filter((p) => !p.pageUrl || p.pageUrl === finalUrl)
      : [];
    const replayResult = await replayPatchesInPlaywright(page, matchingPatches);

    const screenshotBuffer = await page.screenshot({
      type: 'jpeg',
      quality: 72,
      fullPage: false,
    });
    const thumbnail = `data:image/jpeg;base64,${screenshotBuffer.toString('base64')}`;

    session.lastSnapshot = snapshot;

    return {
      sessionId,
      url: finalUrl,
      title: snapshot.title,
      viewport: session.viewport,
      snapshotHtml: snapshot.snapshotHtml,
      elements: snapshot.elements,
      layers: snapshot.layers,
      navLinks: snapshot.navLinks,
      elementCount: snapshot.elementCount,
      replayResult,
      thumbnail,
      expiresAt: new Date(session.expiresAt).toISOString(),
    };
  }

  async setViewport(sessionId, viewportName, patches = []) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      const err = new Error('Browser session not found or expired.');
      err.statusCode = 404;
      throw err;
    }
    const vp = VIEWPORTS[viewportName] || VIEWPORTS.desktop;
    session.viewport = viewportName;
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    await session.page.setViewportSize({ width: vp.width, height: vp.height });
    await session.page.waitForTimeout(200);
    const replayResult = await replayPatchesInPlaywright(session.page, patches);
    const screenshotBuffer = await session.page.screenshot({ type: 'jpeg', quality: 72 });
    return {
      sessionId,
      viewport: viewportName,
      replayResult,
      frame: `data:image/jpeg;base64,${screenshotBuffer.toString('base64')}`,
    };
  }

  async applyPatchesAndCapture(sessionId, patches = []) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      const err = new Error('Browser session not found or expired.');
      err.statusCode = 404;
      throw err;
    }
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    // Reload clean DOM from original page or apply directly on current page?
    // If patches changed/undone, re-navigating ensures clean baseline before replaying current patch list.
    const replayResult = await replayPatchesInPlaywright(session.page, patches);
    const screenshotBuffer = await session.page.screenshot({ type: 'jpeg', quality: 72 });
    return {
      sessionId,
      replayResult,
      frame: `data:image/jpeg;base64,${screenshotBuffer.toString('base64')}`,
    };
  }

  async captureFrame(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      const err = new Error('Browser session not found or expired.');
      err.statusCode = 404;
      throw err;
    }
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    const liveUrl = session.page.url();
    if (liveUrl && liveUrl !== 'about:blank') {
      session.currentUrl = liveUrl;
    }
    const screenshotBuffer = await session.page.screenshot({ type: 'jpeg', quality: 70 });
    return {
      sessionId,
      url: session.currentUrl,
      viewport: session.viewport,
      frame: `data:image/jpeg;base64,${screenshotBuffer.toString('base64')}`,
    };
  }

  async remoteAction(sessionId, action) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      const err = new Error('Browser session not found or expired.');
      err.statusCode = 404;
      throw err;
    }
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    const { page } = session;

    if (action.type === 'scroll') {
      await page.mouse.wheel(Number(action.deltaX || 0), Number(action.deltaY || 0));
    } else if (action.type === 'click') {
      await page.mouse.click(Number(action.x || 0), Number(action.y || 0));
      await page.waitForTimeout(150);
      await page.waitForLoadState('domcontentloaded', { timeout: 2500 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
    } else if (action.type === 'type') {
      const text = typeof action.text === 'string' ? action.text : '';
      if (text) {
        await page.keyboard.type(text, { delay: 10 });
      }
    } else if (action.type === 'press') {
      const key = typeof action.key === 'string' && action.key ? action.key : 'Enter';
      await page.keyboard.press(key);
      if (key === 'Enter') {
        await page.waitForTimeout(150);
        await page.waitForLoadState('domcontentloaded', { timeout: 2500 }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
      }
    } else if (action.type === 'back') {
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
    } else if (action.type === 'reload') {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
    }

    const liveUrl = page.url();
    if (liveUrl && liveUrl !== 'about:blank') {
      await validateExternalUrl(liveUrl, {
        allowLoopbackForTest: session.allowLoopbackForTest,
      });
      session.currentUrl = liveUrl;
    }

    const screenshotBuffer = await page.screenshot({ type: 'jpeg', quality: 70 });
    return {
      sessionId,
      url: session.currentUrl,
      frame: `data:image/jpeg;base64,${screenshotBuffer.toString('base64')}`,
    };
  }

  getSessionStatus(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return {
      sessionId,
      url: session.currentUrl,
      viewport: session.viewport,
      createdAt: new Date(session.createdAt).toISOString(),
      expiresAt: new Date(session.expiresAt).toISOString(),
      active: Date.now() < session.expiresAt,
    };
  }

  async closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    this.sessions.delete(sessionId);
    try {
      await session.context.close();
    } catch {
      // ignore already closed
    }
    return true;
  }

  async cleanupExpiredSessions(forceOldest = false) {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        await this.closeSession(id);
      }
    }
    if (forceOldest && this.sessions.size >= MAX_CONCURRENT_SESSIONS) {
      let oldestId = null;
      let oldestTime = Infinity;
      for (const [id, session] of this.sessions.entries()) {
        if (session.createdAt < oldestTime) {
          oldestTime = session.createdAt;
          oldestId = id;
        }
      }
      if (oldestId) await this.closeSession(oldestId);
    }
  }

  async shutdown() {
    clearInterval(this.cleanupTimer);
    for (const id of Array.from(this.sessions.keys())) {
      await this.closeSession(id);
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}
