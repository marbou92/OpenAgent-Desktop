/**
 * OpenAgent-Desktop Aether - Provider Catalog
 *
 * Maintains a catalog of available providers and their models.
 * Combines OpenCode-sidecar providers with custom protocol providers.
 */

import { EventEmitter } from 'events';

export interface CatalogEntry {
  id: string;
  name: string;
  source: 'opencode' | 'custom';
  category?: string;
  configured: boolean;
  models: { id: string; name: string; contextWindow?: number }[];
}

export class ProviderCatalog extends EventEmitter {
  private entries: Map<string, CatalogEntry> = new Map();

  add(entry: CatalogEntry): void {
    this.entries.set(entry.id, entry);
    this.emit('catalog:updated', this.list());
  }

  remove(id: string): void {
    this.entries.delete(id);
    this.emit('catalog:updated', this.list());
  }

  get(id: string): CatalogEntry | undefined {
    return this.entries.get(id);
  }

  list(): CatalogEntry[] {
    return Array.from(this.entries.values());
  }

  listBySource(source: 'opencode' | 'custom'): CatalogEntry[] {
    return this.list().filter(e => e.source === source);
  }

  findModel(modelId: string): { entry: CatalogEntry; model: { id: string; name: string; contextWindow?: number } } | undefined {
    for (const entry of this.entries.values()) {
      const model = entry.models.find(m => m.id === modelId || `${entry.id}/${m.id}` === modelId);
      if (model) return { entry, model };
    }
    return undefined;
  }

  clear(): void {
    this.entries.clear();
    this.emit('catalog:updated', []);
  }

  getByCategory(category: string): CatalogEntry[] {
    return this.list().filter(e => e.category === category);
  }

  getPopular(): CatalogEntry[] {
    // Return entries that are commonly popular; for now return all configured entries
    return this.list().filter(e => e.configured);
  }
}
