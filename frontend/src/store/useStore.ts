import { create } from 'zustand';
import type {
  Account,
  Call,
  CallLogEntry,
  PhoneNumber,
  AppUser,
} from '@/types';
import { createWebPhone, type WebPhoneInstance } from '@/lib/webphone';
import { api } from '@/lib/api';
import { generateId } from '@/lib/utils';

type SidebarView = 'dialpad' | 'history' | 'numbers' | 'settings';

interface State {
  // Auth
  user: AppUser | null;
  hydrated: boolean;
  hydrating: boolean;

  // Data
  accounts: Account[];
  callHistory: CallLogEntry[];

  // Live calls
  incomingQueue: Call[];      // ringing inbound calls awaiting answer/decline
  activeCalls: Call[];        // answered/outbound calls (active or on-hold)
  focusedCallId: string | null;

  // UI
  view: SidebarView;
  defaultFromNumberId: string | null;

  // Internal: one webphone per account
  _phones: Map<string, WebPhoneInstance>;
  _tickHandle: number | null;
}

interface Actions {
  hydrate: () => Promise<void>;
  login: (user: AppUser) => Promise<void>;
  logout: () => Promise<void>;

  refreshAccounts: () => Promise<void>;
  loadAccounts: (accounts: Account[]) => Promise<void>;
  addAccount: (account: Account) => Promise<void>;
  removeAccount: (accountId: string) => Promise<void>;

  setNumberLabel: (numberId: string, label: string) => Promise<void>;
  setDefaultNumber: (numberId: string) => Promise<void>;

  setView: (view: SidebarView) => void;

  // Outbound
  placeCall: (fromNumberId: string, toNumber: string) => Promise<void>;

  // Inbound / active call control
  answer: (callId: string) => Promise<void>;
  decline: (callId: string) => Promise<void>;
  sendToVoicemail: (callId: string) => void;
  hangup: (callId: string) => Promise<void>;
  toggleMute: (callId: string) => Promise<void>;
  toggleHold: (callId: string) => Promise<void>;
  toggleRecording: (callId: string) => void;
  sendDtmf: (callId: string, digit: string) => Promise<void>;
  transfer: (callId: string, target: string) => Promise<void>;
  focusCall: (callId: string) => void;
}

function findNumber(accounts: Account[], numberId: string): {
  account: Account;
  number: PhoneNumber;
} | null {
  for (const a of accounts) {
    const n = a.numbers.find((x) => x.id === numberId);
    if (n) return { account: a, number: n };
  }
  return null;
}

async function persistHistoryEntry(entry: Omit<CallLogEntry, 'id'>): Promise<void> {
  try {
    await api.recordCall(entry);
  } catch (e) {
    console.warn('Failed to persist call log entry:', e);
  }
}

function appendHistory(set: (fn: (s: State) => Partial<State>) => void, call: Call) {
  const status: CallLogEntry['status'] =
    call.status === 'voicemail'
      ? 'voicemail'
      : call.connectedAt
        ? 'completed'
        : 'missed';
  const durationSec = call.connectedAt
    ? Math.max(0, Math.round(((call.endedAt ?? Date.now()) - call.connectedAt) / 1000))
    : 0;
  const entry: CallLogEntry = {
    id: generateId('log'),
    accountId: call.accountId,
    accountName: call.accountName,
    direction: call.direction,
    fromNumber: call.direction === 'inbound' ? call.remoteNumber : call.businessNumber,
    toNumber: call.direction === 'inbound' ? call.businessNumber : call.remoteNumber,
    businessNumberUsed: call.businessNumber,
    businessNumberLabel: call.businessNumberLabel,
    durationSec,
    status,
    startedAt: new Date(call.startedAt).toISOString(),
  };
  set((s) => ({ callHistory: [entry, ...s.callHistory].slice(0, 500) }));
  const { id: _, ...persistable } = entry;
  void persistHistoryEntry(persistable);
}

