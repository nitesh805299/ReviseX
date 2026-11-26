import mongoose from 'mongoose';
import { Project } from '../models/Project.js';

export async function requireProjectOwner(req, res, next) {
  try {
    const projectId = req.params.id || req.params.projectId || req.body?.projectId;
    if (!projectId || !mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Forbidden: you do not own this project' });
    }

    req.project = project;
    return next();
  } catch (err) {
    return next(err);
  }
}
