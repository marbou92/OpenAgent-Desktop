/**
 * OpenAgent-Desktop — V2 Home View (Phase 2.0.3)
 *
 * The Modern-layout home screen. A floating card on deep bg with a 2-column
 * layout:
 *
 *   ┌──────────────────────┬────────────────────────────────────────┐
 *   │ Projects             │ [Search…]                    [+ New]   │
 *   │  + Add Project       │                                        │
 *   │  ─────────────       │ Today                                  │
 *   │  • Project A  (•)    │   Session 1                            │
 *   │  • Project B         │   Session 2                            │
 *   │  • Project C         │ Yesterday                              │
 *   │                      │   Session 3                            │
 *   │                      │ Older                                  │
 *   │  ⚙ Settings  ? Help  │   Session 4                            │
 *   └──────────────────────┴────────────────────────────────────────┘
 *
 * The Projects column is a 280px left rail. The Sessions column fills the
 * remaining space, with sessions grouped by Today / Yesterday / Older based
 * on `updatedAt`.
 *
 * Clicking a project calls `api.projects.setActive` and refilters the session
 * list to that project's sessions (passed in via `sessions`).
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  SessionInfo,
  ProjectConfig,
  Toast,
} from '../../../types';
import { getAPI } from '../../../utils/api';

interface V2HomeViewProps {
  sessions: SessionInfo[];
  currentSessionId: string | null;
  onLoadSession: (sessionId: string) => void;
  onNewSession: () => void;
  onOpenSettings: () => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

type SessionGroup = 'Today' | 'Yesterday' | 'Older';
const GROUP_ORDER: SessionGroup[] = ['Today', 'Yesterday', 'Older'];

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function classifySession(updatedAt: string, now: Date): SessionGroup {
  let ts: number;
  try {
    ts = new Date(updatedAt).getTime();
  } catch {
    return 'Older';
  }
  if (!Number.isFinite(ts)) return 'Older';
  const todayStart = startOfDay(now);
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  if (ts >= todayStart) return 'Today';
  if (ts >= yesterdayStart) return 'Yesterday';
  return 'Older';
}

const V2HomeView: React.FC<V2HomeViewProps> = ({
  sessions,
  currentSessionId,
  onLoadSession,
  onNewSession,
  onOpenSettings,
  addToast,
}) => {
  const api = getAPI();
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // ── Load projects + active project on mount ────────────────────────
  const refreshProjects = useCallback(async () => {
    if (!api?.projects) return;
    try {
      const [list, active] = await Promise.all([
        api.projects.list().catch(() => [] as ProjectConfig[]),
        api.projects.getActive().catch(() => null as ProjectConfig | null),
      ]);
      setProjects(list || []);
      setActiveProjectId(active?.id || null);
    } catch {
      /* ignore — projects subsystem may be unavailable */
    }
  }, [api]);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const handleAddProject = useCallback(async () => {
    if (!api?.projects?.create) {
      addToast({ type: 'info', title: 'Projects unavailable in this build' });
      return;
    }
    try {
      const created = await api.projects.create({
        name: `Project ${projects.length + 1}`,
      });
      addToast({ type: 'success', title: `Created ${created.name}` });
      await refreshProjects();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({ type: 'error', title: 'Failed to create project', message: msg });
    }
  }, [api, projects.length, refreshProjects, addToast]);

  const handleSelectProject = useCallback(
    async (projectId: string) => {
      if (!api?.projects?.setActive) return;
      try {
        await api.projects.setActive(projectId);
        setActiveProjectId(projectId);
        const p = projects.find((x) => x.id === projectId);
        if (p) addToast({ type: 'success', title: `Switched to ${p.name}` });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        addToast({ type: 'error', title: 'Failed to switch project', message: msg });
      }
    },
    [api, projects, addToast],
  );

  // ── Filter + group sessions ────────────────────────────────────────
  const filteredSessions = useMemo(() => {
    // Filter by active project first (Phase 2.0.2 sessions carry projectId).
    let list = sessions;
    if (activeProjectId) {
      list = list.filter(
        (s) => s.projectId === activeProjectId || s.projectId == null,
      );
    }
    // Then by search query.
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.model || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [sessions, activeProjectId, search]);

  const grouped = useMemo(() => {
    const now = new Date();
    const out: Record<SessionGroup, SessionInfo[]> = {
      Today: [],
      Yesterday: [],
      Older: [],
    };
    for (const s of filteredSessions) {
      out[classifySession(s.updatedAt, now)].push(s);
    }
    // Sort each group newest-first.
    for (const k of GROUP_ORDER) {
      out[k].sort((a, b) => {
        const ta = new Date(a.updatedAt).getTime();
        const tb = new Date(b.updatedAt).getTime();
        return tb - ta;
      });
    }
    return out;
  }, [filteredSessions]);

  return (
    <div
      className="h-full w-full flex items-stretch justify-center overflow-hidden"
      style={{
        background: 'var(--v2-background-bg-deep, var(--v2-background-bg-base))',
        fontFamily: 'var(--v2-font-family-text)',
        padding: '0 16px 16px',
      }}
    >
      {/* Floating card */}
      <div
        className="flex h-full w-full"
        style={{
          maxWidth: '1100px',
          background: 'var(--v2-background-bg-base)',
          borderRadius: 'var(--v2-radius-xl, 16px)',
          boxShadow: 'var(--v2-elevation-raised)',
          border: '1px solid var(--v2-border-border-muted)',
          overflow: 'hidden',
          marginTop: '16px',
        }}
      >
        {/* ─── Projects column (280px) ───────────────────────────────── */}
        <aside
          className="flex flex-col flex-shrink-0"
          style={{
            width: '280px',
            borderRight: '1px solid var(--v2-border-border-muted)',
            background: 'var(--v2-background-bg-deep, var(--v2-background-bg-base))',
          }}
        >
          <div
            className="flex items-center justify-between px-4 flex-shrink-0"
            style={{
              height: '40px',
              borderBottom: '1px solid var(--v2-border-border-muted)',
            }}
          >
            <span
              className="text-[12px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--v2-text-text-faint)' }}
            >
              Projects
            </span>
            <button
              type="button"
              onClick={handleAddProject}
              className="flex items-center justify-center h-6 w-6 rounded-md transition-colors"
              style={{ color: 'var(--v2-icon-icon-muted)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover)';
                e.currentTarget.style.color = 'var(--v2-text-text-base)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--v2-icon-icon-muted)';
              }}
              aria-label="Add project"
              title="Add project"
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
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                <line x1="12" y1="11" x2="12" y2="17" />
                <line x1="9" y1="14" x2="15" y2="14" />
              </svg>
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto py-1 px-1.5">
            {projects.length === 0 ? (
              <div
                className="px-3 py-6 text-center text-[12px]"
                style={{ color: 'var(--v2-text-text-faint)' }}
              >
                No projects yet.
                <br />
                Click + to add one.
              </div>
            ) : (
              projects.map((project) => {
                const isActive = project.id === activeProjectId;
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => handleSelectProject(project.id)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left transition-colors"
                    style={{
                      background: isActive
                        ? 'var(--v2-overlay-simple-overlay-hover)'
                        : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                    title={project.directory || project.name}
                  >
                    <span
                      className="flex items-center justify-center flex-shrink-0"
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '6px',
                        background: isActive
                          ? 'var(--color-accent, var(--v2-blue-600))'
                          : 'var(--v2-overlay-simple-overlay-hover)',
                        color: 'white',
                      }}
                    >
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                    </span>
                    <span
                      className="text-[13px] truncate flex-1 min-w-0"
                      style={{
                        color: isActive
                          ? 'var(--v2-text-text-base)'
                          : 'var(--v2-text-text-muted)',
                        fontWeight: isActive
                          ? 'var(--v2-font-weight-medium)'
                          : 'var(--v2-font-weight-regular)',
                      }}
                    >
                      {project.name}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer: settings + help */}
          <div
            className="flex items-center gap-1 px-2 flex-shrink-0"
            style={{
              height: '40px',
              borderTop: '1px solid var(--v2-border-border-muted)',
            }}
          >
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex items-center gap-1.5 h-7 px-2 rounded-md text-[12px] transition-colors"
              style={{ color: 'var(--v2-text-text-muted)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover)';
                e.currentTarget.style.color = 'var(--v2-text-text-base)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--v2-text-text-muted)';
              }}
              title="Settings"
            >
              <svg
                width="13"
                height="13"
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
              Settings
            </button>
            <button
              type="button"
              onClick={() =>
                addToast({
                  type: 'info',
                  title: 'OpenAgent-Desktop',
                  message: 'Press ? anywhere for keyboard shortcuts.',
                })
              }
              className="flex items-center justify-center h-7 w-7 rounded-md transition-colors"
              style={{ color: 'var(--v2-text-text-muted)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover)';
                e.currentTarget.style.color = 'var(--v2-text-text-base)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--v2-text-text-muted)';
              }}
              aria-label="Help"
              title="Help"
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
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
          </div>
        </aside>

        {/* ─── Sessions column ────────────────────────────────────────── */}
        <section className="flex flex-col flex-1 min-w-0">
          {/* Header: search + New button */}
          <div
            className="flex items-center gap-2 px-4 flex-shrink-0"
            style={{
              height: '40px',
              borderBottom: '1px solid var(--v2-border-border-muted)',
            }}
          >
            <div
              className="flex items-center gap-2 flex-1 min-w-0 h-7 px-2 rounded-md"
              style={{
                background: 'var(--v2-overlay-simple-overlay-hover)',
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color: 'var(--v2-icon-icon-muted)', flexShrink: 0 }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search sessions…"
                className="flex-1 min-w-0 bg-transparent outline-none text-[12px]"
                style={{
                  color: 'var(--v2-text-text-base)',
                  fontFamily: 'var(--v2-font-family-text)',
                }}
              />
            </div>
            <button
              type="button"
              onClick={onNewSession}
              className="flex items-center gap-1.5 h-7 px-3 rounded-md text-[12px] font-medium flex-shrink-0 transition-all"
              style={{
                background: 'var(--color-accent, var(--v2-blue-600))',
                color: 'white',
                fontWeight: 'var(--v2-font-weight-medium)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.92';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1';
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New
            </button>
          </div>

          {/* Grouped session list */}
          <div className="flex-1 min-h-0 overflow-y-auto px-2 py-3">
            {filteredSessions.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center h-full px-6 text-center"
                style={{ color: 'var(--v2-text-text-muted)' }}
              >
                <div
                  className="flex items-center justify-center mb-3"
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '12px',
                    background: 'var(--v2-overlay-simple-overlay-hover)',
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ color: 'var(--v2-icon-icon-muted)' }}
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div
                  className="text-[13px]"
                  style={{
                    color: 'var(--v2-text-text-base)',
                    fontWeight: 'var(--v2-font-weight-medium)',
                    marginBottom: '4px',
                  }}
                >
                  No sessions yet
                </div>
                <div className="text-[12px]" style={{ color: 'var(--v2-text-text-muted)' }}>
                  Click "New" to start a conversation.
                </div>
              </div>
            ) : (
              GROUP_ORDER.map((group) => {
                const items = grouped[group];
                if (items.length === 0) return null;
                return (
                  <div key={group} className="mb-4">
                    <div
                      className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--v2-text-text-faint)' }}
                    >
                      {group}
                    </div>
                    {items.map((session) => {
                      const isActive = session.id === currentSessionId;
                      return (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => onLoadSession(session.id)}
                          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left transition-colors"
                          style={{
                            background: isActive
                              ? 'var(--v2-overlay-simple-overlay-hover)'
                              : 'transparent',
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.background = 'transparent';
                            }
                          }}
                        >
                          <span
                            className="flex items-center justify-center flex-shrink-0"
                            style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '6px',
                              background: isActive
                                ? 'var(--color-accent, var(--v2-blue-600))'
                                : 'var(--v2-overlay-simple-overlay-hover)',
                              color: 'white',
                            }}
                          >
                            <svg
                              width="11"
                              height="11"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                          </span>
                          <div className="flex-1 min-w-0">
                            <div
                              className="text-[13px] truncate"
                              style={{
                                color: isActive
                                  ? 'var(--v2-text-text-base)'
                                  : 'var(--v2-text-text-muted)',
                                fontWeight: isActive
                                  ? 'var(--v2-font-weight-medium)'
                                  : 'var(--v2-font-weight-regular)',
                              }}
                            >
                              {session.name}
                            </div>
                            <div
                              className="text-[11px] truncate"
                              style={{ color: 'var(--v2-text-text-faint)' }}
                            >
                              {session.messageCount} message
                              {session.messageCount === 1 ? '' : 's'}
                              {session.model ? ` · ${session.model}` : ''}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default V2HomeView;
