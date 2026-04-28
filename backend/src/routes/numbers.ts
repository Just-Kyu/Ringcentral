import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../services/db.js';
import { requireSession } from '../middleware/auth.js';

const router = Router();
router.use(requireSession);

const labelSchema = z.object({ label: z.string().min(1).max(80) });

async function ensureOwned(numberId: string, userId: string) {
  const number = await prisma.phoneNumber.findUnique({
    where: { id: numberId },
    select: { account: { select: { appUserId: true } } },
  });
  return number?.account.appUserId === userId;
}

router.patch('/:id', async (req, res) => {
  const parsed = labelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    if (!(await ensureOwned(req.params.id, req.session!.userId))) {
      res.status(404).json({ error: 'Phone number not found' });
      return;
    }
    await prisma.phoneNumber.update({
      where: { id: req.params.id },
      data: { label: parsed.data.label },
    });
    res.status(204).end();
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'P2025') {
      res.status(404).json({ error: 'Phone number not found' });
    } else {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Update failed' });
    }
  }
});

router.post('/:id/default', async (req, res) => {
  try {
    const userId = req.session!.userId;
    if (!(await ensureOwned(req.params.id, userId))) {
      res.status(404).json({ error: 'Phone number not found' });
      return;
    }
    await prisma.$transaction([
      // Only clear the default flag for the user's own numbers.
      prisma.phoneNumber.updateMany({
        data: { isDefault: false },
        where: { isDefault: true, account: { appUserId: userId } },
      }),
      prisma.phoneNumber.update({
        where: { id: req.params.id },
        data: { isDefault: true },
      }),
    ]);
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Update failed' });
  }
});

router.delete('/:id', async (req, res) => {
  const phoneNumber = await prisma.phoneNumber.findUnique({
    where: { id: req.params.id },
  });

  if (!phoneNumber) {
    res.status(404).json({ error: 'Phone number not found' });
    return;
  }

  await prisma.phoneNumber.update({
    where: { id: req.params.id },
    data: { hidden: true, isDefault: false },
  });

  res.status(204).end();
});

export default router;
