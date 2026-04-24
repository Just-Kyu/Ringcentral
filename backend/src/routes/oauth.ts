import { Router } from 'express';
import { exchangeCodeForTokens } from '../services/ringcentral.js';
import { prisma } from '../services/db.js';

const router = Router();

/**
 * RingCentral redirects the user back here after they grant access. We exchange
 * the code for tokens (server-side, so the client_secret never touches the
 * browser), persist them encrypted, then close the popup so the parent dashboard
 * can refresh its account list.
 */
router.get('/callback', async (req, res) => {
  const code = String(req.query.code ?? '');
  const state = String(req.query.state ?? '');
  const error = req.query.error ? String(req.query.error) : null;

  if (error) {
    await prisma.account.update({
      where: { id: state },
      data: { status: 'error' },
    }).catch(() => undefined);
    res.status(400).send(renderClosePage(`OAuth error: ${error}`));
    return;
  }

  if (!code || !state) {
    res.status(400).send(renderClosePage('Missing code or state'));
    return;
  }

  try {
    await exchangeCodeForTokens(state, code);
    res.send(renderClosePage(null));
  } catch (e) {
    await prisma.account.update({
      where: { id: state },
      data: { status: 'error' },
    }).catch(() => undefined);
    res.status(500).send(
      renderClosePage(e instanceof Error ? e.message : 'Token exchange failed'),
    );
  }
});

function renderClosePage(error: string | null): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>RingCentral connected</title>
<style>body{font-family:Inter,system-ui,sans-serif;padding:40px;text-align:center;color:#0f172a}</style>
</head><body>
<h2>${error ? 'Could not connect' : 'Connected!'}</h2>
<p>${error ? error.replace(/[<>]/g, '') : 'You can close this window — the dashboard has been updated.'}</p>
<script>
  try { window.opener && window.opener.postMessage(${JSON.stringify({
    type: 'rc_oauth_complete',
    error,
  })}, '*'); } catch (e) {}
  setTimeout(function(){ window.close(); }, 1500);
</script>
</body></html>`;
}

export default router;
