import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';
import { env } from '../env.js';

/**
 * AES-256-GCM authenticated encryption for OAuth tokens at rest.
 *
 * Output format (base64): version(1) | iv(12) | tag(16) | ciphertext(N)
 * The version byte lets us rotate algorithms later without breaking existing rows.
 */
const ALGO = 'aes-256-gcm';
const VERSION = 0x01;
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');
  if (key.length !== 32) {
    throw new Error(
      'ENCRYPTION_KEY must be 32 bytes (64 hex characters). Generate one with ' +
        '`node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"`.',
    );
  }
  return key;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION]), iv, tag, ciphertext]).toString('base64');
}

export function decrypt(packed: string): string {
  const buf = Buffer.from(packed, 'base64');
  if (buf[0] !== VERSION) throw new Error('Unsupported ciphertext version');
  const iv = buf.subarray(1, 1 + IV_LEN);
  const tag = buf.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(1 + IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
