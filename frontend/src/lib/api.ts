import type { Account, CallLogEntry } from '@/types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = text || `${res.status} ${res.statusText}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && typeof parsed.error === 'string') {
        message = parsed.error;
      }
    } catch {
      /* not JSON — keep raw text */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  // App auth
  login: (email: string, password: string) =>
    request<{ ok: true; email: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  signup: (email: string, password: string) =>
    request<{ ok: true; email: string }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  me: () => request<{ email: string } | null>('/auth/me'),

  // Accounts
  listAccounts: () => request<Account[]>('/accounts'),
  createAccount: (payload: { name: string; clientId: string; clientSecret: string }) =>
    request<{ account: Account; oauthUrl: string }>('/accounts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteAccount: (id: string) => request<void>(`/accounts/${id}`, { method: 'DELETE' }),
  refreshAccount: (id: string) =>
    request<Account>(`/accounts/${id}/refresh`, { method: 'POST' }),

  // Numbers
  updateNumberLabel: (numberId: string, label: string) =>
    request<void>(`/numbers/${numberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ label }),
    }),
  setDefaultNumber: (numberId: string) =>
    request<void>(`/numbers/${numberId}/default`, { method: 'POST' }),
  removeNumber: (numberId: string) =>
    request<void>(`/numbers/${numberId}`, { method: 'DELETE' }),

  // Call log
  listCallLog: (params: {
    accountId?: string;
    direction?: 'inbound' | 'outbound';
    from?: string;
    to?: string;
    limit?: number;
  } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
    ).toString();
    return request<CallLogEntry[]>(`/call-log${qs ? `?${qs}` : ''}`);
  },
  recordCall: (entry: Omit<CallLogEntry, 'id'>) =>
    request<CallLogEntry>('/call-log', { method: 'POST', body: JSON.stringify(entry) }),

  // SIP provisioning proxy (the backend forwards the call to RingCentral with the
  // server-held client_secret so the secret never enters the browser)
  sipProvision: (accountId: string) =>
    request<unknown>(`/accounts/${accountId}/sip-provision`, { method: 'POST' }),

  // Recordings — backend streams audio through a proxy so the user never
  // handles a RingCentral access token.
  listRecordings: () => request<RecordingItem[]>('/recordings'),
  recordingAudioUrl: (accountId: string, recordingId: string) =>
    `${BASE_URL}/recordings/${accountId}/${recordingId}/audio`,
};

export interface RecordingItem {
  callLogId: string;
  recordingId: string;
  accountId: string;
  accountName: string;
  startedAt: string;
  durationSec: number;
  direction: 'inbound' | 'outbound';
  fromNumber: string;
  toNumber: string;
  fromName?: string;
  toName?: string;
  result: string;
}

export { ApiError };
