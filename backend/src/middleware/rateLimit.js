import rateLimit from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 500 : 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again shortly.' },
});

export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: isTest ? 1000 : 180,
  standardHeaders: true,
  legacyHeaders: false,
  // Never rate-limit public share preview reads so share links can be opened any number of times
  skip: (req) => req.path.startsWith('/shares/'),
  message: { error: 'Rate limit exceeded. Please slow down.' },
});
