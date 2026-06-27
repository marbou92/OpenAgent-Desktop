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
function fetchJson(url: string, timeoutMs = 30000): Promise<any> {
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
function fetchJsonWithEtag(url: string, etag: string | null, timeoutMs = 30000): Promise<{ status: number; data: any; etag: string | null }> {
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

/**
 * Fetch plain text from a URL (for .toml files).
 */
function fetchText(url: string, timeoutMs = 15000): Promise<string> {
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
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });
  });
}

const MODELS_DEV_URL = 'https://models.dev/models.json';
const GITHUB_COMMITS_URL = 'https://api.github.com/repos/anomalyco/models.dev/commits?path=providers&per_page=1';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/anomalyco/models.dev/dev/providers';
const CACHE_FILE = 'models-dev-cache.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // Check for updates every 30 minutes

interface CacheShape {
  fetchedAt: string;
  etag: string | null;
  githubSha: string | null;
  tomlOverrides: Record<string, Record<string, ModelConfig>> | null; // providerId → modelId → ModelConfig
  data: Record<string, ModelsDevEntry>;
}

export class ModelsDevClient extends EventEmitter {
  private cache: Map<string, ModelsDevEntry[]> = new Map(); // providerId → entries (from models.json)
  private tomlOverrides: Map<string, Record<string, ModelConfig>> = new Map(); // providerId → models (from GitHub .toml fetch)
  private fetchedAt: string | null = null;
  private etag: string | null = null;
  private githubSha: string | null = null;
  private cachePath: string;
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private lastCheckAt = 0;

  constructor() {
    super();
    this.cachePath = path.join(app.getPath('userData'), CACHE_FILE);
  }

  /** Load the on-disk cache into memory. Safe to call multiple times. */
  loadCache(): void {
    if (this.cache.size > 0 || this.tomlOverrides.size > 0) return; // already loaded
    try {
      if (!fs.existsSync(this.cachePath)) return;
      const raw = fs.readFileSync(this.cachePath, 'utf-8');
      const parsed = JSON.parse(raw) as CacheShape;
      this.fetchedAt = parsed.fetchedAt;
      this.etag = parsed.etag || null;
      this.githubSha = parsed.githubSha || null;
      this.cache = this.groupByProvider(parsed.data);
      if (parsed.tomlOverrides) {
        for (const [pid, models] of Object.entries(parsed.tomlOverrides)) {
          this.tomlOverrides.set(pid, models);
        }
      }
    } catch {
      // Corrupted cache — ignore, will refetch.
    }
  }

  /**
   * Fetch fresh data from models.dev and update the cache.
   * Uses ETag for conditional requests.
   */
  async refresh(): Promise<Map<string, ModelsDevEntry[]>> {
    const { status, data, etag } = await fetchJsonWithEtag(MODELS_DEV_URL, this.etag, 30_000);

    if (status === 304) {
      this.fetchedAt = new Date().toISOString();
      this.emit('checked', { updated: false, providerCount: this.cache.size, modelCount: this.getTotalModelCount() });
      return this.cache;
    }

    const parsed = data as Record<string, ModelsDevEntry>;
    this.cache = this.groupByProvider(parsed);
    this.fetchedAt = new Date().toISOString();
    this.etag = etag;

    this.saveCache();
    this.emit('refreshed', { updated: true, providerCount: this.cache.size, modelCount: this.getTotalModelCount() });
    return this.cache;
  }

