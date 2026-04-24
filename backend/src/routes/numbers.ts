import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../services/db.js';
import { requireSession } from '../middleware/auth.js';

const router = Router();
router.use(requireSession);

const labelSchema = z.object({ label: z.string().min(1).max(80) });

router.patch('/:id', async (req, res) => {
  const parsed = labelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
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
    const exists = await prisma.phoneNumber.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!exists) { res.status(404).json({ error: 'Phone number not found' }); return; }
    await prisma.$transaction([
      prisma.phoneNumber.updateMany({ data: { isDefault: false }, where: { isDefault: true } }),
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

export default router;
