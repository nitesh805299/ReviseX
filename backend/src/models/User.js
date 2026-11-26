import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    profileImage: {
      type: String,
      default: '',
    },
    resetTokenHash: {
      type: String,
      select: false,
      default: null,
    },
    resetTokenExpiresAt: {
      type: Date,
      select: false,
      default: null,
    },
  },
  { timestamps: true }
);

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    profileImage: this.profileImage,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model('User', userSchema);
