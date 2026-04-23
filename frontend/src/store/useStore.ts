import { create } from 'zustand';
import type {
  Account,
  Call,
  CallLogEntry,
  PhoneNumber,
  AppUser,
} from '@/types';
import { createWebPhone, type WebPhoneInstance, isMockMode } from '@/lib/webphone';
import { generateId } from '@/lib/utils';

type SidebarView = 'dialpad' | 'history' | 'numbers' | 'settings';

interface State {
  // Auth
  user: AppUser | null;
  hydrated: boolean;

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
  hydrate: () => void;
  login: (user: AppUser) => void;
  logout: () => void;

  loadAccounts: (accounts: Account[]) => void;
  addAccount: (account: Account) => void;
  removeAccount: (accountId: string) => void;

  setNumberLabel: (numberId: string, label: string) => void;
  setDefaultNumber: (numberId: string) => void;

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

  // Used by UI to seed mock data
  loadDemoData: () => void;
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
}

export const useStore = create<State & Actions>((set, get) => ({
  user: null,
  hydrated: false,
  accounts: [],
  callHistory: [],
  incomingQueue: [],
  activeCalls: [],
  focusedCallId: null,
  view: 'dialpad',
  defaultFromNumberId: null,
  _phones: new Map(),
  _tickHandle: null,

  hydrate: () => {
    if (get().hydrated) return;
    // 1-second tick so duration timers re-render. We avoid storing the time in
    // state directly to prevent cascade renders for every call concurrently.
    const handle = window.setInterval(() => {
      // Only force re-render if there's at least one active call.
      if (get().activeCalls.length > 0) {
        set((s) => ({ activeCalls: [...s.activeCalls] }));
      }
    }, 1000);
    set({ hydrated: true, _tickHandle: handle });
  },

  login: (user) => set({ user }),
  logout: () => {
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

  loadAccounts: (accounts) => {
    const { _phones } = get();
    // Tear down phones for removed accounts
    const incoming = new Set(accounts.map((a) => a.id));
    for (const [id, phone] of _phones) {
      if (!incoming.has(id)) {
        phone.destroy();
        _phones.delete(id);
      }
    }
    // Build phones for new accounts
    for (const account of accounts) {
      if (account.status !== 'connected') continue;
      if (_phones.has(account.id)) continue;
      _phones.set(
        account.id,
        createWebPhone(account, {
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
              // Preserve voicemail status set by sendToVoicemail; otherwise infer.
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
        }),
      );
    }
    const defaultId =
      get().defaultFromNumberId ??
      accounts.flatMap((a) => a.numbers).find((n) => n.isDefault)?.id ??
      accounts[0]?.numbers[0]?.id ??
      null;
    set({ accounts, _phones, defaultFromNumberId: defaultId });
  },

  addAccount: (account) => {
    set((s) => ({ accounts: [...s.accounts, account] }));
    get().loadAccounts(get().accounts);
  },

  removeAccount: (accountId) => {
    const { _phones } = get();
    _phones.get(accountId)?.destroy();
    _phones.delete(accountId);
    set((s) => ({
      accounts: s.accounts.filter((a) => a.id !== accountId),
      _phones,
    }));
  },

  setNumberLabel: (numberId, label) => {
    set((s) => ({
      accounts: s.accounts.map((a) => ({
        ...a,
        numbers: a.numbers.map((n) =>
          n.id === numberId ? { ...n, label } : n,
        ),
      })),
    }));
  },

  setDefaultNumber: (numberId) => {
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
        ...s.activeCalls.map((c) =>
          c.status === 'active' ? { ...c, onHold: true, status: 'on-hold' } : c,
        ),
        { ...ringing, status: 'active', connectedAt: Date.now() },
      ],
      focusedCallId: callId,
    }));
  },

  decline: async (callId) => {
    const ringing = get().incomingQueue.find((c) => c.id === callId);
    if (!ringing) return;
    // The WebPhone's onEnded callback handles history (status='ringing' → 'missed')
    // and removes the entry from the queue.
    await get()._phones.get(ringing.accountId)?.decline(callId);
  },

  sendToVoicemail: (callId) => {
    const ringing = get().incomingQueue.find((c) => c.id === callId);
    if (!ringing) return;
    // Mark the queued call as 'voicemail' so onEnded preserves that status,
    // then end it. The webphone wrapper handles the rest.
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
    const phone = get()._phones.get(call.accountId);
    await phone?.hangup(callId);
    // The webphone's onEnded handler does the cleanup + history append.
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

  loadDemoData: () => {
    const accounts: Account[] = [
      {
        id: 'acct_1',
        name: 'Premier Trucking',
        status: 'connected',
        createdAt: new Date().toISOString(),
        numbers: [
          { id: 'n_1', accountId: 'acct_1', number: '+15134930303', label: 'Main Line', isDefault: true },
          { id: 'n_2', accountId: 'acct_1', number: '+15134930310', label: 'Dispatch', isDefault: false },
          { id: 'n_3', accountId: 'acct_1', number: '+15134930311', label: 'Driver Hotline', isDefault: false },
        ],
      },
      {
        id: 'acct_2',
        name: 'Premier Sales',
        status: 'connected',
        createdAt: new Date().toISOString(),
        numbers: [
          { id: 'n_4', accountId: 'acct_2', number: '+15551234567', label: 'Sales — Inbound', isDefault: false },
          { id: 'n_5', accountId: 'acct_2', number: '+15551234568', label: 'Sales — Outbound', isDefault: false },
          { id: 'n_6', accountId: 'acct_2', number: '+15551234569', label: 'VIP Line', isDefault: false },
        ],
      },
      {
        id: 'acct_3',
        name: 'Customer Support',
        status: 'connected',
        createdAt: new Date().toISOString(),
        numbers: [
          { id: 'n_7', accountId: 'acct_3', number: '+15559876543', label: 'Support Tier 1', isDefault: false },
          { id: 'n_8', accountId: 'acct_3', number: '+15559876544', label: 'Support Tier 2', isDefault: false },
          { id: 'n_9', accountId: 'acct_3', number: '+15559876545', label: 'Escalations', isDefault: false },
        ],
      },
      {
        id: 'acct_4',
        name: 'Operations',
        status: 'connected',
        createdAt: new Date().toISOString(),
        numbers: [
          { id: 'n_10', accountId: 'acct_4', number: '+18005550100', label: 'Ops Main', isDefault: false },
          { id: 'n_11', accountId: 'acct_4', number: '+18005550101', label: 'Yard 1', isDefault: false },
          { id: 'n_12', accountId: 'acct_4', number: '+18005550102', label: 'Yard 2', isDefault: false },
        ],
      },
      {
        id: 'acct_5',
        name: 'Executive',
        status: 'connected',
        createdAt: new Date().toISOString(),
        numbers: [
          { id: 'n_13', accountId: 'acct_5', number: '+12025551110', label: 'CEO Direct', isDefault: false },
          { id: 'n_14', accountId: 'acct_5', number: '+12025551111', label: 'COO Direct', isDefault: false },
          { id: 'n_15', accountId: 'acct_5', number: '+12025551112', label: 'Front Desk', isDefault: false },
        ],
      },
    ];
    const seedHistory: CallLogEntry[] = [
      mkLog('inbound', 'Sarah Johnson', '+15125551038', 'acct_1', 'Premier Trucking', '+15134930303', 'Main Line', 142, 'completed', 12),
      mkLog('outbound', undefined, '+13105557721', 'acct_2', 'Premier Sales', '+15551234568', 'Sales — Outbound', 87, 'completed', 47),
      mkLog('inbound', 'Acme Logistics', '+18005550199', 'acct_3', 'Customer Support', '+15559876543', 'Support Tier 1', 0, 'missed', 95),
      mkLog('inbound', 'Carlos Rivera', '+16145559922', 'acct_4', 'Operations', '+18005550101', 'Yard 1', 215, 'completed', 180),
      mkLog('outbound', undefined, '+19495553084', 'acct_5', 'Executive', '+12025551110', 'CEO Direct', 312, 'completed', 360),
      mkLog('inbound', 'Emily Park', '+12135551234', 'acct_1', 'Premier Trucking', '+15134930310', 'Dispatch', 0, 'voicemail', 720),
    ];
    get().loadAccounts(accounts);
    set({ callHistory: seedHistory });
  },
}));

function mkLog(
  direction: 'inbound' | 'outbound',
  remoteName: string | undefined,
  remoteNumber: string,
  accountId: string,
  accountName: string,
  bizNumber: string,
  bizLabel: string,
  durationSec: number,
  status: CallLogEntry['status'],
  minutesAgo: number,
): CallLogEntry {
  return {
    id: generateId('log'),
    accountId,
    accountName,
    direction,
    fromNumber: direction === 'inbound' ? remoteNumber : bizNumber,
    toNumber: direction === 'inbound' ? bizNumber : remoteNumber,
    businessNumberUsed: bizNumber,
    businessNumberLabel: bizLabel,
    durationSec,
    status,
    startedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  };
}

export { isMockMode };
