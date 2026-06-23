/**
 * OpenAgent-Desktop — TodoWriteCard (Phase 10.9 — Dropdown style)
 *
 * A compact trigger bar that sits above the composer (not connected to it).
 * On hover/click, the full todo list expands UPWARDS as a floating dropdown
 * — like DaisyUI's dropdown but styled for our app + expanding upward.
 *
 *   ┌─────────────────────────────────┐
 *   │  ●  Task 2                      │ ← dropdown (expands upward)
 *   │  ○  Task 3                      │
 *   └─────────────────────────────────┘
 *   ┌─────────────────────────────────┐
 *   │  ☰ 2/3 complete            ▲   │ ← trigger bar (always visible)
 *   └─────────────────────────────────┘
 *   ┌─────────────────────────────────┐
 *   │  Composer (input area)          │
 *   └─────────────────────────────────┘
 *
 * Auto-fades out 1.5s after all tasks complete.
 */

import React, { useState, useEffect, useRef } from 'react';

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
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const completed = todos?.filter(t => t.status === 'completed').length || 0;
  const total = todos?.length || 0;
  const allDone = total > 0 && completed === total;

  useEffect(() => {
    if (allDone && !isStreaming && !fadingOut && !hidden) {
      const fadeTimer = setTimeout(() => setFadingOut(true), 1500);
      const hideTimer = setTimeout(() => setHidden(true), 2200);
      return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer); };
    }
  }, [allDone, isStreaming, fadingOut, hidden]);

  if (cleared || !todos || todos.length === 0 || hidden) return null;

  const inProgressItem = todos.find(t => t.status === 'in_progress');

  return (
    <div
      ref={containerRef}
      className="relative transition-opacity duration-500 mx-4 mb-1"
      style={{ opacity: fadingOut ? 0 : 1 }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* ─── Dropdown content (expands UPWARD) ─────────────────────── */}
      {expanded && (
        <div
          className="absolute bottom-full left-0 right-0 mb-1 rounded-xl overflow-hidden animate-fade-in"
          style={{
            background: 'var(--color-bg-elevated, var(--color-bg-secondary))',
            border: '1px solid var(--color-border-primary)',
            boxShadow: '0 -4px 16px rgba(0,0,0,0.2)',
            zIndex: 50,
            maxHeight: '300px',
            overflowY: 'auto',
          }}
        >
          {/* Progress header inside dropdown */}
          <div
            className="flex items-center gap-2 px-3 py-2 border-b"
            style={{ borderColor: 'var(--color-border-secondary)', background: 'var(--color-bg-tertiary)' }}
          >
            {/* Progress bar */}
            <div
              className="h-1 rounded-full overflow-hidden flex-1"
              style={{ background: 'var(--color-border-secondary)' }}
            >
              <div
                className="h-full transition-all duration-500 rounded-full"
                style={{
                  width: `${total > 0 ? (completed / total) * 100 : 0}%`,
                  background: allDone ? 'var(--color-success, #10b981)' : 'var(--color-accent)',
                }}
              />
            </div>
            <span className="text-[10px] font-medium tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
              {completed}/{total}
            </span>
          </div>

          {/* Todo items */}
          <div className="p-1.5">
            {todos.map((todo, idx) => (
              <TodoRow key={todo.id || idx} todo={todo} />
            ))}
          </div>
        </div>
      )}

      {/* ─── Trigger bar (always visible, sits above composer) ─────── */}
      <div
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg cursor-default transition-colors"
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border-secondary)',
        }}
      >
        {/* Status icon */}
        <span className="flex-shrink-0 flex items-center justify-center w-3.5 h-3.5">
          {allDone ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-success, #10b981)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          )}
        </span>

        {/* Current task or summary */}
        <span className="text-xs flex-1 min-w-0 truncate" style={{ color: 'var(--color-text-secondary)' }}>
          {inProgressItem ? inProgressItem.content : allDone ? 'All tasks complete' : `${completed}/${total} tasks`}
        </span>

        {/* Progress count */}
        <span
          className="text-[10px] font-medium tabular-nums px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{
            background: allDone ? 'rgba(16,185,129,0.1)' : 'var(--color-accent-soft)',
            color: allDone ? 'var(--color-success, #10b981)' : 'var(--color-accent)',
          }}
        >
          {completed}/{total}
        </span>

        {/* Expand indicator */}
        <svg
          width="10" height="10" viewBox="0 0 12 12" fill="none"
          stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          className="flex-shrink-0 transition-transform"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <path d="M3 7L6 4L9 7" />
        </svg>
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
    <div className="flex items-center gap-2 px-2 py-1 rounded-md transition-colors" style={{ opacity }}>
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
