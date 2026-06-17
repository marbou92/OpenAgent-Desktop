/**
 * OpenAgent-Desktop - Model Discoverer
 *
 * Calls each provider's /models endpoint via the protocol adapter and caches
 * the result in the AuthStore. The UI calls refreshModels(providerId) when
 * the user clicks "Refresh from provider"; listAvailableModels() on the
 * ProviderClient returns the cached results alongside the hardcoded presets.
 *
 * Cache TTL: 1 hour. The UI also offers a "Force refresh" button that
 * bypasses the TTL.
 */

import { EventEmitter } from 'events';
import { AuthStore } from './auth-store';
import { ProviderClient } from './provider-client';
import { getProviderRegistry } from './provider-registry';
import { DiscoveredModel } from './v3-types';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export class ModelDiscoverer extends EventEmitter {
  constructor(
    private authStore: AuthStore,
    private client: ProviderClient
  ) {
    super();
  }

  /**
   * Refresh the cached model list for a provider by calling its /models
   * endpoint. Returns the discovered list. Throws if the provider doesn't
   * support discovery or the call fails.
   */
  async refreshModels(providerId: string, force = false): Promise<DiscoveredModel[]> {
    // Check TTL.
    if (!force) {
      const fetchedAt = this.authStore.getCachedModelsFetchedAt(providerId);
      if (fetchedAt) {
        const age = Date.now() - new Date(fetchedAt).getTime();
        if (age < CACHE_TTL_MS) {
          const cached = this.authStore.getCachedModels(providerId);
          if (cached) {
            this.emit('refresh-skipped', { providerId, reason: 'cache-fresh', modelCount: cached.length });
            return cached;
          }
        }
      }
    }

    const def = getProviderRegistry().get(providerId);
    if (!def) throw new Error(`Unknown provider: ${providerId}`);
    if (!def.modelsEndpoint) {
      throw new Error(`Provider '${providerId}' does not support model discovery (no modelsEndpoint). Use the hardcoded presets or add custom models.`);
    }

    this.emit('refresh-started', { providerId });
    try {
      const models = await this.client.discoverModels(providerId);
      this.authStore.setCachedModels(providerId, models);
      this.emit('refresh-completed', { providerId, modelCount: models.length });
      return models;
    } catch (err) {
      this.emit('refresh-failed', {
        providerId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /** Refresh models for all configured providers that support discovery. */
  async refreshAll(force = false): Promise<{ providerId: string; ok: boolean; modelCount?: number; error?: string }[]> {
    const results: { providerId: string; ok: boolean; modelCount?: number; error?: string }[] = [];
    for (const configured of this.authStore.listProviders()) {
      const def = getProviderRegistry().get(configured.providerId);
      if (!def?.modelsEndpoint) continue;
      try {
        const models = await this.refreshModels(configured.providerId, force);
        results.push({ providerId: configured.providerId, ok: true, modelCount: models.length });
      } catch (err) {
        results.push({
          providerId: configured.providerId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  }

  getCachedModels(providerId: string): DiscoveredModel[] | undefined {
    return this.authStore.getCachedModels(providerId);
  }

  getCachedFetchedAt(providerId: string): string | undefined {
    return this.authStore.getCachedModelsFetchedAt(providerId);
  }

  clearCache(providerId: string): void {
    this.authStore.clearCachedModels(providerId);
    this.emit('cache-cleared', { providerId });
  }
}
