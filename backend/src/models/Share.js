import mongoose from 'mongoose';

const shareSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    permission: {
      type: String,
      enum: ['read-only'],
      default: 'read-only',
    },
    // Optional password only if explicitly set; null = open freely without password
    passwordHash: {
      type: String,
      default: null,
    },
    // Null by default = unlimited open time (never expires unless owner explicitly sets an expiry)
    expiresAt: {
      type: Date,
      default: null,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    // Informational analytics counter only — never restricts opens
    accessCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export const Share = mongoose.model('Share', shareSchema);
