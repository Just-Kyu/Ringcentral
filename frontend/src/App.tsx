import { useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';

export default function App() {
  const user = useStore((s) => s.user);
  const hydrate = useStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return user ? <DashboardPage /> : <LoginPage />;
}
