import { Search, Bell, LogOut, Plus } from 'lucide-react';
import { useStore } from '@/store/useStore';
import type { ViewId } from '@/store/useStore';

const PAGE_TITLES: Record<ViewId, [string, string]> = {
  dialpad: ['Phone', 'Place a call from any of your business numbers'],
  history: ['Call history', 'Inbound and outbound calls across every account'],
  recordings: ['Recordings', 'Saved audio of recorded calls — listen, share, download'],
  voicemail: ['Voicemail', 'Visual voicemail with transcription'],
  messages: ['Messages', 'SMS to customers in one inbox'],
  contacts: ['Contacts', 'People, drivers, brokers, and vendors'],
  numbers: ['Numbers', 'Manage every number across every account'],
  analytics: ['Analytics', 'Volume, talk time, and reach across accounts'],
  settings: ['Settings', 'Personal preferences and devices'],
};

export function TopBar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const accounts = useStore((s) => s.accounts);
  const logout = useStore((s) => s.logout);
  const accountFilter = useStore((s) => s.accountFilter);
  const setAccountFilter = useStore((s) => s.setAccountFilter);

  const [title, sub] = PAGE_TITLES[view] ?? ['', ''];

  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>{title}</h1>
        {sub && <div className="topbar-sub">{sub}</div>}
      </div>

      <div className="topbar-spacer" />

      <div className="search-wrap">
        <Search size={14} />
        <input
          className="search-input"
          placeholder="Search numbers, contacts, recordings…"
        />
      </div>

      <select
        className="topbar-select"
        value={accountFilter}
        onChange={(e) => setAccountFilter(e.target.value)}
      >
        <option value="all">All accounts ({accounts.length})</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>

      <button className="btn-ghost btn-icon" aria-label="Notifications" title="Notifications">
        <Bell size={16} />
      </button>

      <button
        className="btn-ghost btn-icon"
        aria-label="Sign out"
        title="Sign out"
        onClick={() => void logout()}
      >
        <LogOut size={14} />
      </button>

      <button
        className="btn-primary btn-sm"
        onClick={() => setView('dialpad')}
        title="New call"
      >
        <Plus size={14} /> New call
      </button>
    </header>
  );
}
