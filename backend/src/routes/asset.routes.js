import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { Asset } from '../models/Asset.js';
import { Project } from '../models/Project.js';
import { requireAuth } from '../middleware/auth.js';
import { requireProjectOwner } from '../middleware/ownership.js';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  deleteAssetFile,
  uploadAssetFile,
} from '../services/storageService.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      const err = new Error('Only PNG, JPEG, WebP, and GIF images are allowed.');
      err.statusCode = 400;
      return cb(err);
    }
    return cb(null, true);
  },
});

router.post('/assets/upload', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    const projectId = req.body?.projectId;
    if (!projectId || !mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ error: 'Valid projectId is required.' });
    }
    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required.' });
    }

    const uploaded = await uploadAssetFile({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
      projectId: project._id.toString(),
    });

    const asset = await Asset.create({
      projectId: project._id,
      ownerId: req.user._id,
      filename: uploaded.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      url: uploaded.url,
      storageKey: uploaded.storageKey,
    });

    return res.status(201).json({ asset });
  } catch (err) {
    return next(err);
  }
});

router.get('/projects/:id/assets', requireAuth, requireProjectOwner, async (req, res, next) => {
  try {
    const assets = await Asset.find({ projectId: req.project._id }).sort({ createdAt: -1 }).lean();
    res.json({ assets });
  } catch (err) {
    next(err);
  }
});

router.delete('/assets/:assetId', requireAuth, async (req, res, next) => {
  try {
    const { assetId } = req.params;
    if (!mongoose.isValidObjectId(assetId)) {
      return res.status(400).json({ error: 'Invalid asset ID' });
    }
    const asset = await Asset.findById(assetId);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    if (asset.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await deleteAssetFile(asset.storageKey);
    await Asset.deleteOne({ _id: asset._id });
    return res.json({ deleted: true });
  } catch (err) {
    return next(err);
  }
});

export default router;
