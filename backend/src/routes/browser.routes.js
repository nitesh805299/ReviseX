import crypto from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Project } from '../models/Project.js';
import { Page } from '../models/Page.js';
import { Change } from '../models/Change.js';
import { BrowserSession } from '../models/BrowserSession.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { browserClient } from '../services/browserClient.js';
import { validateProjectUrl } from '../services/ssrfService.js';
import { VIEWPORTS } from '../../../shared/patchEngine.js';

const router = express.Router();
router.use(requireAuth);

const createSessionSchema = z.object({
  projectId: z.string().min(1),
  url: z.string().optional(),
  viewport: z.enum(['desktop', 'tablet', 'mobile']).default('desktop'),
  allowLoopbackForTest: z.boolean().optional(),
});

const navigateSchema = z.object({
  url: z.string().min(1),
});

const viewportSchema = z.object({
  viewport: z.enum(['desktop', 'tablet', 'mobile']),
});

const actionSchema = z.object({
  type: z.enum(['scroll', 'click']),
  x: z.number().optional(),
  y: z.number().optional(),
  deltaX: z.number().optional(),
  deltaY: z.number().optional(),
});

async function getOwnedSession(sessionId, userId) {
  if (!mongoose.isValidObjectId(sessionId)) {
    const err = new Error('Invalid session ID');
    err.statusCode = 400;
    throw err;
  }
  const session = await BrowserSession.findById(sessionId);
  if (!session) {
    const err = new Error('Browser session not found');
    err.statusCode = 404;
    throw err;
  }
  if (session.ownerId.toString() !== userId.toString()) {
    const err = new Error('Forbidden: session belongs to another user');
    err.statusCode = 403;
    throw err;
  }
  return session;
}

