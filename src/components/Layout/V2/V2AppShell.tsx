/**
 * OpenAgent-Desktop — V2 App Shell (Phase 2.0.3)
 *
 * The top-level shell for the V2 (Modern) layout. Assembles:
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ V2Titlebar (36px)                                       │
 *   ├──────────────────────────────────────────────────────────┤
 *   │                                                          │
 *   │  Main area (children) — V2HomeView / V2NewSessionView /  │
 *   │  V2ChatView — chosen by the parent based on currentView. │
 *   │                                                          │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ Right side: V2SlideInPanel wraps the existing RightPanel │ (overlay)
 *   └──────────────────────────────────────────────────────────┘
 *
 * The shell is responsible for:
 *   - Mounting the titlebar with all the session-tab plumbing.
 *   - Mounting the slide-in trace panel + forwarding RightPanel props.
 *   - Rendering `children` (the active view) inside a deep-bg container.
 *
 * `currentView` / `setCurrentView` are accepted for routing — the titlebar's
 * Home button calls setCurrentView('home'). The shell itself does NOT switch
 * between views; the parent passes the right child for the current view.
 */

import React from 'react';
import { SessionInfo, SessionData, TraceEntry, ProviderInfo, ViewType } from '../../../types';
import V2Titlebar from './V2Titlebar';
import V2SlideInPanel from './V2SlideInPanel';
import RightPanel from '../RightPanel/RightPanel';

/**
 * V2 view names — uses the existing ViewType from the app's type system.
 * The shell itself does NOT switch between views; the parent passes the
 * right child for the current view.
 */

interface V2AppShellProps {
  /** The currently-active view name (used by the Home button to navigate). */
  currentView: ViewType;
  /** Navigate to a view. */
  setCurrentView: (view: ViewType) => void;
  /** Session IDs currently open as tabs. */
  openTabs: string[];
  /** The active session ID. */
  currentSessionId: string | null;
  /** All known sessions. */
  sessions: SessionInfo[];
  /** Click on a tab — load that session. */
  onLoadSession: (sessionId: string) => void;
  /** New session ("+" button or empty state). */
  onNewSession: () => void;
  /** Close a tab. */
  onCloseTab: (sessionId: string) => void;
  /** Whether the trace panel is open. */
  v2TracePanelOpen: boolean;
  /** Toggle the trace panel. */
  toggleV2TracePanel: () => void;
  /** Trace entries for the RightPanel. */
  traceEntries: TraceEntry[];
  /** The full current session data (for the RightPanel context tab). */
  currentSession: SessionData | null;
  /** Known providers (for the RightPanel context tab). */
  providers: ProviderInfo[];
  /** Whether the app is in an initial-loading state. */
  loading?: boolean;
  /** Open the settings sheet (V2Titlebar's ⚙ button). */
  onOpenSettings?: () => void;
  /** Main area content. */
  children?: React.ReactNode;
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
  loading = false,
  onOpenSettings,
  children,
}) => {
  const handleHome = React.useCallback(() => {
    setCurrentView('sessions');
  }, [setCurrentView]);

  // The new-tab button in the titlebar creates a fresh session — that flows
  // through the same onNewSession callback the parent already wires up.
  const handleNewTab = React.useCallback(() => {
    onNewSession();
  }, [onNewSession]);

  // Closing the slide-in panel = toggle off (only meaningful when open).
  const handleClosePanel = React.useCallback(() => {
    if (v2TracePanelOpen) toggleV2TracePanel();
  }, [v2TracePanelOpen, toggleV2TracePanel]);

  // Derive the RightPanel context props from the current session so the user
  // sees the session's provider/model even though AppShell doesn't take them
  // as explicit props.
  const selectedProviderId = currentSession?.providerId || '';
  const selectedModel = currentSession?.model || '';

  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden relative"
      style={{
        background: 'var(--v2-background-bg-deep, var(--v2-background-bg-base))',
        fontFamily: 'var(--v2-font-family-text)',
      }}
    >
      <V2Titlebar
        openTabs={openTabs}
        currentSessionId={currentSessionId}
        sessions={sessions}
        onTabClick={onLoadSession}
        onTabClose={onCloseTab}
        onNewTab={handleNewTab}
        onHome={handleHome}
        onOpenSettings={() => {
          if (onOpenSettings) onOpenSettings();
          else setCurrentView('settings' as ViewType);
        }}
        v2TracePanelOpen={v2TracePanelOpen}
        toggleV2TracePanel={toggleV2TracePanel}
      />

      {/* Main area — children fill the space. The slide-in panel overlays
          this area (absolute-positioned inside the relative parent). */}
      <main className="flex-1 min-h-0 relative overflow-hidden">
        {loading ? (
          <div
            className="flex items-center justify-center h-full"
            style={{ color: 'var(--v2-text-text-muted)' }}
          >
            <div
              className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin-slow"
              style={{
                borderColor: 'var(--color-accent, var(--v2-blue-600))',
                borderTopColor: 'transparent',
              }}
            />
          </div>
        ) : (
          children
        )}

        {/* Slide-in trace / context / notes panel. */}
        <V2SlideInPanel
          open={v2TracePanelOpen}
          onClose={handleClosePanel}
          width={340}
          title="Inspector"
        >
          <RightPanel
            entries={traceEntries}
            session={currentSession}
            sessionId={currentSessionId}
            providers={providers}
            selectedProviderId={selectedProviderId}
            selectedModel={selectedModel}
            onClose={handleClosePanel}
          />
        </V2SlideInPanel>
      </main>

      {/* Silence "currentView is unused" — it's used implicitly via the
          Home button which sets it. Reading it here keeps the prop live in
          React DevTools and lets future shells branch on it. */}
      {currentView ? null : null}
    </div>
  );
};

export default V2AppShell;
