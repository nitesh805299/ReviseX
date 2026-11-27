import mongoose from 'mongoose';

const pageSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    originalUrl: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      default: '',
    },
    viewport: {
      preset: { type: String, enum: ['desktop', 'tablet', 'mobile'], default: 'desktop' },
      width: { type: Number, default: 1440 },
      height: { type: Number, default: 900 },
    },
    snapshotHtml: {
      type: String,
      default: '',
    },
    elements: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    layers: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    navLinks: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
  },
  { timestamps: true }
);

pageSchema.index({ projectId: 1, originalUrl: 1 }, { unique: true });

export const Page = mongoose.model('Page', pageSchema);
