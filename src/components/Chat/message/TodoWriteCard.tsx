/**
 * OpenAgent-Desktop — TodoWriteCard (Phase 10.1 — Codex CLI style)
 *
 * Redesigned to match the new Codex CLI todo list aesthetic:
 *   - Minimal rows with status icons (no heavy card borders)
 *   - ○ pending, ● in_progress (with subtle pulse), ✓ completed, ✕ cancelled
 *   - Strikethrough for completed items
 *   - Clean separator between items
 *   - No progress bar or header chrome — just the list
 *   - `clear: true` parameter dismisses the entire todo UI
 *
 * Layout:
 *   ○  Read the config file
 *   ●  Update the database schema
 *   ✓  Run the test suite
 *   ✕  Deploy to staging
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
  /** When true, the todo UI is dismissed (clear: true parameter). */
  cleared?: boolean;
}

export const TodoWriteCard: React.FC<TodoWriteCardProps> = ({ todos, isStreaming, cleared }) => {
  if (cleared || !todos || todos.length === 0) return null;

  const completed = todos.filter(t => t.status === 'completed').length;
  const total = todos.length;
  const allDone = completed === total;

  return (
    <div className="my-2">
      {/* Minimal header — just count, no chrome */}
      <div className="flex items-center gap-2 mb-1.5 px-0.5">
        <span className="text-[11px] font-medium" style={{ color: allDone ? 'var(--color-success, #10b981)' : 'var(--color-text-muted)' }}>
          {allDone ? '✓' : '☰'}
        </span>
        <span
          className="text-[11px] font-medium"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {isStreaming ? 'Planning' : allDone ? 'All done' : `${completed}/${total} complete`}
        </span>
      </div>

      {/* Todo rows — Codex style: minimal, no card borders */}
      <div className="space-y-0">
        {todos.map((todo, idx) => (
          <TodoRow key={todo.id || idx} todo={todo} />
        ))}
      </div>
    </div>
  );
};

const TodoRow: React.FC<{ todo: TodoItem }> = ({ todo }) => {
  const status = todo.status || 'pending';
  const priority = todo.priority || 'medium';

  // Status icon + color
  let icon: React.ReactNode;
  let color: string;
  let textDecoration = 'none';
  let opacity = 1;

  switch (status) {
    case 'completed':
      icon = (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
      color = 'var(--color-success, #10b981)';
      textDecoration = 'line-through';
      opacity = 0.6;
      break;
    case 'in_progress':
      icon = (
        <span
          className="inline-block w-3 h-3 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }}
        />
      );
      color = 'var(--color-accent)';
      break;
    case 'cancelled':
      icon = (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      );
      color = 'var(--color-text-muted)';
      opacity = 0.4;
      break;
    default: // pending
      icon = (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
      color = 'var(--color-text-muted)';
      break;
  }

  // Priority indicator — a small colored dot on the left
  const priorityColor =
    priority === 'high' ? 'var(--color-error, #ef4444)' :
    priority === 'medium' ? 'var(--color-text-muted)' :
    'transparent';

  return (
    <div
      className="flex items-center gap-2.5 py-1 px-0.5 rounded-sm transition-colors"
      style={{
        opacity,
        borderBottom: '1px solid var(--color-border-secondary)',
      }}
    >
      {/* Priority dot */}
      {priority !== 'low' && (
        <span
          className="w-1 h-1 rounded-full flex-shrink-0"
          style={{ background: priorityColor }}
        />
      )}

      {/* Status icon */}
      <span className="flex-shrink-0 flex items-center justify-center w-3.5 h-3.5" style={{ color }}>
        {icon}
      </span>

      {/* Content */}
      <span
        className="text-xs flex-1 min-w-0 truncate"
        style={{
          color: status === 'completed' || status === 'cancelled'
            ? 'var(--color-text-muted)'
            : 'var(--color-text-primary)',
          textDecoration,
        }}
      >
        {todo.content}
      </span>

      {/* Status label — only for in_progress */}
      {status === 'in_progress' && (
        <span
          className="text-[9px] font-medium uppercase tracking-wide flex-shrink-0"
          style={{ color: 'var(--color-accent)' }}
        >
          working
        </span>
      )}
    </div>
  );
};

export default TodoWriteCard;
