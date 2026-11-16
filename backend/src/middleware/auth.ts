import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db/connection';

const JWT_SECRET = process.env.JWT_SECRET || 'coverflow-super-secret-key-2026';

export interface AuthenticatedUser {
  id: string;
  email: string;
  full_name: string;
  role: 'CUSTOMER' | 'ADVISOR' | 'TECHNICIAN' | 'STOREKEEPER' | 'MANAGER' | 'FINANCE' | 'ADMIN';
  branch_id?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export function generateToken(user: AuthenticatedUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // 1. Check development/demo role header first for instant testing and UI switching
    const roleHeader = req.headers['x-user-role'] as string | undefined;
    const emailHeader = req.headers['x-user-email'] as string | undefined;

    if (roleHeader || emailHeader) {
      const email = emailHeader || (roleHeader ? `${roleHeader.toLowerCase()}@coverflow.com` : 'customer@coverflow.com');
      const userRes = await db.query('SELECT id, email, full_name, role, branch_id FROM users WHERE email = $1 LIMIT 1', [email]);
      if (userRes.rows.length > 0) {
        req.user = userRes.rows[0];
        return next();
      }
    }

    // 2. Check Bearer Token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
      req.user = decoded;
      return next();
    }

    // 3. Fallback default demo user if unauthenticated for public inspection
    const defaultRes = await db.query('SELECT id, email, full_name, role, branch_id FROM users WHERE role = $1 LIMIT 1', ['ADVISOR']);
    if (defaultRes.rows.length > 0) {
      req.user = defaultRes.rows[0];
    }
    return next();
  } catch (err: any) {
    res.status(401).json({ error: 'Unauthorized', message: err.message });
  }
}

export function requireRoles(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: 'Forbidden',
        message: `Role ${req.user.role} does not have permission. Required: [${allowedRoles.join(', ')}]`
      });
      return;
    }
    next();
  };
}
