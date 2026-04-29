import WebPhoneSDK from 'ringcentral-web-phone';
import type { Account, Call, PhoneNumber } from '@/types';
import { api } from './api';
import { generateId, getAudioPrefs, getAccountInboundEnabled } from './utils';

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

interface SipSession {
  id?: string;
  remoteNumber?: string;
  remoteName?: string;
  to?: string;
  from?: string;
  request?: { from?: { uri?: { toString?: () => string } }; to?: { uri?: { toString?: () => string } } };
  accept?: (opts?: unknown) => Promise<void> | void;
  answer?: (opts?: unknown) => Promise<void> | void;
  reject?: (opts?: unknown) => Promise<void> | void;
  decline?: () => Promise<void> | void;
  hangup?: () => Promise<void> | void;
  terminate?: (opts?: unknown) => Promise<void> | void;
  bye?: () => Promise<void> | void;
  hold?: () => Promise<void> | void;
  unhold?: () => Promise<void> | void;
  mute?: () => Promise<void> | void;
  unmute?: () => Promise<void> | void;
  sendDtmf?: (digit: string) => Promise<void> | void;
  dtmf?: (digit: string) => Promise<void> | void;
  transfer: (target: string) => Promise<void> | void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  off?: (event: string, listener: (...args: unknown[]) => void) => void;
  // WebRTC handles — different SDK versions expose them in different places.
  peerConnection?: RTCPeerConnection;
  sessionDescriptionHandler?: { peerConnection?: RTCPeerConnection };
}

/**
 * Returns every local audio track on the session's RTCPeerConnection.
 * Used to implement mute/unmute reliably across SDK versions by toggling
 * `track.enabled` directly — that's the WebRTC-standard way to silence
 * the outbound media stream, and it works regardless of whether the SDK
 * also exposes `session.mute()`.
 */
function localAudioTracks(session: SipSession): MediaStreamTrack[] {
  const pc =
    session.peerConnection ??
    session.sessionDescriptionHandler?.peerConnection ??
    (session as unknown as { _peerConnection?: RTCPeerConnection })._peerConnection;
  if (!pc || typeof pc.getSenders !== 'function') return [];
  const tracks: MediaStreamTrack[] = [];
  for (const sender of pc.getSenders()) {
    if (sender.track && sender.track.kind === 'audio') tracks.push(sender.track);
  }
  return tracks;
}

/**
 * Remote audio tracks — the bytes RingCentral streams to us. Disabling these
 * is how we silence music-on-hold coming back from a held call so it doesn't
 * bleed into the user's speakers while they talk on a different active call.
 */
function remoteAudioTracks(session: SipSession): MediaStreamTrack[] {
  const pc =
    session.peerConnection ??
    session.sessionDescriptionHandler?.peerConnection ??
    (session as unknown as { _peerConnection?: RTCPeerConnection })._peerConnection;
  if (!pc || typeof pc.getReceivers !== 'function') return [];
  const tracks: MediaStreamTrack[] = [];
  for (const receiver of pc.getReceivers()) {
    if (receiver.track && receiver.track.kind === 'audio') tracks.push(receiver.track);
  }
  return tracks;
}

interface UserAgent {
  on: (event: string, listener: (session: SipSession) => void) => void;
  off?: (event: string, listener: (session: SipSession) => void) => void;
  invite?: (target: string, options?: unknown) => Promise<SipSession> | SipSession;
  call?: (target: string, options?: unknown) => Promise<SipSession> | SipSession;
  register?: () => Promise<void>;
  start?: () => Promise<void>;
}

interface SipSdk {
  userAgent?: UserAgent;
  start?: () => Promise<void>;
  register?: () => Promise<void>;
  on?: (event: string, listener: (session: SipSession) => void) => void;
  call?: (target: string, opts?: unknown) => Promise<SipSession> | SipSession;
  invite?: (target: string, opts?: unknown) => Promise<SipSession> | SipSession;
  dispose?: () => Promise<void> | void;
  destroy?: () => void;
}

function parseUri(uri: string | undefined): string | undefined {
  if (!uri) return undefined;
  const m = uri.match(/(?:^|<)(?:sip:)?(\+?\d+)@/);
  return m ? m[1] : undefined;
}

