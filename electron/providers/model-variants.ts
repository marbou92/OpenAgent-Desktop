/**
 * OpenAgent-Desktop - Model Variants
 * 
 * Configure different settings for the same model.
 * Like OpenCode: variants like "high", "low", "fast" for reasoning effort.
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ModelVariant {
  id: string;
  name: string;
  modelId: string;       // e.g., "anthropic/claude-sonnet-4-5"
  description?: string;
  options: Record<string, unknown>;
  color?: string;
  isBuiltIn?: boolean;
}

export class ModelVariantManager extends EventEmitter {
  private variants: Map<string, ModelVariant> = new Map();
  private activeVariantId: string | null = null;
  private filePath: string;

  constructor() {
    super();
    const configDir = path.join(os.homedir(), '.openagent');
    this.filePath = path.join(configDir, 'model-variants.json');
    this.registerBuiltIns();
  }

  private registerBuiltIns(): void {
    const builtIns: ModelVariant[] = [
      // Anthropic variants
      {
        id: 'anthropic-sonnet-default',
        name: 'Default',
        modelId: 'anthropic/claude-sonnet-4-5',
        description: 'Standard configuration',
        options: {},
        isBuiltIn: true,
      },
      {
        id: 'anthropic-sonnet-thinking',
        name: 'Thinking',
        modelId: 'anthropic/claude-sonnet-4-5',
        description: 'Extended thinking enabled with 16K token budget',
        options: { thinking: { type: 'enabled', budgetTokens: 16000 } },
        color: '#3b82f6',
        isBuiltIn: true,
      },
      {
        id: 'anthropic-sonnet-fast',
        name: 'Fast',
        modelId: 'anthropic/claude-sonnet-4-5',
        description: 'Lower temperature for faster, more focused responses',
        options: { temperature: 0.3 },
        color: '#22c55e',
        isBuiltIn: true,
      },
      // OpenAI variants
      {
        id: 'openai-gpt5-default',
        name: 'Default',
        modelId: 'openai/gpt-5',
        description: 'Standard configuration',
        options: {},
        isBuiltIn: true,
      },
      {
        id: 'openai-gpt5-high-reasoning',
        name: 'High Reasoning',
        modelId: 'openai/gpt-5',
        description: 'High reasoning effort',
        options: { reasoningEffort: 'high' },
        color: '#3b82f6',
        isBuiltIn: true,
      },
      {
        id: 'openai-gpt5-low-reasoning',
        name: 'Low Reasoning',
        modelId: 'openai/gpt-5',
        description: 'Low reasoning effort for faster responses',
        options: { reasoningEffort: 'low' },
        color: '#22c55e',
        isBuiltIn: true,
      },
      // Gemini variants
      {
        id: 'gemini-pro-default',
        name: 'Default',
        modelId: 'google/gemini-3-pro',
        description: 'Standard configuration',
        options: {},
        isBuiltIn: true,
      },
      {
        id: 'gemini-pro-high',
        name: 'High',
        modelId: 'google/gemini-3-pro',
        description: 'High reasoning effort',
        options: { reasoningEffort: 'high' },
        color: '#3b82f6',
        isBuiltIn: true,
      },
    ];

    for (const variant of builtIns) {
      this.variants.set(variant.id, variant);
    }
  }

  async initialize(): Promise<void> {
    await this.loadCustomVariants();
  }

  private async loadCustomVariants(): Promise<void> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      const data: ModelVariant[] = JSON.parse(content);
      for (const variant of data) {
        variant.isBuiltIn = false;
        this.variants.set(variant.id, variant);
      }
    } catch {
      // No custom variants
    }
  }

  private async saveCustomVariants(): Promise<void> {
    const custom = Array.from(this.variants.values()).filter((v) => !v.isBuiltIn);
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(custom, null, 2), 'utf-8');
  }

  list(modelId?: string): ModelVariant[] {
    const all = Array.from(this.variants.values());
    if (modelId) {
      return all.filter((v) => v.modelId === modelId);
    }
    return all;
  }

  get(id: string): ModelVariant | undefined {
    return this.variants.get(id);
  }

  getActive(): ModelVariant | null {
    if (this.activeVariantId) {
      return this.variants.get(this.activeVariantId) || null;
    }
    return null;
  }

  setActive(variantId: string): void {
    const variant = this.variants.get(variantId);
    if (!variant) throw new Error(`Variant not found: ${variantId}`);
    this.activeVariantId = variantId;
    this.emit('variant:switched', variant);
  }

  clearActive(): void {
    this.activeVariantId = null;
    this.emit('variant:cleared');
  }

  async create(variant: Omit<ModelVariant, 'isBuiltIn'>): Promise<ModelVariant> {
    const newVariant: ModelVariant = { ...variant, isBuiltIn: false };
    this.variants.set(newVariant.id, newVariant);
    await this.saveCustomVariants();
    this.emit('variant:created', newVariant);
    return newVariant;
  }

  async delete(id: string): Promise<void> {
    const variant = this.variants.get(id);
    if (!variant) throw new Error(`Variant not found: ${id}`);
    if (variant.isBuiltIn) throw new Error('Cannot delete built-in variants');
    
    this.variants.delete(id);
    if (this.activeVariantId === id) {
      this.activeVariantId = null;
    }
    await this.saveCustomVariants();
    this.emit('variant:deleted', { id });
  }

  cycleVariant(modelId: string, direction: 'next' | 'prev' = 'next'): ModelVariant | null {
    const modelVariants = this.list(modelId);
    if (modelVariants.length === 0) return null;

    const currentIndex = this.activeVariantId
      ? modelVariants.findIndex((v) => v.id === this.activeVariantId)
      : -1;

    let nextIndex: number;
    if (direction === 'next') {
      nextIndex = (currentIndex + 1) % modelVariants.length;
    } else {
      nextIndex = currentIndex <= 0 ? modelVariants.length - 1 : currentIndex - 1;
    }

    const nextVariant = modelVariants[nextIndex];
    this.setActive(nextVariant.id);
    return nextVariant;
  }
}
