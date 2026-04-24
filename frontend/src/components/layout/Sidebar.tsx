import { Grid3x3, History, Phone, Settings as SettingsIcon } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';

const items = [
  { id: 'dialpad', label: 'Dialpad', icon: Grid3x3 },
  { id: 'history', label: 'History', icon: History },
  { id: 'numbers', label: 'Numbers', icon: Phone },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
] as const;

export function Sidebar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const accounts = useStore((s) => s.accounts);
  const totalNumbers = accounts.reduce((acc, a) => acc + a.numbers.length, 0);

  return (
    <nav className="flex w-56 shrink-0 flex-col border-r border-ink-200 bg-white p-3">
      <ul className="flex flex-col gap-1">
        {items.map(({ id, label, icon: Icon }) => (
          <li key={id}>
            <button
              onClick={() => setView(id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
                view === id
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-ink-700 hover:bg-ink-100',
              )}
            >
              <Icon size={16} />
              {label}
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-auto rounded-xl bg-ink-50 p-3 text-xs text-ink-600">
        <div className="font-semibold text-ink-800">{accounts.length} accounts</div>
        <div className="mt-1 text-ink-500">{totalNumbers} numbers active</div>
      </div>
    </nav>
  );
}
