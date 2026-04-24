import { useState } from 'react';
import { Star, Edit3, Check, X } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Badge } from '@/components/ui/Badge';
import { formatPhoneNumber, cn } from '@/lib/utils';

export function NumbersPage() {
  const accounts = useStore((s) => s.accounts);
  const setNumberLabel = useStore((s) => s.setNumberLabel);
  const setDefault = useStore((s) => s.setDefaultNumber);

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h3 className="text-base font-semibold text-ink-900">Phone numbers</h3>
        <p className="mt-1 text-sm text-ink-500">
          Label each of your numbers so you'll always see exactly which line is being called.
          One number can be set as the default outbound caller ID.
        </p>
      </div>

      {accounts.map((a) => (
        <div key={a.id} className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-200 bg-ink-50 px-5 py-3">
            <div>
              <div className="font-semibold text-ink-900">{a.name}</div>
              <div className="text-xs text-ink-500">{a.numbers.length} numbers</div>
            </div>
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
          </div>
          <ul className="divide-y divide-ink-100">
            {a.numbers.map((n) => {
              const isEditing = editing === n.id;
              return (
                <li
                  key={n.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-3"
                >
                  <div className="font-mono text-sm text-ink-800 min-w-[10rem]">
                    {formatPhoneNumber(n.number)}
                  </div>

                  {isEditing ? (
                    <div className="flex flex-1 items-center gap-2">
                      <input
                        autoFocus
                        className="input flex-1"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setNumberLabel(n.id, draft.trim() || n.label);
                            setEditing(null);
                          }
                          if (e.key === 'Escape') setEditing(null);
                        }}
                      />
                      <button
                        className="btn-success btn-sm"
                        onClick={() => {
                          setNumberLabel(n.id, draft.trim() || n.label);
                          setEditing(null);
                        }}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => setEditing(null)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 text-sm text-ink-700">{n.label}</div>
                      <button
                        className="btn-ghost text-xs"
                        onClick={() => {
                          setEditing(n.id);
                          setDraft(n.label);
                        }}
                      >
                        <Edit3 size={14} /> Rename
                      </button>
                      <button
                        onClick={() => setDefault(n.id)}
                        className={cn(
                          'btn-ghost text-xs',
                          n.isDefault && 'text-amber-600 hover:text-amber-700',
                        )}
                      >
                        <Star size={14} fill={n.isDefault ? 'currentColor' : 'none'} />
                        {n.isDefault ? 'Default' : 'Set default'}
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
