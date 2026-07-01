/**
 * OpenAgent-Desktop — V2 Titlebar (Phase 2.0.3)
 *
 * Thin (36px) titlebar for the V2 (Modern) layout. Contains:
 *
 *   ┌──────┬──────────────────────────────────────────────┬──────────┐
 *   │ Home │ [Tab1] [Tab2] [+]                            │  Trace ⚙ │
 *   └──────┴──────────────────────────────────────────────┴──────────┘
 *
 *   - macOS: 78px left padding reserved for the native traffic-light buttons.
 *   - Non-macOS: 72px right padding reserved for the native window controls.
 *   - The whole bar is draggable (webkitAppRegion: 'drag'); interactive
 *     elements (buttons, tabs) are marked 'no-drag' so clicks work.
 *
 * The "Home" button returns to the V2 home view (the projects/sessions grid).
 * The "Trace" toggle opens the right-side trace panel. The "⚙" button opens
 * settings.
 */

import React, { useMemo } from 'react';
import { SessionInfo } from '../../../types';
import { getAPI } from '../../../utils/api';
import V2TabStrip from './V2TabStrip';
// Phase 2.0.5: project/folder selector in the titlebar.
import ProjectSelector from '../../Chat/ProjectSelector';

interface V2TitlebarProps {
  /** Session IDs currently open as tabs. */
  openTabs: string[];
  /** The active session ID. */
  currentSessionId: string | null;
  /** All known sessions. */
  sessions: SessionInfo[];
  /** Click on a tab. */
  onTabClick: (sessionId: string) => void;
  /** Close a tab. */
  onTabClose: (sessionId: string) => void;
  /** New session ("+" button or empty state). */
  onNewTab: () => void;
  /** Click the Home button — usually navigates to the V2 home view. */
  onHome: () => void;
  /** Open the settings sheet. */
  onOpenSettings: () => void;
  /** Whether the trace panel is currently open. */
  v2TracePanelOpen: boolean;
  /** Toggle the trace panel. */
  toggleV2TracePanel: () => void;
}

const V2Titlebar: React.FC<V2TitlebarProps> = ({
  openTabs,
  currentSessionId,
  sessions,
  onTabClick,
  onTabClose,
  onNewTab,
  onHome,
  onOpenSettings,
  v2TracePanelOpen,
  toggleV2TracePanel,
}) => {
  // Determine the OS so we can reserve space for native window controls.
  const isMac = useMemo(() => {
    try {
      const api = getAPI();
      return !!api?.platform?.isMac?.();
    } catch {
      // Fallback to navigator.userAgent when not running in Electron
      // (e.g. storybook / vitest jsdom).
      return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
    }
  }, []);

  return (
    <header
      className="flex items-stretch flex-shrink-0 select-none"
      style={{
        height: '36px',
        background: 'var(--v2-background-bg-base)',
        borderBottom: '1px solid var(--v2-border-border-muted)',
        // @ts-expect-error — webkitAppRegion is a non-standard CSS property.
        WebkitAppRegion: 'drag',
        fontFamily: 'var(--v2-font-family-text)',
        paddingLeft: isMac ? '78px' : '8px',
        paddingRight: isMac ? '8px' : '72px',
      }}
    >
      {/* Home button — always visible, returns to the home view. */}
      <button
        type="button"
        onClick={onHome}
        className="flex items-center justify-center h-full w-9 flex-shrink-0 transition-colors"
        style={{
          color: 'var(--v2-icon-icon-muted)',
          // @ts-expect-error — webkitAppRegion is a non-standard CSS property.
          WebkitAppRegion: 'no-drag',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover)';
          e.currentTarget.style.color = 'var(--v2-text-text-base)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--v2-icon-icon-muted)';
        }}
        aria-label="Home"
        title="Home"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 12l9-9 9 9" />
          <path d="M5 10v10a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1V10" />
        </svg>
      </button>

      {/* Phase 2.0.5: Project/folder selector — compact mode for the titlebar. */}
      <div
        style={{
          // @ts-expect-error — webkitAppRegion is a non-standard CSS property.
          WebkitAppRegion: 'no-drag',
        }}
        className="flex-shrink-0 h-full flex items-center"
      >
        <ProjectSelector compact />
      </div>

      {/* Tab strip — fills the available space. */}
      <div
        style={{
          // @ts-expect-error — webkitAppRegion is a non-standard CSS property.
          WebkitAppRegion: 'no-drag',
        }}
        className="flex-1 min-w-0 h-full"
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

      {/* Right-side actions: sidebar toggle + settings. */}
      <div
        className="flex items-center gap-1 flex-shrink-0 pr-2"
        style={{
          // @ts-expect-error — webkitAppRegion is a non-standard CSS property.
          WebkitAppRegion: 'no-drag',
        }}
      >
        <button
          type="button"
          onClick={toggleV2TracePanel}
          className="flex items-center justify-center h-7 w-7 rounded-md transition-colors"
          style={{
            color: v2TracePanelOpen
              ? 'var(--color-accent, var(--v2-blue-600))'
              : 'var(--v2-icon-icon-muted)',
            background: v2TracePanelOpen
              ? 'var(--v2-overlay-simple-overlay-hover)'
              : 'transparent',
          }}
          onMouseEnter={(e) => {
            if (!v2TracePanelOpen) {
              e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover)';
              e.currentTarget.style.color = 'var(--v2-text-text-base)';
            }
          }}
          onMouseLeave={(e) => {
            if (!v2TracePanelOpen) {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--v2-icon-icon-muted)';
            }
          }}
          aria-label="Toggle sidebar"
          aria-pressed={v2TracePanelOpen}
          title="Toggle sidebar"
        >
          {/* Phase 2.8.1: Right sidebar/panel icon (rectangle + right divider) */}
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="flex items-center justify-center h-7 w-7 rounded-md transition-colors"
          style={{ color: 'var(--v2-icon-icon-muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover)';
            e.currentTarget.style.color = 'var(--v2-text-text-base)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--v2-icon-icon-muted)';
          }}
          aria-label="Settings"
          title="Settings"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
  );
};

export default V2Titlebar;
