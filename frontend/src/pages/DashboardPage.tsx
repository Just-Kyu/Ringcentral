import { useStore } from '@/store/useStore';
import { TopBar } from '@/components/layout/TopBar';
import { Sidebar } from '@/components/layout/Sidebar';
import { ActiveCallPanel } from '@/components/calls/ActiveCallPanel';
import { IncomingCallModal } from '@/components/calls/IncomingCallModal';
import { DialpadPage } from './DialpadPage';
import { HistoryPage } from './HistoryPage';
import { NumbersPage } from './NumbersPage';
import { SettingsPage } from './SettingsPage';
import { RecordingsPage } from './RecordingsPage';
import { ComingSoonPage } from './ComingSoonPage';

export function DashboardPage() {
  const view = useStore((s) => s.view);
  const hasActive = useStore((s) => s.activeCalls.length > 0);
  const railCollapsed = useStore((s) => s.railCollapsed);

  return (
    <div className="ec-app" data-rail={railCollapsed ? 'collapsed' : 'expanded'}>
      <Sidebar />
      <div className="ec-main">
        <TopBar />
        <div className="scroll-area" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {hasActive && (
            <div className="px-6 pt-6">
              <ActiveCallPanel />
            </div>
          )}
          {view === 'dialpad' && <DialpadPage />}
          {view === 'recordings' && <RecordingsPage />}
          {(view === 'history' || view === 'numbers' || view === 'settings') && (
            <div style={{ padding: 24 }}>
              <div style={{ margin: '0 auto', maxWidth: 1100 }}>
                {view === 'history' && <HistoryPage />}
                {view === 'numbers' && <NumbersPage />}
                {view === 'settings' && <SettingsPage />}
              </div>
            </div>
          )}
          {view === 'voicemail' && (
            <ComingSoonPage
              title="Voicemail"
              description="Visual voicemail with auto-transcription, ranked by urgency."
              bullets={[
                'Listen, read, or skim transcripts',
                'Mark messages handled, route to a teammate',
                'Reply by callback or by SMS',
              ]}
            />
          )}
          {view === 'messages' && (
            <ComingSoonPage
              title="Messages"
              description="SMS to customers and team chat in one inbox."
              bullets={[
                'Threaded conversations across all your numbers',
                'Templates and quick replies',
                'Loop teammates in without forwarding the whole thread',
              ]}
            />
          )}
          {view === 'contacts' && (
            <ComingSoonPage
              title="Contacts"
              description="People, drivers, brokers, and vendors in one place."
              bullets={[
                'Synced across every connected RingCentral account',
                'Speed-dial favorites, recent contacts',
                'Notes and tags per contact',
              ]}
            />
          )}
          {view === 'analytics' && (
            <ComingSoonPage
              title="Analytics"
              description="Volume, talk time, and reach across every account."
              bullets={[
                'Inbound vs outbound trends per number',
                'Missed-call hotspots and abandonment',
                'Per-account leaderboards',
              ]}
            />
          )}
        </div>
      </div>
      <IncomingCallModal />
    </div>
  );
}
