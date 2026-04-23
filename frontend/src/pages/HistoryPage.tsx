import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Phone,
  PhoneMissed,
  Voicemail,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { formatDuration, formatPhoneNumber, formatRelativeTime } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';

type DirFilter = 'all' | 'inbound' | 'outbound';

export function HistoryPage() {
  const accounts = useStore((s) => s.accounts);
  const history = useStore((s) => s.callHistory);
  const placeCall = useStore((s) => s.placeCall);
  const defaultId = useStore((s) => s.defaultFromNumberId);

  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [dirFilter, setDirFilter] = useState<DirFilter>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return history.filter((h) => {
      if (accountFilter !== 'all' && h.accountId !== accountFilter) return false;
      if (dirFilter !== 'all' && h.direction !== dirFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${h.fromNumber} ${h.toNumber} ${h.businessNumberLabel} ${h.accountName}`
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [history, accountFilter, dirFilter, search]);

  function callBack(toNumber: string) {
    if (!defaultId) return;
    void placeCall(defaultId, toNumber);
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-4 py-3">
        <input
          className="input max-w-xs"
          placeholder="Search number, account, label…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input max-w-xs"
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
        >
          <option value="all">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <div className="ml-auto inline-flex rounded-lg bg-ink-100 p-0.5 text-xs font-medium">
          {(['all', 'inbound', 'outbound'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDirFilter(d)}
              className={
                'rounded-md px-3 py-1.5 ' +
                (dirFilter === d
                  ? 'bg-white text-ink-900 shadow-sm'
                  : 'text-ink-600 hover:text-ink-900')
              }
            >
              {d === 'all' ? 'All' : d === 'inbound' ? 'Inbound' : 'Outbound'}
            </button>
          ))}
        </div>
      </div>

      <div className="scroll-area max-h-[640px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-ink-50 text-left text-xs font-semibold uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-4 py-2.5">Time</th>
              <th className="px-4 py-2.5">Direction</th>
              <th className="px-4 py-2.5">Caller / Callee</th>
              <th className="px-4 py-2.5">Business number</th>
              <th className="px-4 py-2.5">Duration</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-ink-500">
                  No matching calls.
                </td>
              </tr>
            )}
            {filtered.map((h) => {
              const isIn = h.direction === 'inbound';
              const remoteNumber = isIn ? h.fromNumber : h.toNumber;
              return (
                <tr key={h.id} className="hover:bg-ink-50">
                  <td className="px-4 py-3 text-ink-700">
                    {formatRelativeTime(h.startedAt)}
                  </td>
                  <td className="px-4 py-3">
                    {isIn ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <ArrowDownLeft size={14} /> In
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-sky-700">
                        <ArrowUpRight size={14} /> Out
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink-900">
                    {formatPhoneNumber(remoteNumber)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink-800">
                      {h.businessNumberLabel}
                    </div>
                    <div className="text-xs text-ink-500">
                      {h.accountName} · {formatPhoneNumber(h.businessNumberUsed)}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-ink-700">
                    {h.durationSec > 0 ? formatDuration(h.durationSec) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {h.status === 'completed' && <Badge tone="success">Completed</Badge>}
                    {h.status === 'missed' && (
                      <Badge tone="danger">
                        <PhoneMissed size={10} /> Missed
                      </Badge>
                    )}
                    {h.status === 'voicemail' && (
                      <Badge tone="info">
                        <Voicemail size={10} /> Voicemail
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => callBack(remoteNumber)}
                      className="btn-ghost text-xs"
                      aria-label="Call back"
                    >
                      <Phone size={14} /> Call back
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
