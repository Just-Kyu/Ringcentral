/**
 * Thin wrapper around @ringcentral/web-phone with a built-in mock mode.
 *
 * In mock mode (VITE_USE_MOCK_WEBPHONE=true) we do not touch the network and
 * synthesize incoming calls every so often so the UI is fully demonstrable.
 * In real mode we pull SIP provisioning from the backend (which holds the
 * client_secret) and instantiate the real WebPhone SDK.
 */
import type { Account, Call, PhoneNumber } from '@/types';
import { generateId } from './utils';

export interface WebPhoneEvents {
  onIncoming: (call: Call) => void;
  onConnected: (callId: string) => void;
  onEnded: (callId: string) => void;
  onError: (accountId: string, message: string) => void;
}

export interface WebPhoneInstance {
  accountId: string;
  startOutbound: (from: PhoneNumber, toNumber: string) => Promise<Call>;
  answer: (callId: string) => Promise<void>;
  decline: (callId: string) => Promise<void>;
  hangup: (callId: string) => Promise<void>;
  hold: (callId: string, on: boolean) => Promise<void>;
  mute: (callId: string, on: boolean) => Promise<void>;
  sendDtmf: (callId: string, digit: string) => Promise<void>;
  transfer: (callId: string, target: string) => Promise<void>;
  destroy: () => void;
}

const MOCK = (import.meta.env.VITE_USE_MOCK_WEBPHONE ?? 'true') === 'true';

const FAKE_INCOMING_NAMES = [
  'Sarah Johnson',
  'Mike Chen',
  'Acme Logistics',
  'Carlos Rivera',
  undefined,
  'Emily Park',
  'Dispatch — Yard 4',
];

const FAKE_INCOMING_NUMBERS = [
  '+15125551038',
  '+13105557721',
  '+18005550199',
  '+16145559922',
  '+19495553084',
];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

class MockWebPhone implements WebPhoneInstance {
  private timer: number | null = null;
  private active = new Map<string, Call>();

  constructor(
    public accountId: string,
    private accountName: string,
    private numbers: PhoneNumber[],
    private events: WebPhoneEvents,
  ) {
    // Schedule a fake incoming call sometime in the next 30–90 seconds.
    this.scheduleFakeIncoming();
  }

  private scheduleFakeIncoming() {
    if (this.numbers.length === 0) return;
    const delay = 30_000 + Math.random() * 60_000;
    this.timer = window.setTimeout(() => {
      this.fireFakeIncoming();
      this.scheduleFakeIncoming();
    }, delay);
  }

  private fireFakeIncoming() {
    const target = randomFrom(this.numbers);
    const call: Call = {
      id: generateId('call'),
      accountId: this.accountId,
      accountName: this.accountName,
      direction: 'inbound',
      status: 'ringing',
      remoteNumber: randomFrom(FAKE_INCOMING_NUMBERS),
      remoteName: randomFrom(FAKE_INCOMING_NAMES),
      businessNumber: target.number,
      businessNumberLabel: target.label,
      startedAt: Date.now(),
      muted: false,
      onHold: false,
      recording: false,
    };
    this.active.set(call.id, call);
    this.events.onIncoming(call);
  }

  async startOutbound(from: PhoneNumber, toNumber: string): Promise<Call> {
    const call: Call = {
      id: generateId('call'),
      accountId: this.accountId,
      accountName: this.accountName,
      direction: 'outbound',
      status: 'connecting',
      remoteNumber: toNumber,
      businessNumber: from.number,
      businessNumberLabel: from.label,
      startedAt: Date.now(),
      muted: false,
      onHold: false,
      recording: false,
    };
    this.active.set(call.id, call);
    // Simulate network ringing → connected
    window.setTimeout(() => {
      const c = this.active.get(call.id);
      if (!c || c.status === 'ended') return;
      c.status = 'active';
      c.connectedAt = Date.now();
      this.events.onConnected(call.id);
    }, 1200 + Math.random() * 800);
    return call;
  }

  async answer(callId: string): Promise<void> {
    const c = this.active.get(callId);
    if (!c) return;
    c.status = 'active';
    c.connectedAt = Date.now();
    this.events.onConnected(callId);
  }

  async decline(callId: string): Promise<void> {
    return this.hangup(callId);
  }

  async hangup(callId: string): Promise<void> {
    const c = this.active.get(callId);
    if (!c) return;
    c.status = 'ended';
    c.endedAt = Date.now();
    this.active.delete(callId);
    this.events.onEnded(callId);
  }

  async hold(callId: string, on: boolean): Promise<void> {
    const c = this.active.get(callId);
    if (!c) return;
    c.onHold = on;
    c.status = on ? 'on-hold' : 'active';
  }

  async mute(callId: string, on: boolean): Promise<void> {
    const c = this.active.get(callId);
    if (!c) return;
    c.muted = on;
  }

  async sendDtmf(_callId: string, _digit: string): Promise<void> {
    // No-op in mock — real SDK would send an INFO/RFC2833 frame.
  }

  async transfer(callId: string, _target: string): Promise<void> {
    return this.hangup(callId);
  }

  destroy() {
    if (this.timer != null) window.clearTimeout(this.timer);
    this.timer = null;
    this.active.clear();
  }
}

class RealWebPhone implements WebPhoneInstance {
  // The real implementation is intentionally minimal here — wiring it requires
  // valid OAuth tokens fetched via the backend's /sip-provision proxy and the
  // user's microphone permission. The shape mirrors MockWebPhone so the rest of
  // the app stays identical.
  constructor(
    public accountId: string,
    _account: Account,
    _events: WebPhoneEvents,
  ) {
    throw new Error(
      'Real WebPhone not initialized in this build. Set VITE_USE_MOCK_WEBPHONE=true ' +
        'or wire the @ringcentral/web-phone SDK using the SIP provisioning data ' +
        'returned by POST /api/accounts/:id/sip-provision.',
    );
  }
  startOutbound = async () => { throw new Error('not implemented'); };
  answer = async () => { throw new Error('not implemented'); };
  decline = async () => { throw new Error('not implemented'); };
  hangup = async () => { throw new Error('not implemented'); };
  hold = async () => { throw new Error('not implemented'); };
  mute = async () => { throw new Error('not implemented'); };
  sendDtmf = async () => { throw new Error('not implemented'); };
  transfer = async () => { throw new Error('not implemented'); };
  destroy = () => { /* noop */ };
}

export function createWebPhone(account: Account, events: WebPhoneEvents): WebPhoneInstance {
  if (MOCK) {
    return new MockWebPhone(account.id, account.name, account.numbers, events);
  }
  return new RealWebPhone(account.id, account, events);
}

export const isMockMode = MOCK;