  /**
   * Check GitHub for new commits on the providers/ path. If the SHA changed,
   * re-fetch .toml model files for the configured providers and update the
   * tomlOverrides cache.
   */
  async checkGithubUpdate(configuredProviderIds: string[]): Promise<boolean> {
    try {
      // Check latest commit SHA on the providers/ path.
      const commitData = await fetchJson(GITHUB_COMMITS_URL, 15_000) as Array<{ sha: string }>;
      if (!Array.isArray(commitData) || commitData.length === 0) return false;
      const latestSha = commitData[0].sha;

      if (this.githubSha === latestSha) {
        return false; // No change.
      }

      // SHA changed — re-fetch .toml files for configured providers only.
      let updated = false;
      for (const providerId of configuredProviderIds) {
        const models = await this.fetchProviderTomlModels(providerId);
        if (models) {
          this.tomlOverrides.set(providerId, models);
          updated = true;
        }
      }

      this.githubSha = latestSha;
      this.saveCache();

      if (updated) {
        this.emit('catalog-updated', {
          providerCount: this.cache.size,
          modelCount: this.getTotalModelCount(),
          previousModelCount: 0, // Unknown — the checker will compare.
          source: 'github',
        });
      }
      return updated;
    } catch {
      return false;
    }
  }

  /**
   * Fetch all .toml model files for a single provider from the GitHub repo.
   * Returns a Record<modelId, ModelConfig> or null on error.
   */
  private async fetchProviderTomlModels(providerId: string): Promise<Record<string, ModelConfig> | null> {
    try {
      // Fetch the models/ directory listing from the GitHub API.
      const dirUrl = `https://api.github.com/repos/anomalyco/models.dev/contents/providers/${providerId}/models`;
      const dirData = await fetchJson(dirUrl, 15_000) as Array<{ name: string; type: string }>;
      if (!Array.isArray(dirData)) return null;

      const models: Record<string, ModelConfig> = {};
      for (const entry of dirData) {
        if (!entry.name.endsWith('.toml')) continue;
        const modelId = entry.name.replace('.toml', '');
        const rawUrl = `${GITHUB_RAW_BASE}/${providerId}/models/${entry.name}`;
        const tomlContent = await fetchText(rawUrl, 10_000);
        const parsed = this.parseToml(tomlContent);
        models[modelId] = {
          id: modelId,
          name: parsed.name || modelId,
          family: parsed.family,
          release_date: parsed.release_date,
          attachment: parsed.attachment,
          reasoning: parsed.reasoning,
          temperature: parsed.temperature,
          tool_call: parsed.tool_call,
          structured_output: parsed.structured_output,
          cost: parsed.cost,
          limit: parsed.limit,
          modalities: parsed.modalities,
          status: 'active',
          source: 'github-live' as any,
        };
      }
      return Object.keys(models).length > 0 ? models : null;
    } catch {
      return null;
    }
  }

  /** Simple TOML parser for model files. */
  private parseToml(content: string): Record<string, any> {
    const result: Record<string, any> = {};
    let currentSection: string | null = null;
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        currentSection = trimmed.slice(1, -1).trim();
        if (!result[currentSection]) result[currentSection] = {};
        continue;
      }
      if (!trimmed.includes('=')) continue;
      const [key, ...rest] = trimmed.split('=');
      const val = rest.join('=').trim().replace(/^["']|["']$/g, '');
      // Parse values
      let parsed: any = val;
      if (val === 'true') parsed = true;
      else if (val === 'false') parsed = false;
      else if (/^\d+$/.test(val.replace(/_/g, ''))) parsed = parseInt(val.replace(/_/g, ''), 10);
      else if (/^\d+\.\d+$/.test(val)) parsed = parseFloat(val);
      else if (val.startsWith('[') && val.endsWith(']')) {
        parsed = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      }
      if (currentSection) {
        result[currentSection][key.trim()] = parsed;
      } else {
        result[key.trim()] = parsed;
      }
    }
    return result;
  }

  /**
   * Start a background timer that checks for updates every 30 minutes.
   * Checks both:
   *   - models.json ETag (Layer 2 — 18 providers, live pricing)
   *   - GitHub commits SHA (Layer 3 — configured providers' .toml files)
   *
   * Requires the list of configured provider IDs to know which .toml files
   * to re-fetch when the GitHub repo changes.
   */
  startBackgroundChecker(getConfiguredProviderIds?: () => string[]): void {
    if (this.checkTimer) return;
    this.checkForUpdates(getConfiguredProviderIds);
    this.checkTimer = setInterval(() => this.checkForUpdates(getConfiguredProviderIds), CHECK_INTERVAL_MS);
  }

