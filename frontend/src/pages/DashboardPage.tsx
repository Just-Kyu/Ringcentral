import { useStore } from '@/store/useStore';
import { TopBar } from '@/components/layout/TopBar';
import { Sidebar } from '@/components/layout/Sidebar';
import { ActiveCallPanel } from '@/components/calls/ActiveCallPanel';
import { IncomingCallModal } from '@/components/calls/IncomingCallModal';
import { DialpadPage } from './DialpadPage';
import { HistoryPage } from './HistoryPage';
import { NumbersPage } from './NumbersPage';
import { SettingsPage } from './SettingsPage';

export function DashboardPage() {
  const view = useStore((s) => s.view);
  const hasActive = useStore((s) => s.activeCalls.length > 0);

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="scroll-area flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-5xl space-y-4">
            {hasActive && <ActiveCallPanel />}
            {view === 'dialpad' && <DialpadPage />}
            {view === 'history' && <HistoryPage />}
            {view === 'numbers' && <NumbersPage />}
            {view === 'settings' && <SettingsPage />}
          </div>
        </main>
      </div>
      <IncomingCallModal />
    </div>
  );
}
