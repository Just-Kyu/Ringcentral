import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../services/db.js';
import { requireSession } from '../middleware/auth.js';

const router = Router();
router.use(requireSession);

router.get('/', async (req, res) => {
  const where = {
    ...(req.query.accountId ? { accountId: String(req.query.accountId) } : {}),
    ...(req.query.direction ? { direction: String(req.query.direction) } : {}),
    ...(req.query.from || req.query.to
      ? {
          startedAt: {
            ...(req.query.from ? { gte: new Date(String(req.query.from)) } : {}),
            ...(req.query.to ? { lte: new Date(String(req.query.to)) } : {}),
          },
        }
      : {}),
  };
  const limit = Math.min(Number(req.query.limit ?? 200), 1000);
  const logs = await prisma.callLog.findMany({
    where,
    orderBy: { startedAt: 'desc' },
    take: limit,
    include: { account: { select: { name: true } } },
  });
  res.json(
    logs.map((l) => ({
      id: l.id,
      accountId: l.accountId,
      accountName: l.account.name,
      direction: l.direction,
      fromNumber: l.fromNumber,
      toNumber: l.toNumber,
      businessNumberUsed: l.businessNumberUsed,
      businessNumberLabel: l.businessNumberLabel,
      durationSec: l.duration,
      status: l.status,
      startedAt: l.startedAt.toISOString(),
    })),
  );
});

const recordSchema = z.object({
  accountId: z.string(),
  direction: z.enum(['inbound', 'outbound']),
  fromNumber: z.string(),
  toNumber: z.string(),
  businessNumberUsed: z.string(),
  businessNumberLabel: z.string().optional().default(''),
  durationSec: z.number().int().nonnegative(),
  status: z.enum(['completed', 'missed', 'voicemail']),
  startedAt: z.string(),
});

router.post('/', async (req, res) => {
  const parsed = recordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const log = await prisma.callLog.create({
    data: {
      accountId: data.accountId,
      direction: data.direction,
      fromNumber: data.fromNumber,
      toNumber: data.toNumber,
      businessNumberUsed: data.businessNumberUsed,
      businessNumberLabel: data.businessNumberLabel,
      duration: data.durationSec,
      status: data.status,
      startedAt: new Date(data.startedAt),
    },
  });
  res.status(201).json({ id: log.id });
});

export default router;
