/**
 * OpenAgent-Desktop — TodoPanel (Phase 8.3)
 *
 * Renders the agent's todo list for the current session. The agent writes
 * todos via the TodoWrite tool; main.ts persists them to the TodoStore and
 * forwards todos:updated events to the renderer. We subscribe on mount.
 *
 * Layout:
 *   - Header with summary ("3/5 complete") + clear button
 *   - Grouped sections: In Progress → Pending → Completed → Cancelled
 *   - Each todo: status icon + content + priority badge + relative time
 *
 * Empty state: friendly message telling the user the agent hasn't laid
 * out a plan yet (and a hint to ask it to).
 */

import React, { useEffect, useState } from 'react';
import { TodoItem, TodoStatus } from '../../../types';

interface TodoPanelProps {
  sessionId: string | null;
}

const api = (window as any).openagent;

const STATUS_META: Record<TodoStatus, { label: string; color: string; bg: string; icon: string }> = {
  in_progress: {
    label: 'In Progress',
    color: 'var(--color-accent)',
    bg: 'var(--color-accent-soft)',
    icon: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z M12 6a6 6 0 0 0-6 6h2a4 4 0 0 1 4-4z',
  },
  pending: {
    label: 'Pending',
    color: 'var(--color-text-tertiary)',
    bg: 'var(--color-bg-tertiary)',
    icon: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z',
  },
  completed: {
    label: 'Completed',
    color: 'var(--color-success, #10b981)',
    bg: 'rgba(16,185,129,0.08)',
    icon: 'M20 6L9 17l-5-5',
  },
  cancelled: {
    label: 'Cancelled',
    color: 'var(--color-text-muted)',
    bg: 'var(--color-bg-tertiary)',
    icon: 'M18 6L6 18 M6 6l12 12',
  },
};

const PRIORITY_BADGE: Record<string, { label: string; color: string }> = {
  high: { label: 'high', color: 'var(--color-error)' },
  medium: { label: 'med', color: 'var(--color-text-tertiary)' },
  low: { label: 'low', color: 'var(--color-text-muted)' },
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const delta = Date.now() - then;
  if (delta < 60_000) return 'just now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}

export const TodoPanel: React.FC<TodoPanelProps> = ({ sessionId }) => {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Initial load + subscribe to live updates.
  useEffect(() => {
    if (!sessionId) {
      setTodos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    api?.todos?.list(sessionId).then((list: TodoItem[]) => {
      setTodos(list || []);
      setLoading(false);
    }).catch(() => setLoading(false));

    const unsub = api?.on?.todosUpdated?.((data: { sessionId: string; todos: TodoItem[] }) => {
      if (data.sessionId !== sessionId) return;
      setTodos(data.todos || []);
    });
    return () => unsub?.();
  }, [sessionId]);

  const handleClear = async () => {
    if (!sessionId) return;
    if (!confirm('Clear all todos for this session?')) return;
    try {
      await api?.todos?.clear(sessionId);
      setTodos([]);
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
        Loading todos...
      </div>
    );
  }

  if (!todos.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 opacity-60">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
        <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          No todos yet
        </p>
        <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
          Ask the agent to plan a multi-step task and it'll lay out a todo list here.
        </p>
      </div>
    );
  }

  // Group by status, in display order.
  const groups: Array<{ status: TodoStatus; items: TodoItem[] }> = [
    { status: 'in_progress', items: todos.filter(t => t.status === 'in_progress') },
    { status: 'pending', items: todos.filter(t => t.status === 'pending') },
    { status: 'completed', items: todos.filter(t => t.status === 'completed') },
    { status: 'cancelled', items: todos.filter(t => t.status === 'cancelled') },
  ];

  const completed = todos.filter(t => t.status === 'completed').length;
  const inProgress = todos.filter(t => t.status === 'in_progress').length;
  const pct = todos.length > 0 ? Math.round((completed / todos.length) * 100) : 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: 'var(--color-bg-secondary)' }}>
      {/* Header */}
      <div className="px-4 py-2 border-b flex-shrink-0" style={{ borderColor: 'var(--color-border-secondary)' }}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {completed}/{todos.length} complete{inProgress > 0 ? ` · ${inProgress} in progress` : ''}
          </div>
          <button
            onClick={handleClear}
            className="text-[10px] px-2 py-0.5 rounded transition-colors"
            style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg-tertiary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)'; }}
            title="Clear all todos"
          >
            Clear
          </button>
        </div>
        {/* Progress bar */}
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-bg-tertiary)' }}>
          <div
            className="h-full transition-all duration-300"
            style={{ width: `${pct}%`, background: 'var(--color-success, #10b981)' }}
          />
        </div>
      </div>

      {/* Grouped lists */}
      <div className="flex-1 p-2.5 space-y-2">
        {groups.map(group => {
          if (group.items.length === 0) return null;
          const meta = STATUS_META[group.status];
          return (
            <div key={group.status}>
              <div className="flex items-center gap-1.5 mb-1.5 px-1">
                <span
                  className="text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: meta.color }}
                >
                  {meta.label}
                </span>
                <span
                  className="text-[10px] px-1 py-0 rounded-full"
                  style={{ background: meta.bg, color: meta.color }}
                >
                  {group.items.length}
                </span>
              </div>
              <div className="space-y-1">
                {group.items.map(todo => (
                  <TodoRow key={todo.id} todo={todo} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const TodoRow: React.FC<{ todo: TodoItem }> = ({ todo }) => {
  const meta = STATUS_META[todo.status];
  const prio = PRIORITY_BADGE[todo.priority] || PRIORITY_BADGE.medium;
  const isDone = todo.status === 'completed';
  const isCancelled = todo.status === 'cancelled';
  return (
    <div
      className="flex items-start gap-2.5 px-2.5 py-2 rounded-md text-xs"
      style={{
        background: 'var(--color-bg-primary)',
        border: '1px solid var(--color-border-secondary)',
        opacity: isCancelled ? 0.6 : 1,
      }}
    >
      {/* Status icon */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke={meta.color}
        strokeWidth={isDone ? 3 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 flex-shrink-0"
      >
        <path d={meta.icon} />
      </svg>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div
          className="leading-snug"
          style={{
            color: isCancelled ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
            textDecoration: isDone ? 'line-through' : 'none',
          }}
        >
          {todo.content}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span
            className="text-[10px] px-1 py-0 rounded font-mono uppercase"
            style={{ color: prio.color, background: 'var(--color-bg-tertiary)' }}
            title={`Priority: ${todo.priority}`}
          >
            {prio.label}
          </span>
          {todo.updatedAt && (
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              {relativeTime(todo.updatedAt)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default TodoPanel;
