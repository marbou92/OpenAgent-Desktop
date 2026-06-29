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
      style={{ opacity: fadingOut ? 0 : 1, background: 'transparent' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ─── Expanded list (animates upward) — Phase 1.9.4-b: minimal opencode-style ── */}
      <div
        className="absolute bottom-full mb-2 rounded-[10px] overflow-hidden transition-all duration-300 origin-bottom"
        style={{
          background: 'var(--v2-background-bg-base, var(--color-bg-elevated))',
          boxShadow: 'var(--v2-elevation-floating, var(--shadow-popover))',
          zIndex: 50,
          width: '340px',
          maxWidth: '90vw',
          maxHeight: visible ? '320px' : '0',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.95)',
          pointerEvents: visible ? 'auto' : 'none',
          overflow: 'hidden',
          padding: '4px',
        }}
      >
        {/* Todo items */}
        <div className="overflow-y-auto" style={{ maxHeight: '280px' }}>
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
            : 'var(--color-bg-secondary)',
          border: `1px solid ${hovered
            ? (allDone ? 'rgba(16,185,129,0.3)' : 'var(--color-accent)')
            : 'var(--color-border-secondary)'}`,
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

// ─── Todo Row (used inside the expanded list) — Phase 1.9.4-b: minimal ──────────

const TodoRow: React.FC<{ todo: TodoItem }> = ({ todo }) => {
  const status = todo.status || 'pending';
  const isActive = status === 'in_progress';
  const isCompleted = status === 'completed';
  const isCancelled = status === 'cancelled';

  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded-[6px] transition-colors"
      style={{
        opacity: isCancelled ? 0.4 : 1,
        background: isActive ? 'var(--v2-overlay-simple-overlay-hover, var(--color-accent-soft))' : 'transparent',
        fontFamily: 'var(--v2-font-family-text)',
      }}
    >
      <span
        className="text-[13px] flex-1 min-w-0 truncate"
        style={{
          color: isActive
            ? 'var(--color-accent)'
            : isCompleted
            ? 'var(--v2-text-text-muted, var(--color-text-muted))'
            : 'var(--v2-text-text-base, var(--color-text-primary))',
          textDecoration: isCompleted ? 'line-through' : 'none',
          fontWeight: isActive ? 'var(--v2-font-weight-medium)' : 'var(--v2-font-weight-regular)',
        }}
      >
        {todo.content}
      </span>
      {isCompleted && (
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </div>
  );
};

export default TodoWriteCard;
