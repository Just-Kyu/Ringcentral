/**
 * Thin wrapper around ringcentral-web-phone.
 *
 * One wrapper instance per RingCentral account.  The wrapper:
 *   1. Fetches SIP provisioning from our backend (the backend holds the
 *      client_secret, so it never reaches the browser).
 *   2. Starts the SDK which opens a SIP-over-WSS connection to RingCentral.
 *   3. Surfaces inbound/outbound call events to the Zustand store via
 *      the `WebPhoneEvents` callbacks.
 *
 * The SDK's exact event/method names have shifted between major versions.  If
 * the SDK you install exposes slightly different shapes, adjust the narrow
 * adapter methods below (`extractRemote`, `bindSessionEvents`, `invite`).
 */
import WebPhoneSDK from 'ringcentral-web-phone';
import type { Account, Call, PhoneNumber } from '@/types';
import { api } from './api';
import { generateId, getAudioPrefs } from './utils';

export interface WebPhoneEvents {
  onIncoming: (call: Call) => void;
  onConnected: (callId: string) => void;
  onEnded: (callId: string) => void;
  onError: (accountId: string, message: string) => void;
}

export interface WebPhoneInstance {
  accountId: string;
  ready: Promise<void>;
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

// Minimal SIP session shape we rely on. Different SDK versions name these
// slightly differently — adjust the accessor functions below if needed.
interface SipSession {
  id?: string;
  remoteNumber?: string;
  remoteName?: string;
  to?: string;
  from?: string;
  answer: () => Promise<void> | void;
  reject?: () => Promise<void> | void;
  decline?: () => Promise<void> | void;
  hangup: () => Promise<void> | void;
  terminate?: () => Promise<void> | void;
  hold: () => Promise<void> | void;
  unhold?: () => Promise<void> | void;
  mute: () => Promise<void> | void;
  unmute?: () => Promise<void> | void;
  sendDtmf?: (digit: string) => Promise<void> | void;
  dtmf?: (digit: string) => Promise<void> | void;
  transfer: (target: string) => Promise<void> | void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  off?: (event: string, listener: (...args: unknown[]) => void) => void;
}

interface SipSdk {
  start?: () => Promise<void>;
  register?: () => Promise<void>;
  on: (event: string, listener: (session: SipSession) => void) => void;
  call: (to: string, from?: string) => Promise<SipSession> | SipSession;
  dispose?: () => Promise<void> | void;
  destroy?: () => void;
}

function extractRemoteNumber(session: SipSession): string {
  return session.remoteNumber ?? parseUri(session.from) ?? '';
}

function extractLocalNumber(session: SipSession): string {
  return parseUri(session.to) ?? '';
}

function parseUri(uri: string | undefined): string | undefined {
  if (!uri) return undefined;
  // "sip:+15551234567@domain" → "+15551234567"
  const m = uri.match(/(?:^|<)(?:sip:)?(\+?\d+)@/);
  return m ? m[1] : undefined;
}

export async function createWebPhone(
  account: Account,
  events: WebPhoneEvents,
): Promise<WebPhoneInstance> {
  const sessionsByCallId = new Map<string, SipSession>();
  const callIdBySession = new WeakMap<SipSession, string>();

  const sipProvision = (await api.sipProvision(account.id)) as {
    sipInfo?: unknown;
    sipFlags?: unknown;
    device?: unknown;
  };

  const audioPrefs = getAudioPrefs();
  const micConstraint = audioPrefs.micDeviceId
    ? { deviceId: { exact: audioPrefs.micDeviceId } }
    : true;

  // The SDK constructor signature has varied between versions — the common
  // denominator is a single options argument that carries the provisioning data
  // and an app identifier used for registration.
  const sdk = new (WebPhoneSDK as unknown as new (opts: unknown) => SipSdk)({
    sipInfo: Array.isArray((sipProvision as { sipInfo?: unknown[] }).sipInfo)
      ? (sipProvision as { sipInfo: unknown[] }).sipInfo[0]
      : (sipProvision as { sipInfo?: unknown }).sipInfo,
    appKey: undefined, // Filled server-side; keep undefined to let the SDK use its default.
    appName: 'Easy Call',
    appVersion: '1.0.0',
    // Pass microphone device preference; both property names are used across SDK versions.
    constraints: { audio: micConstraint },
    audioConstraints: micConstraint,
  });

  // Apply speaker output device if the browser supports setSinkId.
  if (audioPrefs.speakerDeviceId && typeof AudioContext !== 'undefined') {
    const applySpeaker = () => {
      document.querySelectorAll('audio').forEach((el) => {
        const elem = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
        if (typeof elem.setSinkId === 'function' && audioPrefs.speakerDeviceId) {
          elem.setSinkId(audioPrefs.speakerDeviceId).catch(() => undefined);
        }
      });
    };
    // Apply now and again shortly after (the SDK may create audio elements during start).
    applySpeaker();
    setTimeout(applySpeaker, 2000);
  }

  const ready = (async () => {
    if (typeof sdk.start === 'function') await sdk.start();
    else if (typeof sdk.register === 'function') await sdk.register();
  })();

  function labelForNumber(bizNumber: string): PhoneNumber | undefined {
    return account.numbers.find((n) => n.number === bizNumber);
  }

  function trackSession(session: SipSession, seed: Omit<Call, 'id'>): Call {
    const id = generateId('call');
    const call: Call = { ...seed, id };
    sessionsByCallId.set(id, session);
    callIdBySession.set(session, id);
    bindSessionEvents(session);
    return call;
  }

  function bindSessionEvents(session: SipSession) {
    const id = callIdBySession.get(session);
    if (!id) return;
    const onAccepted = () => events.onConnected(id);
    const onTerminated = () => {
      // Remove all listeners we added to prevent memory leaks.
      if (session.off) {
        session.off('accepted', onAccepted);
        session.off('answered', onAccepted);
        session.off('established', onAccepted);
        session.off('terminated', onTerminated);
        session.off('bye', onTerminated);
        session.off('disposed', onTerminated);
        session.off('failed', onTerminated);
        session.off('rejected', onTerminated);
      }
      sessionsByCallId.delete(id);
      events.onEnded(id);
    };
    // Different SDK versions emit different events — bind all plausible names.
    session.on('accepted', onAccepted);
    session.on('answered', onAccepted);
    session.on('established', onAccepted);
    session.on('terminated', onTerminated);
    session.on('bye', onTerminated);
    session.on('disposed', onTerminated);
    session.on('failed', onTerminated);
    session.on('rejected', onTerminated);
  }

  // Incoming invitations from RingCentral land here.
  const bindIncoming = (session: SipSession) => {
    const bizNumber = extractLocalNumber(session);
    const matched = labelForNumber(bizNumber) ?? account.numbers[0];
    const call = trackSession(session, {
      accountId: account.id,
      accountName: account.name,
      direction: 'inbound',
      status: 'ringing',
      remoteNumber: extractRemoteNumber(session),
      remoteName: session.remoteName,
      businessNumber: matched?.number ?? bizNumber,
      businessNumberLabel: matched?.label ?? 'Unlabeled',
      startedAt: Date.now(),
      muted: false,
      onHold: false,
      recording: false,
    });
    events.onIncoming(call);
  };

  sdk.on('invite', bindIncoming);
  sdk.on('inviteReceived', bindIncoming);
  sdk.on('inboundCall', bindIncoming);

  return {
    accountId: account.id,
    ready,

    async startOutbound(from, toNumber) {
      await ready;
      const session = await Promise.resolve(sdk.call(toNumber, from.number));
      return trackSession(session, {
        accountId: account.id,
        accountName: account.name,
        direction: 'outbound',
        status: 'connecting',
        remoteNumber: toNumber,
        businessNumber: from.number,
        businessNumberLabel: from.label,
        startedAt: Date.now(),
        muted: false,
        onHold: false,
        recording: false,
      });
    },

    async answer(callId) {
      const s = sessionsByCallId.get(callId);
      if (s) await Promise.resolve(s.answer());
    },

    async decline(callId) {
      const s = sessionsByCallId.get(callId);
      if (!s) return;
      await Promise.resolve((s.decline ?? s.reject ?? s.hangup).call(s));
    },

    async hangup(callId) {
      const s = sessionsByCallId.get(callId);
      if (!s) return;
      await Promise.resolve((s.hangup ?? s.terminate)!.call(s));
    },

    async hold(callId, on) {
      const s = sessionsByCallId.get(callId);
      if (!s) return;
      if (on) await Promise.resolve(s.hold());
      else await Promise.resolve((s.unhold ?? s.hold).call(s));
    },

    async mute(callId, on) {
      const s = sessionsByCallId.get(callId);
      if (!s) return;
      if (on) await Promise.resolve(s.mute());
      else await Promise.resolve((s.unmute ?? s.mute).call(s));
    },

    async sendDtmf(callId, digit) {
      const s = sessionsByCallId.get(callId);
      if (!s) return;
      const fn = s.sendDtmf ?? s.dtmf;
      if (fn) await Promise.resolve(fn.call(s, digit));
    },

    async transfer(callId, target) {
      const s = sessionsByCallId.get(callId);
      if (!s) return;
      await Promise.resolve(s.transfer(target));
    },

    destroy() {
      sessionsByCallId.clear();
      if (typeof sdk.dispose === 'function') void sdk.dispose();
      else if (typeof sdk.destroy === 'function') sdk.destroy();
    },
  };
}
