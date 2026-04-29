import { Router } from 'express';
import { prisma } from '../services/db.js';
import { requireSession } from '../middleware/auth.js';
import { fetchRecordingStream, listRecordingsForUser } from '../services/ringcentral.js';

const router = Router();
router.use(requireSession);

/**
 * GET /api/recordings
 * Lists recorded calls across the signed-in user's connected RingCentral
 * accounts, newest first.
 */
router.get('/', async (req, res) => {
  try {
    const items = await listRecordingsForUser(req.session!.userId);
    res.json(items);
  } catch (e) {
    console.error('GET /api/recordings failed:', e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to list recordings' });
  }
});

/**
 * GET /api/recordings/:accountId/:recordingId/audio
 * Streams the recording audio. Verifies the account belongs to the
 * signed-in user, then proxies the bytes from RingCentral so the
 * server-only access token never reaches the browser.
 */
router.get('/:accountId/:recordingId/audio', async (req, res) => {
  try {
    const { accountId, recordingId } = req.params;
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { appUserId: true },
    });
    if (!account || account.appUserId !== req.session!.userId) {
      res.status(404).json({ error: 'Recording not found' });
      return;
    }
    // Pass the browser's Range header through so seek (15s/30s skip,
    // dragging the scrubber) hits a partial-content fetch instead of
    // pulling the whole file each time.
    const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : undefined;
    const stream = await fetchRecordingStream(accountId, recordingId, rangeHeader);
    if ((stream.status !== 200 && stream.status !== 206) || !stream.body) {
      res.status(stream.status === 404 ? 404 : 502).json({
        error: stream.status === 404 ? 'Recording not available' : 'Recording fetch failed',
      });
      return;
    }
    res.status(stream.status);
    res.setHeader('Content-Type', stream.contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    // Always advertise byte-range support so browsers know they can seek.
    res.setHeader('Accept-Ranges', stream.acceptRanges ?? 'bytes');
    if (stream.contentLength) res.setHeader('Content-Length', stream.contentLength);
    if (stream.contentRange) res.setHeader('Content-Range', stream.contentRange);

    // Pipe the WHATWG ReadableStream into the Express response.
    const reader = stream.body.getReader();
    const pump = async () => {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!res.write(Buffer.from(value))) {
          await new Promise<void>((resolve) => res.once('drain', () => resolve()));
        }
      }
      res.end();
    };
    await pump();
  } catch (e) {
    console.error('GET /api/recordings/:id/audio failed:', e);
    if (!res.headersSent) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Audio fetch failed' });
    } else {
      res.end();
    }
  }
});

export default router;
