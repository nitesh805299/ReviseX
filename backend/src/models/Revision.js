import mongoose from 'mongoose';

const revisionSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    revisionNumber: {
      type: Number,
      required: true,
    },
    label: {
      type: String,
      default: '',
    },
    changes: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

revisionSchema.index({ projectId: 1, revisionNumber: -1 }, { unique: true });

export const Revision = mongoose.model('Revision', revisionSchema);
