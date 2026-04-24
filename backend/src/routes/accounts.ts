import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../services/db.js';
import { encrypt } from '../services/crypto.js';
import {
  buildAuthorizeUrl,
  refreshAccessToken,
  sipProvision,
  syncPhoneNumbers,
} from '../services/ringcentral.js';
import { requireSession } from '../middleware/auth.js';

const router = Router();
router.use(requireSession);

router.get('/', async (_req, res) => {
  const accounts = await prisma.account.findMany({
    include: { phoneNumbers: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(
    accounts.map((a) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
      numbers: a.phoneNumbers.map((p) => ({
        id: p.id,
        accountId: p.accountId,
        number: p.number,
        label: p.label,
        isDefault: p.isDefault,
      })),
    })),
  );
});

const createSchema = z.object({
  name: z.string().min(1).max(80),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, clientId, clientSecret } = parsed.data;
  const account = await prisma.account.create({
    data: {
      name,
      clientId,
      clientSecret: encrypt(clientSecret),
      status: 'connecting',
    },
    include: { phoneNumbers: true },
  });
  const oauthUrl = buildAuthorizeUrl(account.id, clientId);
  res.status(201).json({
    account: {
      id: account.id,
      name: account.name,
      status: account.status,
      createdAt: account.createdAt.toISOString(),
      numbers: [],
    },
    oauthUrl,
  });
});

router.delete('/:id', async (req, res) => {
  await prisma.account.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

router.post('/:id/refresh', async (req, res) => {
  try {
    await refreshAccessToken(req.params.id);
    await syncPhoneNumbers(req.params.id);
    const account = await prisma.account.findUnique({
      where: { id: req.params.id },
      include: { phoneNumbers: true },
    });
    res.json(account);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Refresh failed' });
  }
});

router.post('/:id/sip-provision', async (req, res) => {
  try {
    const provisioning = await sipProvision(req.params.id);
    res.json(provisioning);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'SIP provisioning failed' });
  }
});

export default router;
