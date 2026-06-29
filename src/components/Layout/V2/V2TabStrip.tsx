/**
 * OpenAgent-Desktop — V2 Tab Strip (Phase 2.0.3)
 *
 * Browser-style horizontal session tabs that live inside the V2 titlebar.
 *
 *   ┌─────┬──────────┬──────────┬─────┐
 *   │  +  │ Session1 │ Session2 │  +  │  ← tab strip
 *   └─────┴──────────┴──────────┴─────┘
 *
 * Each tab shows:
 *   - The session name (truncated).
 *   - A close (×) button that appears on hover or when the tab is active.
 *
 * The "+" button at the trailing edge creates a new session.
 *
 * Tabs are middle-click closable (browser convention) and the active tab is
 * underlined with the accent colour.
 */

import React, { useRef, useState, useCallback } from 'react';
import { SessionInfo } from '../../../types';

interface V2TabStripProps {
  /** Session IDs that are currently open as tabs (in display order). */
  openTabs: string[];
  /** The currently active session ID (highlighted). */
  currentSessionId: string | null;
  /** All known sessions — used to resolve names for tab IDs. */
  sessions: SessionInfo[];
  /** Called when the user clicks a tab. */
  onTabClick: (sessionId: string) => void;
  /** Called when the user closes a tab (× button or middle-click). */
  onTabClose: (sessionId: string) => void;
  /** Called when the user clicks the "+" button. */
  onNewTab: () => void;
}

const V2TabStrip: React.FC<V2TabStripProps> = ({
  openTabs,
  currentSessionId,
  sessions,
  onTabClick,
  onTabClose,
  onNewTab,
}) => {
  const stripRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Build a fast lookup so we don't iterate every render per tab.
  const sessionMap = React.useMemo(() => {
    const m = new Map<string, SessionInfo>();
    for (const s of sessions) m.set(s.id, s);
    return m;
  }, [sessions]);

  const handleAuxClick = useCallback(
    (e: React.MouseEvent, sessionId: string) => {
      // Middle-click closes the tab (browser convention).
      if (e.button === 1) {
        e.preventDefault();
        onTabClose(sessionId);
      }
    },
    [onTabClose],
  );

  if (openTabs.length === 0) {
    // Empty state — just show the + button centred.
    return (
      <div
        ref={stripRef}
        className="flex items-center gap-1 h-full min-w-0 flex-1 px-2"
        role="tablist"
        aria-label="Open sessions"
      >
        <NewTabButton onClick={onNewTab} />
      </div>
    );
  }

  return (
    <div
      ref={stripRef}
      className="flex items-center gap-0.5 h-full min-w-0 flex-1 overflow-x-auto no-scrollbar"
      style={{ scrollbarWidth: 'none' }}
      role="tablist"
      aria-label="Open sessions"
    >
      {openTabs.map((sessionId) => {
        const session = sessionMap.get(sessionId);
        const name = session?.name || 'New session';
        const isActive = sessionId === currentSessionId;
        const isHovered = sessionId === hoveredId;
        return (
          <div
            key={sessionId}
            role="tab"
            tabIndex={0}
            aria-selected={isActive}
            onClick={() => onTabClick(sessionId)}
            onAuxClick={(e) => handleAuxClick(e, sessionId)}
            onMouseEnter={() => setHoveredId(sessionId)}
            onMouseLeave={() => setHoveredId((prev) => (prev === sessionId ? null : prev))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onTabClick(sessionId);
              }
            }}
            className="group relative flex items-center gap-1.5 h-7 pl-3 pr-1.5 rounded-md cursor-pointer transition-colors flex-shrink-0 max-w-[180px]"
            style={{
              background: isActive
                ? 'var(--v2-overlay-simple-overlay-hover)'
                : isHovered
                ? 'var(--v2-overlay-simple-overlay-hover)'
                : 'transparent',
              outline: 'none',
            }}
            title={name}
          >
            <span
              className="text-[12px] truncate"
              style={{
                color: isActive
                  ? 'var(--v2-text-text-base)'
                  : 'var(--v2-text-text-muted)',
                fontFamily: 'var(--v2-font-family-text)',
                fontWeight: isActive
                  ? 'var(--v2-font-weight-medium)'
                  : 'var(--v2-font-weight-regular)',
                maxWidth: '120px',
              }}
            >
              {name}
            </span>

            {/* Close button — visible on hover or when active. */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(sessionId);
              }}
              className="flex items-center justify-center h-4 w-4 rounded-[4px] flex-shrink-0 transition-all"
              style={{
                color: 'var(--v2-icon-icon-muted)',
                background: 'transparent',
                opacity: isActive || isHovered ? 1 : 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover)';
                e.currentTarget.style.color = 'var(--v2-text-text-base)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--v2-icon-icon-muted)';
              }}
              aria-label={`Close ${name}`}
              title={`Close ${name}`}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Active underline */}
            {isActive && (
              <span
                className="absolute -bottom-px left-2 right-2 h-0.5 rounded-full"
                style={{ background: 'var(--color-accent, var(--v2-blue-600))' }}
              />
            )}
          </div>
        );
      })}

      <NewTabButton onClick={onNewTab} />
    </div>
  );
};

// ─── New Tab "+" button ────────────────────────────────────────────────────
const NewTabButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex items-center justify-center h-7 w-7 rounded-md flex-shrink-0 transition-colors"
    style={{ color: 'var(--v2-icon-icon-muted)' }}
    onMouseEnter={(e) => {
      e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover)';
      e.currentTarget.style.color = 'var(--v2-text-text-base)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.color = 'var(--v2-icon-icon-muted)';
    }}
    aria-label="New session"
    title="New session"
  >
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  </button>
);

export default V2TabStrip;
