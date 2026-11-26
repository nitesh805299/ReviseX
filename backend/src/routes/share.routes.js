import crypto from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Share } from '../models/Share.js';
import { Project } from '../models/Project.js';
import { Page } from '../models/Page.js';
import { Change } from '../models/Change.js';
import { requireAuth } from '../middleware/auth.js';
import { requireProjectOwner } from '../middleware/ownership.js';
import { validateBody } from '../middleware/validate.js';
import { env } from '../config/env.js';

const router = express.Router();

const createShareSchema = z.object({
  // By default null/unlimited per user preference ("share link par open time ka koi limit na ho")
  expiresInHours: z.number().positive().max(24 * 365).nullable().optional(),
  password: z.string().min(4).max(100).nullable().optional(),
  regenerate: z.boolean().optional(),
});

function hashShareToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// Create or regenerate a share link (Authenticated owner only)
router.post('/projects/:id/shares', requireAuth, requireProjectOwner, validateBody(createShareSchema), async (req, res, next) => {
  try {
    const { expiresInHours = null, password = null, regenerate = false } = req.validatedBody;

    if (regenerate) {
      await Share.updateMany(
        { projectId: req.project._id, revokedAt: null },
        { $set: { revokedAt: new Date() } }
      );
    }

    const rawToken = crypto.randomBytes(24).toString('base64url');
    const tokenHash = hashShareToken(rawToken);
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    const expiresAt = expiresInHours ? new Date(Date.now() + expiresInHours * 3600 * 1000) : null;

    const share = await Share.create({
      projectId: req.project._id,
      tokenHash,
      permission: 'read-only',
      passwordHash,
      expiresAt,
      revokedAt: null,
    });

    req.project.status = 'in_review';
    await req.project.save();

    const shareUrl = `${env.FRONTEND_URL.replace(/\/$/, '')}/share/${rawToken}`;

    return res.status(201).json({
      share: {
        id: share._id.toString(),
        permission: share.permission,
        hasPassword: Boolean(share.passwordHash),
        expiresAt: share.expiresAt,
        revokedAt: share.revokedAt,
        accessCount: share.accessCount,
        createdAt: share.createdAt,
      },
      token: rawToken,
      shareUrl,
    });
  } catch (err) {
    return next(err);
  }
});

// List shares for a project (Owner only)
router.get('/projects/:id/shares', requireAuth, requireProjectOwner, async (req, res, next) => {
  try {
    const shares = await Share.find({ projectId: req.project._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json({
      shares: shares.map((s) => ({
        id: s._id.toString(),
        permission: s.permission,
        hasPassword: Boolean(s.passwordHash),
        expiresAt: s.expiresAt,
        revokedAt: s.revokedAt,
        accessCount: s.accessCount,
        createdAt: s.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// Public read-only preview endpoint — unlimited opens, no login required
router.get('/shares/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    const tokenHash = hashShareToken(token);
    const share = await Share.findOne({ tokenHash });

    if (!share) {
      return res.status(404).json({ error: 'Share link not found or invalid.' });
    }
    if (share.revokedAt) {
      return res.status(410).json({ error: 'This share link has been revoked by the owner.' });
    }
    if (share.expiresAt && share.expiresAt.getTime() <= Date.now()) {
      return res.status(410).json({ error: 'This share link has expired.' });
    }

    // Check optional password ONLY if the owner explicitly configured one
    if (share.passwordHash) {
      const providedPassword = req.headers['x-share-password'] || req.query.password || '';
      if (!providedPassword) {
        return res.status(401).json({
          error: 'Password required to view this shared preview.',
          passwordRequired: true,
        });
      }
      const valid = await bcrypt.compare(String(providedPassword), share.passwordHash);
      if (!valid) {
        return res.status(401).json({
          error: 'Incorrect share link password.',
          passwordRequired: true,
        });
      }
    }

    const project = await Project.findById(share.projectId).lean();
    if (!project) {
      return res.status(404).json({ error: 'Shared project no longer exists.' });
    }

    const [pages, changes] = await Promise.all([
      Page.find({ projectId: project._id }).sort({ createdAt: 1 }).lean(),
      Change.find({ projectId: project._id }).sort({ createdAt: 1 }).lean(),
    ]);

    // Increment informational counter without imposing any limit
    await Share.updateOne({ _id: share._id }, { $inc: { accessCount: 1 } });

    return res.json({
      notice: 'PROPOSED CHANGES — NOT LIVE ON ORIGINAL WEBSITE',
      permission: share.permission,
      share: {
        id: share._id.toString(),
        expiresAt: share.expiresAt,
        accessCount: share.accessCount + 1,
        createdAt: share.createdAt,
      },
      project: {
        id: project._id.toString(),
        name: project.name,
        originalUrl: project.originalUrl,
        status: project.status,
        thumbnail: project.thumbnail,
        updatedAt: project.updatedAt,
      },
      pages,
      changes,
    });
  } catch (err) {
    return next(err);
  }
});

// Explicit read-only guard on any mutation attempt against a share link
router.all('/shares/:token/mutate', (_req, res) => {
  res.status(403).json({ error: 'Share links are strictly read-only. Modifications are not permitted.' });
});

// Revoke share link (Owner only)
router.delete('/shares/:shareId', requireAuth, async (req, res, next) => {
  try {
    const { shareId } = req.params;
    if (!mongoose.isValidObjectId(shareId)) {
      return res.status(400).json({ error: 'Invalid share ID' });
    }

    const share = await Share.findById(shareId);
    if (!share) return res.status(404).json({ error: 'Share link not found' });

    const project = await Project.findById(share.projectId);
    if (!project || project.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    share.revokedAt = new Date();
    await share.save();

    return res.json({ revoked: true, shareId: share._id.toString() });
  } catch (err) {
    return next(err);
  }
});

export default router;
