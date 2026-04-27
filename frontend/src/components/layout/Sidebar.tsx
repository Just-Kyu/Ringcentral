import {
  Phone,
  Clock,
  Voicemail,
  MessageSquare,
  Users,
  Hash,
  BarChart3,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Mic,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import type { ViewId } from '@/store/useStore';
import { cn } from '@/lib/utils';

type RailItem = {
  id: ViewId;
  name: string;
  Icon: typeof Phone;
  badge?: number | null;
};

type RailGroup = { label: string; items: RailItem[] };

const NAV_GROUPS: RailGroup[] = [
  {
    label: 'Communicate',
    items: [
      { id: 'dialpad', name: 'Phone', Icon: Phone },
      { id: 'history', name: 'Call history', Icon: Clock },
      { id: 'recordings', name: 'Recordings', Icon: Mic },
      { id: 'voicemail', name: 'Voicemail', Icon: Voicemail },
      { id: 'messages', name: 'Messages', Icon: MessageSquare },
      { id: 'contacts', name: 'Contacts', Icon: Users },
    ],
  },
  {
    label: 'Manage',
    items: [
      { id: 'numbers', name: 'Numbers', Icon: Hash },
      { id: 'analytics', name: 'Analytics', Icon: BarChart3 },
    ],
  },
  {
    label: 'Configure',
    items: [{ id: 'settings', name: 'Settings', Icon: SettingsIcon }],
  },
];

export function Sidebar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const accounts = useStore((s) => s.accounts);
  const user = useStore((s) => s.user);
  const railCollapsed = useStore((s) => s.railCollapsed);
  const setRailCollapsed = useStore((s) => s.setRailCollapsed);

  const connected = accounts.filter((a) => a.status === 'connected').length;
  const total = accounts.length;
  const initials = user?.email
    ? user.email
        .split('@')[0]
        .split(/[._-]/)
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0]?.toUpperCase())
        .join('') || 'EC'
    : 'EC';

  return (
    <aside className="rail">
      <div className="rail-head">
        <div className="brand-mark">
          <CircleDot size={18} strokeWidth={2.5} />
        </div>
        <div className="brand-text">
          <div className="brand-name">Easy Call</div>
          <div className="brand-sub">Multi-account workspace</div>
        </div>
        {!railCollapsed && (
          <button
            className="btn-ghost btn-icon rail-collapse ml-auto"
            onClick={() => setRailCollapsed(true)}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <ChevronLeft size={14} />
          </button>
        )}
      </div>

      {railCollapsed && (
        <button
          className="btn-ghost btn-icon"
          onClick={() => setRailCollapsed(false)}
          aria-label="Expand sidebar"
          title="Expand sidebar"
          style={{ margin: '8px auto', width: 32, height: 32 }}
        >
          <ChevronRight size={14} />
        </button>
      )}

      <nav className="nav">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="nav-section-label">{group.label}</div>
            {group.items.map(({ id, name, Icon, badge }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={cn('nav-item', view === id && 'active')}
                title={name}
              >
                <Icon className="nav-icon" size={18} strokeWidth={1.75} />
                <span className="nav-label">{name}</span>
                {badge != null && <span className="nav-badge">{badge}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="rail-foot">
        <div className="avatar">{initials}</div>
        <div className="rail-foot-detail">
          <div className="rail-foot-name">{user?.email?.split('@')[0] ?? 'You'}</div>
          <div className="rail-foot-meta">
            {connected}/{total || 0} accounts connected
          </div>
        </div>
      </div>
    </aside>
  );
}
