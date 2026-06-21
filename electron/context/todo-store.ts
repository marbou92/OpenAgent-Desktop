/**
 * OpenAgent-Desktop — Per-Session Todo Store (Phase 8.3)
 *
 * Stores the agent's todo list for each chat session. The agent calls the
 * `TodoWrite` tool with the full todo list; we persist it here and emit an
 * event so the renderer's TodoPanel can re-render in real time.
 *
 * Storage strategy:
 *   - In-memory Map<sessionId, Todo[]> — fast reads, survives across
 *     IPC calls within the same app run.
 *   - Persisted to userData/todos.json on every change so todos survive
 *     app restarts. Loaded lazily on first access.
 *
 * Concurrency:
 *   - Single-process (Electron main), so no locks needed.
 *   - Persistence is synchronous (fs.writeFileSync + rename) — todos are
 *     small (usually <10 items), so this is fast and avoids race conditions
 *     with the renderer reading stale state.
 *
 * Events:
 *   - 'updated' — emitted with { sessionId, todos } after every change.
 *     main.ts forwards this to the renderer via IPC.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TodoPriority = 'high' | 'medium' | 'low';

export interface Todo {
  /** Stable ID — the agent reuses the same ID when updating an existing todo. */
  id: string;
  /** Short imperative description, e.g. "Add input validation to login form". */
  content: string;
  status: TodoStatus;
  priority: TodoPriority;
  /** ISO timestamp of when this todo was first created. */
  createdAt: string;
  /** ISO timestamp of the last status change. */
  updatedAt: string;
}

export interface TodoUpdateEvent {
  sessionId: string;
  todos: Todo[];
}

const PERSIST_FILE = 'todos.json';

interface PersistShape {
  [sessionId: string]: Todo[];
}

class TodoStoreImpl extends EventEmitter {
  private sessions = new Map<string, Todo[]>();
  private persistPath: string | null = null;
  private loaded = false;

  /** Lazily compute the persist path (app.getPath may not be ready at module load). */
  private getPersistPath(): string {
    if (!this.persistPath) {
      this.persistPath = path.join(app.getPath('userData'), PERSIST_FILE);
    }
    return this.persistPath;
  }

  /** Load persisted todos from disk. Safe to call multiple times. */
  load(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const p = this.getPersistPath();
      if (!fs.existsSync(p)) return;
      const raw = fs.readFileSync(p, 'utf-8');
      const parsed = JSON.parse(raw) as PersistShape;
      if (parsed && typeof parsed === 'object') {
        for (const [sid, todos] of Object.entries(parsed)) {
          if (Array.isArray(todos)) {
            this.sessions.set(sid, todos);
          }
        }
      }
    } catch {
      // Corrupted file — ignore, will be overwritten on next save.
    }
  }

  /** Persist all sessions to disk atomically. */
  private save(): void {
    try {
      const p = this.getPersistPath();
      const payload: PersistShape = {};
      for (const [sid, todos] of this.sessions.entries()) {
        payload[sid] = todos;
      }
      const tmp = p + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf-8');
      fs.renameSync(tmp, p);
    } catch {
      // Best-effort persistence — don't crash the agent loop on disk errors.
    }
  }

  /**
   * Replace the todo list for a session. The agent always sends the FULL
   * list (not a delta), so this is a simple assignment + status timestamp
   * bump for any todo whose status changed.
   */
  setTodos(sessionId: string, incoming: Array<{ id: string; content: string; status: TodoStatus; priority?: TodoPriority }>): Todo[] {
    this.load();
    const now = new Date().toISOString();
    const prev = this.sessions.get(sessionId) || [];
    const prevById = new Map(prev.map(t => [t.id, t]));

    const next: Todo[] = incoming.map(item => {
      const existing = prevById.get(item.id);
      const status = item.status || 'pending';
      // If status changed (or this is a new todo), bump updatedAt.
      const updatedAt = (!existing || existing.status !== status) ? now : (existing.updatedAt || now);
      return {
        id: item.id,
        content: item.content,
        status,
        priority: item.priority || existing?.priority || 'medium',
        createdAt: existing?.createdAt || now,
        updatedAt,
      };
    });

    this.sessions.set(sessionId, next);
    this.save();
    this.emit('updated', { sessionId, todos: next } as TodoUpdateEvent);
    return next;
  }

  /** Get the current todos for a session (empty array if none). */
  getTodos(sessionId: string): Todo[] {
    this.load();
    return this.sessions.get(sessionId) || [];
  }

  /** Clear todos for a session (e.g. when the session is deleted). */
  clear(sessionId: string): void {
    if (this.sessions.has(sessionId)) {
      this.sessions.delete(sessionId);
      this.save();
      this.emit('updated', { sessionId, todos: [] } as TodoUpdateEvent);
    }
  }

  /** Get a quick summary — used by the UI badge on the tab. */
  getSummary(sessionId: string): { total: number; completed: number; inProgress: number; pending: number } {
    const todos = this.getTodos(sessionId);
    return {
      total: todos.length,
      completed: todos.filter(t => t.status === 'completed').length,
      inProgress: todos.filter(t => t.status === 'in_progress').length,
      pending: todos.filter(t => t.status === 'pending').length,
    };
  }
}

// Singleton
let _store: TodoStoreImpl | null = null;
export function getTodoStore(): TodoStoreImpl {
  if (!_store) _store = new TodoStoreImpl();
  return _store;
}
