/**
 * OpenAgent-Desktop - Right Panel (Phase 3.1 Redesign)
 *
 * The right side panel is now a TABBED container with three tabs:
 *
 *   ┌─────────────────────────────┐
 *   │  📋 Trace  📁 Context  📝 Notes │ ← tab bar
 *   ├─────────────────────────────┤
 *   │                             │
 *   │  (tab content)              │
 *   │                             │
 *   └─────────────────────────────┘
 *
 * Tabs:
 *   - Trace: redesigned agent trace (collapsible tree view)
 *   - Context: attached files, working directory, session info
 *   - Notes: per-session scratchpad (persisted to localStorage)
 *
 * The panel is opt-in (manual toggle via the panel button in the chat
 * header). Width is ~340px. Slides in from the right as an overlay.
 */

import React, { useState } from 'react';
import { TraceEntry, SessionData, ProviderInfo } from '../../../types';
import TraceTab from './TraceTab';
import ContextTab from './ContextTab';
import NotesTab from './NotesTab';

interface RightPanelProps {
  entries: TraceEntry[];
  session: SessionData | null;
  sessionId: string | null;
  providers: ProviderInfo[];
  selectedProviderId: string;
  selectedModel: string;
  onClose: () => void;
}

type Tab = 'trace' | 'context' | 'notes';

const TABS: { id: Tab; label: string; iconPath: string }[] = [
  { id: 'trace', label: 'Trace', iconPath: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
  { id: 'context', label: 'Context', iconPath: 'M3 7h18v14H3z M3 7l3-4h12l3 4 M9 12h6' },
  { id: 'notes', label: 'Notes', iconPath: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8' },
];

const RightPanel: React.FC<RightPanelProps> = ({
  entries,
  session,
  sessionId,
  providers,
  selectedProviderId,
  selectedModel,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('trace');

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-secondary)' }}>
      {/* Tab bar */}
      <div
        className="flex items-center justify-between border-b flex-shrink-0"
        style={{ borderColor: 'var(--color-border-secondary)' }}
      >
        <div className="flex items-center">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors relative"
                style={{
                  color: isActive ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.color = 'var(--color-text-primary)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.color = 'var(--color-text-tertiary)';
                }}
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
                  <path d={tab.iconPath} />
                </svg>
                <span>{tab.label}</span>
                {tab.id === 'trace' && entries.length > 0 && (
                  <span
                    className="ml-0.5 text-[10px] px-1 py-0 rounded-full"
                    style={{
                      background: isActive ? 'var(--color-accent-soft)' : 'var(--color-bg-tertiary)',
                      color: isActive ? 'var(--color-accent)' : 'var(--color-text-muted)',
                    }}
                  >
                    {entries.length}
                  </span>
                )}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                    style={{ background: 'var(--color-accent)' }}
                  />
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 mr-2 rounded transition-colors"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
          aria-label="Close panel"
          title="Close panel"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'trace' && <TraceTab entries={entries} />}
        {activeTab === 'context' && (
          <ContextTab
            session={session}
            providers={providers}
            selectedProviderId={selectedProviderId}
            selectedModel={selectedModel}
          />
        )}
        {activeTab === 'notes' && <NotesTab sessionId={sessionId} />}
      </div>
    </div>
  );
};

export default RightPanel;
