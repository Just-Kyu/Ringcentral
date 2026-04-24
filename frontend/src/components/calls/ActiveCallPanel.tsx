import { useState } from 'react';
import {
  Mic,
  MicOff,
  Pause,
  Play,
  Grid3x3,
  PhoneForwarded,
  PhoneOff,
  Circle,
  CircleDot,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Keypad } from '@/components/dialpad/Keypad';
import { formatPhoneNumber, formatDuration, cn } from '@/lib/utils';

export function ActiveCallPanel() {
  const calls = useStore((s) => s.activeCalls);
  const focusedId = useStore((s) => s.focusedCallId);
  const focusCall = useStore((s) => s.focusCall);
  const hangup = useStore((s) => s.hangup);
  const toggleMute = useStore((s) => s.toggleMute);
  const toggleHold = useStore((s) => s.toggleHold);
  const toggleRecording = useStore((s) => s.toggleRecording);
  const sendDtmf = useStore((s) => s.sendDtmf);
  const transfer = useStore((s) => s.transfer);

  const [showKeypad, setShowKeypad] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTo, setTransferTo] = useState('');

  if (calls.length === 0) return null;

  const focused = calls.find((c) => c.id === focusedId) ?? calls[0];
  const elapsed = focused.connectedAt
    ? Math.max(0, Math.floor((Date.now() - focused.connectedAt) / 1000))
    : 0;

  return (
    <section className="card overflow-hidden">
      {/* Switcher pills if multiple calls */}
      {calls.length > 1 && (
        <div className="scroll-area flex gap-2 overflow-x-auto border-b border-ink-200 bg-ink-50 px-4 py-2">
          {calls.map((c) => (
            <button
              key={c.id}
              onClick={() => focusCall(c.id)}
              className={cn(
                'whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition',
                c.id === focused.id
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-ink-700 hover:bg-ink-100',
              )}
            >
              {c.remoteName ?? formatPhoneNumber(c.remoteNumber)}
              {c.onHold && <span className="ml-1 text-[10px] opacity-80">(hold)</span>}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* Left: caller info */}
        <div className="border-b border-ink-200 p-6 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex h-2 w-2 rounded-full',
                focused.status === 'active' ? 'bg-emerald-500' : 'bg-amber-500',
              )}
            />
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              {focused.status === 'connecting'
                ? 'Connecting…'
                : focused.onHold
                  ? 'On hold'
                  : focused.direction === 'inbound'
                    ? 'On call (inbound)'
                    : 'On call (outbound)'}
            </span>
          </div>

          <div className="mt-3 text-2xl font-semibold text-ink-900">
            {focused.remoteName ?? formatPhoneNumber(focused.remoteNumber)}
          </div>
          {focused.remoteName && (
            <div className="text-sm text-ink-500">
              {formatPhoneNumber(focused.remoteNumber)}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <div className="rounded-lg bg-ink-50 px-3 py-2">
              <div className="text-xs text-ink-500">Account</div>
              <div className="font-medium text-ink-800">{focused.accountName}</div>
            </div>
            <div className="rounded-lg bg-ink-50 px-3 py-2">
              <div className="text-xs text-ink-500">
                {focused.direction === 'inbound' ? 'Number called' : 'From'}
              </div>
              <div className="font-medium text-ink-800">
                {focused.businessNumberLabel}
              </div>
              <div className="text-xs text-ink-500">
                {formatPhoneNumber(focused.businessNumber)}
              </div>
            </div>
            <div className="rounded-lg bg-ink-50 px-3 py-2">
              <div className="text-xs text-ink-500">Duration</div>
              <div className="font-mono text-base font-medium text-ink-800">
                {formatDuration(elapsed)}
              </div>
            </div>
          </div>
        </div>

        {/* Right: controls */}
        <div className="flex flex-col p-6">
          <div className="grid grid-cols-3 gap-2">
            <ControlButton
              active={focused.muted}
              onClick={() => toggleMute(focused.id)}
              icon={focused.muted ? MicOff : Mic}
              label={focused.muted ? 'Unmute' : 'Mute'}
            />
            <ControlButton
              active={focused.onHold}
              onClick={() => toggleHold(focused.id)}
              icon={focused.onHold ? Play : Pause}
              label={focused.onHold ? 'Resume' : 'Hold'}
            />
            <ControlButton
              active={showKeypad}
              onClick={() => setShowKeypad((v) => !v)}
              icon={Grid3x3}
              label="Keypad"
            />
            <ControlButton
              active={showTransfer}
              onClick={() => setShowTransfer((v) => !v)}
              icon={PhoneForwarded}
              label="Transfer"
            />
            <ControlButton
              active={focused.recording}
              onClick={() => toggleRecording(focused.id)}
              icon={focused.recording ? CircleDot : Circle}
              label={focused.recording ? 'Recording' : 'Record'}
            />
            <button
              onClick={() => hangup(focused.id)}
              className="flex flex-col items-center justify-center gap-1 rounded-xl bg-red-600 px-3 py-3 text-white hover:bg-red-700"
            >
              <PhoneOff size={20} />
              <span className="text-xs font-medium">End</span>
            </button>
          </div>

          {showKeypad && (
            <div className="mt-4 rounded-xl bg-ink-50 p-3">
              <Keypad onPress={(d) => sendDtmf(focused.id, d)} compact />
            </div>
          )}

          {showTransfer && (
            <div className="mt-4 rounded-xl border border-ink-200 p-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                Transfer to number or extension
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="+1 (555) 123-4567 or x1234"
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                />
                <button
                  className="btn-primary"
                  disabled={!transferTo.trim()}
                  onClick={async () => {
                    await transfer(focused.id, transferTo.trim());
                    setShowTransfer(false);
                    setTransferTo('');
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ControlButton({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: typeof Mic;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-3 transition',
        active
          ? 'bg-brand-600 text-white hover:bg-brand-700'
          : 'bg-ink-100 text-ink-800 hover:bg-ink-200',
      )}
    >
      <Icon size={20} />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}
