import { useState, useMemo } from 'react';
import { Phone, Delete, ArrowUpRight } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Keypad } from '@/components/dialpad/Keypad';
import { FromNumberSelect } from '@/components/dialpad/FromNumberSelect';
import { formatPhoneNumber, formatRelativeTime } from '@/lib/utils';

export function DialpadPage() {
  const accounts = useStore((s) => s.accounts);
  const defaultId = useStore((s) => s.defaultFromNumberId);
  const placeCall = useStore((s) => s.placeCall);
  const history = useStore((s) => s.callHistory);

  const [fromId, setFromId] = useState<string | null>(defaultId);
  const [dest, setDest] = useState('');
  const [error, setError] = useState<string | null>(null);

  const selectedFromId = fromId ?? defaultId ?? accounts[0]?.numbers[0]?.id ?? null;

  const recentOutbound = useMemo(
    () => history.filter((h) => h.direction === 'outbound').slice(0, 5),
    [history],
  );

  function append(d: string) {
    setDest((v) => v + d);
  }

  async function call() {
    setError(null);
    if (!selectedFromId) {
      setError('Choose a "From:" number first.');
      return;
    }
    const digits = dest.replace(/\D/g, '');
    if (digits.length < 7) {
      setError('Please enter a valid phone number.');
      return;
    }
    try {
      await placeCall(selectedFromId, dest.startsWith('+') ? dest : `+${digits}`);
      setDest('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start call');
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <FromNumberSelect value={selectedFromId} onChange={setFromId} />

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <input
              className="w-full bg-transparent text-2xl font-mono font-medium text-ink-900 placeholder:text-ink-300 focus:outline-none"
              placeholder="Enter number"
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') call();
              }}
            />
            <button
              onClick={() => setDest((v) => v.slice(0, -1))}
              className="ml-2 rounded-full p-2 text-ink-500 hover:bg-ink-100"
              aria-label="Backspace"
            >
              <Delete size={18} />
            </button>
          </div>
          {dest && (
            <div className="mt-1 text-xs text-ink-500">
              {formatPhoneNumber(dest)}
            </div>
          )}

          <div className="mt-4">
            <Keypad onPress={append} />
          </div>

          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            onClick={call}
            disabled={!dest.trim()}
            className="btn-success mt-4 w-full"
          >
            <Phone size={16} /> Call
          </button>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-ink-800">Recent outbound</h3>
        <p className="mt-0.5 text-xs text-ink-500">
          Click any entry to redial from the same number.
        </p>
        <ul className="mt-3 divide-y divide-ink-100">
          {recentOutbound.length === 0 && (
            <li className="py-6 text-center text-sm text-ink-500">
              No outbound calls yet.
            </li>
          )}
          {recentOutbound.map((h) => (
            <li key={h.id}>
              <button
                onClick={() => setDest(h.toNumber)}
                className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-ink-50 -mx-2 rounded-lg px-2 transition"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-ink-900">
                    {formatPhoneNumber(h.toNumber)}
                  </div>
                  <div className="truncate text-xs text-ink-500">
                    via {h.businessNumberLabel} · {h.accountName}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-ink-500">
                  <span>{formatRelativeTime(h.startedAt)}</span>
                  <ArrowUpRight size={14} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
