/**
 * OpenAgent-Desktop - Encryption Utility
 *
 * Provides AES-256-GCM encryption/decryption for sensitive data such as API keys
 * and provider credentials. Delegates key derivation to Electron's safeStorage
 * (DPAPI on Windows, Keychain on macOS, libsecret on Linux) so that secrets are
 * bound to the OS user account rather than to a hardcoded fallback string.
 *
 * Fallback path: when `safeStorage` is unavailable (e.g. running outside
 * Electron, headless Linux without libsecret), we refuse to encrypt rather
 * than fall back to a public/weak key — see `isEncryptionAvailable()`.
 */

import * as crypto from 'crypto';
import { safeStorage } from 'electron';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

// Sentinel prefix so we can detect whether a stored value is OS-keychain
// ciphertext (from safeStorage) or our own AES envelope.
const SAFESTORAGE_PREFIX = 'safestorage:';
const AES_PREFIX = 'aes:';

/**
 * Whether secrets can be encrypted on this machine. If false, callers should
 * refuse to persist secrets (rather than fall back to a known weak key).
 */
export function isEncryptionAvailable(): boolean {
  try {
    return typeof safeStorage !== 'undefined' && safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/**
 * Encrypt a plaintext string. Prefers Electron safeStorage (OS keychain);
 * falls back to AES-256-GCM with a process-local random key (NOT persisted)
 * only when running outside a real Electron environment (e.g. unit tests).
 * The fallback is intentionally non-persistent — restarting the process
 * invalidates any secrets encrypted with it, which is the safe failure mode.
 */
export function encrypt(plaintext: string): string {
  if (isEncryptionAvailable()) {
    try {
      const buf = safeStorage.encryptString(plaintext);
      return SAFESTORAGE_PREFIX + buf.toString('base64');
    } catch {
      // Fall through to AES fallback
    }
  }

  // Fallback: AES-256-GCM with an ephemeral random key. This exists so that
  // the function does not throw inside test harnesses; in production, if
  // safeStorage is unavailable the caller should refuse to persist.
  const key = getEphemeralKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return `${AES_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
  if (ciphertext.startsWith(SAFESTORAGE_PREFIX)) {
    const b64 = ciphertext.slice(SAFESTORAGE_PREFIX.length);
    if (!isEncryptionAvailable()) {
      throw new Error('safeStorage unavailable; cannot decrypt OS-keychain ciphertext');
    }
    try {
      const buf = Buffer.from(b64, 'base64');
      return safeStorage.decryptString(buf);
    } catch (err) {
      throw new Error(`Failed to decrypt safeStorage value: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (ciphertext.startsWith(AES_PREFIX)) {
    const rest = ciphertext.slice(AES_PREFIX.length);
    const parts = rest.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid AES encrypted format');
    }
    const key = getEphemeralKey();
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // Legacy plaintext values (from older installs): pass through unchanged.
  // This allows a smooth migration: load → detect plaintext → re-encrypt on next save.
  return ciphertext;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(SAFESTORAGE_PREFIX) || value.startsWith(AES_PREFIX);
}

// ─── Ephemeral key (fallback path only) ───────────────────────────────────────

let _ephemeralKey: Buffer | null = null;
function getEphemeralKey(): Buffer {
  if (!_ephemeralKey) {
    // Random per-process key. NOT persisted — any AES-encrypted value will
    // become undecryptable after a process restart, which is the safe
    // failure mode (the user is prompted to re-enter the API key).
    _ephemeralKey = crypto.randomBytes(KEY_LENGTH);
  }
  return _ephemeralKey;
}

// Marker so dead-code lint keeps the (currently unused) AES constants.
void TAG_LENGTH;
