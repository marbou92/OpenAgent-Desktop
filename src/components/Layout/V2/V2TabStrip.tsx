/**
 * OpenAgent-Desktop — V2 Tab Strip (Phase 1.2)
 *
 * Browser-style session tabs in the titlebar. Each open session is a tab.
 * Clicking a tab loads that session; clicking the X closes the tab.
 * A "+" button creates a new session.
 *
 * Tabs are backed by the `openTabs` array in the Zustand store (session IDs).
 * The active tab is `currentSessionId`.
 */

import React, { useRef, useEffect } from 'react';
import { SessionInfo } from '../../../types';

interface V2TabStripProps {
  /** Session IDs that are open as tabs. */
  openTabs: string[];
  /** The currently active session ID (null = no session / home view). */
  currentSessionId: string | null;
  /** All sessions (for looking up names). */
  sessions: SessionInfo[];
  /** Called when the user clicks a tab. */
  onTabClick: (sessionId: string) => void;
  /** Called when the user clicks a tab's close button. */
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
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the active tab
  useEffect(() => {
    if (!scrollRef.current || !currentSessionId) return;
    const activeEl = scrollRef.current.querySelector(`[data-tab-id="${currentSessionId}"]`) as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [currentSessionId]);

  // Build a name lookup map
  const nameMap = new Map<string, string>();
  for (const s of sessions) {
    nameMap.set(s.id, s.name || 'New Chat');
  }

  return (
    <div className="flex items-center min-w-0 flex-1 h-full">
      {/* Scrollable tab container */}
      <div
        ref={scrollRef}
        className="flex items-center h-full overflow-x-auto"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <style>{`/* hide webkit scrollbar */ .v2-tab-strip::-webkit-scrollbar { display: none; }`}</style>
        <div className="flex items-center h-full v2-tab-strip">
          {openTabs.map((tabId) => {
            const isActive = tabId === currentSessionId;
            const name = nameMap.get(tabId) || 'New Chat';
            return (
              <div
                key={tabId}
                data-tab-id={tabId}
                onClick={() => onTabClick(tabId)}
                className="group flex items-center gap-1.5 h-full px-3 cursor-pointer transition-colors flex-shrink-0"
                style={{
                  background: isActive ? 'var(--v2-background-bg-base)' : 'transparent',
                  maxWidth: '200px',
                  minWidth: '120px',
                  borderRight: '1px solid var(--v2-border-border-muted)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                {/* Active indicator dot */}
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{
                    background: isActive ? 'var(--v2-icon-icon-accent)' : 'var(--v2-icon-icon-muted)',
                  }}
                />
                {/* Tab name */}
                <span
                  className="text-[12px] truncate flex-1 min-w-0"
                  style={{
                    fontFamily: 'var(--v2-font-family-text)',
                    fontWeight: isActive ? 'var(--v2-font-weight-medium)' : 'var(--v2-font-weight-regular)',
                    color: isActive ? 'var(--v2-text-text-base)' : 'var(--v2-text-text-muted)',
                  }}
                >
                  {name}
                </span>
                {/* Close button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTabClose(tabId);
                  }}
                  className="flex-shrink-0 p-0.5 rounded transition-colors opacity-0 group-hover:opacity-100"
                  style={{ color: 'var(--v2-icon-icon-muted)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-pressed)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  aria-label="Close tab"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* New tab button */}
      <button
        onClick={onNewTab}
        className="flex items-center justify-center flex-shrink-0 px-2.5 h-full transition-colors"
        style={{ color: 'var(--v2-icon-icon-muted)' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        aria-label="New session"
        title="New session"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
};

export default V2TabStrip;
