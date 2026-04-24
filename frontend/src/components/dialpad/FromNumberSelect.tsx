import { Phone } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { formatPhoneNumber } from '@/lib/utils';

export function FromNumberSelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (numberId: string) => void;
}) {
  const accounts = useStore((s) => s.accounts);

  return (
    <div className="card p-3">
      <label className="text-xs font-semibold uppercase tracking-wider text-ink-500">
        From
      </label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
      >
        {accounts.length === 0 && <option value="">No numbers available</option>}
        {accounts.map((a) => (
          <optgroup key={a.id} label={a.name}>
            {a.numbers.map((n) => (
              <option key={n.id} value={n.id}>
                {formatPhoneNumber(n.number)} — {n.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {value && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-ink-500">
          <Phone size={12} />
          Outbound caller ID will appear as the selected number.
        </div>
      )}
    </div>
  );
}
