/**
 * Middleware Index
 * 
 * Export all middleware for easy importing
 */

export { errorHandler, createError } from './errorHandler';
export { requestLogger, logger } from './logger';
export { validateRequest as validateBody } from './validation';
export {
  createRateLimiter,
  apiRateLimiter,
  strictRateLimiter,
  criticalRateLimiter,
  reportRateLimiter,
  getRateLimitStatus,
  clearRateLimit,
  clearAllRateLimits,
} from './rateLimiter';
export {
  securityHeaders,
  xssProtection,
  inputSanitization,
  parameterPollutionPrevention,
  requestSizeLimiter,
  combinedSecurityMiddleware,
  validateContentType,
  isInputSafe,
  sanitizeInput,
} from './security';
