/**
 * OpenAgent-Desktop - Encryption Utility
 *
 * Provides AES-256-GCM encryption/decryption for sensitive data
 * such as API keys and provider credentials.
 *
 * Uses machine-specific key derivation via HKDF so that encrypted
 * values are only decryptable on the same machine.
 */

import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const _TAG_LENGTH = 16;

// Derive encryption key from machine-specific info
function getEncryptionKey(): Buffer {
  const machineId = process.env.OPENAGENT_MACHINE_ID ||
    process.env.HOSTNAME ||
    process.env.COMPUTERNAME ||
    'openagent-default-key';

  // Derive a consistent key using HKDF
  const salt = 'openagent-encryption-salt-v1';
  return Buffer.from(crypto.hkdfSync(
    'sha256',
    machineId,
    salt,
    'openagent-key-derivation',
    KEY_LENGTH
  ));
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const parts = ciphertext.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export function isEncrypted(value: string): boolean {
  // Check if value matches our encrypted format (iv:tag:ciphertext, all hex)
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  return /^[0-9a-f]{32}$/.test(parts[0]) && /^[0-9a-f]{32}$/.test(parts[1]);
}
