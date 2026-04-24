import { useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';

export default function App() {
  const user = useStore((s) => s.user);
  const hydrated = useStore((s) => s.hydrated);
  const hydrate = useStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3 text-ink-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    );
  }

  return user ? <DashboardPage /> : <LoginPage />;
}
