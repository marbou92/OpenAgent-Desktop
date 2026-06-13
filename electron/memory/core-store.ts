/**
 * OpenAgent-Desktop - Core Memory Store
 * 
 * Manages core memories: identity, preferences, skills, interests, notes.
 * Always loaded into agent context.
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CoreMemory } from './types';

export class CoreMemoryStore extends EventEmitter {
  private memories: Map<string, CoreMemory> = new Map();
  private filePath: string;

  constructor() {
    super();
    const configDir = path.join(os.homedir(), '.openagent');
    this.filePath = path.join(configDir, 'core-memory.json');
  }

  async initialize(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      const data: CoreMemory[] = JSON.parse(content);
      for (const memory of data) {
        this.memories.set(memory.id, memory);
      }
    } catch {
      // No memories yet
    }
  }

  private async save(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(Array.from(this.memories.values()), null, 2), 'utf-8');
  }

  list(category?: string): CoreMemory[] {
    const all = Array.from(this.memories.values());
    if (category) {
      return all.filter((m) => m.category === category);
    }
    return all;
  }

  get(id: string): CoreMemory | undefined {
    return this.memories.get(id);
  }

  async set(category: CoreMemory['category'], key: string, value: string): Promise<CoreMemory> {
    const existing = Array.from(this.memories.values()).find((m) => m.category === category && m.key === key);
    
    if (existing) {
      existing.value = value;
      existing.updatedAt = new Date().toISOString();
      this.memories.set(existing.id, existing);
      await this.save();
      this.emit('memory:updated', existing);
      return existing;
    }

    const memory: CoreMemory = {
      id: `core-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      category,
      key,
      value,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    this.memories.set(memory.id, memory);
    await this.save();
    this.emit('memory:created', memory);
    return memory;
  }

  async delete(id: string): Promise<void> {
    this.memories.delete(id);
    await this.save();
    this.emit('memory:deleted', { id });
  }

  getAll(): CoreMemory[] {
    return Array.from(this.memories.values());
  }

  getContextString(): string {
    const memories = this.getAll();
    if (memories.length === 0) return '';
    
    const grouped: Record<string, CoreMemory[]> = {};
    for (const m of memories) {
      if (!grouped[m.category]) grouped[m.category] = [];
      grouped[m.category].push(m);
    }

    const parts: string[] = ['[Core Memory]'];
    for (const [category, items] of Object.entries(grouped)) {
      parts.push(`\n${category}:`);
      for (const item of items) {
        parts.push(`  - ${item.key}: ${item.value}`);
      }
    }
    return parts.join('\n');
  }
}
