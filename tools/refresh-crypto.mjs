import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';

const ITERATIONS = 300000;

const pageValue = (page, name) => {
  const match = page.match(new RegExp(`const ${name}\\s*= Uint8Array\\.from\\(atob\\('([^']+)'`));
  if (!match) throw new Error(`Encrypted page is missing ${name}`);
  return Buffer.from(match[1], 'base64');
};

export function decryptPage(page, passphrase) {
  const salt = pageValue(page, 'SALT');
  const iv = pageValue(page, 'IV');
  const data = pageValue(page, 'DATA');
  const tag = data.subarray(data.length - 16);
  const ciphertext = data.subarray(0, data.length - 16);
  const decipher = createDecipheriv(
    'aes-256-gcm',
    pbkdf2Sync(passphrase, salt, ITERATIONS, 32, 'sha256'),
    iv,
  );
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function encryptPayload(value, passphrase) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(passphrase, salt, ITERATIONS, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = typeof value === 'string' ? value : JSON.stringify(value);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return {
    v: 1,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ct: ciphertext.toString('base64'),
  };
}

export function decryptPayload(payload, passphrase) {
  const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const data = Buffer.from(parsed.ct, 'base64');
  const tag = data.subarray(data.length - 16);
  const ciphertext = data.subarray(0, data.length - 16);
  const decipher = createDecipheriv(
    'aes-256-gcm',
    pbkdf2Sync(passphrase, Buffer.from(parsed.salt, 'base64'), ITERATIONS, 32, 'sha256'),
    Buffer.from(parsed.iv, 'base64'),
  );
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
}

export function replaceBetween(source, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Could not find data markers: ${startMarker}`);
  return source.slice(0, start) + replacement + source.slice(end + endMarker.length);
}
