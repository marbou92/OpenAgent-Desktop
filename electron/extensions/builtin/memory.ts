/**
 * OpenAgent Desktop - Memory Extension
 *
 * Persistent context storage across sessions using electron-store:
 * - save_memory: Store persistent context
 * - recall_memory: Retrieve stored memories
 * - delete_memory: Remove a memory
 * - list_memories: List all memories
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BaseExtension } from '../base-extension';
import {
  ExtensionConfig,
  ExtensionType,
  ToolDefinition,
  ToolResult,
  Permission,
  PermissionLevel,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Memory entry structure
// ─────────────────────────────────────────────────────────────────────────────

interface MemoryEntry {
  key: string;
  value: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  accessCount: number;
  lastAccessedAt: string;
}

interface MemoryStore {
  version: number;
  memories: Record<string, MemoryEntry>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Memory Extension class
// ─────────────────────────────────────────────────────────────────────────────

export class MemoryExtension extends BaseExtension {
  private storePath: string;
  private store: MemoryStore;
  private dirty: boolean = false;
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private flushIntervalMs: number = 5000;

  constructor(config: ExtensionConfig) {
    super(config);
    this.storePath = this.getSetting<string>(
      'storePath',
      path.join(os.homedir(), '.openagent', 'memory', 'memories.json'),
    );
    this.store = { version: 1, memories: {} };
  }

  protected registerTools(): void {
    this.registerTool(
      {
        name: 'save_memory',
        description:
          'Store a persistent memory that will be available across sessions. ' +
          'Use categories to organize memories (e.g., "preferences", "context", "facts").',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Unique key for this memory (e.g., "user_preferred_language")',
            },
            value: {
              type: 'string',
              description: 'The value to store',
            },
            category: {
              type: 'string',
              description: 'Category for organizing memories (default: "general")',
              default: 'general',
            },
          },
          required: ['key', 'value'],
        },
      },
      this.executeSaveMemory.bind(this),
    );

    this.registerTool(
      {
        name: 'recall_memory',
        description:
          'Retrieve stored memories by key or category. If no key is specified, ' +
          'returns all memories in the given category (or all memories if no category either).',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Specific memory key to recall',
            },
            category: {
              type: 'string',
              description: 'Category to filter memories by',
            },
          },
        },
      },
      this.executeRecallMemory.bind(this),
    );

    this.registerTool(
      {
        name: 'delete_memory',
        description: 'Remove a specific memory by key.',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'The key of the memory to delete',
            },
          },
          required: ['key'],
        },
      },
      this.executeDeleteMemory.bind(this),
    );

    this.registerTool(
      {
        name: 'list_memories',
        description: 'List all stored memories, optionally filtered by category.',
        parameters: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'Filter by category',
            },
          },
        },
      },
      this.executeListMemories.bind(this),
    );

    this.setPermissions([
      {
        level: PermissionLevel.Read,
        reason: 'Read and write persistent memory store',
        resources: ['memory-store'],
      },
    ]);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  protected async onInitialize(): Promise<void> {
    await this.loadStore();
    this.startFlushInterval();
  }

  protected async onShutdown(): Promise<void> {
    this.stopFlushInterval();
    await this.flushStore();
  }

  // ─── Store persistence ─────────────────────────────────────────────────────

  private async loadStore(): Promise<void> {
    try {
      const dir = path.dirname(this.storePath);
      await fs.mkdir(dir, { recursive: true });

      const data = await fs.readFile(this.storePath, 'utf-8');
      this.store = JSON.parse(data) as MemoryStore;

      // Handle version migrations
      if (this.store.version < 1) {
        this.store.version = 1;
        this.dirty = true;
      }

      this.logger.info(`Loaded ${Object.keys(this.store.memories).length} memories`);
    } catch (err) {
      // Store doesn't exist yet — initialize empty
      this.store = { version: 1, memories: {} };
      this.dirty = true;
      this.logger.info('Initialized new memory store');
    }
  }

  private async flushStore(): Promise<void> {
    if (!this.dirty) return;

    try {
      const dir = path.dirname(this.storePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.storePath, JSON.stringify(this.store, null, 2), 'utf-8');
      this.dirty = false;
      this.logger.debug('Memory store flushed to disk');
    } catch (err) {
      this.logger.error('Failed to flush memory store', err);
    }
  }

  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      this.flushStore().catch((err) => {
        this.logger.error('Flush interval error', err);
      });
    }, this.flushIntervalMs);
  }

  private stopFlushInterval(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  // ─── Tool implementations ──────────────────────────────────────────────────

  private async executeSaveMemory(args: Record<string, unknown>): Promise<ToolResult> {
    const key = args.key as string;
    const value = args.value as string;
    const category = (args.category as string) || 'general';
    const now = new Date().toISOString();

    const existing = this.store.memories[key];
    const entry: MemoryEntry = {
      key,
      value,
      category,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      accessCount: existing?.accessCount || 0,
      lastAccessedAt: now,
    };

    this.store.memories[key] = entry;
    this.dirty = true;

    return this.success(
      `Memory saved: "${key}" (${category})${existing ? ' (updated)' : ''}`,
      { key, category, isNew: !existing },
    );
  }

  private async executeRecallMemory(args: Record<string, unknown>): Promise<ToolResult> {
    const key = args.key as string | undefined;
    const category = args.category as string | undefined;

    if (key) {
      const entry = this.store.memories[key];
      if (!entry) {
        return this.error(`Memory "${key}" not found`);
      }

      // Update access tracking
      entry.accessCount++;
      entry.lastAccessedAt = new Date().toISOString();
      this.dirty = true;

      return this.success(entry.value, {
        key: entry.key,
        category: entry.category,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        accessCount: entry.accessCount,
      });
    }

    // List by category or return all
    let entries = Object.values(this.store.memories);

    if (category) {
      entries = entries.filter((e) => e.category === category);
    }

    if (entries.length === 0) {
      return this.success(
        `No memories found${category ? ` in category "${category}"` : ''}`,
        { count: 0, category },
      );
    }

    const output = entries
      .map((e) => `[${e.category}] ${e.key}: ${e.value}`)
      .join('\n');

    return this.success(output, { count: entries.length, category });
  }

  private async executeDeleteMemory(args: Record<string, unknown>): Promise<ToolResult> {
    const key = args.key as string;

    if (!(key in this.store.memories)) {
      return this.error(`Memory "${key}" not found`);
    }

    delete this.store.memories[key];
    this.dirty = true;

    return this.success(`Memory "${key}" deleted`, { deletedKey: key });
  }

  private async executeListMemories(args: Record<string, unknown>): Promise<ToolResult> {
    const category = args.category as string | undefined;

    let entries = Object.values(this.store.memories);

    if (category) {
      entries = entries.filter((e) => e.category === category);
    }

    if (entries.length === 0) {
      return this.success(
        `No memories stored${category ? ` in category "${category}"` : ''}`,
        { count: 0 },
      );
    }

    // Group by category
    const grouped: Record<string, MemoryEntry[]> = {};
    for (const entry of entries) {
      if (!grouped[entry.category]) {
        grouped[entry.category] = [];
      }
      grouped[entry.category].push(entry);
    }

    const output: string[] = [];
    for (const [cat, catEntries] of Object.entries(grouped)) {
      output.push(`\n📂 ${cat} (${catEntries.length}):`);
      for (const entry of catEntries) {
        const updated = new Date(entry.updatedAt).toLocaleDateString();
        output.push(`  • ${entry.key}: ${entry.value.substring(0, 80)}${entry.value.length > 80 ? '...' : ''} [${updated}]`);
      }
    }

    return this.success(output.join('\n'), {
      count: entries.length,
      categories: Object.keys(grouped),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory function
// ─────────────────────────────────────────────────────────────────────────────

export function createMemoryExtension(): ExtensionConfig {
  return {
    id: 'memory',
    type: ExtensionType.Memory,
    name: 'Memory',
    description: 'Persistent memory storage across sessions with categories and search',
    version: '1.0.0',
    enabled: true,
    settings: {
      storePath: '',
      flushIntervalMs: 5000,
      maxMemorySize: 10000,
    },
    builtin: true,
    installedAt: new Date().toISOString(),
  };
}
