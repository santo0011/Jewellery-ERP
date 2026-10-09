import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const tooMany = (req, res) =>
  res.status(429).json({
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' },
    requestId: req.id,
  });

const base = { standardHeaders: 'draft-8', legacyHeaders: false, handler: tooMany, skip: () => env.isTest };

export const apiLimiter = rateLimit({ ...base, windowMs: 60 * 1000, limit: 600 });

export const authLimiter = rateLimit({ ...base, windowMs: 15 * 60 * 1000, limit: 20 });

export const signupLimiter = rateLimit({ ...base, windowMs: 60 * 60 * 1000, limit: 5 });
