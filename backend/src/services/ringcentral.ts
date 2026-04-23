import { env } from '../env.js';
import { prisma } from './db.js';
import { decrypt, encrypt } from './crypto.js';

const SCOPES = [
  'ReadAccounts',
  'ReadCallLog',
  'CallControl',
  'VoipCalling',
  'ReadPresence',
];

const REDIRECT_URI = `${env.APP_BASE_URL}/api/oauth/callback`;

/**
 * Build the authorize URL the user is redirected to in order to grant our app
 * access to a particular RingCentral account.  We pack the internal account id
 * into `state` so the callback knows which row to update.
 */
export function buildAuthorizeUrl(accountId: string, clientId: string): string {
  const url = new URL(`${env.RINGCENTRAL_SERVER}/restapi/oauth/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('state', accountId);
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
  await prisma.$transaction([
    prisma.phoneNumber.deleteMany({ where: { accountId } }),
    prisma.phoneNumber.createMany({
      data: callable.map((n) => ({
        accountId,
        number: n.phoneNumber,
        label: labelByNumber.get(n.phoneNumber) ?? 'Unlabeled',
      })),
    }),
  ]);
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
