import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../env.js';

const COOKIE = 'session';

export interface SessionPayload {
  email: string;
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '24h' });
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE, { path: '/' });
}

export function readSession(req: Request): SessionPayload | null {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  try {
    return jwt.verify(token, env.JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export function requireSession(req: Request, res: Response, next: NextFunction) {
  const session = readSession(req);
  if (!session) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  (req as Request & { session: SessionPayload }).session = session;
  next();
}
