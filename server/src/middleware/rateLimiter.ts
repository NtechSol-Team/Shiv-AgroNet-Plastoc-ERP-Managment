/**
 * Rate Limiting Middleware
 * 
 * Protects the API from abuse by limiting request rates.
 * Uses a sliding window algorithm with in-memory storage.
 */

import { Request, Response, NextFunction } from 'express';
import { SERVER_CONFIG } from '../config/app.config';

/**
 * Rate limit entry for tracking requests
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * In-memory store for rate limiting
 * In production, consider using Redis for distributed rate limiting
 */
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Clean up expired entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Clean up every minute

/**
 * Get client identifier for rate limiting
 */
function getClientIdentifier(req: Request): string {
  // Use X-Forwarded-For header if behind a proxy, otherwise use IP
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded
    ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0])
    : req.ip || req.socket.remoteAddress || 'unknown';

  return ip;
}

/**
 * Rate limiter options
 */
interface RateLimiterOptions {
  /** Time window in milliseconds */
  windowMs?: number;
  /** Maximum requests per window */
  maxRequests?: number;
  /** Message to send when rate limited */
  message?: string;
  /** Skip rate limiting for certain conditions */
  skip?: (req: Request) => boolean;
  /** Key generator function */
  keyGenerator?: (req: Request) => string;
}

/**
 * Create a rate limiter middleware
 */
export function createRateLimiter(options: RateLimiterOptions = {}) {
  const {
    windowMs = SERVER_CONFIG.rateLimit.windowMs,
    maxRequests = SERVER_CONFIG.rateLimit.maxRequests,
    message = 'Too many requests, please try again later.',
    skip,
    keyGenerator = getClientIdentifier,
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip rate limiting in development if configured
    if (SERVER_CONFIG.rateLimit.skipInDev && SERVER_CONFIG.server.env === 'development') {
      return next();
    }

    // Skip if custom skip function returns true
    if (skip?.(req)) {
      return next();
    }

    const key = keyGenerator(req);
    const now = Date.now();

    // Get or create entry
    let entry = rateLimitStore.get(key);

    if (!entry || now > entry.resetTime) {
      // Create new entry or reset expired one
      entry = {
        count: 1,
        resetTime: now + windowMs,
      };
      rateLimitStore.set(key, entry);
    } else {
      // Increment count
      entry.count++;
    }

    // Calculate remaining requests
    const remaining = Math.max(0, maxRequests - entry.count);
    const resetTime = Math.ceil((entry.resetTime - now) / 1000);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetTime);

    // Check if rate limited
    if (entry.count > maxRequests) {
      res.setHeader('Retry-After', resetTime);
      return res.status(429).json({
        error: message,
        retryAfter: resetTime,
      });
    }

    next();
  };
}

/**
 * Default rate limiter for general API endpoints
 */
export const apiRateLimiter = createRateLimiter({
  windowMs: SERVER_CONFIG.rateLimit.windowMs,
  maxRequests: SERVER_CONFIG.rateLimit.maxRequests,
  message: 'Too many requests from this IP, please try again later.',
});

/**
 * Stricter rate limiter for sensitive endpoints (auth, payments)
 */
export const strictRateLimiter = createRateLimiter({
  windowMs: SERVER_CONFIG.rateLimit.windowMs,
  maxRequests: SERVER_CONFIG.rateLimit.authMaxRequests,
  message: 'Too many requests for this operation, please try again later.',
});

/**
 * Very strict rate limiter for critical operations (password reset, etc.)
 */
export const criticalRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5,
  message: 'Too many attempts, please try again in an hour.',
});

/**
 * Rate limiter for report generation (CPU-intensive)
 */
export const reportRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  message: 'Too many report requests, please wait a moment.',
});

/**
 * Get rate limit status for a client
 */
export function getRateLimitStatus(clientIp: string): {
  remaining: number;
  resetTime: number;
  isLimited: boolean;
} | null {
  const entry = rateLimitStore.get(clientIp);

  if (!entry) {
    return null;
  }

  const now = Date.now();
  const remaining = Math.max(0, SERVER_CONFIG.rateLimit.maxRequests - entry.count);
  const resetTime = Math.ceil((entry.resetTime - now) / 1000);

  return {
    remaining,
    resetTime,
    isLimited: entry.count > SERVER_CONFIG.rateLimit.maxRequests,
  };
}

/**
 * Clear rate limit for a specific client (admin function)
 */
export function clearRateLimit(clientIp: string): boolean {
  return rateLimitStore.delete(clientIp);
}

/**
 * Clear all rate limits (admin function)
 */
export function clearAllRateLimits(): void {
  rateLimitStore.clear();
}

export default {
  createRateLimiter,
  apiRateLimiter,
  strictRateLimiter,
  criticalRateLimiter,
  reportRateLimiter,
  getRateLimitStatus,
  clearRateLimit,
  clearAllRateLimits,
};
