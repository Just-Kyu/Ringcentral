import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  Mic,
  RefreshCw,
} from 'lucide-react';
import { api, ApiError, type RecordingItem } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { formatDuration, formatPhoneNumber, formatRelativeTime } from '@/lib/utils';

export function RecordingsPage() {
  const accounts = useStore((s) => s.accounts);
  const accountFilter = useStore((s) => s.accountFilter);

  const [items, setItems] = useState<RecordingItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listRecordings();
      setItems(data);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError(e instanceof Error ? e.message : 'Failed to load recordings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    if (!items) return null;
    if (accountFilter === 'all') return items;
    return items.filter((i) => i.accountId === accountFilter);
  }, [items, accountFilter]);

  const connectedCount = accounts.filter((a) => a.status === 'connected').length;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div className="card">
        <div className="card-head">
          <Mic size={14} className="soft" />
          <div>
            <div className="card-title">All recordings</div>
            <div className="card-sub">
              Pulled live from RingCentral. Only calls that were actually recorded server-side
              show up here.
            </div>
          </div>
          <div className="spacer" />
          <button className="btn-ghost btn-sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {error && (
          <div
            style={{
              margin: 16,
              borderRadius: 10,
              background: 'var(--red-50)',
              border: '1px solid #FECACA',
              color: 'var(--red)',
              padding: '10px 14px',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {!error && connectedCount === 0 && (
          <div className="soft" style={{ padding: 28, textAlign: 'center', fontSize: 13 }}>
            Connect a RingCentral account in Settings to see recordings.
          </div>
        )}

        {!error && connectedCount > 0 && filtered != null && filtered.length === 0 && (
          <div className="soft" style={{ padding: 28, textAlign: 'center', fontSize: 13 }}>
            No recorded calls yet. RingCentral records calls only when auto-recording is on
            for the account, or when a user opts in mid-call.
          </div>
        )}

        {filtered && filtered.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {filtered.map((r) => {
              const isInbound = r.direction === 'inbound';
              const Icon = isInbound ? ArrowDownLeft : ArrowUpRight;
              const remoteNumber = isInbound ? r.fromNumber : r.toNumber;
              const remoteName = isInbound ? r.fromName : r.toName;
              const audioUrl = api.recordingAudioUrl(r.accountId, r.recordingId);
              const isPlaying = playing === r.recordingId;
              return (
                <li
                  key={r.recordingId}
                  style={{
                    padding: '14px 18px',
                    borderTop: '1px solid var(--border)',
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto auto',
                    gap: 14,
                    alignItems: 'center',
                  }}
                >
                  <div style={{ color: isInbound ? 'var(--green)' : 'var(--text-muted)' }}>
                    <Icon size={16} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>
                      {remoteName || formatPhoneNumber(remoteNumber)}
                    </div>
                    <div className="soft" style={{ fontSize: 12 }}>
                      {remoteName ? (
                        <span className="mono">{formatPhoneNumber(remoteNumber)}</span>
                      ) : null}
                      {remoteName ? ' · ' : ''}
                      {r.accountName}
                      {' · '}
                      {formatRelativeTime(r.startedAt)}
                      {r.durationSec > 0 ? ` · ${formatDuration(r.durationSec)}` : ''}
                    </div>
                  </div>
                  {!isPlaying ? (
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => setPlaying(r.recordingId)}
                    >
                      Play
                    </button>
                  ) : (
                    <audio
                      src={audioUrl}
                      controls
                      autoPlay
                      preload="metadata"
                      style={{ height: 32, width: 240 }}
                    />
                  )}
                  <a
                    href={audioUrl}
                    download={`recording-${r.recordingId}.mp3`}
                    className="btn-ghost btn-icon"
                    title="Download"
                    aria-label="Download"
                  >
                    <Download size={14} />
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
