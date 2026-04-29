import { env } from '../env.js';
import { prisma } from './db.js';
import { decrypt, encrypt } from './crypto.js';

const SCOPES = [
  'ReadAccounts',
  'ReadCallLog',
  'CallControl',
  'VoipCalling',
  'ReadPresence',
  // Added for the voicemail and messaging features. Existing OAuth tokens
  // do not include these — users need to disconnect and re-add each
  // Easy Call account once for the new scopes to take effect.
  'ReadMessages',
  'SMS',
];

const REDIRECT_URI = `${env.APP_BASE_URL}/api/oauth/callback`;

/**
 * Build the authorize URL the user is redirected to in order to grant our app
 * access to a particular RingCentral account.  We pack the internal account id
 * into `state` so the callback knows which row to update.
 */
export function buildAuthorizeUrl(clientId: string, state: string): string {
  const url = new URL(`${env.RINGCENTRAL_SERVER}/restapi/oauth/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', SCOPES.join(' '));
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_token_expires_in: number;
  token_type: string;
  scope: string;
  owner_id: string;
}

async function tokenRequest(
  clientId: string,
  clientSecret: string,
  body: URLSearchParams,
): Promise<TokenResponse> {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`${env.RINGCENTRAL_SERVER}/restapi/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`RingCentral token endpoint returned ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<TokenResponse>;
}

export async function exchangeCodeForTokens(
  accountId: string,
  code: string,
): Promise<void> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) throw new Error(`Account ${accountId} not found`);
  const clientSecret = decrypt(account.clientSecret);
  const tokens = await tokenRequest(
    account.clientId,
    clientSecret,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }),
  );
  await prisma.account.update({
    where: { id: accountId },
    data: {
      accessToken: encrypt(tokens.access_token),
      refreshToken: encrypt(tokens.refresh_token),
      tokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
      status: 'connected',
    },
  });
  await syncPhoneNumbers(accountId);
}

export async function refreshAccessToken(accountId: string): Promise<void> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account?.refreshToken) throw new Error(`Account ${accountId} has no refresh token`);
  const tokens = await tokenRequest(
    account.clientId,
    decrypt(account.clientSecret),
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: decrypt(account.refreshToken),
    }),
  );
  await prisma.account.update({
    where: { id: accountId },
    data: {
      accessToken: encrypt(tokens.access_token),
      refreshToken: encrypt(tokens.refresh_token),
      tokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
      status: 'connected',
    },
  });
}

async function getValidAccessToken(accountId: string): Promise<string> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account?.accessToken) throw new Error('Account is not connected');
  // Refresh if the token expires within 60 seconds.
  if (!account.tokenExpiry || account.tokenExpiry.getTime() - Date.now() < 60_000) {
    await refreshAccessToken(accountId);
    const refreshed = await prisma.account.findUnique({ where: { id: accountId } });
    if (!refreshed?.accessToken) throw new Error('Refresh failed');
    return decrypt(refreshed.accessToken);
  }
  return decrypt(account.accessToken);
}

async function rcGet<T>(accountId: string, path: string): Promise<T> {
  const token = await getValidAccessToken(accountId);
  const res = await fetch(`${env.RINGCENTRAL_SERVER}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`RingCentral GET ${path} ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function rcPost<T>(accountId: string, path: string, body: unknown): Promise<T> {
  const token = await getValidAccessToken(accountId);
  const res = await fetch(`${env.RINGCENTRAL_SERVER}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`RingCentral POST ${path} ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

interface RcPhoneNumber {
  id: number;
  phoneNumber: string;
  type: string;
  usageType: string;
}

export async function syncPhoneNumbers(accountId: string): Promise<void> {
  const data = await rcGet<{ records: RcPhoneNumber[] }>(
    accountId,
    '/restapi/v1.0/account/~/phone-number?perPage=100',
  );
  // Only keep numbers that can place/receive calls.
  const callable = data.records.filter(
    (n) => n.usageType !== 'NumberSource' && (n.type === 'VoiceFax' || n.type === 'Voice'),
  );
  // Replace existing numbers with the latest snapshot, preserving labels by phone string.
  const existing = await prisma.phoneNumber.findMany({ where: { accountId } });
  const labelByNumber = new Map(existing.map((p) => [p.number, p.label]));
  const hiddenByNumber = new Map(existing.map((p) => [p.number, p.hidden]));
  await prisma.$transaction([
    prisma.phoneNumber.deleteMany({ where: { accountId } }),
    prisma.phoneNumber.createMany({
      data: callable.map((n) => ({
        accountId,
        number: n.phoneNumber,
        label: labelByNumber.get(n.phoneNumber) ?? 'Unlabeled',
        hidden: hiddenByNumber.get(n.phoneNumber) ?? false,
      })),
    }),
  ]);
}

// ============================================================================
// Call log + recordings
// ============================================================================

interface RcCallLogRecord {
  id: string;
  startTime: string;
  duration?: number;
  direction: 'Inbound' | 'Outbound';
  from?: { phoneNumber?: string; name?: string };
  to?: { phoneNumber?: string; name?: string };
  result?: string;
  recording?: { id: string; contentUri?: string; type?: string };
}

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

/**
 * Lists recordings across the user's connected RingCentral accounts.
 * Each call to this function hits the RingCentral call-log endpoint per
 * account, filters down to records that include a recording, and returns
 * them sorted newest-first.
 */
export async function listRecordingsForUser(userId: string): Promise<RecordingItem[]> {
  const accounts = await prisma.account.findMany({
    where: { appUserId: userId, status: 'connected' },
    select: { id: true, name: true },
  });
  const all: RecordingItem[] = [];
  await Promise.all(
    accounts.map(async ({ id, name }) => {
      try {
        const data = await rcGet<{ records: RcCallLogRecord[] }>(
          id,
          '/restapi/v1.0/account/~/extension/~/call-log?perPage=100&recordingType=All&showBlocked=true&view=Detailed',
        );
        for (const r of data.records) {
          if (!r.recording?.id) continue;
          all.push({
            callLogId: r.id,
            recordingId: r.recording.id,
            accountId: id,
            accountName: name,
            startedAt: r.startTime,
            durationSec: r.duration ?? 0,
            direction: r.direction === 'Inbound' ? 'inbound' : 'outbound',
            fromNumber: r.from?.phoneNumber ?? 'unknown',
            toNumber: r.to?.phoneNumber ?? 'unknown',
            fromName: r.from?.name,
            toName: r.to?.name,
            result: r.result ?? '',
          });
        }
      } catch (e) {
        console.warn(`[recordings] account ${id} fetch failed:`, e);
      }
    }),
  );
  return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/**
 * Streams a recording's audio bytes from RingCentral. The browser hits our
 * proxy endpoint instead of RingCentral directly, because the recording
 * URL requires the account's bearer token, which is server-only.
 *
 * Forwards a Range header through to RingCentral so the browser can seek
 * to a specific time in the audio. Returns the upstream status code (200
 * for full content, 206 for partial content when a Range is honored).
 */
export async function fetchRecordingStream(
  accountId: string,
  recordingId: string,
  rangeHeader?: string,
): Promise<{
  status: number;
  contentType: string;
  contentLength: string | null;
  contentRange: string | null;
  acceptRanges: string | null;
  body: ReadableStream<Uint8Array> | null;
}> {
  const token = await getValidAccessToken(accountId);
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (rangeHeader) headers.Range = rangeHeader;
  const res = await fetch(
    `${env.RINGCENTRAL_SERVER}/restapi/v1.0/account/~/recording/${encodeURIComponent(recordingId)}/content`,
    { headers },
  );
  return {
    status: res.status,
    contentType: res.headers.get('content-type') ?? 'audio/mpeg',
    contentLength: res.headers.get('content-length'),
    contentRange: res.headers.get('content-range'),
    acceptRanges: res.headers.get('accept-ranges'),
    body: res.body,
  };
}

/**
 * Returns the SIP provisioning payload the WebPhone SDK needs in the browser.
 * The browser hits this server endpoint instead of RingCentral directly so the
 * client_secret never leaves the server.
 */
export async function sipProvision(accountId: string): Promise<unknown> {
  return rcPost(accountId, '/restapi/v1.0/client-info/sip-provision', {
    sipInfo: [{ transport: 'WSS' }],
  });
}
