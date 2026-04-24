import { createHmac, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { exchangeCodeForTokens } from '../services/ringcentral.js';
import { prisma } from '../services/db.js';
import { env } from '../env.js';

const router = Router();

// Signed OAuth state tokens expire after 10 minutes.
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Generate a tamper-evident OAuth state string that embeds the accountId.
 * Format: `${accountId}.${nonce}.${iat}.${hmac}` — all URL-safe characters.
 */
export function generateOAuthState(accountId: string): string {
  const nonce = randomBytes(16).toString('hex');
  const iat = Date.now().toString(36);
  const payload = `${accountId}.${nonce}.${iat}`;
  const sig = createHmac('sha256', env.JWT_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

/**
 * Verify a signed OAuth state string. Returns the embedded accountId on
 * success, or null if the signature is invalid or the token has expired.
 */
export function verifyOAuthState(state: string): string | null {
  const parts = state.split('.');
  if (parts.length !== 4) return null;
  const [accountId, nonce, iat, sig] = parts;
  const payload = `${accountId}.${nonce}.${iat}`;
  const expected = createHmac('sha256', env.JWT_SECRET).update(payload).digest('hex');
  // Constant-time comparison to prevent timing attacks.
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  const issuedAt = parseInt(iat, 36);
  if (isNaN(issuedAt) || Date.now() - issuedAt > STATE_MAX_AGE_MS) return null;
  return accountId;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * RingCentral redirects the user back here after they grant access. We exchange
 * the code for tokens (server-side, so the client_secret never touches the
 * browser), persist them encrypted, then close the popup so the parent dashboard
 * can refresh its account list.
 */
router.get('/callback', async (req, res) => {
  const code = String(req.query.code ?? '');
  const state = String(req.query.state ?? '');
  const rcError = req.query.error ? String(req.query.error) : null;

  if (rcError) {
    const accountId = verifyOAuthState(state);
    if (accountId) {
      await prisma.account.update({
        where: { id: accountId },
        data: { status: 'error' },
      }).catch(() => undefined);
    }
    res.status(400).send(renderClosePage(`OAuth error: ${escapeHtml(rcError)}`));
    return;
  }

  if (!code || !state) {
    res.status(400).send(renderClosePage('Missing code or state'));
    return;
  }

  const accountId = verifyOAuthState(state);
  if (!accountId) {
    res.status(400).send(renderClosePage('Invalid or expired OAuth state — please try again'));
    return;
  }

  try {
    await exchangeCodeForTokens(accountId, code);
    res.send(renderClosePage(null));
  } catch (e) {
    await prisma.account.update({
      where: { id: accountId },
      data: { status: 'error' },
    }).catch(() => undefined);
    res.status(500).send(
      renderClosePage(
        e instanceof Error ? escapeHtml(e.message) : 'Token exchange failed',
      ),
    );
  }
});

function renderClosePage(error: string | null): string {
  // error is already HTML-escaped by callers; embed directly into the page.
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>RingCentral connected</title>
<style>body{font-family:Inter,system-ui,sans-serif;padding:40px;text-align:center;color:#0f172a}</style>
</head><body>
<h2>${error ? 'Could not connect' : 'Connected!'}</h2>
<p>${error ?? 'You can close this window — the dashboard has been updated.'}</p>
<script>
  try {
    window.opener && window.opener.postMessage(
      ${JSON.stringify({ type: 'rc_oauth_complete', error: error ?? null })},
      window.location.origin
    );
  } catch (e) {}
  setTimeout(function(){ window.close(); }, 1500);
</script>
</body></html>`;
}

export default router;