function readUri(holder: unknown): string | undefined {
  if (!holder) return undefined;
  const obj = holder as { toString?: () => string; uri?: { toString?: () => string } };
  if (typeof obj.toString === 'function') {
    const s = obj.toString();
    if (typeof s === 'string' && s.length && s !== '[object Object]') return s;
  }
  if (obj.uri && typeof obj.uri.toString === 'function') return obj.uri.toString();
  return undefined;
}

function extractRemoteNumber(session: SipSession): string {
  if (session.remoteNumber) return session.remoteNumber;
  const fromStr = readUri(session.from) ?? readUri(session.request?.from);
  return parseUri(fromStr) ?? '';
}

function extractLocalNumber(session: SipSession): string {
  const toStr = readUri(session.to) ?? readUri(session.request?.to);
  return parseUri(toStr) ?? '';
}

/**
 * Resolve the entry point that places outbound calls. Different versions of
 * `ringcentral-web-phone` expose this in different places — v2.x puts it on
 * `sdk.userAgent.invite()`, while older v1.x puts it directly on the SDK.
 */
function resolveInvite(sdk: SipSdk): ((target: string, opts?: unknown) => Promise<SipSession> | SipSession) | null {
  if (sdk.userAgent?.invite) return sdk.userAgent.invite.bind(sdk.userAgent);
  if (sdk.userAgent?.call) return sdk.userAgent.call.bind(sdk.userAgent);
  if (sdk.invite) return sdk.invite.bind(sdk);
  if (sdk.call) return sdk.call.bind(sdk);
  return null;
}

/**
 * Subscribe a single listener to whichever of the SDK's two event APIs is
 * present (`sdk.on` in v1, `sdk.userAgent.on` in v2). Returns the events that
 * were actually wired up so the caller can decide what to teardown.
 */
