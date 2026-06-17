/**
 * OpenAgent-Desktop - Auth Store
 *
 * The single source of truth for provider credentials and per-session bindings.
 * Persisted as auth.json in the userData directory. Sensitive fields (API keys,
 * OAuth tokens) are encrypted at rest via Electron safeStorage (DPAPI on
 * Windows, Keychain on macOS, libsecret on Linux). Falls back to plaintext
 * only when safeStorage is unavailable — and warns the user in that case.
 *
 * Modeled on opencode's auth.json format (~/.config/opencode/auth.json) but
 * extended with safeStorage encryption and per-session bindings.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { app, safeStorage } from 'electron';
import {
  AuthJsonShape,
  AuthEntry,
  ConfiguredProvider,
  DiscoveredModel,
  SessionProviderBinding,
  ProviderInfo,
} from './v3-types';

const AUTH_FILE = 'auth.json';
const SCHEMA_VERSION = 3;

// Fields that must be encrypted at rest. Other fields (providerId, label,
// enabled, etc.) stay in plaintext so the file is partially human-readable.
const SENSITIVE_FIELDS = [
  // ApiKeyAuth
  'apiKey',
  // OAuthAuth
  'accessToken', 'refreshToken',
  // AzureAdAuth
  'clientSecret',
] as const;

function isEncryptionAvailable(): boolean {
  try {
    return typeof safeStorage !== 'undefined' && safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function encryptValue(plaintext: string): string {
  if (!isEncryptionAvailable()) {
    // Refuse to encrypt rather than fall back to a known-weak key. The caller
    // can detect this via isEncryptionAvailable() and warn the user.
    return plaintext;
  }
  try {
    const buf = safeStorage.encryptString(plaintext);
    return 'enc:' + buf.toString('base64');
  } catch {
    return plaintext;
  }
}

function decryptValue(value: string): string {
  if (!value.startsWith('enc:')) {
    // Legacy plaintext value (from older installs or when safeStorage was
    // unavailable at write time). Pass through; the caller will re-encrypt
    // on next save.
    return value;
  }
  if (!isEncryptionAvailable()) {
    throw new Error('safeStorage unavailable; cannot decrypt stored credential');
  }
  try {
    const buf = Buffer.from(value.slice(4), 'base64');
    return safeStorage.decryptString(buf);
  } catch (err) {
    throw new Error(`Failed to decrypt credential: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function isSensitiveField(field: string): boolean {
  return (SENSITIVE_FIELDS as ReadonlyArray<string>).includes(field);
}

function encryptAuthEntry(auth: AuthEntry): AuthEntry {
  const out = { ...auth } as Record<string, unknown>;
  for (const field of Object.keys(out)) {
    if (isSensitiveField(field) && typeof out[field] === 'string') {
      out[field] = encryptValue(out[field] as string);
    }
  }
  return out as unknown as AuthEntry;
}

function decryptAuthEntry(auth: AuthEntry): AuthEntry {
  const out = { ...auth } as Record<string, unknown>;
  for (const field of Object.keys(out)) {
    if (isSensitiveField(field) && typeof out[field] === 'string') {
      try {
        out[field] = decryptValue(out[field] as string);
      } catch (err) {
        // Decryption failed (e.g. migrated from another machine). Clear the
        // field so the user is forced to re-enter it via the UI.
        out[field] = '';
        // eslint-disable-next-line no-console
        console.warn(`[AuthStore] Failed to decrypt ${field}, clearing:`, err);
      }
    }
  }
  return out as unknown as AuthEntry;
}

export class AuthStore extends EventEmitter {
  private providers: Map<string, ConfiguredProvider> = new Map();
  private discoveredModels: Map<string, { models: DiscoveredModel[]; fetchedAt: string }> = new Map();
  private sessionBindings: Map<string, SessionProviderBinding> = new Map();
  private authPath: string;
  private dirty = false;

  constructor() {
    super();
    this.authPath = path.join(app.getPath('userData'), AUTH_FILE);
  }

  /** Load auth.json from disk. Old custom-providers.json is intentionally
   * ignored (fresh start per user decision). Safe to call multiple times. */
  load(): void {
    if (!fs.existsSync(this.authPath)) {
      this.emit('loaded', { providerCount: 0, fresh: true });
      return;
    }
    try {
      const raw = fs.readFileSync(this.authPath, 'utf-8');
      const parsed = JSON.parse(raw) as AuthJsonShape;
      if (parsed._schemaVersion !== SCHEMA_VERSION) {
        // Migrate-or-archive: rename old file and start fresh.
        const backup = this.authPath + `.v${parsed._schemaVersion}.bak`;
        try { fs.renameSync(this.authPath, backup); } catch { /* ignore */ }
        this.emit('migrated', { from: parsed._schemaVersion, to: SCHEMA_VERSION });
        this.emit('loaded', { providerCount: 0, fresh: true });
        return;
      }
      for (const [id, prov] of Object.entries(parsed.providers || {})) {
        this.providers.set(id, { ...prov, auth: decryptAuthEntry(prov.auth) });
      }
      for (const [id, cached] of Object.entries(parsed.discoveredModels || {})) {
        this.discoveredModels.set(id, cached);
      }
      for (const [id, binding] of Object.entries(parsed.sessionBindings || {})) {
        this.sessionBindings.set(id, binding);
      }
      this.emit('loaded', { providerCount: this.providers.size, fresh: false });
    } catch (err) {
      this.emit('error', err);
      // Archive the corrupted file and start fresh.
      try {
        const backup = this.authPath + '.corrupt.bak';
        fs.renameSync(this.authPath, backup);
      } catch { /* ignore */ }
    }
  }

  /** Atomically persist the in-memory state to disk. */
  save(): void {
    if (!this.dirty) return;
    try {
      const payload: AuthJsonShape = {
        _schemaVersion: SCHEMA_VERSION,
        providers: Object.fromEntries(
          Array.from(this.providers.entries()).map(([id, prov]) => [
            id,
            { ...prov, auth: encryptAuthEntry(prov.auth) },
          ]),
        ),
        discoveredModels: Object.fromEntries(this.discoveredModels.entries()),
        sessionBindings: Object.fromEntries(this.sessionBindings.entries()),
      };
      const json = JSON.stringify(payload, null, 2);
      const tmp = this.authPath + '.tmp';
      fs.writeFileSync(tmp, json, 'utf-8');
      fs.renameSync(tmp, this.authPath);
      this.dirty = false;
      this.emit('saved', { providerCount: this.providers.size });
    } catch (err) {
      this.emit('error', err);
    }
  }

  // ─── Provider CRUD ────────────────────────────────────────────────────────

  listProviders(): ConfiguredProvider[] {
    return Array.from(this.providers.values());
  }

  getProvider(id: string): ConfiguredProvider | undefined {
    return this.providers.get(id);
  }

  /** Returns true if a provider is configured AND has non-empty auth. */
  isConfigured(id: string): boolean {
    const prov = this.providers.get(id);
    if (!prov || !prov.enabled) return false;
    return hasNonEmptyAuth(prov.auth);
  }

  upsertProvider(provider: ConfiguredProvider): void {
    this.providers.set(provider.providerId, {
      ...provider,
      updatedAt: new Date().toISOString(),
    });
    this.dirty = true;
    this.emit('provider-changed', provider.providerId);
    this.save();
  }

  removeProvider(id: string): void {
    if (this.providers.delete(id)) {
      this.dirty = true;
      this.emit('provider-removed', id);
      this.save();
    }
  }

  setProviderEnabled(id: string, enabled: boolean): void {
    const prov = this.providers.get(id);
    if (!prov) return;
    prov.enabled = enabled;
    prov.updatedAt = new Date().toISOString();
    this.dirty = true;
    this.emit('provider-changed', id);
    this.save();
  }

  // ─── Discovered models cache ──────────────────────────────────────────────

  getCachedModels(providerId: string): DiscoveredModel[] | undefined {
    return this.discoveredModels.get(providerId)?.models;
  }

  getCachedModelsFetchedAt(providerId: string): string | undefined {
    return this.discoveredModels.get(providerId)?.fetchedAt;
  }

  setCachedModels(providerId: string, models: DiscoveredModel[]): void {
    this.discoveredModels.set(providerId, {
      models,
      fetchedAt: new Date().toISOString(),
    });
    this.dirty = true;
    this.save();
  }

  clearCachedModels(providerId: string): void {
    if (this.discoveredModels.delete(providerId)) {
      this.dirty = true;
      this.save();
    }
  }

  // ─── Session binding ──────────────────────────────────────────────────────

  getSessionBinding(sessionId: string): SessionProviderBinding | undefined {
    return this.sessionBindings.get(sessionId);
  }

  setSessionBinding(binding: SessionProviderBinding): void {
    this.sessionBindings.set(binding.sessionId, binding);
    this.dirty = true;
    this.emit('session-binding-changed', binding.sessionId);
    this.save();
  }

  clearSessionBinding(sessionId: string): void {
    if (this.sessionBindings.delete(sessionId)) {
      this.dirty = true;
      this.emit('session-binding-changed', sessionId);
      this.save();
    }
  }

  // ─── Convenience: legacy ProviderInfo shape for chat UI ───────────────────

  toProviderInfoList(definitions: Map<string, { name: string; protocol: string }>): ProviderInfo[] {
    return this.listProviders().map((p) => {
      const def = definitions.get(p.providerId);
      const models = (p.customModels || []).map((m) => m.id);
      return {
        id: p.providerId,
        name: p.label || def?.name || p.providerId,
        type: def?.protocol || 'custom',
        models,
        isDefault: false, // no global default in v3 — per-session binding
        configured: this.isConfigured(p.providerId),
        enabled: p.enabled,
        authMethod: p.auth.method,
        status: 'unknown',
      };
    });
  }
}

function hasNonEmptyAuth(auth: AuthEntry): boolean {
  switch (auth.method) {
    case 'api_key':
      return Boolean(auth.apiKey && auth.apiKey.trim());
    case 'oauth':
      return Boolean(auth.accessToken && auth.accessToken.trim());
    case 'azure_ad':
      return Boolean(auth.tenantId && auth.clientId);
    case 'env_var':
      return Boolean(auth.envVarName && process.env[auth.envVarName]);
  }
}
