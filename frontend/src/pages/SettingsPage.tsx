import { useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { getAudioPrefs, setAudioPrefs } from '@/lib/utils';

export function SettingsPage() {
  const accounts = useStore((s) => s.accounts);
  const removeAccount = useStore((s) => s.removeAccount);
  const refreshAccounts = useStore((s) => s.refreshAccounts);

  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [micDeviceId, setMicDeviceId] = useState(getAudioPrefs().micDeviceId ?? '');
  const [speakerDeviceId, setSpeakerDeviceId] = useState(getAudioPrefs().speakerDeviceId ?? '');

  // Enumerate audio devices. Re-run if the user changes their device selection
  // (so labels appear after permission is granted on first call).
  useEffect(() => {
    async function loadDevices() {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMics(devices.filter((d) => d.kind === 'audioinput'));
      setSpeakers(devices.filter((d) => d.kind === 'audiooutput'));
    }
    void loadDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', loadDevices);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', loadDevices);
  }, []);

  function handleMicChange(id: string) {
    setMicDeviceId(id);
    setAudioPrefs({ ...getAudioPrefs(), micDeviceId: id || undefined });
  }

  function handleSpeakerChange(id: string) {
    setSpeakerDeviceId(id);
    setAudioPrefs({ ...getAudioPrefs(), speakerDeviceId: id || undefined });
  }

  // When the OAuth popup finishes, it posts back and we reload the account list.
  useEffect(() => {
    function handler(ev: MessageEvent) {
      if (!ev.data || typeof ev.data !== 'object') return;
      if (ev.data.type !== 'rc_oauth_complete') return;
      if (ev.data.error) {
        setError(`OAuth failed: ${String(ev.data.error)}`);
        return;
      }
      void refreshAccounts();
    }
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [refreshAccounts]);

  async function submit() {
    setError(null);
    if (!name.trim() || !clientId.trim() || !clientSecret.trim()) {
      setError('All three fields are required.');
      return;
    }
    setSubmitting(true);
    try {
      const { oauthUrl } = await api.createAccount({
        name: name.trim(),
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
      });
      // Open RingCentral's OAuth flow in a popup; backend's /oauth/callback
      // posts back to this window when done.
      window.open(oauthUrl, 'rc_oauth', 'width=520,height=720');
      setShowAdd(false);
      setName('');
      setClientId('');
      setClientSecret('');
      await refreshAccounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create account');
    } finally {
      setSubmitting(false);
    }
  }

  async function refreshTokens(id: string) {
    setRefreshing(id);
    try {
      await api.refreshAccount(id);
      await refreshAccounts();
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card flex items-center justify-between p-5">
        <div>
          <h3 className="text-base font-semibold text-ink-900">Connected accounts</h3>
          <p className="mt-1 text-sm text-ink-500">
            {accounts.length === 1
              ? '1 RingCentral account connected.'
              : `${accounts.length} RingCentral accounts connected.`}
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">
          <Plus size={16} /> Add account
        </button>
      </div>

      <div className="card overflow-hidden">
        <ul className="divide-y divide-ink-100">
          {accounts.length === 0 && (
            <li className="px-5 py-12 text-center text-sm text-ink-500">
              No accounts yet. Click "Add account" to connect your first RingCentral tenant.
            </li>
          )}
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="font-medium text-ink-900">{a.name}</div>
                <div className="text-xs text-ink-500">
                  {a.numbers.length} numbers · added{' '}
                  {new Date(a.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  tone={
                    a.status === 'connected'
                      ? 'success'
                      : a.status === 'connecting'
                        ? 'warning'
                        : 'danger'
                  }
                >
                  {a.status}
                </Badge>
                <button
                  className="btn-ghost text-xs"
                  onClick={() => refreshTokens(a.id)}
                  disabled={refreshing === a.id}
                >
                  <RefreshCw
                    size={14}
                    className={refreshing === a.id ? 'animate-spin' : ''}
                  />
                  Refresh tokens
                </button>
                <button
                  className="btn-ghost text-xs text-red-600 hover:bg-red-50"
                  onClick={() => {
                    if (confirm(`Remove account "${a.name}"?`)) void removeAccount(a.id);
                  }}
                >
                  <Trash2 size={14} /> Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card p-5">
        <h3 className="text-base font-semibold text-ink-900">Audio devices</h3>
        <p className="mt-1 text-sm text-ink-500">
          Select your microphone and speaker for in-browser calling. The dashboard will use
          these for every call across all accounts.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-500">
              Microphone
            </div>
            <select
              className="input"
              value={micDeviceId}
              onChange={(e) => handleMicChange(e.target.value)}
            >
              <option value="">System default</option>
              {mics.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-500">
              Speaker
            </div>
            <select
              className="input"
              value={speakerDeviceId}
              onChange={(e) => handleSpeakerChange(e.target.value)}
            >
              <option value="">System default</option>
              {speakers.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Speaker ${d.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs text-ink-500">
          Device labels appear after microphone permission is granted on your first call.
          Changes take effect when the next call connects.
        </p>
      </div>

      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add a RingCentral account"
        size="md"
      >
        <p className="text-sm text-ink-600">
          Create a developer app in your RingCentral console with the permissions{' '}
          <code className="rounded bg-ink-100 px-1 py-0.5 font-mono text-xs">
            ReadAccounts, ReadCallLog, CallControl, VoipCalling, ReadPresence
          </code>{' '}
          and the redirect URI{' '}
          <code className="rounded bg-ink-100 px-1 py-0.5 font-mono text-xs">
            {window.location.origin}/api/oauth/callback
          </code>
          .
        </p>
        <div className="mt-4 space-y-3">
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-500">
              Friendly name
            </div>
            <input
              className="input"
              placeholder="Premier Trucking"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-500">
              Client ID
            </div>
            <input
              className="input font-mono"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-500">
              Client Secret
            </div>
            <input
              className="input font-mono"
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
            />
            <div className="mt-1 text-xs text-ink-500">
              Stored encrypted (AES-256-GCM) on the server. Never sent to the browser after
              creation.
            </div>
          </label>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={() => setShowAdd(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={submitting} onClick={submit}>
              {submitting ? 'Saving…' : 'Connect via OAuth'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