function bindIncoming(sdk: SipSdk, listener: (session: SipSession) => void) {
  const events = ['invite', 'inviteReceived', 'inboundCall'];
  if (sdk.userAgent?.on) {
    for (const ev of events) sdk.userAgent.on(ev, listener);
  }
  if (sdk.on) {
    for (const ev of events) sdk.on(ev, listener);
  }
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

  const sdk = new (WebPhoneSDK as unknown as new (opts: unknown) => SipSdk)({
    sipInfo: Array.isArray((sipProvision as { sipInfo?: unknown[] }).sipInfo)
      ? (sipProvision as { sipInfo: unknown[] }).sipInfo[0]
      : (sipProvision as { sipInfo?: unknown }).sipInfo,
    appKey: undefined,
    appName: 'Easy Call',
    appVersion: '1.0.0',
    constraints: { audio: micConstraint },
    audioConstraints: micConstraint,
  });

  if (audioPrefs.speakerDeviceId && typeof AudioContext !== 'undefined') {
    const applySpeaker = () => {
      document.querySelectorAll('audio').forEach((el) => {
        const elem = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
        if (typeof elem.setSinkId === 'function' && audioPrefs.speakerDeviceId) {
          elem.setSinkId(audioPrefs.speakerDeviceId).catch(() => undefined);
        }
      });
    };
    applySpeaker();
    setTimeout(applySpeaker, 2000);
  }

  // Start / register the SIP stack.
  const ready = (async () => {
    try {
      const ua = sdk.userAgent;
      if (ua?.start) await ua.start();
      else if (ua?.register) await ua.register();
      else if (sdk.start) await sdk.start();
      else if (sdk.register) await sdk.register();
    } catch (e) {
      events.onError(account.id, e instanceof Error ? e.message : 'WebPhone start failed');
      throw e;
    }
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
    session.on('accepted', onAccepted);
    session.on('answered', onAccepted);
    session.on('established', onAccepted);
    session.on('terminated', onTerminated);
    session.on('bye', onTerminated);
    session.on('disposed', onTerminated);
    session.on('failed', onTerminated);
    session.on('rejected', onTerminated);
  }

  // Inbound is OPT-IN per account. When disabled, the SIP stack still
  // registers (so the SDK can place outbound calls), but we silently ignore
  // any incoming INVITEs by immediately rejecting them — letting RingCentral's
  // normal call routing fall through to the user's other registered devices.
  // This mirrors the previous behavior where calls only rang in the official
  // RingCentral app.
  const inboundEnabled = getAccountInboundEnabled(account.id);

  const onIncoming = (session: SipSession) => {
    if (!inboundEnabled) {
      // Reject quickly with 480 Temporarily Unavailable equivalent so the
      // shared extension can fork to other devices without delay.
      const reject = session.reject ?? session.decline ?? session.hangup ?? session.terminate;
      try {
        if (reject) Promise.resolve(reject.call(session)).catch(() => undefined);
      } catch {
        /* ignore */
      }
      return;
    }
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

  bindIncoming(sdk, onIncoming);

  return {
    accountId: account.id,
    ready,

    async startOutbound(from, toNumber) {
      await ready;
      const invite = resolveInvite(sdk);
      if (!invite) {
        const msg =
          'Outbound calling unavailable: WebPhone SDK did not expose an invite() method.';
        events.onError(account.id, msg);
        throw new Error(msg);
      }
      let session: SipSession;
      try {
        session = await Promise.resolve(invite(toNumber, { fromNumber: from.number }));
      } catch (e) {
        events.onError(account.id, e instanceof Error ? e.message : 'Outbound invite failed');
        throw e;
      }
      if (!session) {
        const msg = 'Outbound invite returned no session.';
        events.onError(account.id, msg);
        throw new Error(msg);
      }
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
      if (!s) return;
      const fn = s.accept ?? s.answer;
      if (!fn) return;
      try {
        await Promise.resolve(fn.call(s));
      } catch (e) {
        events.onError(account.id, e instanceof Error ? e.message : 'Answer failed');
        // If accept fails, hang up so the call doesn't stay in a stuck state.
        const reject = s.reject ?? s.decline ?? s.hangup ?? s.terminate;
        if (reject) await Promise.resolve(reject.call(s)).catch(() => undefined);
      }
    },

    async decline(callId) {
      const s = sessionsByCallId.get(callId);
      if (!s) return;
      const fn = s.reject ?? s.decline ?? s.hangup ?? s.terminate;
      if (fn) await Promise.resolve(fn.call(s));
    },

    async hangup(callId) {
      const s = sessionsByCallId.get(callId);
      if (!s) return;
      const fn = s.hangup ?? s.terminate ?? s.bye;
      if (fn) await Promise.resolve(fn.call(s));
    },

    async hold(callId, on) {
      const s = sessionsByCallId.get(callId);
      if (!s) return;
      // Silence the held party's incoming audio (music-on-hold) on our side
      // so it doesn't bleed into whatever active call the user is now on.
      // We do this regardless of whether session.hold() succeeds; on resume
      // we re-enable so the user hears the other party again.
      for (const t of remoteAudioTracks(s)) t.enabled = !on;
      // Also stop sending our audio while the call is held — most SIP
      // stacks already handle this via re-INVITE, but toggling the local
      // track is a defensive belt-and-suspenders.
      for (const t of localAudioTracks(s)) t.enabled = !on;
      try {
        if (on) {
          if (typeof s.hold === 'function') await Promise.resolve(s.hold());
        } else {
          const fn = s.unhold ?? s.hold;
          if (typeof fn === 'function') await Promise.resolve(fn.call(s));
        }
      } catch (e) {
        events.onError(account.id, e instanceof Error ? e.message : 'Hold toggle failed');
      }
    },

    async mute(callId, on) {
      const s = sessionsByCallId.get(callId);
      if (!s) return;
      // Primary path: directly toggle the local audio track's enabled flag.
      // This is the standard WebRTC way to mute and works regardless of
      // whether the SDK exposes a working session.mute()/unmute().
      const tracks = localAudioTracks(s);
      let muted = false;
      for (const t of tracks) {
        t.enabled = !on;
        muted = true;
      }
      // Best-effort: also call the SDK's mute hook if it exists, in case it
      // updates UI / signaling state. Failures are ignored — track-level
      // muting above is the source of truth.
      try {
        if (on) {
          if (typeof s.mute === 'function') await Promise.resolve(s.mute());
        } else {
          const fn = s.unmute ?? s.mute;
          if (typeof fn === 'function') await Promise.resolve(fn.call(s));
        }
      } catch {
        /* ignore — track.enabled toggle already took effect */
      }
      if (!muted) {
        events.onError(account.id, 'Mute failed: no local audio track found.');
      }
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
