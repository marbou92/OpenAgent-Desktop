/**
 * OpenAgent-Desktop Aether - Model Variants Manager
 *
 * Manages model variant configurations (e.g., temperature presets,
 * system prompt variants) that can be applied on top of base model configs.
 */

import { EventEmitter } from 'events';

export interface ModelVariant {
  id: string;
  name: string;
  description?: string;
  modelId: string;
  overrides: {
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
  };
  createdAt: string;
}

export class ModelVariantManager extends EventEmitter {
  private variants: Map<string, ModelVariant> = new Map();
  private activeVariantId: string | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.emit('initialized');
  }

  getActive(): ModelVariant | null {
    if (!this.activeVariantId) return null;
    return this.variants.get(this.activeVariantId) || null;
  }

  setActive(id: string): ModelVariant | undefined {
    const variant = this.variants.get(id);
    if (variant) {
      this.activeVariantId = id;
      this.emit('variant:activated', variant);
    }
    return variant;
  }

  cycleVariant(modelId: string, direction?: 'next' | 'previous'): ModelVariant | null {
    const modelVariants = this.list(modelId);
    if (modelVariants.length === 0) return null;
    const currentIndex = this.activeVariantId
      ? modelVariants.findIndex(v => v.id === this.activeVariantId)
      : -1;
    const dir = direction === 'previous' ? -1 : 1;
    const nextIndex = (currentIndex + dir + modelVariants.length) % modelVariants.length;
    const next = modelVariants[nextIndex];
    this.activeVariantId = next.id;
    this.emit('variant:cycled', next);
    return next;
  }

  create(options: Omit<ModelVariant, 'id' | 'createdAt'>): ModelVariant {
    const id = `variant-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const variant: ModelVariant = {
      ...options,
      id,
      createdAt: new Date().toISOString(),
    };
    this.variants.set(id, variant);
    this.emit('variant:created', variant);
    return variant;
  }

  get(id: string): ModelVariant | undefined {
    return this.variants.get(id);
  }

  list(modelId?: string): ModelVariant[] {
    const all = Array.from(this.variants.values());
    if (modelId) return all.filter(v => v.modelId === modelId);
    return all;
  }

  update(id: string, updates: Partial<ModelVariant>): ModelVariant | undefined {
    const variant = this.variants.get(id);
    if (!variant) return undefined;
    const updated = { ...variant, ...updates, id: variant.id };
    this.variants.set(id, updated);
    this.emit('variant:updated', updated);
    return updated;
  }

  delete(id: string): boolean {
    const deleted = this.variants.delete(id);
    if (deleted) this.emit('variant:deleted', { id });
    return deleted;
  }

  applyVariant(baseConfig: Record<string, any>, variantId: string): Record<string, any> {
    const variant = this.variants.get(variantId);
    if (!variant) return baseConfig;
    return { ...baseConfig, ...variant.overrides };
  }
}
