import { Request, Response, NextFunction, CookieOptions } from 'express';
import { authService } from '../services/authService';
import { db } from '../db';
import { config } from '../config/config';
import { UnauthorizedError, ForbiddenError } from '../errors/AppError';
import { User, UserRole, StaffSubRole } from '../../types';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      authToken?: string;
      restaurantId?: string;
    }
  }
}

/**
 * Standard enterprise session cookie configuration
 */
export const SESSION_COOKIE_NAME = 'hk_session';

export function getSessionCookieOptions(): CookieOptions {
  const isProd = config.env === 'production' || process.env.NODE_ENV === 'production';
  const sameSiteEnv = (process.env.COOKIE_SAMESITE?.toLowerCase() as 'lax' | 'strict' | 'none') || undefined;
  const sameSite = sameSiteEnv || (isProd ? 'none' : 'lax');

  return {
    httpOnly: true,
    secure: isProd,
    sameSite: sameSite,
    path: '/',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  };
}

export function getClearCookieOptions(): CookieOptions {
  const isProd = config.env === 'production' || process.env.NODE_ENV === 'production';
  const sameSiteEnv = (process.env.COOKIE_SAMESITE?.toLowerCase() as 'lax' | 'strict' | 'none') || undefined;
  const sameSite = sameSiteEnv || (isProd ? 'none' : 'lax');

  return {
    httpOnly: true,
    secure: isProd,
    sameSite: sameSite,
    path: '/'
  };
}

/**
 * Extracts session token from cookie (hk_session) or Authorization: Bearer <token>
 */
export function extractToken(req: Request): string | null {
  // 1. Check HTTP-only cookie (primary, XSS-proof session identifier)
  if (req.cookies && req.cookies[SESSION_COOKIE_NAME]) {
    return req.cookies[SESSION_COOKIE_NAME];
  }

  // 2. Check Authorization Bearer header (for in-memory callers, mobile, or CLI tests)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  return null;
}

/**
 * Middleware: Strictly requires authenticated user session (with L1/L2 revocation verification)
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (!token) {
      throw new UnauthorizedError('Authentication required. Please log in.');
    }

    const payload = await authService.verifyTokenAsync(token);
    const user = await db.getUserById(payload.userId);

    if (!user) {
      throw new UnauthorizedError('User account not found or removed.');
    }

    if (user.status === 'SUSPENDED') {
      throw new ForbiddenError('Account has been suspended. Please contact management.');
    }
    if (user.status === 'INACTIVE') {
      throw new ForbiddenError('Account is inactive.');
    }
    if (user.status === 'INVITED') {
      throw new ForbiddenError('Account invitation pending activation.');
    }

    req.user = user;
    req.authToken = token;
    req.restaurantId = user.restaurantId || payload.restaurantId || 'rest_hunter_01';

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware: Optional authentication (loads user if token present)
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (token) {
      const payload = await authService.verifyTokenAsync(token);
      const user = await db.getUserById(payload.userId);
      if (user && user.status === 'ACTIVE') {
        req.user = user;
        req.authToken = token;
        req.restaurantId = user.restaurantId || payload.restaurantId || 'rest_hunter_01';
      }
    }
  } catch (err) {
    // Ignore invalid token for optional auth
  }
  next();
}

/**
 * Middleware: Authorize by Role
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    const userRole = req.user.role;
    const effectiveRoles = userRole === 'OWNER' || userRole === 'ADMIN' ? ['OWNER', 'ADMIN'] : [userRole];
    const isAllowed = roles.some((r) => effectiveRoles.includes(r));

    if (!isAllowed) {
      return next(
        new ForbiddenError(`Access denied: Requires role ${roles.join(' or ')}`)
      );
    }

    next();
  };
}

/**
 * Middleware: Authorize by Staff Sub-Role (Admin/Owner is always permitted)
 */
export function requireStaffSubRole(...subRoles: StaffSubRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (req.user.role === 'OWNER' || req.user.role === 'ADMIN') {
      return next(); // Admin has universal clearance
    }

    if (req.user.role === 'STAFF' && req.user.staffRole && subRoles.includes(req.user.staffRole)) {
      return next();
    }

    return next(new ForbiddenError('Access denied: Insufficient staff permissions for this action.'));
  };
}

/**
 * Middleware: Authorize by fine-grained Permission (Admin/Owner is always permitted)
 */
export function requirePermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (req.user.role === 'OWNER' || req.user.role === 'ADMIN') {
      return next(); // Admin has universal clearance
    }

    const userPermissions = req.user.permissions || [];
    const hasAll = permissions.every((p) => userPermissions.includes(p));

    if (!hasAll) {
      return next(new ForbiddenError(`Access denied: Missing required permission(s)`));
    }

    next();
  };
}

function isAllowedOrigin(originStr: string): boolean {
  if (!originStr) return true;
  try {
    const parsed = new URL(originStr);
    // Always permit local development hosts
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return true;
    }
    if (parsed.hostname.endsWith('.onrender.com')) {
      return true;
    }
    if (config.appOrigin) {
      try {
        const appUrl = new URL(config.appOrigin);
        if (parsed.host === appUrl.host) return true;
      } catch {}
    }
    if (config.corsOrigins && config.corsOrigins.length > 0) {
      // Wildcard '*' must not allow foreign external origins to bypass CSRF verification
      const specificOrigins = config.corsOrigins.filter((o) => o !== '*');
      return specificOrigins.some((allowed) => {
        try {
          return new URL(allowed).host === parsed.host;
        } catch {
          return allowed === originStr;
        }
      });
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Middleware: Enterprise CSRF Protection for state-mutating requests
 * - Enforces Origin / Host header alignment
 * - Enforces custom header (X-Requested-With / X-CSRF-Token) for cookie sessions
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Webhooks are machine-to-machine with cryptographic signature validation (e.g. Razorpay HMAC)
  if (req.path.startsWith('/api/webhooks/')) {
    return next();
  }

  const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!mutatingMethods.includes(req.method)) {
    return next();
  }

  // 1. Verify Origin header against allowed hosts (OWASP Standard Defense)
  const origin = req.headers.origin;
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      const host = req.headers.host;
      const isSameHost = host && originHost === host;
      if (!isSameHost && !isAllowedOrigin(origin)) {
        return next(new ForbiddenError('CSRF protection: untrusted origin rejected'));
      }
    } catch {
      return next(new ForbiddenError('CSRF protection: malformed origin header'));
    }
  }

  // 2. If using cookie authentication, mandate custom headers that cross-site forms cannot produce
  const isCookieAuth = req.cookies && req.cookies[SESSION_COOKIE_NAME];
  const authHeader = req.headers.authorization;
  const hasBearer = authHeader && authHeader.startsWith('Bearer ');

  if (isCookieAuth && !hasBearer) {
    const requestedWith = req.headers['x-requested-with'];
    const csrfToken = req.headers['x-csrf-token'];
    if (!requestedWith && !csrfToken) {
      return next(new ForbiddenError('CSRF protection: missing required request header (X-Requested-With or X-CSRF-Token)'));
    }
  }

  next();
}
