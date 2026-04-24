import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../env.js';
import {
  clearSessionCookie,
  readSession,
  setSessionCookie,
  signSession,
} from '../middleware/auth.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid email or password' });
    return;
  }
  const { email, password } = parsed.data;
  if (
    email.toLowerCase() !== env.APP_USER_EMAIL.toLowerCase() ||
    !env.APP_USER_PASSWORD_HASH ||
    !(await bcrypt.compare(password, env.APP_USER_PASSWORD_HASH))
  ) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }
  setSessionCookie(res, signSession({ email }));
  res.json({ ok: true });
});

router.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

router.get('/me', (req, res) => {
  const session = readSession(req);
  res.json(session ? { email: session.email } : null);
});

export default router;
