import mongoose from 'mongoose';

const changeSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    pageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Page',
      default: null,
      index: true,
    },
    pageUrl: {
      type: String,
      required: true,
    },
    clientId: {
      type: String,
      default: null,
    },
    elementId: {
      type: String,
      required: true,
    },
    elementFingerprint: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    type: {
      type: String,
      enum: ['text', 'image', 'style', 'layout', 'visibility', 'move'],
      required: true,
    },
    originalValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    proposedValue: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    revisionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Revision',
      default: null,
    },
    unresolved: {
      type: Boolean,
      default: false,
    },
    unresolvedReason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

changeSchema.index({ projectId: 1, createdAt: 1 });
changeSchema.index({ projectId: 1, pageUrl: 1, elementId: 1 });

export const Change = mongoose.model('Change', changeSchema);