export const useStore = create<State & Actions>((set, get) => ({
  user: null,
  hydrated: false,
  hydrating: false,
  accounts: [],
  callHistory: [],
  incomingQueue: [],
  activeCalls: [],
  focusedCallId: null,
  view: 'dialpad',
  defaultFromNumberId: null,
  _phones: new Map(),
  _tickHandle: null,

  hydrate: async () => {
    if (get().hydrated || get().hydrating) return;
    set({ hydrating: true });
    try {
      const me = await api.me();
      if (me) {
        set({ user: { email: me.email } });
        const [accounts, history] = await Promise.all([
          api.listAccounts(),
          api.listCallLog({ limit: 200 }),
        ]);
        set({ callHistory: history });
        await get().loadAccounts(accounts);
      }
      // 1-second tick so active-call duration timers re-render.
      if (get()._tickHandle == null) {
        const handle = window.setInterval(() => {
          if (get().activeCalls.length > 0) {
            set((s) => ({ activeCalls: [...s.activeCalls] }));
          }
        }, 1000);
        set({ _tickHandle: handle });
      }
    } finally {
      set({ hydrated: true, hydrating: false });
    }
  },

  login: async (user) => {
    set({ user });
    const [accounts, history] = await Promise.all([
      api.listAccounts(),
      api.listCallLog({ limit: 200 }),
    ]);
    set({ callHistory: history });
    await get().loadAccounts(accounts);
  },

  logout: async () => {
    try {
      await api.logout();
    } catch (e) {
      console.warn('logout request failed:', e);
    }
    const { _phones, _tickHandle } = get();
    _phones.forEach((p) => p.destroy());
    if (_tickHandle != null) clearInterval(_tickHandle);
    set({
      user: null,
      accounts: [],
      callHistory: [],
      incomingQueue: [],
      activeCalls: [],
      focusedCallId: null,
      _phones: new Map(),
      _tickHandle: null,
      hydrated: false,
    });
  },

  refreshAccounts: async () => {
    const accounts = await api.listAccounts();
    await get().loadAccounts(accounts);
  },

  loadAccounts: async (accounts) => {
    const phones = new Map(get()._phones);
    // Tear down phones for removed or no-longer-connected accounts.
    const connectedIds = new Set(
      accounts.filter((a) => a.status === 'connected').map((a) => a.id),
    );
    for (const [id, phone] of phones) {
      if (!connectedIds.has(id)) {
        phone.destroy();
        phones.delete(id);
      }
    }
    // Build phones for newly-connected accounts.
    const toInit = accounts.filter(
      (a) => a.status === 'connected' && !phones.has(a.id),
    );
    await Promise.all(
      toInit.map(async (account) => {
        try {
          const phone = await createWebPhone(account, {
            onIncoming: (call) =>
              set((s) => ({ incomingQueue: [...s.incomingQueue, call] })),
            onConnected: (callId) => {
              set((s) => ({
                activeCalls: s.activeCalls.map((c) =>
                  c.id === callId
                    ? { ...c, status: 'active', connectedAt: Date.now() }
                    : c,
                ),
              }));
            },
            onEnded: (callId) => {
              const ended =
                get().activeCalls.find((c) => c.id === callId) ??
                get().incomingQueue.find((c) => c.id === callId);
              if (ended) {
                const finalStatus =
                  ended.status === 'voicemail'
                    ? 'voicemail'
                    : ended.status === 'ringing'
                      ? 'missed'
                      : 'ended';
                appendHistory(set, {
                  ...ended,
                  status: finalStatus,
                  endedAt: Date.now(),
                });
              }
              set((s) => ({
                activeCalls: s.activeCalls.filter((c) => c.id !== callId),
                incomingQueue: s.incomingQueue.filter((c) => c.id !== callId),
                focusedCallId:
                  s.focusedCallId === callId
                    ? (s.activeCalls.find((c) => c.id !== callId)?.id ?? null)
                    : s.focusedCallId,
              }));
            },
            onError: (accountId, message) => {
              console.error(`[webphone:${accountId}]`, message);
            },
          });
          phones.set(account.id, phone);
        } catch (e) {
          console.error(`Failed to initialize WebPhone for ${account.name}:`, e);
        }
      }),
    );

    const defaultId =
      accounts.flatMap((a) => a.numbers).find((n) => n.isDefault)?.id ??
      get().defaultFromNumberId ??
      accounts[0]?.numbers[0]?.id ??
      null;
    set({ accounts, _phones: phones, defaultFromNumberId: defaultId });
  },

  addAccount: async (account) => {
    set((s) => ({ accounts: [...s.accounts, account] }));
    await get().loadAccounts(get().accounts);
  },

  removeAccount: async (accountId) => {
    await api.deleteAccount(accountId);
    const phones = new Map(get()._phones);
    phones.get(accountId)?.destroy();
    phones.delete(accountId);
    set((s) => ({
      accounts: s.accounts.filter((a) => a.id !== accountId),
      _phones: phones,
    }));
  },

  setNumberLabel: async (numberId, label) => {
    await api.updateNumberLabel(numberId, label);
    set((s) => ({
      accounts: s.accounts.map((a) => ({
        ...a,
        numbers: a.numbers.map((n) =>
          n.id === numberId ? { ...n, label } : n,
        ),
      })),
    }));
  },

  setDefaultNumber: async (numberId) => {
    await api.setDefaultNumber(numberId);
    set((s) => ({
      defaultFromNumberId: numberId,
      accounts: s.accounts.map((a) => ({
        ...a,
        numbers: a.numbers.map((n) => ({ ...n, isDefault: n.id === numberId })),
      })),
    }));
  },

  setView: (view) => set({ view }),

  placeCall: async (fromNumberId, toNumber) => {
    const found = findNumber(get().accounts, fromNumberId);
    if (!found) throw new Error('Selected outbound number is not available');
    const phone = get()._phones.get(found.account.id);
    if (!phone) throw new Error(`No active connection for ${found.account.name}`);
    const call = await phone.startOutbound(found.number, toNumber);
    set((s) => ({
      activeCalls: [...s.activeCalls, call],
      focusedCallId: call.id,
      view: 'dialpad',
    }));
  },

  answer: async (callId) => {
    const ringing = get().incomingQueue.find((c) => c.id === callId);
    if (!ringing) return;
    const phone = get()._phones.get(ringing.accountId);
    if (!phone) return;
    // Auto-hold any other live call so the user can hop.
    for (const other of get().activeCalls) {
      if (!other.onHold && other.status === 'active') {
        await phone.hold(other.id, true);
      }
    }
    await phone.answer(callId);
    set((s) => ({
      incomingQueue: s.incomingQueue.filter((c) => c.id !== callId),
      activeCalls: [
        ...s.activeCalls.map((c): Call =>
          c.status === 'active' ? { ...c, onHold: true, status: 'on-hold' } : c,
        ),
        { ...ringing, status: 'active' as const, connectedAt: Date.now() },
      ],
      focusedCallId: callId,
    }));
  },

  decline: async (callId) => {
    const ringing = get().incomingQueue.find((c) => c.id === callId);
    if (!ringing) return;
    await get()._phones.get(ringing.accountId)?.decline(callId);
  },

  sendToVoicemail: (callId) => {
    const ringing = get().incomingQueue.find((c) => c.id === callId);
    if (!ringing) return;
    set((s) => ({
      incomingQueue: s.incomingQueue.map((c) =>
        c.id === callId ? { ...c, status: 'voicemail' } : c,
      ),
    }));
    void get()._phones.get(ringing.accountId)?.decline(callId);
  },

  hangup: async (callId) => {
    const call = get().activeCalls.find((c) => c.id === callId);
    if (!call) return;
    await get()._phones.get(call.accountId)?.hangup(callId);
  },

  toggleMute: async (callId) => {
    const call = get().activeCalls.find((c) => c.id === callId);
    if (!call) return;
    const next = !call.muted;
    await get()._phones.get(call.accountId)?.mute(callId, next);
    set((s) => ({
      activeCalls: s.activeCalls.map((c) =>
        c.id === callId ? { ...c, muted: next } : c,
      ),
    }));
  },

  toggleHold: async (callId) => {
    const call = get().activeCalls.find((c) => c.id === callId);
    if (!call) return;
    const next = !call.onHold;
    await get()._phones.get(call.accountId)?.hold(callId, next);
    set((s) => ({
      activeCalls: s.activeCalls.map((c) =>
        c.id === callId
          ? { ...c, onHold: next, status: next ? 'on-hold' : 'active' }
          : c,
      ),
    }));
  },

  toggleRecording: (callId) => {
    set((s) => ({
      activeCalls: s.activeCalls.map((c) =>
        c.id === callId ? { ...c, recording: !c.recording } : c,
      ),
    }));
  },

  sendDtmf: async (callId, digit) => {
    const call = get().activeCalls.find((c) => c.id === callId);
    if (!call) return;
    await get()._phones.get(call.accountId)?.sendDtmf(callId, digit);
  },

  transfer: async (callId, target) => {
    const call = get().activeCalls.find((c) => c.id === callId);
    if (!call) return;
    await get()._phones.get(call.accountId)?.transfer(callId, target);
  },

  focusCall: (callId) => set({ focusedCallId: callId }),
}));
