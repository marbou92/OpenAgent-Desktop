/**
 * OpenAgent-Desktop — TodoWriteCard (Phase 9.4)
 *
 * Renders a TodoWrite tool call INLINE in the chat message — shows the
 * todo list as a checklist with status icons, priority badges, and a
 * progress bar. This is in addition to the side-panel TodoPanel.
 *
 * The card renders the todos from the tool call's arguments (not from
 * the TodoStore) so it shows what the agent INTENDED at that point in
 * the conversation — historical todo states are preserved per message.
 */

import React, { useState } from 'react';

interface TodoItem {
  id?: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority?: 'high' | 'medium' | 'low';
}

interface TodoWriteCardProps {
  todos: TodoItem[];
  isStreaming?: boolean;
}

const STATUS_ICON: Record<TodoItem['status'], { icon: string; color: string }> = {
  in_progress: { icon: '◐', color: 'var(--color-accent)' },
  pending: { icon: '○', color: 'var(--color-text-muted)' },
  completed: { icon: '✓', color: 'var(--color-success, #10b981)' },
  cancelled: { icon: '✕', color: 'var(--color-text-muted)' },
};

const PRIORITY_COLOR: Record<string, string> = {
  high: 'var(--color-error)',
  medium: 'var(--color-text-tertiary)',
  low: 'var(--color-text-muted)',
};

export const TodoWriteCard: React.FC<TodoWriteCardProps> = ({ todos, isStreaming }) => {
  const [expanded, setExpanded] = useState(true);

  if (!todos || todos.length === 0) return null;

  const completed = todos.filter(t => t.status === 'completed').length;
  const inProgress = todos.filter(t => t.status === 'in_progress').length;
  const pct = todos.length > 0 ? Math.round((completed / todos.length) * 100) : 0;

  return (
    <div
      className="rounded-xl border my-2 overflow-hidden"
      style={{ borderColor: 'var(--color-border-primary)', background: 'var(--color-bg-secondary)' }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-3 py-2 transition-colors"
        style={{ background: 'var(--color-bg-tertiary)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
        <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {isStreaming ? 'Planning…' : 'Todo List'}
        </span>
        <span
          className="text-[10px] px-1.5 py-0 rounded-full"
          style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
        >
          {completed}/{todos.length}
        </span>
        {inProgress > 0 && (
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            · {inProgress} in progress
          </span>
        )}
        <div className="flex-1" />
        {/* Progress bar */}
        <div className="w-16 h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-bg-primary)' }}>
          <div
            className="h-full transition-all duration-300"
            style={{ width: `${pct}%`, background: 'var(--color-success, #10b981)' }}
          />
        </div>
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.15s', color: 'var(--color-text-muted)' }}
        >
          <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Todo items */}
      {expanded && (
        <div className="p-2 space-y-1 animate-fade-in">
          {todos.map((todo, idx) => {
            const meta = STATUS_ICON[todo.status] || STATUS_ICON.pending;
            const prio = todo.priority || 'medium';
            return (
              <div
                key={todo.id || idx}
                className="flex items-start gap-2.5 px-2 py-1.5 rounded-md"
                style={{
                  background: todo.status === 'in_progress' ? 'var(--color-accent-soft)' : 'transparent',
                  opacity: todo.status === 'cancelled' ? 0.5 : 1,
                }}
              >
                {/* Status icon */}
                <span
                  className="text-sm flex-shrink-0 mt-0.5"
                  style={{ color: meta.color, fontWeight: 'bold' }}
                >
                  {meta.icon}
                </span>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div
                    className="text-xs leading-snug"
                    style={{
                      color: todo.status === 'cancelled' ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                      textDecoration: todo.status === 'completed' ? 'line-through' : 'none',
                    }}
                  >
                    {todo.content}
                  </div>
                </div>
                {/* Priority badge */}
                {todo.priority && (
                  <span
                    className="text-[9px] px-1 py-0 rounded font-mono uppercase flex-shrink-0 mt-0.5"
                    style={{ color: PRIORITY_COLOR[prio], background: 'var(--color-bg-tertiary)' }}
                  >
                    {prio}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TodoWriteCard;
