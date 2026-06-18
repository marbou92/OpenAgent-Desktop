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
import { getOpencodeRegistry } from './opencode-registry';

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

/**
 * Fetch JSON from a URL with ETag support for conditional requests.
 * If the server returns 304 (Not Modified), returns the 304 status with
 * null data — the caller should keep the existing cache.
 */
function fetchJsonWithEtag(url: string, etag: string | null, timeoutMs: number = 30000): Promise<{ status: number; data: any; etag: string | null }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { 'User-Agent': 'OpenAgent-Desktop' };
    if (etag) {
      headers['If-None-Match'] = etag;
    }
    const req = https.get(url, { headers }, (res) => {
      const responseEtag = res.headers['etag'] || null;
      if (res.statusCode === 304) {
        resolve({ status: 304, data: null, etag: responseEtag });
        res.resume();
        return;
      }
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        res.resume();
        return;
      }
      let body = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 200, data: JSON.parse(body), etag: responseEtag });
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
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // Check for updates every 30 minutes

interface CacheShape {
  fetchedAt: string;
  etag: string | null;
  data: Record<string, ModelsDevEntry>;
}

export class ModelsDevClient extends EventEmitter {
  private cache: Map<string, ModelsDevEntry[]> = new Map(); // providerId → entries
  private fetchedAt: string | null = null;
  private etag: string | null = null;
  private cachePath: string;
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private lastCheckAt: number = 0;

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
      this.etag = parsed.etag || null;
      this.cache = this.groupByProvider(parsed.data);
    } catch {
      // Corrupted cache — ignore, will refetch.
    }
  }

  /**
   * Fetch fresh data from models.dev and update the cache.
   * Uses ETag for conditional requests — if the server returns 304, the
   * catalog hasn't changed and we skip the update.
   * Returns the grouped entries. Throws on network error.
   */
  async refresh(): Promise<Map<string, ModelsDevEntry[]>> {
    // Use https.get directly so we can inspect headers (etag, status code).
    const { status, data, etag } = await fetchJsonWithEtag(MODELS_DEV_URL, this.etag, 30_000);

    if (status === 304) {
      // Catalog hasn't changed — just update the fetchedAt timestamp.
      this.fetchedAt = new Date().toISOString();
      this.emit('checked', { updated: false, providerCount: this.cache.size, modelCount: this.getTotalModelCount() });
      return this.cache;
    }

    // Catalog changed — update cache + etag.
    const parsed = data as Record<string, ModelsDevEntry>;
    this.cache = this.groupByProvider(parsed);
    this.fetchedAt = new Date().toISOString();
    this.etag = etag;

    // Persist to disk atomically.
    const payload: CacheShape = { fetchedAt: this.fetchedAt, etag: this.etag, data: parsed };
    const tmp = this.cachePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf-8');
    fs.renameSync(tmp, this.cachePath);

    this.emit('refreshed', { updated: true, providerCount: this.cache.size, modelCount: this.getTotalModelCount() });
    return this.cache;
  }

  /**
   * Start a background timer that checks models.dev for updates every 30
   * minutes. If the catalog has changed (ETag mismatch), emits a
   * 'catalog-updated' event that main.ts forwards to the renderer so the
   * UI can refresh the provider list.
   */
  startBackgroundChecker(): void {
    if (this.checkTimer) return;
    // Check immediately, then every 30 minutes.
    this.checkForUpdates();
    this.checkTimer = setInterval(() => this.checkForUpdates(), CHECK_INTERVAL_MS);
  }

  /** Stop the background checker. */
  stopBackgroundChecker(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /** Check for updates without blocking. Silently logs result. */
  private async checkForUpdates(): Promise<void> {
    // Don't check more than once per 5 minutes.
    if (Date.now() - this.lastCheckAt < 5 * 60 * 1000) return;
    this.lastCheckAt = Date.now();

    try {
      const before = this.getTotalModelCount();
      await this.refresh();
      const after = this.getTotalModelCount();
      if (after !== before) {
        this.emit('catalog-updated', {
          providerCount: this.cache.size,
          modelCount: after,
          previousModelCount: before,
        });
      }
    } catch {
      // Network error — silently ignore, will retry next interval.
    }
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
      const models: Record<string, ModelConfig> = {};

      // Determine which models.dev provider to pull models from.
      // - If def.modelSource is '*', pull from ALL providers (for openrouter).
      // - If def.modelSource is set (e.g. 'google'), pull from that provider.
      // - Otherwise, pull from the provider's own ID.
      const sourceIds: string[] = [];
      if (def.modelSource === '*') {
        // Pull from all models.dev providers.
        sourceIds.push(...Array.from(this.cache.keys()));
      } else if (def.modelSource) {
        sourceIds.push(def.modelSource);
      } else {
        sourceIds.push(def.id);
      }

      for (const sourceId of sourceIds) {
        const devModels = this.cache.get(sourceId);
        if (!devModels) continue;
        for (const m of devModels) {
          const modelId = m.id.includes('/') ? m.id.split('/').slice(1).join('/') : m.id;
          // For openrouter (modelSource='*'), prefix the model id with the
          // source provider so the qualified id is "openrouter/openai/gpt-4o".
          // This matches OpenRouter's actual model naming convention.
          const finalModelId = def.modelSource === '*' ? `${sourceId}/${modelId}` : modelId;
          models[finalModelId] = {
            id: finalModelId,
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

      // Merge hardcoded models from the provider definition (takes precedence).
      result.push({ ...def, models: { ...models, ...def.models } });
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
