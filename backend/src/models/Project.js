import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    originalUrl: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'in_review', 'archived'],
      default: 'active',
      index: true,
    },
    thumbnail: {
      type: String,
      default: '',
    },
    lastError: {
      type: String,
      default: null,
    },
    changesCount: {
      type: Number,
      default: 0,
    },
    activeRevisionNumber: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

projectSchema.index({ ownerId: 1, updatedAt: -1 });
projectSchema.index({ ownerId: 1, name: 'text', originalUrl: 'text' });

export const Project = mongoose.model('Project', projectSchema);
