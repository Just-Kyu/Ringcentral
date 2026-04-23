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
  await prisma.phoneNumber.update({
    where: { id: req.params.id },
    data: { label: parsed.data.label },
  });
  res.status(204).end();
});

router.post('/:id/default', async (req, res) => {
  await prisma.$transaction([
    prisma.phoneNumber.updateMany({ data: { isDefault: false }, where: { isDefault: true } }),
    prisma.phoneNumber.update({
      where: { id: req.params.id },
      data: { isDefault: true },
    }),
  ]);
  res.status(204).end();
});

export default router;
