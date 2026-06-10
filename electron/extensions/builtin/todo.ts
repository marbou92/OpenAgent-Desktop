/**
 * OpenAgent Desktop - Todo Extension
 *
 * Built-in extension enabled by default for task management:
 * - create_todo: Create a task
 * - update_todo: Update a task
 * - delete_todo: Delete a task
 * - list_todos: List tasks with filters
 * - complete_todo: Mark a task as complete
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
// Todo data structures
// ─────────────────────────────────────────────────────────────────────────────

type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
type TodoPriority = 'low' | 'medium' | 'high' | 'critical';

interface TodoItem {
  id: string;
  title: string;
  description: string;
  status: TodoStatus;
  priority: TodoPriority;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  tags: string[];
  parentTaskId: string | null;
  subtaskIds: string[];
  metadata: Record<string, unknown>;
}

interface TodoStore {
  version: number;
  todos: Record<string, TodoItem>;
  nextId: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Todo Extension class
// ─────────────────────────────────────────────────────────────────────────────

export class TodoExtension extends BaseExtension {
  private storePath: string;
  private store: TodoStore;
  private dirty: boolean = false;
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: ExtensionConfig) {
    super(config);
    this.storePath = this.getSetting<string>(
      'storePath',
      path.join(os.homedir(), '.openagent', 'todos', 'todos.json'),
    );
    this.store = { version: 1, todos: {}, nextId: 1 };
  }

  protected registerTools(): void {
    this.registerTool(
      {
        name: 'create_todo',
        description: 'Create a new task with title, description, and priority.',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Title of the task',
            },
            description: {
              type: 'string',
              description: 'Detailed description of the task',
              default: '',
            },
            priority: {
              type: 'string',
              description: 'Priority level',
              enum: ['low', 'medium', 'high', 'critical'],
              default: 'medium',
            },
          },
          required: ['title'],
        },
      },
      this.executeCreateTodo.bind(this),
    );

    this.registerTool(
      {
        name: 'update_todo',
        description: 'Update an existing task. Provide the task ID and fields to update.',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID of the task to update',
            },
            updates: {
              type: 'object',
              description: 'Fields to update (title, description, priority, status, tags)',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] },
                tags: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          required: ['id', 'updates'],
        },
      },
      this.executeUpdateTodo.bind(this),
    );

    this.registerTool(
      {
        name: 'delete_todo',
        description: 'Delete a task by ID.',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID of the task to delete',
            },
          },
          required: ['id'],
        },
      },
      this.executeDeleteTodo.bind(this),
    );

    this.registerTool(
      {
        name: 'list_todos',
        description: 'List tasks with optional filters for status and priority.',
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              description: 'Filter by status',
              enum: ['pending', 'in_progress', 'completed', 'cancelled'],
            },
            priority: {
              type: 'string',
              description: 'Filter by priority',
              enum: ['low', 'medium', 'high', 'critical'],
            },
          },
        },
      },
      this.executeListTodos.bind(this),
    );

    this.registerTool(
      {
        name: 'complete_todo',
        description: 'Mark a task as completed.',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID of the task to complete',
            },
          },
          required: ['id'],
        },
      },
      this.executeCompleteTodo.bind(this),
    );

    this.setPermissions([
      {
        level: PermissionLevel.Read,
        reason: 'Manage task list',
        resources: ['todo-store'],
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
      this.store = JSON.parse(data) as TodoStore;
      this.logger.info(`Loaded ${Object.keys(this.store.todos).length} todos`);
    } catch {
      this.store = { version: 1, todos: {}, nextId: 1 };
      this.dirty = true;
    }
  }

  private async flushStore(): Promise<void> {
    if (!this.dirty) return;
    try {
      const dir = path.dirname(this.storePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.storePath, JSON.stringify(this.store, null, 2), 'utf-8');
      this.dirty = false;
    } catch (err) {
      this.logger.error('Failed to flush todo store', err);
    }
  }

  private generateId(): string {
    const id = `todo_${this.store.nextId}`;
    this.store.nextId++;
    this.dirty = true;
    return id;
  }

  // ─── Tool implementations ──────────────────────────────────────────────────

  private async executeCreateTodo(args: Record<string, unknown>): Promise<ToolResult> {
    const title = args.title as string;
    const description = (args.description as string) || '';
    const priority = (args.priority as TodoPriority) || 'medium';
    const now = new Date().toISOString();

    const id = this.generateId();
    const todo: TodoItem = {
      id,
      title,
      description,
      status: 'pending',
      priority,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      tags: [],
      parentTaskId: null,
      subtaskIds: [],
      metadata: {},
    };

    this.store.todos[id] = todo;
    this.dirty = true;

    return this.success(
      `Task created: [${id}] "${title}" (${priority})`,
      { id, title, priority },
    );
  }

  private async executeUpdateTodo(args: Record<string, unknown>): Promise<ToolResult> {
    const id = args.id as string;
    const updates = args.updates as Record<string, unknown>;

    const todo = this.store.todos[id];
    if (!todo) {
      return this.error(`Task "${id}" not found`);
    }

    const allowedFields = ['title', 'description', 'priority', 'status', 'tags'];
    const appliedUpdates: string[] = [];

    for (const field of allowedFields) {
      if (field in updates && updates[field] !== undefined) {
        (todo as Record<string, unknown>)[field] = updates[field];
        appliedUpdates.push(field);
      }
    }

    if (appliedUpdates.length === 0) {
      return this.error('No valid fields provided to update');
    }

    todo.updatedAt = new Date().toISOString();

    if (updates.status === 'completed' && !todo.completedAt) {
      todo.completedAt = new Date().toISOString();
    }

    this.dirty = true;

    return this.success(
      `Task [${id}] updated: ${appliedUpdates.join(', ')}`,
      { id, updatedFields: appliedUpdates },
    );
  }

  private async executeDeleteTodo(args: Record<string, unknown>): Promise<ToolResult> {
    const id = args.id as string;

    if (!(id in this.store.todos)) {
      return this.error(`Task "${id}" not found`);
    }

    // Remove from parent's subtask list if applicable
    const todo = this.store.todos[id];
    if (todo.parentTaskId && this.store.todos[todo.parentTaskId]) {
      const parent = this.store.todos[todo.parentTaskId];
      parent.subtaskIds = parent.subtaskIds.filter((sid) => sid !== id);
    }

    delete this.store.todos[id];
    this.dirty = true;

    return this.success(`Task "${id}" deleted`, { deletedId: id });
  }

  private async executeListTodos(args: Record<string, unknown>): Promise<ToolResult> {
    const status = args.status as TodoStatus | undefined;
    const priority = args.priority as TodoPriority | undefined;

    let todos = Object.values(this.store.todos);

    if (status) {
      todos = todos.filter((t) => t.status === status);
    }
    if (priority) {
      todos = todos.filter((t) => t.priority === priority);
    }

    if (todos.length === 0) {
      return this.success(
        `No tasks found${status ? ` with status "${status}"` : ''}${priority ? ` and priority "${priority}"` : ''}`,
        { count: 0, status, priority },
      );
    }

    // Sort by priority (critical first), then by creation date
    const priorityOrder: Record<TodoPriority, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };
    todos.sort((a, b) => {
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    const statusIcons: Record<TodoStatus, string> = {
      pending: '⬜',
      in_progress: '🔄',
      completed: '✅',
      cancelled: '❌',
    };

    const output = todos
      .map((t) => {
        const icon = statusIcons[t.status];
        const priorityBadge = t.priority === 'critical' ? ' 🔴' : t.priority === 'high' ? ' 🟡' : '';
        return `${icon} [${t.id}] ${t.title}${priorityBadge}${t.description ? ` — ${t.description.substring(0, 60)}` : ''}`;
      })
      .join('\n');

    return this.success(output, { count: todos.length, status, priority });
  }

  private async executeCompleteTodo(args: Record<string, unknown>): Promise<ToolResult> {
    const id = args.id as string;

    const todo = this.store.todos[id];
    if (!todo) {
      return this.error(`Task "${id}" not found`);
    }

    if (todo.status === 'completed') {
      return this.success(`Task "${id}" is already completed`, { id, alreadyCompleted: true });
    }

    const now = new Date().toISOString();
    todo.status = 'completed';
    todo.completedAt = now;
    todo.updatedAt = now;
    this.dirty = true;

    return this.success(
      `✅ Task [${id}] "${todo.title}" completed!`,
      { id, completedAt: now },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory function
// ─────────────────────────────────────────────────────────────────────────────

export function createTodoExtension(): ExtensionConfig {
  return {
    id: 'todo',
    type: ExtensionType.Todo,
    name: 'Todo',
    description: 'Task management with priorities, statuses, and persistence across sessions',
    version: '1.0.0',
    enabled: true,
    settings: {
      storePath: '',
    },
    builtin: true,
    installedAt: new Date().toISOString(),
  };
}
