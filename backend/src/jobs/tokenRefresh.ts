import { prisma } from '../services/db.js';
import { refreshAccessToken } from '../services/ringcentral.js';

/**
 * Sweeps every 5 minutes for tokens expiring within the next 10 minutes and
 * refreshes them. RingCentral tokens last 1 hour by default, so this is well
 * before expiry.
 */
export function startTokenRefreshJob() {
  const tick = async () => {
    try {
      const soon = new Date(Date.now() + 10 * 60 * 1000);
      const accounts = await prisma.account.findMany({
        where: {
          status: 'connected',
          tokenExpiry: { lte: soon },
        },
      });
      for (const account of accounts) {
        try {
          await refreshAccessToken(account.id);
        } catch (e) {
          await prisma.account.update({
            where: { id: account.id },
            data: { status: 'error' },
          });
          console.error(`Token refresh failed for ${account.id}:`, e);
        }
      }
    } catch (e) {
      console.error('Token refresh tick failed:', e);
    }
  };
  // Run once at boot, then every 5 minutes.
  void tick();
  setInterval(tick, 5 * 60 * 1000);
}
