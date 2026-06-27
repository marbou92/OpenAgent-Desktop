/**
 * OpenAgent-Desktop — V2 Home View (Phase 1.3)
 *
 * The Modern-layout home screen. A floating card (rounded-10px, raised shadow)
 * on the deep background, with a 2-column layout:
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Projects (280px)        │ Sessions                            │
 *   │ ┌────────────────────┐  │ ┌────────────────────────────────┐  │
 *   │ │ + Add Project      │  │ │ 🔍 Search sessions…            │  │
 *   │ │ ▢ Project A       │  │ └────────────────────────────────┘  │
 *   │ │ ▢ Project B       │  │                                     │
 *   │ │ ...                │  │ Today                               │
 *   │ ├────────────────────┤  │ ┌────────────────────────────────┐  │
 *   │ │ ⚙ Settings         │  │ │ ▢ Chat 1                      │  │
 *   │ │ ? Help             │  │ │ ▢ Chat 2                      │  │
 *   │ └────────────────────┘  │ └────────────────────────────────┘  │
 *   │                         │ Yesterday                           │
 *   │                         │ ...                                 │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Sessions are grouped by date (Today / Yesterday / Older) and the first group
 * shows a "New session" button.
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { SessionInfo, Toast } from '../../../types';

const api = (window as any).openagent;

interface V2HomeViewProps {
  sessions: SessionInfo[];
  currentSessionId: string | null;
  onLoadSession: (sessionId: string) => void;
  onNewSession: () => void;
  onOpenSettings: () => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

// ─── Date grouping ────────────────────────────────────────────────────────────

function groupSessionsByDate(sessions: SessionInfo[]): { label: string; sessions: SessionInfo[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);

  const groups: { label: string; sessions: SessionInfo[] }[] = [
    { label: 'Today', sessions: [] },
    { label: 'Yesterday', sessions: [] },
    { label: 'Older', sessions: [] },
  ];

  for (const s of sessions) {
    const d = new Date(s.updatedAt || s.createdAt);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (day.getTime() === today.getTime()) groups[0].sessions.push(s);
    else if (day.getTime() === yesterday.getTime()) groups[1].sessions.push(s);
    else groups[2].sessions.push(s);
  }

  return groups.filter(g => g.sessions.length > 0);
}

// ─── Projects Column ──────────────────────────────────────────────────────────

const ProjectsColumn: React.FC<{
  onOpenSettings: () => void;
}> = ({ onOpenSettings }) => {
  const [projects, setProjects] = useState<any[]>([]);

  useEffect(() => {
    if (!api?.projects?.list) return;
    api.projects.list().then((p: any[]) => setProjects(p || [])).catch(() => {});
  }, []);

  const handleAddProject = useCallback(async () => {
    if (!api?.projects?.create) return;
    try {
      const result = await api.dialog.openFile({
        title: 'Select project directory',
        properties: ['openDirectory'],
      });
      if (!result || result.canceled || !result.filePaths?.[0]) return;
      await api.projects.create({ directory: result.filePaths[0] });
      const list = await api.projects.list();
      setProjects(list || []);
    } catch (err: any) {
      // Non-critical
    }
  }, []);

  return (
    <aside
      className="flex flex-col h-full overflow-hidden"
      style={{ borderRight: '1px solid var(--v2-border-border-muted)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 flex-shrink-0"
        style={{ height: '36px' }}
      >
        <span
          className="text-[13px]"
          style={{ color: 'var(--v2-text-text-muted)', fontWeight: 'var(--v2-font-weight-medium)', fontFamily: 'var(--v2-font-family-text)' }}
        >
          Projects
        </span>
        <button
          onClick={handleAddProject}
          className="flex items-center justify-center h-6 w-6 rounded transition-colors"
          style={{ color: 'var(--v2-icon-icon-muted)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          aria-label="Add project"
          title="Add project"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
        </button>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto px-2">
        {projects.length === 0 ? (
          <div
            className="text-[12px] px-2 py-3 text-center"
            style={{ color: 'var(--v2-text-text-faint)', fontFamily: 'var(--v2-font-family-text)' }}
          >
            No projects yet
          </div>
        ) : (
          projects.map((p, i) => (
            <button
              key={p.id || i}
              className="w-full flex items-center gap-2 px-2 h-7 rounded transition-colors text-left"
              style={{ color: 'var(--v2-text-text-base)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v2-icon-icon-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span className="text-[13px] truncate" style={{ fontFamily: 'var(--v2-font-family-text)', fontWeight: 'var(--v2-font-weight-regular)' }}>
                {p.name || p.directory?.split(/[\\/]/).pop() || 'Project'}
              </span>
            </button>
          ))
        )}
      </div>

      {/* Footer: Settings + Help */}
      <div
        className="flex-shrink-0 px-2 py-2 flex flex-col gap-0.5"
        style={{ borderTop: '1px solid var(--v2-border-border-muted)' }}
      >
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 px-2 h-7 rounded transition-colors text-left"
          style={{ color: 'var(--v2-text-text-muted)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span className="text-[13px]" style={{ fontFamily: 'var(--v2-font-family-text)' }}>Settings</span>
        </button>
        <button
          className="w-full flex items-center gap-2 px-2 h-7 rounded transition-colors text-left"
          style={{ color: 'var(--v2-text-text-muted)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="text-[13px]" style={{ fontFamily: 'var(--v2-font-family-text)' }}>Help</span>
        </button>
      </div>
    </aside>
  );
};

// ─── Session Row ──────────────────────────────────────────────────────────────

const SessionRow: React.FC<{
  session: SessionInfo;
  active: boolean;
  onClick: () => void;
}> = ({ session, active, onClick }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-2.5 px-3 h-10 rounded-[6px] transition-colors text-left"
    style={{
      background: active ? 'var(--v2-background-bg-layer-03)' : 'transparent',
    }}
    onMouseEnter={(e) => {
      if (!active) e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover)';
    }}
    onMouseLeave={(e) => {
      if (!active) e.currentTarget.style.background = 'transparent';
    }}
  >
    {/* Session icon — small chat bubble */}
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--v2-icon-icon-accent)' : 'var(--v2-icon-icon-muted)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
    <span
      className="text-[13px] truncate flex-1 min-w-0"
      style={{
        fontFamily: 'var(--v2-font-family-text)',
        fontWeight: active ? 'var(--v2-font-weight-medium)' : 'var(--v2-font-weight-regular)',
        color: active ? 'var(--v2-text-text-base)' : 'var(--v2-text-text-base)',
      }}
    >
      {session.name || 'New Chat'}
    </span>
    {session.messageCount > 0 && (
      <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--v2-text-text-faint)', fontFamily: 'var(--v2-font-family-text)' }}>
        {session.messageCount}
      </span>
    )}
  </button>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const V2HomeView: React.FC<V2HomeViewProps> = ({
  sessions,
  currentSessionId,
  onLoadSession,
  onNewSession,
  onOpenSettings,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSessions = useMemo(() => {
    let result = [...sessions];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.providerId.toLowerCase().includes(q) ||
        s.model.toLowerCase().includes(q)
      );
    }
    // Sort by updatedAt desc
    result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return result;
  }, [sessions, searchQuery]);

  const groups = useMemo(() => groupSessionsByDate(filteredSessions), [filteredSessions]);

  return (
    <div
      className="h-full w-full flex items-center justify-center p-2"
      style={{ background: 'var(--v2-background-bg-deep)' }}
    >
      {/* The floating card */}
      <div
        className="flex h-full w-full max-w-[1080px] overflow-hidden"
        style={{
          background: 'var(--v2-background-bg-base)',
          borderRadius: 'var(--v2-radius-lg)',
          boxShadow: 'var(--v2-elevation-raised)',
        }}
      >
        {/* Left column: Projects (280px) */}
        <div className="flex-shrink-0 h-full" style={{ width: '280px' }}>
          <ProjectsColumn onOpenSettings={onOpenSettings} />
        </div>

        {/* Right column: Sessions */}
        <section className="flex-1 min-w-0 flex flex-col h-full">
          {/* Search bar */}
          <div className="flex items-center gap-2 px-4 flex-shrink-0" style={{ height: '36px' }}>
            <div
              className="flex items-center gap-2 flex-1 h-7 px-2.5 rounded-[6px]"
              style={{ background: 'var(--v2-background-bg-layer-02)' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v2-icon-icon-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sessions…"
                className="flex-1 bg-transparent outline-none text-[13px] min-w-0"
                style={{
                  color: 'var(--v2-text-text-base)',
                  fontFamily: 'var(--v2-font-family-text)',
                  fontWeight: 'var(--v2-font-weight-regular)',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="flex-shrink-0 p-0.5 rounded"
                  style={{ color: 'var(--v2-icon-icon-muted)' }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
            {/* New session button */}
            <button
              onClick={onNewSession}
              className="flex items-center gap-1.5 h-7 px-3 rounded-[6px] flex-shrink-0 transition-colors"
              style={{
                // Phase 1.9.1: use accent (follows palette) instead of grey contrast.
                background: 'var(--color-accent, var(--v2-blue-600))',
                color: 'white',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span className="text-[12px]" style={{ fontFamily: 'var(--v2-font-family-text)', fontWeight: 'var(--v2-font-weight-medium)' }}>
                New
              </span>
            </button>
          </div>

          {/* Session list (grouped) */}
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--v2-icon-icon-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <p className="text-[13px]" style={{ color: 'var(--v2-text-text-muted)', fontFamily: 'var(--v2-font-family-text)' }}>
                  {searchQuery ? 'No sessions match your search' : 'No sessions yet'}
                </p>
                {!searchQuery && (
                  <button
                    onClick={onNewSession}
                    className="mt-1 px-3 py-1.5 rounded-[6px] text-[12px] transition-colors"
                    style={{
                      // Phase 1.9.1: use accent (follows palette).
                      background: 'var(--color-accent, var(--v2-blue-600))',
                      color: 'white',
                      fontFamily: 'var(--v2-font-family-text)',
                      fontWeight: 'var(--v2-font-weight-medium)',
                    }}
                  >
                    Start a new chat
                  </button>
                )}
              </div>
            ) : (
              groups.map((group, gi) => (
                <div key={group.label} className={gi > 0 ? 'mt-3' : ''}>
                  {/* Group header */}
                  <div className="flex items-center px-3 h-7">
                    <span
                      className="text-[11px] uppercase tracking-wide"
                      style={{ color: 'var(--v2-text-text-faint)', fontFamily: 'var(--v2-font-family-text)', fontWeight: 'var(--v2-font-weight-medium)' }}
                    >
                      {group.label}
                    </span>
                  </div>
                  {/* Session rows */}
                  <div className="flex flex-col gap-0.5">
                    {group.sessions.map(s => (
                      <SessionRow
                        key={s.id}
                        session={s}
                        active={s.id === currentSessionId}
                        onClick={() => onLoadSession(s.id)}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default V2HomeView;
