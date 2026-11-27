import express from 'express';
import { z } from 'zod';
import { Change } from '../models/Change.js';
import { Project } from '../models/Project.js';
import { requireAuth } from '../middleware/auth.js';
import { requireProjectOwner } from '../middleware/ownership.js';
import { validateBody } from '../middleware/validate.js';
import { getIO } from '../services/socketService.js';
import { isValidId } from '../utils/ids.js';

const router = express.Router();

const singleChangeSchema = z.object({
  pageId: z.string().optional().nullable(),
  pageUrl: z.string().min(1),
  clientId: z.string().optional().nullable(),
  elementId: z.string().min(1),
  elementFingerprint: z.record(z.any()),
  type: z.enum(['text', 'image', 'style', 'layout', 'visibility', 'move']),
  originalValue: z.any().optional(),
  proposedValue: z.any(),
});

const batchOrSingleSchema = z.union([
  singleChangeSchema,
  z.object({
    replaceAll: z.boolean().optional(),
    changes: z.array(singleChangeSchema),
  }),
]);

const updateChangeSchema = z.object({
  proposedValue: z.any().optional(),
  unresolved: z.boolean().optional(),
  unresolvedReason: z.string().nullable().optional(),
});

async function refreshProjectChangeCount(projectId) {
  const count = await Change.countDocuments({ projectId });
  await Project.findByIdAndUpdate(projectId, { changesCount: count });
  return count;
}

router.post('/projects/:id/changes', requireAuth, requireProjectOwner, validateBody(batchOrSingleSchema), async (req, res, next) => {
  try {
    const body = req.validatedBody;
    const projectId = req.project._id;

    if ('changes' in body) {
      if (body.replaceAll) {
        await Change.deleteMany({ projectId });
      }
      const docs = body.changes.map((c) => ({
        ...c,
        projectId,
        pageId: c.pageId && isValidId(c.pageId) ? c.pageId : null,
      }));
      const created = docs.length > 0 ? await Change.insertMany(docs) : [];
      const changesCount = await refreshProjectChangeCount(projectId);

      getIO()?.to(`project:${projectId}`).emit('changes-synced', { changesCount });
      return res.status(201).json({ changes: created, changesCount });
    }

    const change = await Change.create({
      ...body,
      projectId,
      pageId: body.pageId && isValidId(body.pageId) ? body.pageId : null,
    });
    const changesCount = await refreshProjectChangeCount(projectId);

    getIO()?.to(`project:${projectId}`).emit('patch-created', { change });
    return res.status(201).json({ change, changesCount });
  } catch (err) {
    return next(err);
  }
});

router.get('/projects/:id/changes', requireAuth, requireProjectOwner, async (req, res, next) => {
  try {
    const changes = await Change.find({ projectId: req.project._id }).sort({ createdAt: 1 }).lean();
    res.json({ changes });
  } catch (err) {
    next(err);
  }
});

router.patch('/changes/:changeId', requireAuth, validateBody(updateChangeSchema), async (req, res, next) => {
  try {
    const { changeId } = req.params;
    if (!isValidId(changeId)) {
      return res.status(400).json({ error: 'Invalid change ID' });
    }

    const change = await Change.findById(changeId);
    if (!change) return res.status(404).json({ error: 'Change not found' });

    const project = await Project.findById(change.projectId);
    if (!project || project.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (req.validatedBody.proposedValue !== undefined) {
      change.proposedValue = req.validatedBody.proposedValue;
    }
    if (req.validatedBody.unresolved !== undefined) {
      change.unresolved = req.validatedBody.unresolved;
    }
    if (req.validatedBody.unresolvedReason !== undefined) {
      change.unresolvedReason = req.validatedBody.unresolvedReason;
    }

    await change.save();
    getIO()?.to(`project:${project._id}`).emit('patch-updated', { change });
    return res.json({ change });
  } catch (err) {
    return next(err);
  }
});

router.delete('/changes/:changeId', requireAuth, async (req, res, next) => {
  try {
    const { changeId } = req.params;
    if (!isValidId(changeId)) {
      return res.status(400).json({ error: 'Invalid change ID' });
    }

    const change = await Change.findById(changeId);
    if (!change) return res.status(404).json({ error: 'Change not found' });

    const project = await Project.findById(change.projectId);
    if (!project || project.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await Change.deleteOne({ _id: change._id });
    const changesCount = await refreshProjectChangeCount(project._id);
    getIO()?.to(`project:${project._id}`).emit('patch-deleted', { changeId });

    return res.json({ deleted: true, changesCount });
  } catch (err) {
    return next(err);
  }
});

export default router;
