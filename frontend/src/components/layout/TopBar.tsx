import { Settings, LogOut, CircleDot } from 'lucide-react';
import { useStore } from '@/store/useStore';

export function TopBar() {
  const accounts = useStore((s) => s.accounts);
  const setView = useStore((s) => s.setView);
  const logout = useStore((s) => s.logout);
  const user = useStore((s) => s.user);
  const connected = accounts.filter((a) => a.status === 'connected').length;
  const total = accounts.length;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-ink-200 bg-white px-5">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
          <CircleDot size={18} />
        </div>
        <div className="flex items-baseline gap-2">
          <h1 className="text-base font-semibold text-ink-900">Easy Call</h1>
          <span className="text-xs text-ink-500">Multi-Account Dashboard</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span
            className={
              'inline-block h-2 w-2 rounded-full ' +
              (connected === total && total > 0 ? 'bg-emerald-500' : 'bg-amber-500')
            }
          />
          <span className="text-sm font-medium text-ink-700">
            {connected}/{total || '0'} Connected
          </span>
        </div>
        {user && <span className="hidden text-sm text-ink-500 md:inline">{user.email}</span>}
        <button
          className="btn-ghost"
          onClick={() => setView('settings')}
          aria-label="Settings"
        >
          <Settings size={16} />
        </button>
        <button className="btn-ghost" onClick={() => void logout()} aria-label="Sign out">
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
