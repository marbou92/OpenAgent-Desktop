/**
 * OpenAgent-Desktop — V2 Titlebar (Phase 1.2)
 *
 * Thin 36px titlebar for the Modern layout. Contains:
 *   Left:  Home button (navigates to sessions/home view)
 *   Center: V2TabStrip (browser-style session tabs + new tab button)
 *   Right: Trace toggle, Settings button, window controls spacer
 *
 * The entire bar is a drag region (for window dragging in Electron).
 * On macOS, space is reserved for native traffic lights on the left.
 */

import React from 'react';
import V2TabStrip from './V2TabStrip';
import { SessionInfo, ViewType } from '../../../types';

interface V2TitlebarProps {
  currentView: ViewType;
  openTabs: string[];
  currentSessionId: string | null;
  sessions: SessionInfo[];
  v2TracePanelOpen: boolean;
  onHome: () => void;
  onTabClick: (sessionId: string) => void;
  onTabClose: (sessionId: string) => void;
  onNewTab: () => void;
  onToggleTrace: () => void;
  onOpenSettings: () => void;
}

const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');

const V2Titlebar: React.FC<V2TitlebarProps> = ({
  currentView,
  openTabs,
  currentSessionId,
  sessions,
  v2TracePanelOpen,
  onHome,
  onTabClick,
  onTabClose,
  onNewTab,
  onToggleTrace,
  onOpenSettings,
}) => {
  return (
    <header
      className="flex items-center flex-shrink-0 select-none"
      style={{
        height: '36px',
        background: 'var(--v2-background-bg-deep)',
        borderBottom: '1px solid var(--v2-border-border-muted)',
        // Allow window dragging via the titlebar (Electron -webkit-app-region).
        // The CSS property is set via style attribute; Electron honors it.
        // @ts-expect-error — webkitAppRegion is a non-standard CSS property.
        WebkitAppRegion: 'drag',
      }}
    >
      {/* macOS: reserve space for traffic lights */}
      {isMac && <div style={{ width: '78px', flexShrink: 0 }} />}

      {/* Home button — navigates to the sessions/home view */}
      <button
        onClick={onHome}
        className="flex items-center justify-center flex-shrink-0 h-full px-3 transition-colors"
        style={{
          // @ts-expect-error
          WebkitAppRegion: 'no-drag',
          color: currentView === 'sessions' ? 'var(--v2-icon-icon-accent)' : 'var(--v2-icon-icon-muted)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        aria-label="Home"
        title="Home"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      </button>

      {/* Tab strip */}
      <div
        className="flex-1 min-w-0 h-full"
        style={{ // @ts-expect-error
          WebkitAppRegion: 'no-drag',
        }}
      >
        <V2TabStrip
          openTabs={openTabs}
          currentSessionId={currentSessionId}
          sessions={sessions}
          onTabClick={onTabClick}
          onTabClose={onTabClose}
          onNewTab={onNewTab}
        />
      </div>

      {/* Right-side actions */}
      <div
        className="flex items-center gap-0.5 flex-shrink-0 h-full px-1"
        style={{ // @ts-expect-error
          WebkitAppRegion: 'no-drag',
        }}
      >
        {/* Trace toggle */}
        <button
          onClick={onToggleTrace}
          className="flex items-center justify-center h-7 w-7 rounded transition-colors"
          style={{
            color: v2TracePanelOpen ? 'var(--v2-icon-icon-accent)' : 'var(--v2-icon-icon-muted)',
            background: v2TracePanelOpen ? 'var(--v2-overlay-simple-overlay-hover)' : 'transparent',
          }}
          onMouseEnter={(e) => {
            if (!v2TracePanelOpen) e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover)';
          }}
          onMouseLeave={(e) => {
            if (!v2TracePanelOpen) e.currentTarget.style.background = 'transparent';
          }}
          aria-label="Toggle trace panel"
          title="Trace"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3h7v7H3z" />
            <path d="M14 3h7v7h-7z" />
            <path d="M14 14h7v7h-7z" />
            <path d="M3 14h7v7H3z" />
          </svg>
        </button>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className="flex items-center justify-center h-7 w-7 rounded transition-colors"
          style={{
            color: currentView === 'settings' ? 'var(--v2-icon-icon-accent)' : 'var(--v2-icon-icon-muted)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          aria-label="Settings"
          title="Settings"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {/* Non-mac: reserve space for window controls (minimize/maximize/close) */}
      {!isMac && <div style={{ width: '72px', flexShrink: 0 }} />}
    </header>
  );
};

export default V2Titlebar;
