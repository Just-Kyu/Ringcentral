import { useState } from 'react';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { isMockMode } from '@/lib/webphone';
import { generateId } from '@/lib/utils';
import type { Account } from '@/types';

export function SettingsPage() {
  const accounts = useStore((s) => s.accounts);
  const removeAccount = useStore((s) => s.removeAccount);
  const addAccount = useStore((s) => s.addAccount);

  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!name.trim() || !clientId.trim() || !clientSecret.trim()) {
      setError('All three fields are required.');
      return;
    }
    setSubmitting(true);
    try {
      if (isMockMode) {
        const id = generateId('acct');
        const newAcct: Account = {
          id,
          name: name.trim(),
          status: 'connected',
          createdAt: new Date().toISOString(),
          numbers: [
            { id: generateId('n'), accountId: id, number: '+15550000001', label: 'Main', isDefault: false },
            { id: generateId('n'), accountId: id, number: '+15550000002', label: 'Secondary', isDefault: false },
            { id: generateId('n'), accountId: id, number: '+15550000003', label: 'Direct', isDefault: false },
          ],
        };
        addAccount(newAcct);
      } else {
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? '/api'}/accounts`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, clientId, clientSecret }),
        });
        if (!res.ok) throw new Error((await res.text()) || 'Failed to create account');
        const { oauthUrl } = (await res.json()) as { oauthUrl: string };
        // Open RingCentral's OAuth flow in a popup; backend's /oauth/callback
        // handles the code exchange + sends a postMessage when done.
        window.open(oauthUrl, 'rc_oauth', 'width=520,height=700');
      }
      setShowAdd(false);
      setName('');
      setClientId('');
      setClientSecret('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create account');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card flex items-center justify-between p-5">
        <div>
          <h3 className="text-base font-semibold text-ink-900">Connected accounts</h3>
          <p className="mt-1 text-sm text-ink-500">
            {accounts.length} of 5 RingCentral accounts connected.
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
              No accounts yet. Click "Add account" to get started.
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
                <button className="btn-ghost text-xs" disabled={isMockMode}>
                  <RefreshCw size={14} /> Refresh tokens
                </button>
                <button
                  className="btn-ghost text-xs text-red-600 hover:bg-red-50"
                  onClick={() => {
                    if (confirm(`Remove account "${a.name}"?`)) removeAccount(a.id);
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
          Select your microphone and speaker for in-browser calling. The dashboard will use these
          for every call across all accounts.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-500">
              Microphone
            </div>
            <select className="input">
              <option>System default</option>
            </select>
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-500">
              Speaker
            </div>
            <select className="input">
              <option>System default</option>
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs text-ink-500">
          Tip: the browser will prompt for microphone permission the first time you place or
          answer a call.
        </p>
      </div>

      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add a RingCentral account"
        size="md"
      >
        <p className="text-sm text-ink-600">
          Create a developer app in your RingCentral console with the
          permissions <code className="rounded bg-ink-100 px-1 py-0.5 font-mono text-xs">
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
              {submitting ? 'Saving…' : isMockMode ? 'Add (demo)' : 'Connect via OAuth'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