  /** Stop the background checker. */
  stopBackgroundChecker(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /** Check for updates (models.json ETag + GitHub commits SHA). */
  private async checkForUpdates(getConfiguredProviderIds?: () => string[]): Promise<void> {
    if (Date.now() - this.lastCheckAt < 5 * 60 * 1000) return;
    this.lastCheckAt = Date.now();

    try {
      const before = this.getTotalModelCount();
      let changed = false;

      // Layer 2: Check models.json ETag
      try {
        await this.refresh();
        changed = true;
      } catch {
        // Network error — continue to GitHub check.
      }

      // Layer 3: Check GitHub commits SHA for .toml file updates
      if (getConfiguredProviderIds) {
        const configuredIds = getConfiguredProviderIds();
        if (configuredIds.length > 0) {
          const githubChanged = await this.checkGithubUpdate(configuredIds);
          if (githubChanged) changed = true;
        }
      }

      if (changed) {
        const after = this.getTotalModelCount();
        if (after !== before) {
          this.emit('catalog-updated', {
            providerCount: this.cache.size,
            modelCount: after,
            previousModelCount: before,
          });
        }
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
    // Also count tomlOverrides models
    for (const models of this.tomlOverrides.values()) count += Object.keys(models).length;
    return count;
  }

  getFetchedAt(): string | null {
    return this.fetchedAt;
  }

  getGithubSha(): string | null {
    return this.githubSha;
  }

  /** Save cache to disk atomically. */
  private saveCache(): void {
    try {
      const tomlOverridesObj: Record<string, Record<string, ModelConfig>> = {};
      for (const [pid, models] of this.tomlOverrides.entries()) {
        tomlOverridesObj[pid] = models;
      }
      const payload: CacheShape = {
        fetchedAt: this.fetchedAt || new Date().toISOString(),
        etag: this.etag,
        githubSha: this.githubSha,
        tomlOverrides: tomlOverridesObj,
        data: Object.fromEntries(
          Array.from(this.cache.entries()).flatMap(([_pid, entries]) =>
            entries.map(e => [e.id, e])
          )
        ),
      };
      const tmp = this.cachePath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(payload), 'utf-8');
      fs.renameSync(tmp, this.cachePath);
    } catch {
      // Ignore save errors — cache is best-effort.
    }
  }

  /**
   * Merge all sources into provider definitions:
   *   1. Build-time embedded .toml models (from models-dev-catalog.ts)
   *   2. Runtime models.json data (for 18 providers — live pricing)
   *   3. Runtime GitHub .toml overrides (for configured providers — latest data)
   *
   * Precedence: GitHub .toml overrides > models.json > build-time .toml
   */
  getMergedProviders(): ProviderDefinition[] {
    const registry = getOpencodeRegistry();
    const all = registry.listAll();
    const result: ProviderDefinition[] = [];

    for (const def of all) {
      const models: Record<string, ModelConfig> = {};

      // 1. Start with build-time embedded models (from .toml files in the catalog)
      if (def.models) {
        for (const [modelId, mc] of Object.entries(def.models)) {
          models[modelId] = { ...mc, source: 'toml' as any };
        }
      }

      // 2. Overlay models.json data (for 18 providers — live pricing)
      const sourceIds: string[] = [];
      if (def.modelSource === '*') {
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
            source: 'models.json' as any,
          };
        }
      }

      // 3. Overlay GitHub .toml overrides (highest precedence — latest data)
      const tomlOverride = this.tomlOverrides.get(def.id);
      if (tomlOverride) {
        for (const [modelId, mc] of Object.entries(tomlOverride)) {
          models[modelId] = mc;
        }
      }

      result.push({ ...def, models });
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