router.post('/sessions', validateBody(createSessionSchema), async (req, res, next) => {
  try {
    const { projectId, url, viewport, allowLoopbackForTest } = req.validatedBody;
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const targetUrl = await validateProjectUrl(url || project.originalUrl, { allowLoopbackForTest });
    const existingChanges = await Change.find({ projectId: project._id, pageUrl: targetUrl }).lean();
    const workerSessionId = `rx_${project._id}_${crypto.randomBytes(6).toString('hex')}`;

    const workerResult = await browserClient.createSession({
      sessionId: workerSessionId,
      url: targetUrl,
      viewport,
      patches: existingChanges,
      allowLoopbackForTest:
        process.env.NODE_ENV === 'test' &&
        (allowLoopbackForTest === true || process.env.ALLOW_TEST_LOOPBACK === 'true'),
    });

    const vp = VIEWPORTS[viewport] || VIEWPORTS.desktop;
    const pageDoc = await Page.findOneAndUpdate(
      { projectId: project._id, originalUrl: workerResult.url },
      {
        $set: {
          title: workerResult.title,
          viewport: { preset: viewport, width: vp.width, height: vp.height },
          snapshotHtml: workerResult.snapshotHtml,
          elements: workerResult.elements,
          layers: workerResult.layers,
          navLinks: workerResult.navLinks,
        },
      },
      { upsert: true, new: true }
    );

    if (workerResult.thumbnail) {
      project.thumbnail = workerResult.thumbnail;
      project.lastError = null;
      await project.save();
    }

    const sessionDoc = await BrowserSession.create({
      projectId: project._id,
      ownerId: req.user._id,
      workerSessionId,
      currentUrl: workerResult.url,
      viewport,
      sessionStatus: 'active',
      expiresAt: new Date(workerResult.expiresAt),
    });

    return res.status(201).json({
      session: sessionDoc,
      page: pageDoc,
      snapshotHtml: workerResult.snapshotHtml,
      elements: workerResult.elements,
      layers: workerResult.layers,
      navLinks: workerResult.navLinks,
      replayResult: workerResult.replayResult,
      thumbnail: workerResult.thumbnail,
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/sessions/:id', async (req, res, next) => {
  try {
    const session = await getOwnedSession(req.params.id, req.user._id);
    let workerStatus = null;
    try {
      workerStatus = await browserClient.getSessionStatus(session.workerSessionId);
    } catch {
      session.sessionStatus = 'expired';
      await session.save();
    }
    res.json({ session, workerStatus });
  } catch (err) {
    next(err);
  }
});

router.post('/sessions/:id/navigate', validateBody(navigateSchema), async (req, res, next) => {
  try {
    const session = await getOwnedSession(req.params.id, req.user._id);
    const validatedUrl = await validateProjectUrl(req.validatedBody.url, {
      allowLoopbackForTest: process.env.NODE_ENV === 'test',
    });

    const pageChanges = await Change.find({ projectId: session.projectId, pageUrl: validatedUrl }).lean();
    const workerResult = await browserClient.navigate(session.workerSessionId, {
      url: validatedUrl,
      patches: pageChanges,
    });

    const vp = VIEWPORTS[session.viewport] || VIEWPORTS.desktop;
    const pageDoc = await Page.findOneAndUpdate(
      { projectId: session.projectId, originalUrl: workerResult.url },
      {
        $set: {
          title: workerResult.title,
          viewport: { preset: session.viewport, width: vp.width, height: vp.height },
          snapshotHtml: workerResult.snapshotHtml,
          elements: workerResult.elements,
          layers: workerResult.layers,
          navLinks: workerResult.navLinks,
        },
      },
      { upsert: true, new: true }
    );

    session.currentUrl = workerResult.url;
    session.expiresAt = new Date(workerResult.expiresAt);
    await session.save();

    res.json({
      session,
      page: pageDoc,
      snapshotHtml: workerResult.snapshotHtml,
      elements: workerResult.elements,
      layers: workerResult.layers,
      navLinks: workerResult.navLinks,
      replayResult: workerResult.replayResult,
      thumbnail: workerResult.thumbnail,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/sessions/:id/viewport', validateBody(viewportSchema), async (req, res, next) => {
  try {
    const session = await getOwnedSession(req.params.id, req.user._id);
    const { viewport } = req.validatedBody;
    const pageChanges = await Change.find({
      projectId: session.projectId,
      pageUrl: session.currentUrl,
    }).lean();

    const result = await browserClient.setViewport(session.workerSessionId, {
      viewport,
      patches: pageChanges,
    });

    session.viewport = viewport;
    await session.save();

    res.json({ session, ...result });
  } catch (err) {
    next(err);
  }
});

router.post('/sessions/:id/replay', async (req, res, next) => {
  try {
    const session = await getOwnedSession(req.params.id, req.user._id);
    const changes = await Change.find({
      projectId: session.projectId,
      pageUrl: session.currentUrl,
    }).sort({ createdAt: 1 });

    const result = await browserClient.replayPatches(session.workerSessionId, changes);

    const unresolvedMap = new Map(
      (result.replayResult?.unresolved || []).map((u) => [String(u.changeId), u.reason])
    );

    for (const change of changes) {
      const reason = unresolvedMap.get(change._id.toString());
      const shouldBeUnresolved = Boolean(reason);
      if (change.unresolved !== shouldBeUnresolved || change.unresolvedReason !== (reason || null)) {
        change.unresolved = shouldBeUnresolved;
        change.unresolvedReason = reason || null;
        await change.save();
      }
    }

    if (result.frame) {
      await Project.findByIdAndUpdate(session.projectId, { thumbnail: result.frame });
    }

    res.json({ ...result, changes });
  } catch (err) {
    next(err);
  }
});

router.get('/sessions/:id/frame', async (req, res, next) => {
  try {
    const session = await getOwnedSession(req.params.id, req.user._id);
    const frame = await browserClient.captureFrame(session.workerSessionId);
    res.json(frame);
  } catch (err) {
    next(err);
  }
});

router.post('/sessions/:id/action', validateBody(actionSchema), async (req, res, next) => {
  try {
    const session = await getOwnedSession(req.params.id, req.user._id);
    const result = await browserClient.remoteAction(session.workerSessionId, req.validatedBody);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.delete('/sessions/:id', async (req, res, next) => {
  try {
    const session = await getOwnedSession(req.params.id, req.user._id);
    await browserClient.closeSession(session.workerSessionId).catch(() => {});
    session.sessionStatus = 'closed';
    await session.save();
    res.json({ closed: true });
  } catch (err) {
    next(err);
  }
});

export default router;
