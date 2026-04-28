import { Phone, PhoneOff, Voicemail, X } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { formatPhoneNumber } from '@/lib/utils';

export function IncomingCallModal() {
  const incoming = useStore((s) => s.incomingQueue);
  const answer = useStore((s) => s.answer);
  const decline = useStore((s) => s.decline);
  const sendToVoicemail = useStore((s) => s.sendToVoicemail);
  const ignoreIncoming = useStore((s) => s.ignoreIncoming);

  if (incoming.length === 0) return null;
  // The most-recent incoming call is the prominent one; older ones stack below.
  const [head, ...rest] = incoming;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-ink-900/40 p-4 pt-16 animate-fade-in">
      <div className="w-full max-w-md animate-slide-up">
        <div className="card overflow-hidden">
          <div className="relative bg-gradient-to-br from-brand-500 to-brand-700 px-6 py-8 text-white">
            <div className="absolute right-6 top-6">
              <span className="badge bg-white/20 text-white">{head.accountName}</span>
            </div>
            <div className="relative mb-4 flex h-20 w-20 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-white/30 animate-pulse-ring" />
              <span
                className="absolute inset-0 rounded-full bg-white/30 animate-pulse-ring"
                style={{ animationDelay: '0.5s' }}
              />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-white/20">
                <Phone size={32} />
              </div>
            </div>
            <div className="text-xs uppercase tracking-wider text-white/70">Incoming call</div>
            <div className="mt-1 text-2xl font-semibold">
              {head.remoteName ?? formatPhoneNumber(head.remoteNumber)}
            </div>
            {head.remoteName && (
              <div className="text-sm text-white/80">{formatPhoneNumber(head.remoteNumber)}</div>
            )}
            <div className="mt-4 rounded-lg bg-white/10 px-3 py-2 text-sm">
              <div className="text-xs text-white/70">Calling</div>
              <div className="font-medium">
                {head.businessNumberLabel} · {formatPhoneNumber(head.businessNumber)}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 px-6 py-4 sm:grid-cols-4">
            <button onClick={() => ignoreIncoming(head.id)} className="btn-secondary">
              <X size={16} /> Ignore
            </button>
            <button onClick={() => decline(head.id)} className="btn-danger">
              <PhoneOff size={16} /> Decline
            </button>
            <button onClick={() => sendToVoicemail(head.id)} className="btn-secondary">
              <Voicemail size={16} /> Voicemail
            </button>
            <button onClick={() => answer(head.id)} className="btn-success">
              <Phone size={16} /> Answer
            </button>
          </div>
        </div>

        {rest.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              {rest.length} more incoming
            </div>
            {rest.map((c) => (
              <div
                key={c.id}
                className="card flex items-center justify-between px-4 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink-900">
                    {c.remoteName ?? formatPhoneNumber(c.remoteNumber)}
                  </div>
                  <div className="truncate text-xs text-ink-500">
                    {c.accountName} · {c.businessNumberLabel}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => ignoreIncoming(c.id)}
                    className="btn-secondary px-2 py-1.5 text-xs"
                    aria-label="Ignore"
                  >
                    <X size={14} />
                  </button>
                  <button
                    onClick={() => decline(c.id)}
                    className="btn-danger px-2 py-1.5 text-xs"
                    aria-label="Decline"
                  >
                    <PhoneOff size={14} />
                  </button>
                  <button
                    onClick={() => answer(c.id)}
                    className="btn-success px-2 py-1.5 text-xs"
                    aria-label="Answer"
                  >
                    <Phone size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
