import express from 'express';
import { z } from 'zod';
import { Project } from '../models/Project.js';
import { Page } from '../models/Page.js';
import { Change } from '../models/Change.js';
import { Revision } from '../models/Revision.js';
import { Share } from '../models/Share.js';
import { BrowserSession } from '../models/BrowserSession.js';
import { requireAuth } from '../middleware/auth.js';
import { requireProjectOwner } from '../middleware/ownership.js';
import { validateBody } from '../middleware/validate.js';
import { validateProjectUrl } from '../services/ssrfService.js';

const router = express.Router();

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  originalUrl: z.string().trim().min(1),
  allowLoopbackForTest: z.boolean().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  status: z.enum(['active', 'in_review', 'archived']).optional(),
  thumbnail: z.string().optional(),
});

router.use(requireAuth);

router.post('/', validateBody(createProjectSchema), async (req, res, next) => {
  try {
    const { name, originalUrl, allowLoopbackForTest } = req.validatedBody;
    const normalizedUrl = await validateProjectUrl(originalUrl, { allowLoopbackForTest });
    const hostname = new URL(normalizedUrl).hostname;

    const project = await Project.create({
      ownerId: req.user._id,
      name: name || hostname,
      originalUrl: normalizedUrl,
      status: 'active',
    });

    const initialPage = await Page.create({
      projectId: project._id,
      originalUrl: normalizedUrl,
      title: project.name,
    });

    return res.status(201).json({
      project,
      initialPage,
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { search, status } = req.query;
    const filter = { ownerId: req.user._id };

    if (status && ['active', 'in_review', 'archived'].includes(status)) {
      filter.status = status;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { originalUrl: { $regex: q, $options: 'i' } },
      ];
    }

    const projects = await Project.find(filter).sort({ updatedAt: -1 }).lean();
    res.json({ projects });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireProjectOwner, async (req, res, next) => {
  try {
    const [pages, changes, revisions] = await Promise.all([
      Page.find({ projectId: req.project._id }).sort({ createdAt: 1 }).lean(),
      Change.find({ projectId: req.project._id }).sort({ createdAt: 1 }).lean(),
      Revision.find({ projectId: req.project._id }).sort({ revisionNumber: -1 }).lean(),
    ]);

    res.json({
      project: req.project,
      pages,
      changes,
      revisions,
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireProjectOwner, validateBody(updateProjectSchema), async (req, res, next) => {
  try {
    const { name, status, thumbnail } = req.validatedBody;
    if (name !== undefined) req.project.name = name;
    if (status !== undefined) req.project.status = status;
    if (thumbnail !== undefined) req.project.thumbnail = thumbnail;
    await req.project.save();
    res.json({ project: req.project });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireProjectOwner, async (req, res, next) => {
  try {
    const projectId = req.project._id;
    await Promise.all([
      Page.deleteMany({ projectId }),
      Change.deleteMany({ projectId }),
      Revision.deleteMany({ projectId }),
      Share.deleteMany({ projectId }),
      BrowserSession.deleteMany({ projectId }),
      Project.deleteOne({ _id: projectId }),
    ]);
    res.json({ deleted: true, projectId: projectId.toString() });
  } catch (err) {
    next(err);
  }
});

export default router;
