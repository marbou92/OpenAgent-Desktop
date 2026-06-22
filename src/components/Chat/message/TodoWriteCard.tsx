/**
 * OpenAgent-Desktop — TodoWriteCard (Phase 10.6 — Codex CLI style)
 *
 * Minimal, compact todo list that matches the Codex CLI aesthetic:
 *   - No card borders, no header chrome — just the items
 *   - Small status circles: ○ pending, ● in-progress, ✓ done
 *   - Completed items are dimmed + strikethrough
 *   - In-progress item has a subtle accent highlight
 *   - Auto-fades out 2 seconds after all items complete
 *   - `clear: true` dismisses immediately
 *
 * The list stays inline where the agent created it. When the agent
 * finishes all tasks, the list fades away smoothly.
 */

import React, { useState, useEffect } from 'react';

interface TodoItem {
  id?: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority?: 'high' | 'medium' | 'low';
}

interface TodoWriteCardProps {
  todos: TodoItem[];
  isStreaming?: boolean;
  cleared?: boolean;
}

export const TodoWriteCard: React.FC<TodoWriteCardProps> = ({ todos, isStreaming, cleared }) => {
  const [fadingOut, setFadingOut] = useState(false);
  const [hidden, setHidden] = useState(false);

  const completed = todos?.filter(t => t.status === 'completed').length || 0;
  const total = todos?.length || 0;
  const allDone = total > 0 && completed === total;

  // Phase 10.6: Auto-fade when all done AND not streaming.
  // Wait 1.5 seconds, then fade out over 0.5s, then hide.
  useEffect(() => {
    if (allDone && !isStreaming && !fadingOut && !hidden) {
      const fadeTimer = setTimeout(() => setFadingOut(true), 1500);
      const hideTimer = setTimeout(() => setHidden(true), 2200);
      return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer); };
    }
  }, [allDone, isStreaming, fadingOut, hidden]);

  if (cleared || !todos || todos.length === 0 || hidden) return null;

  return (
    <div
      className="my-2 transition-opacity duration-500"
      style={{ opacity: fadingOut ? 0 : 1 }}
    >
      {/* Progress indicator — single line, very compact */}
      <div className="flex items-center gap-2 mb-1">
        {/* Progress bar — thin, minimal */}
        <div
          className="h-0.5 rounded-full overflow-hidden flex-1"
          style={{ background: 'var(--color-border-secondary)' }}
        >
          <div
            className="h-full transition-all duration-500 rounded-full"
            style={{
              width: `${total > 0 ? (completed / total) * 100 : 0}%`,
              background: allDone
                ? 'var(--color-success, #10b981)'
                : 'var(--color-accent)',
            }}
          />
        </div>
        <span
          className="text-[10px] font-medium tabular-nums flex-shrink-0"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {completed}/{total}
        </span>
      </div>

      {/* Todo items — ultra-compact Codex style */}
      <div>
        {todos.map((todo, idx) => (
          <TodoRow key={todo.id || idx} todo={todo} />
        ))}
      </div>
    </div>
  );
};

const TodoRow: React.FC<{ todo: TodoItem }> = ({ todo }) => {
  const status = todo.status || 'pending';

  let icon: React.ReactNode;
  let color: string;
  let textDecoration = 'none';
  let opacity = 1;

  switch (status) {
    case 'completed':
      icon = (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
      color = 'var(--color-success, #10b981)';
      textDecoration = 'line-through';
      opacity = 0.4;
      break;
    case 'in_progress':
      icon = (
        <span
          className="inline-block w-2.5 h-2.5 rounded-full"
          style={{ background: 'var(--color-accent)', animation: 'pulse 1.5s ease-in-out infinite' }}
        />
      );
      color = 'var(--color-accent)';
      break;
    case 'cancelled':
      icon = (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      );
      color = 'var(--color-text-muted)';
      opacity = 0.3;
      break;
    default:
      icon = (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
      color = 'var(--color-text-muted)';
      break;
  }

  return (
    <div
      className="flex items-center gap-2 py-0.5 transition-opacity"
      style={{ opacity }}
    >
      <span className="flex-shrink-0 flex items-center justify-center w-3 h-3" style={{ color }}>
        {icon}
      </span>
      <span
        className="text-xs flex-1 min-w-0 truncate"
        style={{
          color: status === 'completed' || status === 'cancelled'
            ? 'var(--color-text-muted)'
            : status === 'in_progress'
            ? 'var(--color-text-primary)'
            : 'var(--color-text-tertiary)',
          textDecoration,
          fontWeight: status === 'in_progress' ? 500 : 400,
        }}
      >
        {todo.content}
      </span>
    </div>
  );
};

export default TodoWriteCard;
