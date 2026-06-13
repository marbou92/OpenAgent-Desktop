/**
 * OpenAgent-Desktop - Layered Configuration
 * 
 * Merges configuration from multiple layers with clear precedence.
 * Like OpenCode: later layers override earlier ones.
 * 
 * Precedence (lowest to highest):
 * 1. App defaults (built-in)
 * 2. Global config (~/.openagent/config.json)
 * 3. Project config (<workspace>/.openagent/config.json)
 * 4. Session overrides
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';

export interface ConfigLayer {
  name: string;
  source: 'default' | 'global' | 'project' | 'session';
  data: Record<string, unknown>;
  filePath?: string;
}

export class LayeredConfig extends EventEmitter {
  private layers: Map<string, ConfigLayer> = new Map();
  private globalConfigPath: string;
  private projectConfigPath: string | null = null;

  constructor() {
    super();
    this.globalConfigPath = path.join(os.homedir(), '.openagent', 'config.json');
  }

  async initialize(projectDir?: string): Promise<void> {
    // Layer 1: App defaults
    this.setLayer({
      name: 'defaults',
      source: 'default',
      data: this.getDefaults(),
    });

    // Layer 2: Global config
    await this.loadLayer('global', this.globalConfigPath);

    // Layer 3: Project config
    if (projectDir) {
      this.projectConfigPath = path.join(projectDir, '.openagent', 'config.json');
      await this.loadLayer('project', this.projectConfigPath);
    }
  }

  private async loadLayer(name: string, filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      this.setLayer({
        name,
        source: name as ConfigLayer['source'],
        data,
        filePath,
      });
    } catch {
      // Config file doesn't exist yet
    }
  }

  setLayer(layer: ConfigLayer): void {
    this.layers.set(layer.name, layer);
    this.emit('config:changed', this.getMerged());
  }

  getMerged(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    
    // Apply layers in order of precedence
    const order = ['defaults', 'global', 'project', 'session'];
    for (const name of order) {
      const layer = this.layers.get(name);
      if (layer) {
        this.deepMerge(result, layer.data);
      }
    }
    
    return result;
  }

  get<T = unknown>(key: string, defaultValue?: T): T {
    const merged = this.getMerged();
    const keys = key.split('.');
    let current: unknown = merged;
    
    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = (current as Record<string, unknown>)[k];
      } else {
        return defaultValue as T;
      }
    }
    
    return current as T;
  }

  async set(key: string, value: unknown, layer: 'global' | 'project' | 'session' = 'global'): Promise<void> {
    const layerObj = this.layers.get(layer);
    if (!layerObj) {
      this.setLayer({
        name: layer,
        source: layer as ConfigLayer['source'],
        data: {},
      });
    }
    
    const targetLayer = this.layers.get(layer)!;
    this.setNestedValue(targetLayer.data, key, value);
    
    // Persist to disk if applicable
    if (targetLayer.filePath) {
      await fs.mkdir(path.dirname(targetLayer.filePath), { recursive: true });
      await fs.writeFile(targetLayer.filePath, JSON.stringify(targetLayer.data, null, 2), 'utf-8');
    }
    
    this.emit('config:changed', this.getMerged());
  }

  getLayer(name: string): ConfigLayer | undefined {
    return this.layers.get(name);
  }

  getAllLayers(): ConfigLayer[] {
    return Array.from(this.layers.values());
  }

  private deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key] || typeof target[key] !== 'object') {
          target[key] = {};
        }
        this.deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
      } else {
        target[key] = source[key];
      }
    }
  }

  private setNestedValue(obj: Record<string, unknown>, key: string, value: unknown): void {
    const keys = key.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
        current[keys[i]] = {};
      }
      current = current[keys[i]] as Record<string, unknown>;
    }
    current[keys[keys.length - 1]] = value;
  }

  private getDefaults(): Record<string, unknown> {
    return {
      providers: {},
      extensions: {},
      agents: {
        defaultMode: 'build',
      },
      memory: {
        enabled: true,
        maxCoreMemories: 100,
        maxExperiences: 1000,
      },
      context: {
        compactionThreshold: 0.8,
        compactionStrategy: 'hybrid',
      },
      security: {
        enablePromptInjectionDetection: true,
        enableCommandInjectionDetection: true,
        maxRiskScore: 0.7,
      },
      permissions: {},
      ui: {
        theme: 'system',
        language: 'en',
        autoRefreshInterval: 30000,
      },
    };
  }
}
