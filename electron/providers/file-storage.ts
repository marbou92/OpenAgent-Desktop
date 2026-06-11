/**
 * OpenAgent-Desktop - File Storage Adapter
 *
 * A persistent StorageAdapter implementation that writes provider configurations
 * to a JSON file on disk. Replaces the in-memory MemoryStorageAdapter so that
 * provider configs survive app restarts — critical fix for Windows 7 where
 * providers weren't being saved.
 *
 * Features:
 * - Atomic write pattern (write .tmp → rename) to prevent data corruption
 * - Retry logic for Windows 7 file locks (3 attempts, 100ms exponential backoff)
 * - Optional AES-256-GCM encryption for sensitive fields (apiKeys, etc.)
 * - Encryption key derived from machine-specific identifier (hostname + username, salted)
 * - Loads existing data on construction; if file missing/corrupt, starts empty
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';

// ─── StorageAdapter Interface ──────────────────────────────────────────────────

export interface StorageAdapter {
  get<T>(key: string, defaultValue?: T): T | undefined;
  set(key: string, value: any): void;
  delete(key: string): void;
  clear(): void;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 100;
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT = 'openagent-desktop-provider-storage-v1';

// Keys that contain sensitive data and should be encrypted when encryptKeys is enabled
const SENSITIVE_KEY_PATTERNS = [
  /apikey/i,
  /api_key/i,
  /secret/i,
  /token/i,
  /password/i,
  /credential/i,
];

// ─── Helper: Derive Encryption Key ─────────────────────────────────────────────

function deriveEncryptionKey(): Buffer {
  const hostname = os.hostname() || 'unknown-host';
  const username = os.userInfo().username || 'unknown-user';
  const machineId = `${hostname}:${username}`;
  return crypto.scryptSync(machineId, SALT, KEY_LENGTH);
}

// ─── Helper: Check if a key is sensitive ───────────────────────────────────────

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

// ─── Helper: Encrypt a value ───────────────────────────────────────────────────

function encrypt(data: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:encryptedData
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

// ─── Helper: Decrypt a value ───────────────────────────────────────────────────

function decrypt(encryptedData: string, key: Buffer): string | null {
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) return null;

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    // Decryption failed — data may be from a different machine or corrupted
    return null;
  }
}

// ─── Helper: Deep-clone and encrypt sensitive fields ───────────────────────────

function encryptSensitiveValues(
  data: Record<string, any>,
  encKey: Buffer
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (isSensitiveKey(key) && typeof value !== 'undefined' && value !== null) {
      const serialized = JSON.stringify(value);
      result[key] = { __encrypted: true, __data: encrypt(serialized, encKey) };
    } else if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      !(value as any).__encrypted
    ) {
      // Recurse into nested objects that aren't already encrypted wrappers
      result[key] = encryptSensitiveValues(value, encKey);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ─── Helper: Deep-clone and decrypt sensitive fields ───────────────────────────

function decryptSensitiveValues(
  data: Record<string, any>,
  encKey: Buffer
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (
      typeof value === 'object' &&
      value !== null &&
      (value as any).__encrypted &&
      typeof (value as any).__data === 'string'
    ) {
      const decrypted = decrypt((value as any).__data, encKey);
      if (decrypted !== null) {
        try {
          result[key] = JSON.parse(decrypted);
        } catch {
          result[key] = decrypted;
        }
      } else {
        // Decryption failed — keep the encrypted wrapper so we don't lose data
        result[key] = value;
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = decryptSensitiveValues(value, encKey);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ─── Helper: Retry with exponential backoff (synchronous) ──────────────────────

function retrySync<T>(fn: () => T, description: string): T {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return fn();
    } catch (err: any) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[FileStorage] ${description} failed (attempt ${attempt + 1}/${MAX_RETRIES}), ` +
            `retrying in ${delay}ms... Error: ${err.message}`
        );
        // Synchronous sleep via busy-wait (acceptable for short delays)
        const end = Date.now() + delay;
        while (Date.now() < end) {
          // busy wait
        }
      }
    }
  }
  throw lastError;
}

// ─── FileStorageAdapter ────────────────────────────────────────────────────────

export class FileStorageAdapter implements StorageAdapter {
  private filePath: string;
  private store: Map<string, any> = new Map();
  private encryptKeys: boolean;
  private encryptionKey: Buffer | null = null;
  private dirty: boolean = false;

  constructor(filePath: string, options?: { encryptKeys?: boolean }) {
    this.filePath = filePath;
    this.encryptKeys = options?.encryptKeys ?? false;

    if (this.encryptKeys) {
      this.encryptionKey = deriveEncryptionKey();
    }

    // Ensure parent directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (err: any) {
        console.error(
          `[FileStorage] Failed to create directory ${dir}: ${err.message}`
        );
      }
    }

    // Load existing data
    this.load();
  }

  // ─── Load from disk ──────────────────────────────────────────────────────

  private load(): void {
    try {
      if (!fs.existsSync(this.filePath)) {
        // No file yet — start with empty store
        this.store = new Map();
        return;
      }

      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);

      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        console.warn(
          '[FileStorage] Stored data is not a valid object, starting fresh'
        );
        this.store = new Map();
        return;
      }

      // Decrypt sensitive values if encryption is enabled
      let data = parsed as Record<string, any>;
      if (this.encryptKeys && this.encryptionKey) {
        data = decryptSensitiveValues(data, this.encryptionKey);
      }

      // Populate the store
      this.store = new Map(Object.entries(data));
    } catch (err: any) {
      console.warn(
        `[FileStorage] Failed to load from ${this.filePath}: ${err.message}. Starting fresh.`
      );
      this.store = new Map();
    }
  }

  // ─── Persist to disk (atomic write with retry) ──────────────────────────

  private persist(): void {
    let data: Record<string, any> = {};

    // Convert Map to plain object
    for (const [key, value] of this.store.entries()) {
      data[key] = value;
    }

    // Encrypt sensitive values if encryption is enabled
    if (this.encryptKeys && this.encryptionKey) {
      data = encryptSensitiveValues(data, this.encryptionKey);
    }

    const jsonStr = JSON.stringify(data, null, 2);
    const tmpPath = this.filePath + '.tmp';

    try {
      retrySync(
        () => {
          // Write to temporary file first
          fs.writeFileSync(tmpPath, jsonStr, 'utf-8');
          // Atomic rename
          fs.renameSync(tmpPath, this.filePath);
        },
        'persist'
      );
      this.dirty = false;
    } catch (err: any) {
      console.error(
        `[FileStorage] Failed to persist to ${this.filePath}: ${err.message}`
      );
      // Clean up temp file if it exists
      try {
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath);
        }
      } catch {
        // Ignore cleanup errors
      }
      throw err;
    }
  }

  // ─── StorageAdapter interface ────────────────────────────────────────────

  get<T>(key: string, defaultValue?: T): T | undefined {
    if (this.store.has(key)) {
      return this.store.get(key) as T;
    }
    return defaultValue;
  }

  set(key: string, value: any): void {
    this.store.set(key, value);
    this.dirty = true;
    this.persist();
  }

  delete(key: string): void {
    const existed = this.store.delete(key);
    if (existed) {
      this.dirty = true;
      this.persist();
    }
  }

  clear(): void {
    this.store.clear();
    this.dirty = true;
    this.persist();
  }

  // ─── Explicit sync (flush to disk) ──────────────────────────────────────

  flush(): void {
    if (this.dirty) {
      this.persist();
    }
  }
}
