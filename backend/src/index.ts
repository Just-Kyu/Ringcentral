import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { env } from './env.js';
import authRoutes from './routes/auth.js';
import accountsRoutes from './routes/accounts.js';
import oauthRoutes from './routes/oauth.js';
import numbersRoutes from './routes/numbers.js';
import callLogRoutes from './routes/callLog.js';
import { startTokenRefreshJob } from './jobs/tokenRefresh.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Running behind a single reverse proxy (Railway, Codespaces port-forwarding,
// etc.). express-rate-limit refuses to honor X-Forwarded-For without an
// explicit trust-proxy setting, so trust one upstream hop.
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false, // Vite/SDK inline scripts; tighten in production via custom CSP.
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

if (env.NODE_ENV !== 'production') {
  app.use(
    cors({
      origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
      credentials: true,
    }),
  );
}

// Rate-limit the auth + OAuth surfaces.
const sensitive = rateLimit({ windowMs: 60_000, max: 30 });
app.use('/api/auth', sensitive);
app.use('/api/oauth', sensitive);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/oauth', oauthRoutes);
app.use('/api/numbers', numbersRoutes);
app.use('/api/call-log', callLogRoutes);

// Production: serve the built frontend bundle.
if (env.NODE_ENV === 'production') {
  const staticDir = path.resolve(__dirname, '../../frontend/dist');
  app.use(express.static(staticDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next();
      return;
    }
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

process.on('unhandledRejection', (reason) => {
  console.error('UnhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('UncaughtException:', err);
});

app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`> Easy Call backend listening on 0.0.0.0:${env.PORT} (${env.NODE_ENV})`);
  startTokenRefreshJob();
});
