import crypto from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User } from '../models/User.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().email('Valid email is required').toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email('Valid email is required').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  profileImage: z.string().max(1000).optional(),
});

const forgotSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
});

const resetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(128),
});

router.post('/register', authLimiter, validateBody(registerSchema), async (req, res, next) => {
  try {
    const { name, email, password } = req.validatedBody;
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash });
    const token = signToken(user);

    res.cookie('revisex_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      token,
      user: user.toSafeJSON(),
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/login', authLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.validatedBody;
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = signToken(user);
    res.cookie('revisex_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      token,
      user: user.toSafeJSON(),
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie('revisex_token');
  res.json({ message: 'Logged out successfully.' });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
});

router.patch('/me', requireAuth, validateBody(updateProfileSchema), async (req, res, next) => {
  try {
    const { name, profileImage } = req.validatedBody;
    if (name !== undefined) req.user.name = name;
    if (profileImage !== undefined) req.user.profileImage = profileImage;
    await req.user.save();
    res.json({ user: req.user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
});

router.post('/forgot-password', authLimiter, validateBody(forgotSchema), async (req, res, next) => {
  try {
    const { email } = req.validatedBody;
    const user = await User.findOne({ email });
    let devResetToken = null;
    if (user) {
      const rawToken = crypto.randomBytes(24).toString('hex');
      user.resetTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      user.resetTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await user.save();
      if (process.env.NODE_ENV !== 'production') {
        devResetToken = rawToken;
      }
    }

    return res.json({
      message: 'If an account exists for that email, password reset instructions have been prepared.',
      ...(devResetToken ? { devResetToken } : {}),
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/reset-password', authLimiter, validateBody(resetSchema), async (req, res, next) => {
  try {
    const { token, password } = req.validatedBody;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetTokenHash: tokenHash,
      resetTokenExpiresAt: { $gt: new Date() },
    }).select('+resetTokenHash +resetTokenExpiresAt +passwordHash');

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token.' });
    }

    user.passwordHash = await bcrypt.hash(password, 12);
    user.resetTokenHash = null;
    user.resetTokenExpiresAt = null;
    await user.save();

    return res.json({ message: 'Password updated successfully. You can now log in.' });
  } catch (err) {
    return next(err);
  }
});

export default router;
