/**
 * OpenAgent Desktop - Top of Mind Extension
 *
 * Manages persistent instructions injected every turn:
 * - set_persistent_instructions: Inject every turn
 * - get_persistent_instructions: Get current instructions
 * - clear_persistent_instructions: Clear
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
// Persistent instructions data structure
// ─────────────────────────────────────────────────────────────────────────────

interface PersistentInstruction {
  id: string;
  instructions: string;
  priority: number;
  createdAt: string;
  updatedAt: string;
  active: boolean;
  category: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Top of Mind Extension class
// ─────────────────────────────────────────────────────────────────────────────

export class TopOfMindExtension extends BaseExtension {
  private storePath: string;
  private instructions: Map<string, PersistentInstruction> = new Map();
  private dirty: boolean = false;
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private instructionCounter: number = 0;

  constructor(config: ExtensionConfig) {
    super(config);
    this.storePath = this.getSetting<string>(
      'storePath',
      path.join(os.homedir(), '.openagent', 'top-of-mind', 'instructions.json'),
    );
  }

  protected registerTools(): void {
    this.registerTool(
      {
        name: 'set_persistent_instructions',
        description:
          'Set instructions that will be injected into every conversation turn. ' +
          'These serve as persistent context/reminders for the AI agent. ' +
          'Useful for maintaining coding standards, project context, or behavioral preferences.',
        parameters: {
          type: 'object',
          properties: {
            instructions: {
              type: 'string',
              description: 'The instructions text to inject every turn',
            },
            category: {
              type: 'string',
              description: 'Category for the instructions (default: "general")',
              default: 'general',
            },
            priority: {
              type: 'integer',
              description: 'Priority (higher = injected first, default: 0)',
              minimum: -100,
              maximum: 100,
              default: 0,
            },
            replace_existing: {
              type: 'boolean',
              description: 'Replace all existing instructions in this category (default: false)',
              default: false,
            },
          },
          required: ['instructions'],
        },
      },
      this.executeSetPersistentInstructions.bind(this),
    );

    this.registerTool(
      {
        name: 'get_persistent_instructions',
        description:
          'Get the current persistent instructions that are injected every turn. ' +
          'Returns all active instructions sorted by priority.',
        parameters: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'Filter by category (omit for all)',
            },
          },
        },
      },
      this.executeGetPersistentInstructions.bind(this),
    );

    this.registerTool(
      {
        name: 'clear_persistent_instructions',
        description:
          'Clear persistent instructions. Can clear by category or all at once.',
        parameters: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'Clear instructions in this category only (omit for all)',
            },
            instruction_id: {
              type: 'string',
              description: 'Clear a specific instruction by ID',
            },
          },
        },
      },
      this.executeClearPersistentInstructions.bind(this),
    );

    this.setPermissions([
      {
        level: PermissionLevel.Read,
        reason: 'Manage persistent instruction context',
        resources: ['instructions'],
      },
    ]);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  protected async onInitialize(): Promise<void> {
    await this.loadStore();
    this.flushInterval = setInterval(() => {
      this.flushStore().catch((err) => this.logger.error('Flush error', err));
    }, 5000);
  }

  protected async onShutdown(): Promise<void> {
    if (this.flushInterval) clearInterval(this.flushInterval);
    await this.flushStore();
  }

  // ─── Store persistence ─────────────────────────────────────────────────────

  private async loadStore(): Promise<void> {
    try {
      const dir = path.dirname(this.storePath);
      await fs.mkdir(dir, { recursive: true });
      const data = await fs.readFile(this.storePath, 'utf-8');
      const parsed = JSON.parse(data) as { instructions: PersistentInstruction[]; nextId: number };
      this.instructionCounter = parsed.nextId || 0;
      for (const inst of parsed.instructions) {
        this.instructions.set(inst.id, inst);
      }
      this.logger.info(`Loaded ${this.instructions.size} persistent instructions`);
    } catch {
      this.instructionCounter = 0;
      this.dirty = true;
    }
  }

  private async flushStore(): Promise<void> {
    if (!this.dirty) return;
    try {
      const dir = path.dirname(this.storePath);
      await fs.mkdir(dir, { recursive: true });
      const data = {
        instructions: Array.from(this.instructions.values()),
        nextId: this.instructionCounter,
      };
      await fs.writeFile(this.storePath, JSON.stringify(data, null, 2), 'utf-8');
      this.dirty = false;
    } catch (err) {
      this.logger.error('Failed to flush instructions store', err);
    }
  }

  private generateId(): string {
    return `inst_${++this.instructionCounter}`;
  }

  /**
   * Get all active instructions as a combined string.
   * This is the method called by the agent loop to inject instructions.
   */
  getCombinedInstructions(): string {
    const active = Array.from(this.instructions.values())
      .filter((inst) => inst.active)
      .sort((a, b) => b.priority - a.priority);

    if (active.length === 0) return '';

    return active
      .map((inst) => `[${inst.category}] ${inst.instructions}`)
      .join('\n\n');
  }

  // ─── Tool implementations ──────────────────────────────────────────────────

  private async executeSetPersistentInstructions(args: Record<string, unknown>): Promise<ToolResult> {
    const instructions = args.instructions as string;
    const category = (args.category as string) || 'general';
    const priority = (args.priority as number) || 0;
    const replaceExisting = args.replace_existing as boolean;

    if (replaceExisting) {
      // Remove all existing instructions in this category
      for (const [id, inst] of this.instructions) {
        if (inst.category === category) {
          this.instructions.delete(id);
        }
      }
    }

    const now = new Date().toISOString();
    const id = this.generateId();

    const instruction: PersistentInstruction = {
      id,
      instructions,
      priority,
      createdAt: now,
      updatedAt: now,
      active: true,
      category,
    };

    this.instructions.set(id, instruction);
    this.dirty = true;

    return this.success(
      `Persistent instructions set [${id}] in category "${category}" with priority ${priority}.\n` +
      `These will be injected into every conversation turn.\n\n` +
      `Instructions: ${instructions.substring(0, 200)}${instructions.length > 200 ? '...' : ''}`,
      { id, category, priority },
    );
  }

  private async executeGetPersistentInstructions(args: Record<string, unknown>): Promise<ToolResult> {
    const category = args.category as string | undefined;

    let instructions = Array.from(this.instructions.values());

    if (category) {
      instructions = instructions.filter((inst) => inst.category === category);
    }

    if (instructions.length === 0) {
      return this.success(
        `No persistent instructions${category ? ` in category "${category}"` : ''}`,
        { count: 0 },
      );
    }

    // Sort by priority
    instructions.sort((a, b) => b.priority - a.priority);

    const output = instructions
      .map((inst) => {
        const activeIcon = inst.active ? '🟢' : '⚪';
        return `${activeIcon} [${inst.id}] Priority ${inst.priority} — ${inst.category}\n   ${inst.instructions.substring(0, 150)}${inst.instructions.length > 150 ? '...' : ''}`;
      })
      .join('\n\n');

    return this.success(output, { count: instructions.length, category });
  }

  private async executeClearPersistentInstructions(args: Record<string, unknown>): Promise<ToolResult> {
    const category = args.category as string | undefined;
    const instructionId = args.instruction_id as string | undefined;

    if (instructionId) {
      if (!this.instructions.has(instructionId)) {
        return this.error(`Instruction "${instructionId}" not found`);
      }
      this.instructions.delete(instructionId);
      this.dirty = true;
      return this.success(`Instruction "${instructionId}" cleared`, { clearedId: instructionId });
    }

    if (category) {
      let count = 0;
      for (const [id, inst] of this.instructions) {
        if (inst.category === category) {
          this.instructions.delete(id);
          count++;
        }
      }
      this.dirty = true;
      return this.success(`Cleared ${count} instruction(s) in category "${category}"`, { clearedCount: count, category });
    }

    // Clear all
    const count = this.instructions.size;
    this.instructions.clear();
    this.dirty = true;
    return this.success(`Cleared all ${count} persistent instructions`, { clearedCount: count });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory function
// ─────────────────────────────────────────────────────────────────────────────

export function createTopOfMindExtension(): ExtensionConfig {
  return {
    id: 'top_of_mind',
    type: ExtensionType.TopOfMind,
    name: 'Top of Mind',
    description: 'Manage persistent instructions injected into every conversation turn',
    version: '1.0.0',
    enabled: false,
    settings: {
      storePath: '',
      maxInstructions: 50,
    },
    builtin: true,
    installedAt: new Date().toISOString(),
  };
}
