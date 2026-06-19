/**
 * OpenAgent-Desktop - Notes Tab (Phase 3.1)
 *
 * A per-session scratchpad where the user can jot down notes that persist
 * across reloads. Notes are stored in localStorage keyed by session ID.
 *
 *   ┌─────────────────────────────┐
 *   │ ┌─────────────────────────┐ │
 *   │ │ Type notes here...      │ │
 *   │ │                         │ │
 *   │ │ Multi-line supported.   │ │
 *   │ └─────────────────────────┘ │
 *   │                             │
 *   │ Saved automatically         │
 *   └─────────────────────────────┘
 *
 * Use cases:
 *   - Track what the agent is doing across long sessions
 *   - Jot down questions to ask later
 *   - Paste snippets the agent referenced
 *   - Reminder of what to follow up on
 */

import React, { useState, useEffect, useCallback } from 'react';

interface NotesTabProps {
  sessionId: string | null;
}

function getStorageKey(sessionId: string): string {
  return `openagent-session-notes-${sessionId}`;
}

const NotesTab: React.FC<NotesTabProps> = ({ sessionId }) => {
  const [notes, setNotes] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Load notes from localStorage when session changes
  useEffect(() => {
    if (!sessionId) {
      setNotes('');
      setSavedAt(null);
      return;
    }
    try {
      const stored = localStorage.getItem(getStorageKey(sessionId)) || '';
      setNotes(stored);
      setSavedAt(null);
    } catch {
      setNotes('');
    }
  }, [sessionId]);

  // Auto-save (debounced via a 500ms timeout)
  const save = useCallback((value: string) => {
    if (!sessionId) return;
    try {
      localStorage.setItem(getStorageKey(sessionId), value);
      setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch {
      // localStorage might be full or disabled — ignore
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const timer = setTimeout(() => save(notes), 500);
    return () => clearTimeout(timer);
  }, [notes, sessionId, save]);

  // Clear notes for this session
  const handleClear = useCallback(() => {
    if (!sessionId) return;
    if (!confirm('Clear all notes for this session?')) return;
    setNotes('');
    try {
      localStorage.removeItem(getStorageKey(sessionId));
    } catch {
      // ignore
    }
    setSavedAt(null);
  }, [sessionId]);

  if (!sessionId) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 px-4">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-text-muted)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        <p className="text-sm mt-3" style={{ color: 'var(--color-text-muted)' }}>
          No active session
        </p>
        <p className="text-xs mt-1 text-center" style={{ color: 'var(--color-text-muted)' }}>
          Start a chat to take notes
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Notes textarea */}
      <div className="flex-1 p-3">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Type notes for this session…&#10;&#10;• Track what the agent is doing&#10;• Jot down questions&#10;• Paste snippets&#10;• Reminders for follow-up"
          className="w-full h-full resize-none text-sm rounded-lg p-3 outline-none"
          style={{
            background: 'var(--color-bg-tertiary)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border-primary)',
            lineHeight: '1.6',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Footer: save status + clear */}
      <div
        className="flex items-center justify-between px-3 py-2 border-t"
        style={{ borderColor: 'var(--color-border-secondary)' }}
      >
        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          {savedAt ? `Saved at ${savedAt}` : notes ? 'Saving…' : 'Auto-saved per session'}
        </span>
        {notes && (
          <button
            onClick={handleClear}
            className="text-[10px] px-2 py-0.5 rounded transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-error)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
};

export default NotesTab;
