import express from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Revision } from '../models/Revision.js';
import { Change } from '../models/Change.js';
import { Project } from '../models/Project.js';
import { requireAuth } from '../middleware/auth.js';
import { requireProjectOwner } from '../middleware/ownership.js';
import { validateBody } from '../middleware/validate.js';

const router = express.Router();

const createRevisionSchema = z.object({
  label: z.string().trim().max(120).optional(),
});

router.post('/projects/:id/revisions', requireAuth, requireProjectOwner, validateBody(createRevisionSchema), async (req, res, next) => {
  try {
    const projectId = req.project._id;
    const latest = await Revision.findOne({ projectId }).sort({ revisionNumber: -1 }).lean();
    const nextNumber = latest ? latest.revisionNumber + 1 : 1;

    const currentChanges = await Change.find({ projectId }).sort({ createdAt: 1 }).lean();

    const revision = await Revision.create({
      projectId,
      revisionNumber: nextNumber,
      label: req.validatedBody.label || `Revision #${nextNumber}`,
      changes: currentChanges.map((c) => ({
        pageId: c.pageId,
        pageUrl: c.pageUrl,
        clientId: c.clientId,
        elementId: c.elementId,
        elementFingerprint: c.elementFingerprint,
        type: c.type,
        originalValue: c.originalValue,
        proposedValue: c.proposedValue,
      })),
      createdBy: req.user._id,
    });

    await Change.updateMany({ projectId }, { $set: { revisionId: revision._id } });
    req.project.activeRevisionNumber = nextNumber;
    await req.project.save();

    res.status(201).json({ revision });
  } catch (err) {
    next(err);
  }
});

router.get('/projects/:id/revisions', requireAuth, requireProjectOwner, async (req, res, next) => {
  try {
    const revisions = await Revision.find({ projectId: req.project._id })
      .sort({ revisionNumber: -1 })
      .lean();
    res.json({ revisions });
  } catch (err) {
    next(err);
  }
});

router.post('/projects/:id/revisions/:revisionId/restore', requireAuth, requireProjectOwner, async (req, res, next) => {
  try {
    const { revisionId } = req.params;
    if (!mongoose.isValidObjectId(revisionId)) {
      return res.status(400).json({ error: 'Invalid revision ID' });
    }

    const revision = await Revision.findOne({
      _id: revisionId,
      projectId: req.project._id,
    }).lean();

    if (!revision) {
      return res.status(404).json({ error: 'Revision not found' });
    }

    await Change.deleteMany({ projectId: req.project._id });
    const restoredDocs = (revision.changes || []).map((c) => ({
      projectId: req.project._id,
      pageId: c.pageId || null,
      pageUrl: c.pageUrl,
      clientId: c.clientId || null,
      elementId: c.elementId,
      elementFingerprint: c.elementFingerprint,
      type: c.type,
      originalValue: c.originalValue,
      proposedValue: c.proposedValue,
      revisionId: revision._id,
    }));

    const changes = restoredDocs.length > 0 ? await Change.insertMany(restoredDocs) : [];
    req.project.changesCount = changes.length;
    req.project.activeRevisionNumber = revision.revisionNumber;
    await req.project.save();

    return res.json({ restored: true, revision, changes });
  } catch (err) {
    return next(err);
  }
});

export default router;
