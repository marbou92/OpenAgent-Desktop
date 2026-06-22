/**
 * OpenAgent-Desktop — TodoWriteCard (Phase 11.1 — Pill button + hover expand)
 *
 * A small pill-shaped button that shows the current progress (e.g. "2/3").
 * Centered above the composer. On hover, the full todo list expands upward
 * with a smooth scale + fade animation.
 *
 *   ┌─────────────────────────────────┐
 *   │  ●  Task 2                      │ ← expanded list (animates in)
 *   │  ○  Task 3                      │
 *   │  ─────────────                  │
 *   │  ████░░░░  2/3                  │
 *   └─────────────────────────────────┘
 *            ╭──────────╮
 *            │  2/3  ▲  │              ← pill button (centered, small)
 *            ╰──────────╯
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
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const completed = todos?.filter(t => t.status === 'completed').length || 0;
  const total = todos?.length || 0;
  const allDone = total > 0 && completed === total;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const inProgressItem = todos?.find(t => t.status === 'in_progress');

  // Phase 11.2: Reset hidden state when new todos arrive (e.g. agent creates
  // a new todo list after the previous one auto-dismissed).
  useEffect(() => {
    if (todos && todos.length > 0 && !allDone) {
      setHidden(false);
      setFadingOut(false);
    }
  }, [todos, allDone]);

  useEffect(() => {
    if (allDone && !isStreaming && !fadingOut && !hidden) {
      const fadeTimer = setTimeout(() => setFadingOut(true), 1500);
      const hideTimer = setTimeout(() => setHidden(true), 2200);
      return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer); };
    }
  }, [allDone, isStreaming, fadingOut, hidden]);

  // Smooth show/hide with delay on hover leave
  useEffect(() => {
    if (hovered) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setVisible(true);
    } else {
      timerRef.current = setTimeout(() => setVisible(false), 200);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [hovered]);

  if (cleared || !todos || todos.length === 0 || hidden) return null;

  return (
    <div
      className="relative flex justify-center mb-1 transition-opacity duration-500"
      style={{ opacity: fadingOut ? 0 : 1 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ─── Expanded list (animates upward) ─────────────────────────── */}
      <div
        className="absolute bottom-full mb-2 rounded-2xl overflow-hidden transition-all duration-300 origin-bottom"
        style={{
          background: 'var(--color-bg-elevated, var(--color-bg-secondary))',
          border: '1px solid var(--color-border-primary)',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.25)',
          zIndex: 50,
          width: '340px',
          maxWidth: '90vw',
          maxHeight: visible ? '320px' : '0',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.95)',
          pointerEvents: visible ? 'auto' : 'none',
        }}
      >
        {/* Progress header */}
        <div
          className="flex items-center gap-2.5 px-4 py-2.5"
          style={{ borderBottom: '1px solid var(--color-border-secondary)' }}
        >
          {/* Circular progress */}
          <div className="relative w-9 h-9 flex-shrink-0">
            <svg width="36" height="36" viewBox="0 0 36 36" className="-rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-border-secondary)" strokeWidth="2.5" />
              <circle
                cx="18" cy="18" r="15" fill="none"
                stroke={allDone ? 'var(--color-success, #10b981)' : 'var(--color-accent)'}
                strokeWidth="2.5" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 15}`}
                strokeDashoffset={`${2 * Math.PI * 15 * (1 - pct / 100)}`}
                style={{ transition: 'stroke-dashoffset 0.5s ease' }}
              />
            </svg>
            <span
              className="absolute inset-0 flex items-center justify-center text-[8px] font-bold tabular-nums"
              style={{ color: allDone ? 'var(--color-success, #10b981)' : 'var(--color-text-secondary)' }}
            >
              {pct}%
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium" style={{ color: 'var(--color-text-primary)' }}>
              {allDone ? 'All complete' : isStreaming ? 'Working…' : 'Tasks'}
            </div>
            <div className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
              {completed} of {total} done
            </div>
          </div>
        </div>

        {/* Todo items */}
        <div className="p-2 overflow-y-auto" style={{ maxHeight: '250px' }}>
          {todos.map((todo, idx) => (
            <TodoRow key={todo.id || idx} todo={todo} />
          ))}
        </div>
      </div>

      {/* ─── Pill button (centered, small) ──────────────────────────── */}
      <button
        className="flex items-center gap-1.5 px-3 py-1 rounded-full transition-all duration-200"
        style={{
          background: hovered
            ? (allDone ? 'rgba(16,185,129,0.15)' : 'var(--color-accent-soft)')
            : 'transparent',
          border: hovered
            ? `1px solid ${allDone ? 'rgba(16,185,129,0.3)' : 'var(--color-accent)'}`
            : '1px solid transparent',
          cursor: 'default',
          transform: hovered ? 'scale(1.05)' : 'scale(1)',
        }}
      >
        {/* Status dot */}
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{
            background: allDone
              ? 'var(--color-success, #10b981)'
              : inProgressItem
              ? 'var(--color-accent)'
              : 'var(--color-text-muted)',
            animation: inProgressItem && !allDone ? 'pulse 1.5s ease-in-out infinite' : 'none',
          }}
        />

        {/* Progress text */}
        <span
          className="text-[11px] font-medium tabular-nums"
          style={{
            color: allDone
              ? 'var(--color-success, #10b981)'
              : hovered
              ? 'var(--color-accent)'
              : 'var(--color-text-muted)',
          }}
        >
          {completed}/{total}
        </span>

        {/* Expand chevron */}
        <svg
          width="8" height="8" viewBox="0 0 12 12" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="flex-shrink-0 transition-transform duration-200"
          style={{
            transform: visible ? 'rotate(180deg)' : 'rotate(0deg)',
            color: hovered ? 'var(--color-accent)' : 'var(--color-text-muted)',
          }}
        >
          <path d="M3 7L6 4L9 7" />
        </svg>
      </button>
    </div>
  );
};

// ─── Todo Row (used inside the expanded list) ─────────────────────────────────

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
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors"
      style={{
        opacity,
        background: status === 'in_progress' ? 'var(--color-accent-soft)' : 'transparent',
      }}
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
