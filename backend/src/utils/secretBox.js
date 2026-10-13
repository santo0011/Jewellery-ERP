import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

// AES-256-GCM for secrets kept in the database (e.g. the SMTP password): "v1:<iv>:<tag>:<ciphertext>", base64url parts.
const key = () => createHash('sha256').update(env.SETTINGS_ENCRYPTION_KEY ?? `settings:${env.JWT_ACCESS_SECRET}`).digest();

export function seal(plain) {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join(':');
}

/** The secret, or null if it is missing or was sealed with another key. */
export function open(sealed) {
  if (!sealed) return null;
  try {
    const [version, iv, tag, data] = sealed.split(':');
    if (version !== 'v1') return null;
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
