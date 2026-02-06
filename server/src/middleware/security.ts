/**
 * Security Middleware
 * 
 * Provides XSS protection, input sanitization, and security headers.
 * Implements defense-in-depth strategy for API security.
 */

import { Request, Response, NextFunction } from 'express';
import { SERVER_CONFIG } from '../config/app.config';

/**
 * XSS patterns to detect and sanitize
 */
const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /<\s*img[^>]*onerror\s*=/gi,
  /<\s*body[^>]*onload\s*=/gi,
  /data:\s*text\/html/gi,
  /expression\s*\(/gi,
  /vbscript:/gi,
];

/**
 * SQL injection patterns to detect
 */
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b)/gi,
  /(--|;|\/\*|\*\/)/g,
  /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/gi,
  /'(\s*)(OR|AND)(\s*)'/gi,
];

/**
 * Check if a string contains XSS patterns
 */
function containsXss(str: string): boolean {
  if (typeof str !== 'string') return false;
  return XSS_PATTERNS.some(pattern => pattern.test(str));
}

/**
 * Check if a string contains SQL injection patterns
 */
function containsSqlInjection(str: string): boolean {
  if (typeof str !== 'string') return false;
  return SQL_INJECTION_PATTERNS.some(pattern => pattern.test(str));
}

/**
 * Sanitize a string by escaping HTML entities
 */
function sanitizeString(str: string): string {
  if (typeof str !== 'string') return str;

  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Deep sanitize an object recursively
 */
function deepSanitize(obj: any, depth: number = 0): any {
  // Prevent infinite recursion
  if (depth > 10) return obj;

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepSanitize(item, depth + 1));
  }

  if (obj && typeof obj === 'object') {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize both key and value
      const sanitizedKey = sanitizeString(key);
      sanitized[sanitizedKey] = deepSanitize(value, depth + 1);
    }
    return sanitized;
  }

  return obj;
}

/**
 * Check an object for dangerous patterns
 */
function checkForDangerousPatterns(obj: any, path: string = ''): string[] {
  const issues: string[] = [];

  if (typeof obj === 'string') {
    if (containsXss(obj)) {
      issues.push(`XSS pattern detected at ${path || 'root'}`);
    }
    if (containsSqlInjection(obj)) {
      issues.push(`SQL injection pattern detected at ${path || 'root'}`);
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      issues.push(...checkForDangerousPatterns(item, `${path}[${index}]`));
    });
  } else if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      issues.push(...checkForDangerousPatterns(value, path ? `${path}.${key}` : key));
    }
  }

  return issues;
}

/**
 * Security headers middleware
 * Adds various security headers to responses
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Prevent XSS attacks
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Content Security Policy (basic)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self';"
  );

  // Permissions Policy
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=()'
  );

  // Remove X-Powered-By header
  res.removeHeader('X-Powered-By');

  next();
}

/**
 * XSS protection middleware
 * Checks request body for XSS patterns
 */
export function xssProtection(req: Request, res: Response, next: NextFunction) {
  if (!SERVER_CONFIG.security.enableXssProtection) {
    return next();
  }

  // Only check requests with body
  if (req.body && Object.keys(req.body).length > 0) {
    const issues = checkForDangerousPatterns(req.body);

    if (issues.length > 0) {
      console.warn(`⚠️ Security: Dangerous pattern detected in request to ${req.path}`);
      console.warn('  Issues:', issues);

      return res.status(400).json({
        error: 'Invalid input detected',
        message: 'Your request contains potentially dangerous content',
      });
    }
  }

  // Check query parameters
  if (req.query && Object.keys(req.query).length > 0) {
    const issues = checkForDangerousPatterns(req.query);

    if (issues.length > 0) {
      console.warn(`⚠️ Security: Dangerous pattern in query params for ${req.path}`);

      return res.status(400).json({
        error: 'Invalid query parameters',
        message: 'Your request contains potentially dangerous content',
      });
    }
  }

  next();
}

/**
 * Input sanitization middleware
 * Sanitizes all string inputs in the request body
 */
export function inputSanitization(req: Request, res: Response, next: NextFunction) {
  if (req.body && Object.keys(req.body).length > 0) {
    req.body = deepSanitize(req.body);
  }

  if (req.query && Object.keys(req.query).length > 0) {
    req.query = deepSanitize(req.query);
  }

  next();
}

/**
 * Parameter pollution prevention middleware
 * Prevents HTTP Parameter Pollution attacks
 */
export function parameterPollutionPrevention(req: Request, res: Response, next: NextFunction) {
  // For query parameters, take only the first value if duplicates exist
  if (req.query) {
    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value)) {
        req.query[key] = value[0];
      }
    }
  }

  next();
}

/**
 * Request size limiter middleware
 * Prevents large payload attacks
 */
export function requestSizeLimiter(maxSize: number = 1024 * 1024) { // 1MB default
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);

    if (contentLength > maxSize) {
      return res.status(413).json({
        error: 'Payload too large',
        message: `Request body exceeds ${maxSize / 1024}KB limit`,
      });
    }

    next();
  };
}

/**
 * Combined security middleware
 * Applies all security measures in one middleware
 */
export function combinedSecurityMiddleware(req: Request, res: Response, next: NextFunction) {
  // Apply security headers
  securityHeaders(req, res, () => {
    // Apply XSS protection
    xssProtection(req, res, () => {
      // Apply parameter pollution prevention
      parameterPollutionPrevention(req, res, next);
    });
  });
}

/**
 * Validate content type middleware
 * Ensures requests have proper content type
 */
export function validateContentType(allowedTypes: string[] = ['application/json']) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only check for methods that typically have a body
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const contentType = req.headers['content-type'];

      if (!contentType) {
        return res.status(415).json({
          error: 'Unsupported Media Type',
          message: 'Content-Type header is required',
        });
      }

      const isAllowed = allowedTypes.some(type =>
        contentType.toLowerCase().includes(type.toLowerCase())
      );

      if (!isAllowed) {
        return res.status(415).json({
          error: 'Unsupported Media Type',
          message: `Allowed content types: ${allowedTypes.join(', ')}`,
        });
      }
    }

    next();
  };
}

/**
 * Utility: Check if input is safe (no dangerous patterns)
 */
export function isInputSafe(input: any): boolean {
  const issues = checkForDangerousPatterns(input);
  return issues.length === 0;
}

/**
 * Utility: Sanitize user input
 */
export function sanitizeInput<T>(input: T): T {
  return deepSanitize(input) as T;
}

export default {
  securityHeaders,
  xssProtection,
  inputSanitization,
  parameterPollutionPrevention,
  requestSizeLimiter,
  combinedSecurityMiddleware,
  validateContentType,
  isInputSafe,
  sanitizeInput,
};
