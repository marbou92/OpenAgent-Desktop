/**
 * OpenAgent-Desktop - Provider Config Sets
 * 
 * Named API configurations that bundle provider + model + API key + settings.
 * Like OpenCowork's ApiConfigSet — easily switch between different setups.
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProviderType } from './types';

export interface ProviderConfigSet {
  id: string;
  name: string;
  providerType: ProviderType;
  apiKey?: string;
  apiHost?: string;
  model: string;
  contextWindow?: number;
  maxTokens?: number;
  temperature?: number;
  enableThinking?: boolean;
  thinkingBudget?: number;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export class ConfigSetManager extends EventEmitter {
  private configSets: Map<string, ProviderConfigSet> = new Map();
  private activeConfigSetId: string | null = null;
  private filePath: string;

  constructor() {
    super();
    const configDir = path.join(os.homedir(), '.openagent');
    this.filePath = path.join(configDir, 'config-sets.json');
  }

  async initialize(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await this.load();
    
    // Create default config set if none exist
    if (this.configSets.size === 0) {
      await this.create({
        name: 'Default',
        providerType: ProviderType.anthropic,
        model: 'anthropic/claude-sonnet-4-5',
        isDefault: true,
      });
    }
  }

  private async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      const data: ProviderConfigSet[] = JSON.parse(content);
      for (const cs of data) {
        this.configSets.set(cs.id, cs);
        if (cs.isDefault) {
          this.activeConfigSetId = cs.id;
        }
      }
    } catch {
      // No config sets yet
    }
  }

  private async save(): Promise<void> {
    await fs.writeFile(this.filePath, JSON.stringify(Array.from(this.configSets.values()), null, 2), 'utf-8');
  }

  list(): ProviderConfigSet[] {
    return Array.from(this.configSets.values());
  }

  get(id: string): ProviderConfigSet | undefined {
    return this.configSets.get(id);
  }

  getActive(): ProviderConfigSet | undefined {
    if (this.activeConfigSetId) {
      return this.configSets.get(this.activeConfigSetId);
    }
    return Array.from(this.configSets.values()).find((cs) => cs.isDefault);
  }

  async create(config: Omit<ProviderConfigSet, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProviderConfigSet> {
    const configSet: ProviderConfigSet = {
      ...config,
      id: `cs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.configSets.set(configSet.id, configSet);
    await this.save();
    this.emit('configset:created', configSet);
    return configSet;
  }

  async update(id: string, updates: Partial<ProviderConfigSet>): Promise<ProviderConfigSet> {
    const existing = this.configSets.get(id);
    if (!existing) throw new Error(`Config set not found: ${id}`);
    
    const updated = { ...existing, ...updates, id, updatedAt: new Date().toISOString() };
    this.configSets.set(id, updated);
    await this.save();
    this.emit('configset:updated', updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const cs = this.configSets.get(id);
    if (!cs) throw new Error(`Config set not found: ${id}`);
    if (cs.isDefault) throw new Error('Cannot delete the default config set');
    
    this.configSets.delete(id);
    if (this.activeConfigSetId === id) {
      this.activeConfigSetId = Array.from(this.configSets.values()).find((c) => c.isDefault)?.id || null;
    }
    await this.save();
    this.emit('configset:deleted', { id });
  }

  async switch(id: string): Promise<ProviderConfigSet> {
    const cs = this.configSets.get(id);
    if (!cs) throw new Error(`Config set not found: ${id}`);
    
    this.activeConfigSetId = id;
    await this.save();
    this.emit('configset:switched', cs);
    return cs;
  }
}
