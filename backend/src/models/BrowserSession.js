import mongoose from 'mongoose';

const browserSessionSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    workerSessionId: {
      type: String,
      required: true,
      unique: true,
    },
    currentUrl: {
      type: String,
      required: true,
    },
    viewport: {
      type: String,
      enum: ['desktop', 'tablet', 'mobile'],
      default: 'desktop',
    },
    sessionStatus: {
      type: String,
      enum: ['active', 'closed', 'expired', 'error'],
      default: 'active',
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

export const BrowserSession = mongoose.model('BrowserSession', browserSessionSchema);
