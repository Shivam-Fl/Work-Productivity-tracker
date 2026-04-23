import crypto from 'crypto';
import { config } from './config';

const algorithm = 'aes-256-gcm';

function keyMaterial(): Buffer {
  if (config.tokenEncryptionKey) {
    const raw = Buffer.from(config.tokenEncryptionKey, 'base64');
    if (raw.length === 32) return raw;
  }
  return crypto.createHash('sha256').update('development-only-fallback-key').digest();
}

export function encryptSecret(value: string): string {
  const key = keyMaterial();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptSecret(encoded: string): string {
  const payload = Buffer.from(encoded, 'base64');
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = crypto.createDecipheriv(algorithm, keyMaterial(), iv);
  decipher.setAuthTag(tag);
  const output = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return output.toString('utf8');
}

export function makeIdempotencyKey(userId: string, reportDate: string): string {
  return crypto.createHash('sha256').update(`${userId}:${reportDate}`).digest('hex');
}
