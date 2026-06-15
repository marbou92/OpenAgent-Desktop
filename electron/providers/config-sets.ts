/**
 * OpenAgent-Desktop Aether - Config Sets Manager
 *
 * Manages named configuration sets (presets) for provider settings.
 * Allows users to save and switch between different provider configurations.
 */

import { EventEmitter } from 'events';

export interface ConfigSet {
  id: string;
  name: string;
  description?: string;
  providerConfigs: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export class ConfigSetManager extends EventEmitter {
  private configSets: Map<string, ConfigSet> = new Map();
  private activeSetId: string | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.emit('initialized');
  }

  switch(id: string): ConfigSet | undefined {
    this.activate(id);
    return this.configSets.get(id);
  }

  create(options: { name: string; description?: string; providerConfigs?: Record<string, any> }): ConfigSet {
    const id = `config-set-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const configSet: ConfigSet = {
      id,
      name: options.name,
      description: options.description,
      providerConfigs: options.providerConfigs || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.configSets.set(id, configSet);
    this.emit('config-set:created', configSet);
    return configSet;
  }

  get(id: string): ConfigSet | undefined {
    return this.configSets.get(id);
  }

  list(): ConfigSet[] {
    return Array.from(this.configSets.values());
  }

  update(id: string, updates: Partial<ConfigSet>): ConfigSet | undefined {
    const configSet = this.configSets.get(id);
    if (!configSet) return undefined;
    const updated = { ...configSet, ...updates, id, updatedAt: new Date().toISOString() };
    this.configSets.set(id, updated);
    this.emit('config-set:updated', updated);
    return updated;
  }

  delete(id: string): boolean {
    const deleted = this.configSets.delete(id);
    if (deleted) {
      if (this.activeSetId === id) this.activeSetId = null;
      this.emit('config-set:deleted', { id });
    }
    return deleted;
  }

  activate(id: string): void {
    if (!this.configSets.has(id)) throw new Error(`Config set not found: ${id}`);
    this.activeSetId = id;
    this.emit('config-set:activated', this.configSets.get(id));
  }

  getActive(): ConfigSet | null {
    if (!this.activeSetId) return null;
    return this.configSets.get(this.activeSetId) || null;
  }
}
