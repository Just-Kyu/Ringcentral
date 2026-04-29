import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPhoneNumber(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length > 10) {
    return `+${digits}`;
  }
  return input;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diff = (now - date.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}

export function generateId(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

const AUDIO_PREFS_KEY = 'rc_audio_prefs';

export interface AudioPrefs {
  micDeviceId?: string;
  speakerDeviceId?: string;
}

export function getAudioPrefs(): AudioPrefs {
  try {
    return JSON.parse(localStorage.getItem(AUDIO_PREFS_KEY) ?? '{}') as AudioPrefs;
  } catch {
    return {};
  }
}

export function setAudioPrefs(prefs: AudioPrefs): void {
  localStorage.setItem(AUDIO_PREFS_KEY, JSON.stringify(prefs));
}

const INBOUND_KEY = 'rc_account_inbound';

/** Per-account opt-in flag for receiving inbound calls in Easy Call. */
export function getAccountInboundEnabled(accountId: string): boolean {
  try {
    const map = JSON.parse(localStorage.getItem(INBOUND_KEY) ?? '{}') as Record<string, boolean>;
    return Boolean(map[accountId]);
  } catch {
    return false;
  }
}

export function setAccountInboundEnabled(accountId: string, enabled: boolean): void {
  try {
    const map = JSON.parse(localStorage.getItem(INBOUND_KEY) ?? '{}') as Record<string, boolean>;
    if (enabled) map[accountId] = true;
    else delete map[accountId];
    localStorage.setItem(INBOUND_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/**
 * Normalize any user-entered phone number into E.164 form for dialing.
 * Accepts shapes like "(513) 902-7643", "513-902-7643", "5139027643",
 * "+1 513 902 7643", "1-513-902-7643", "+15139027643", etc.
 *
 * Rules:
 *  - If it already starts with `+`, keep the literal `+` and digits.
 *  - 10 digits → assume US/Canada, prepend `+1`.
 *  - 11 digits starting with `1` → prepend `+`.
 *  - 7 digits → reject (need an area code).
 *  - Anything else (8-15 digits, non-NANP) → prepend `+` as-is.
 * Returns null if the number can't be coerced into a dialable form.
 */
export function normalizeDialString(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const startedWithPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 0) return null;
  if (startedWithPlus) {
    return `+${digits}`;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length < 8) return null;
  return `+${digits}`;
}

/**
 * Trigger the browser's microphone permission prompt and return true if
 * the user grants (or has already granted) access.  Throws a friendly
 * error if it's blocked at the browser or system level.
 */
export async function ensureMicrophonePermission(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      'Your browser does not support WebRTC microphone access. Use a recent Chrome or Edge.',
    );
  }
  const prefs = getAudioPrefs();
  const constraint = prefs.micDeviceId
    ? { deviceId: { exact: prefs.micDeviceId } }
    : true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: constraint });
    // Release the test stream — the WebPhone will request its own.
    stream.getTracks().forEach((t) => t.stop());
  } catch (e) {
    const err = e as DOMException & { name?: string; message?: string };
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      throw new Error(
        'Microphone access is blocked. Click the lock icon in the address bar, set Microphone to Allow, then try again.',
      );
    }
    if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
      throw new Error(
        'No microphone found. Plug in a mic (or check your selected mic in Settings) and try again.',
      );
    }
    throw new Error(`Microphone error: ${err.message ?? err.name ?? 'unknown'}`);
  }
}
