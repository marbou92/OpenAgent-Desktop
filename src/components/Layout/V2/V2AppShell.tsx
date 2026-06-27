/**
 * OpenAgent-Desktop — V2 App Shell (Phase 1.2)
 *
 * The Modern layout shell. Structure:
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ V2Titlebar (36px) — home, tab strip, trace toggle, settings  │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │                                                              │
 *   │  Main Area (deep bg) — renders the current view              │
 *   │  (Chat / Sessions / Settings / etc. as floating cards)       │
 *   │                                                              │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * The slide-in trace panel overlays from the right when toggled.
 * Settings/Providers/etc. open as full-screen overlays (Q1=A).
 */

import React from 'react';
import V2Titlebar from './V2Titlebar';
import V2SlideInPanel from './V2SlideInPanel';
import { SessionInfo, ViewType, TraceEntry, SessionData, ProviderInfo } from '../../../types';
import RightPanel from '../RightPanel/RightPanel';

interface V2AppShellProps {
  // Navigation
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;

  // Tabs
  openTabs: string[];
  currentSessionId: string | null;
  sessions: SessionInfo[];

  // Tab actions
  onLoadSession: (sessionId: string) => void;
  onNewSession: () => void;
  onCloseTab: (sessionId: string) => void;

  // Trace panel
  v2TracePanelOpen: boolean;
  toggleV2TracePanel: () => void;
  traceEntries: TraceEntry[];
  currentSession: SessionData | null;
  providers: ProviderInfo[];

  // Content
  loading: boolean;
  children: React.ReactNode;
}

const V2AppShell: React.FC<V2AppShellProps> = ({
  currentView,
  setCurrentView,
  openTabs,
  currentSessionId,
  sessions,
  onLoadSession,
  onNewSession,
  onCloseTab,
  v2TracePanelOpen,
  toggleV2TracePanel,
  traceEntries,
  currentSession,
  providers,
  loading,
  children,
}) => {
  return (
    <div
      className="flex flex-col h-screen w-screen overflow-hidden"
      style={{
        background: 'var(--v2-background-bg-deep)',
        color: 'var(--v2-text-text-base)',
        fontFamily: 'var(--v2-font-family-text)',
        fontSize: 'var(--v2-font-size-base)',
      }}
    >
      {/* Titlebar */}
      <V2Titlebar
        currentView={currentView}
        openTabs={openTabs}
        currentSessionId={currentSessionId}
        sessions={sessions}
        v2TracePanelOpen={v2TracePanelOpen}
        onHome={() => setCurrentView('sessions')}
        onTabClick={onLoadSession}
        onTabClose={onCloseTab}
        onNewTab={onNewSession}
        onToggleTrace={toggleV2TracePanel}
        onOpenSettings={() => setCurrentView('settings')}
      />

      {/* Main content area */}
      <main className="flex-1 min-h-0 min-w-0 overflow-hidden">
        {loading ? (
          <div
            className="flex items-center justify-center h-full"
            style={{ color: 'var(--v2-text-text-muted)' }}
          >
            <div
              className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: 'var(--v2-icon-icon-accent)', borderTopColor: 'transparent' }}
            />
          </div>
        ) : (
          children
        )}
      </main>

      {/* Slide-in trace panel (overlays from the right) */}
      <V2SlideInPanel
        open={v2TracePanelOpen}
        onClose={toggleV2TracePanel}
        title="Trace"
      >
        <RightPanel
          entries={traceEntries}
          session={currentSession}
          sessionId={currentSessionId}
          providers={providers}
          selectedProviderId={currentSession?.providerId || ''}
          selectedModel={currentSession?.model || ''}
          onClose={toggleV2TracePanel}
        />
      </V2SlideInPanel>
    </div>
  );
};

export default V2AppShell;
