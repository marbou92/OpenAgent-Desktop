/**
 * OpenAgent-Desktop - opencode.json Config Manager
 *
 * Reads/writes userData/opencode.json — the same config file opencode-cli
 * reads. This gives us full ecosystem compatibility: a user can configure
 * providers in OpenAgent-Desktop and use the same config with opencode-cli,
 * or vice versa.
 *
 * Format (from opencode):
 *   {
 *     "$schema": "https://opencode.ai/config.json",
 *     "provider": {
 *       "openai": { "options": { "baseURL": "https://my-proxy.com/v1" } },
 *       "custom:ollama": {
 *         "npm": "@ai-sdk/openai-compatible",
 *         "name": "Ollama (local)",
 *         "api": "http://localhost:11434/v1",
 *         "options": { "apiKey": "ollama" }
 *       }
 *     }
 *   }
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { OpencodeJson, ProviderDefinition } from './opencode-types';
import { getOpencodeRegistry } from './opencode-registry';

const CONFIG_FILE = 'opencode.json';
const SCHEMA_URL = 'https://opencode.ai/config.json';

export class OpencodeConfig extends EventEmitter {
  private config: OpencodeJson = {};
  private configPath: string;

  constructor() {
    super();
    this.configPath = path.join(app.getPath('userData'), CONFIG_FILE);
  }

  load(): void {
    try {
      if (!fs.existsSync(this.configPath)) {
        this.config = {};
        return;
      }
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      this.config = JSON.parse(raw) as OpencodeJson;
      // Register custom providers from config into the registry.
      this.syncCustomProviders();
      this.emit('loaded', { providerCount: Object.keys(this.config.provider || {}).length });
    } catch (err) {
      this.emit('error', err);
      this.config = {};
    }
  }

  save(): void {
    try {
      const payload: OpencodeJson = {
        $schema: SCHEMA_URL,
        ...this.config,
      };
      const json = JSON.stringify(payload, null, 2);
      const tmp = this.configPath + '.tmp';
      fs.writeFileSync(tmp, json, 'utf-8');
      fs.renameSync(tmp, this.configPath);
      this.emit('saved', { providerCount: Object.keys(this.config.provider || {}).length });
    } catch (err) {
      this.emit('error', err);
    }
  }

  /** Get a provider definition from the config (merged with builtin defaults). */
  getProvider(providerId: string): ProviderDefinition | undefined {
    const registry = getOpencodeRegistry();
    const builtin = registry.get(providerId);
    const configured = this.config.provider?.[providerId];
    if (!builtin && !configured) return undefined;
    const merged = { ...builtin, ...configured, id: providerId } as ProviderDefinition;
    if (!merged.name) merged.name = providerId;
    return merged;
  }

  /** List all providers: builtins + custom from config. */
  listProviders(): ProviderDefinition[] {
    const registry = getOpencodeRegistry();
    const all = registry.listAll();
    // Overlay config options on top.
    return all.map((p) => {
      const configured = this.config.provider?.[p.id];
      const merged = configured ? { ...p, ...configured, id: p.id } : p;
      if (!merged.name) merged.name = p.id;
      return merged;
    });
  }

  /** Set/update a provider's options in the config. */
  setProviderOptions(providerId: string, options: Partial<ProviderDefinition>): void {
    if (!this.config.provider) this.config.provider = {};
    const existing = this.config.provider[providerId] || {};
    this.config.provider[providerId] = { ...existing, ...options, id: providerId };
    this.save();
    this.emit('provider-changed', providerId);
  }

  /** Remove a provider from the config (only works for custom providers). */
  removeProvider(providerId: string): void {
    if (!this.config.provider?.[providerId]) return;
    delete this.config.provider[providerId];
    this.save();
    this.emit('provider-removed', providerId);
  }

  /** Add a custom provider to the config + registry. */
  addCustomProvider(def: ProviderDefinition): void {
    if (!this.config.provider) this.config.provider = {};
    this.config.provider[def.id] = { ...def, isBuiltin: false };
    getOpencodeRegistry().registerCustom(def);
    this.save();
    this.emit('provider-added', def.id);
  }

  private syncCustomProviders(): void {
    const registry = getOpencodeRegistry();
    if (!this.config.provider) return;
    for (const [id, def] of Object.entries(this.config.provider)) {
      // If it's not a builtin, register as custom.
      if (!registry.isBuiltin(id) && def.npm || def.api) {
        try {
          registry.registerCustom({ ...def, id, isBuiltin: false });
        } catch {
          // Already registered — fine.
        }
      }
    }
  }

  get raw(): OpencodeJson {
    return this.config;
  }
}
