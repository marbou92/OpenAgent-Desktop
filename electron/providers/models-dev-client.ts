/**
 * OpenAgent-Desktop - models.dev Client
 *
 * Fetches the provider/model catalog from https://models.dev/models.json
 * (the same source opencode uses). Caches to userData/models-dev-cache.json
 * with a 24-hour TTL. When the cache is stale or unreachable, falls back to
 * the hardcoded presets in opencode-registry.ts.
 *
 * The models.dev response is a flat object keyed by "<provider>/<model>":
 *   { "xai/grok-4.20-0309-non-reasoning": { id, name, family, ... }, ... }
 *
 * We group entries by provider (the first path segment) so the UI can show
 * a per-provider model list.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { app } from 'electron';
import { ModelsDevEntry, ProviderDefinition, ModelConfig } from './opencode-types';
import { getOpencodeRegistry, OPENCODE_PROVIDERS } from './opencode-registry';

/**
 * Fetch JSON from a URL using Node's built-in https module.
 * Works on all Node versions (including Node 16 / Electron 22 where
 * global fetch is not available and node-fetch v3 is ESM-only).
 */
function fetchJson(url: string, timeoutMs: number = 30000): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'OpenAgent-Desktop' } }, (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        res.resume();
        return;
      }
      let data = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error(`Failed to parse JSON from ${url}: ${err}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });
  });
}

const MODELS_DEV_URL = 'https://models.dev/models.json';
const CACHE_FILE = 'models-dev-cache.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheShape {
  fetchedAt: string;
  data: Record<string, ModelsDevEntry>;
}

export class ModelsDevClient extends EventEmitter {
  private cache: Map<string, ModelsDevEntry[]> = new Map(); // providerId → entries
  private fetchedAt: string | null = null;
  private cachePath: string;

  constructor() {
    super();
    this.cachePath = path.join(app.getPath('userData'), CACHE_FILE);
  }

  /** Load the on-disk cache into memory. Safe to call multiple times. */
  loadCache(): void {
    if (this.cache.size > 0) return; // already loaded
    try {
      if (!fs.existsSync(this.cachePath)) return;
      const raw = fs.readFileSync(this.cachePath, 'utf-8');
      const parsed = JSON.parse(raw) as CacheShape;
      this.fetchedAt = parsed.fetchedAt;
      this.cache = this.groupByProvider(parsed.data);
    } catch {
      // Corrupted cache — ignore, will refetch.
    }
  }

  /**
   * Fetch fresh data from models.dev and update the cache.
   * Returns the grouped entries. Throws on network error.
   */
  async refresh(): Promise<Map<string, ModelsDevEntry[]>> {
    const data = await fetchJson(MODELS_DEV_URL, 30_000) as Record<string, ModelsDevEntry>;
    this.cache = this.groupByProvider(data);
    this.fetchedAt = new Date().toISOString();

    // Persist to disk atomically.
    const payload: CacheShape = { fetchedAt: this.fetchedAt, data };
    const tmp = this.cachePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf-8');
    fs.renameSync(tmp, this.cachePath);

    this.emit('refreshed', { providerCount: this.cache.size, modelCount: this.getTotalModelCount() });
    return this.cache;
  }

  /** Check if the cache is fresh (within TTL). */
  isCacheFresh(): boolean {
    if (!this.fetchedAt) return false;
    const age = Date.now() - new Date(this.fetchedAt).getTime();
    return age < CACHE_TTL_MS;
  }

  /** Get cached entries for a provider, or undefined if not cached. */
  getModels(providerId: string): ModelsDevEntry[] | undefined {
    return this.cache.get(providerId);
  }

  /** Get all cached provider IDs that have models. */
  getCachedProviderIds(): string[] {
    return Array.from(this.cache.keys());
  }

  /** Total model count across all cached providers. */
  getTotalModelCount(): number {
    let count = 0;
    for (const models of this.cache.values()) count += models.length;
    return count;
  }

  getFetchedAt(): string | null {
    return this.fetchedAt;
  }

  /**
   * Merge models.dev data into the provider definitions. For each builtin
   * provider, attach the models.dev entries as ModelConfig. For providers
   * that exist in models.dev but aren't in the builtin list, create new
   * ProviderDefinition entries dynamically.
   *
   * Returns the merged list of all providers with their models populated.
   */
  getMergedProviders(): ProviderDefinition[] {
    const registry = getOpencodeRegistry();
    const all = registry.listAll();
    const result: ProviderDefinition[] = [];

    for (const def of all) {
      const devModels = this.cache.get(def.id);
      const models: Record<string, ModelConfig> = {};
      if (devModels) {
        for (const m of devModels) {
          // models.dev id is "provider/model" — extract the model part.
          const modelId = m.id.includes('/') ? m.id.split('/').slice(1).join('/') : m.id;
          models[modelId] = {
            id: modelId,
            name: m.name,
            family: m.family,
            release_date: m.release_date,
            attachment: m.attachment,
            reasoning: m.reasoning,
            tool_call: m.tool_call,
            temperature: m.temperature,
            cost: m.cost,
            limit: m.limit,
            modalities: m.modalities,
            status: 'active',
          };
        }
      }
      result.push({ ...def, models: { ...def.models, ...models } });
    }

    // Add providers from models.dev that aren't in the builtin list.
    const builtinIds = new Set(all.map((p) => p.id));
    for (const [providerId, entries] of this.cache.entries()) {
      if (builtinIds.has(providerId)) continue;
      const models: Record<string, ModelConfig> = {};
      for (const m of entries) {
        const modelId = m.id.includes('/') ? m.id.split('/').slice(1).join('/') : m.id;
        models[modelId] = {
          id: modelId,
          name: m.name,
          family: m.family,
          release_date: m.release_date,
          attachment: m.attachment,
          reasoning: m.reasoning,
          tool_call: m.tool_call,
          temperature: m.temperature,
          cost: m.cost,
          limit: m.limit,
          modalities: m.modalities,
          status: 'active',
        };
      }
      result.push({
        id: providerId,
        name: this.capitalize(providerId),
        authMethods: ['api'],
        isBuiltin: false,
        icon: 'cloud',
        models,
      });
    }

    return result;
  }

  private groupByProvider(data: Record<string, ModelsDevEntry>): Map<string, ModelsDevEntry[]> {
    const map = new Map<string, ModelsDevEntry[]>();
    for (const [key, entry] of Object.entries(data)) {
      const slashIdx = key.indexOf('/');
      const providerId = slashIdx >= 0 ? key.slice(0, slashIdx) : key;
      if (!map.has(providerId)) map.set(providerId, []);
      map.get(providerId)!.push(entry);
    }
    return map;
  }

  private capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}

// Singleton
let _client: ModelsDevClient | null = null;
export function getModelsDevClient(): ModelsDevClient {
  if (!_client) _client = new ModelsDevClient();
  return _client;
}
