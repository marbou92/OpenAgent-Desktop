/**
 * OpenAgent-Desktop - Auth Store v2 (opencode-compatible)
 *
 * Persists credentials in opencode's exact auth.json format:
 *   { "anthropic": { "type": "api", "key": "sk-ant-..." },
 *     "openai": { "type": "oauth", "refresh": "...", "access": "...", "expires": 123 },
 *     "github-copilot": { "type": "wellknown", "key": "github", "token": "gho_..." } }
 *
 * Sensitive fields (key, access, refresh, token) are encrypted at rest via
 * Electron safeStorage (DPAPI / Keychain / libsecret). The on-disk format
 * is still compatible with opencode-cli — opencode-cli reads the plaintext
 * fields; we encrypt with an 'enc:' prefix that opencode-cli will see as a
 * (wrong) key, but our own loader decrypts transparently.
 *
 * Old v3 auth.json (ConfiguredProvider shape) is archived to auth.json.v3.bak.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { app, safeStorage } from 'electron';
import { AuthProvider, AuthJson } from './opencode-types';

const AUTH_FILE = 'auth.json';
const SENSITIVE_FIELDS = ['key', 'access', 'refresh', 'token'] as const;

function isEncryptionAvailable(): boolean {
  try {
    return typeof safeStorage !== 'undefined' && safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function encryptValue(plaintext: string): string {
  if (!isEncryptionAvailable()) return plaintext;
  try {
    return 'enc:' + safeStorage.encryptString(plaintext).toString('base64');
  } catch {
    return plaintext;
  }
}

function decryptValue(value: string): string {
  if (!value.startsWith('enc:')) return value; // plaintext (legacy or safeStorage unavailable)
  if (!isEncryptionAvailable()) {
    throw new Error('safeStorage unavailable; cannot decrypt credential');
  }
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'));
  } catch (err) {
    throw new Error(`Failed to decrypt credential: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function encryptAuth(auth: AuthProvider): AuthProvider {
  const out = { ...auth } as Record<string, unknown>;
  for (const field of SENSITIVE_FIELDS) {
    if (typeof out[field] === 'string') {
      out[field] = encryptValue(out[field] as string);
    }
  }
  return out as unknown as AuthProvider;
}

function decryptAuth(auth: AuthProvider): AuthProvider {
  const out = { ...auth } as Record<string, unknown>;
  for (const field of SENSITIVE_FIELDS) {
    if (typeof out[field] === 'string') {
      try {
        out[field] = decryptValue(out[field] as string);
      } catch {
        out[field] = '';
      }
    }
  }
  return out as unknown as AuthProvider;
}

export class AuthStore extends EventEmitter {
  private entries: Map<string, AuthProvider> = new Map();
  private authPath: string;
  private dirty = false;

  constructor() {
    super();
    this.authPath = path.join(app.getPath('userData'), AUTH_FILE);
  }

  load(): void {
    if (!fs.existsSync(this.authPath)) {
      this.emit('loaded', { count: 0, fresh: true });
      return;
    }
    try {
      const raw = fs.readFileSync(this.authPath, 'utf-8');
      const parsed = JSON.parse(raw) as AuthJson;
      // Detect old v3 format (has _schemaVersion) and archive.
      if ((parsed as any)._schemaVersion) {
        const backup = this.authPath + '.v3.bak';
        try { fs.renameSync(this.authPath, backup); } catch { /* ignore */ }
        this.emit('migrated', { from: 'v3', to: 'opencode' });
        this.emit('loaded', { count: 0, fresh: true });
        return;
      }
      for (const [id, auth] of Object.entries(parsed)) {
        if (auth && typeof auth === 'object' && auth.type) {
          this.entries.set(id, decryptAuth(auth));
        }
      }
      this.emit('loaded', { count: this.entries.size, fresh: false });
    } catch (err) {
      this.emit('error', err);
      try {
        const backup = this.authPath + '.corrupt.bak';
        fs.renameSync(this.authPath, backup);
      } catch { /* ignore */ }
    }
  }

  save(): void {
    if (!this.dirty) return;
    try {
      const payload: AuthJson = {};
      for (const [id, auth] of this.entries.entries()) {
        payload[id] = encryptAuth(auth);
      }
      const json = JSON.stringify(payload, null, 2);
      const tmp = this.authPath + '.tmp';
      fs.writeFileSync(tmp, json, 'utf-8');
      fs.renameSync(tmp, this.authPath);
      this.dirty = false;
      this.emit('saved', { count: this.entries.size });
    } catch (err) {
      this.emit('error', err);
    }
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────

  list(): Array<{ providerId: string; auth: AuthProvider }> {
    return Array.from(this.entries.entries()).map(([providerId, auth]) => ({ providerId, auth }));
  }

  get(providerId: string): AuthProvider | undefined {
    return this.entries.get(providerId);
  }

  isConfigured(providerId: string): boolean {
    const auth = this.entries.get(providerId);
    if (!auth) return false;
    switch (auth.type) {
      case 'api': return Boolean(auth.key && auth.key.trim());
      case 'oauth': return Boolean(auth.access && auth.access.trim());
      case 'wellknown': return Boolean(auth.token && auth.token.trim());
    }
  }

  set(providerId: string, auth: AuthProvider): void {
    this.entries.set(providerId, auth);
    this.dirty = true;
    this.emit('provider-changed', providerId);
    this.save();
  }

  remove(providerId: string): void {
    if (this.entries.delete(providerId)) {
      this.dirty = true;
      this.emit('provider-removed', providerId);
      this.save();
    }
  }

  all(): AuthJson {
    const out: AuthJson = {};
    for (const [id, auth] of this.entries.entries()) {
      out[id] = auth;
    }
    return out;
  }
}
