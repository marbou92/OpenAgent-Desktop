/**
 * OpenAgent-Desktop — ProjectSelector (Phase 2.0.3)
 *
 * A Claude Code-style folder picker that lives in the composer's control row.
 * Shows the active project name + a dropdown to switch projects or add a new one.
 *
 *   [📁 my-project ▾]   ← trigger button
 *
 * When clicked, opens a dropdown:
 *   - Searchable list of projects (radio-style with checkmark for active)
 *   - "Add project..." → opens native OS directory picker
 *   - Git branch display next to the project name (reads .git/HEAD)
 *
 * Used in: V2Composer, V2Titlebar, Classic ChatInput.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

const api = (window as any).openagent;

interface ProjectInfo {
  id: string;
  name: string;
  directory: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ProjectSelectorProps {
  /** Compact mode (for titlebar — smaller button, no branch). */
  compact?: boolean;
}

/**
 * Read the current git branch from a directory by parsing .git/HEAD.
 * Returns null if not a git repo or the file can't be read.
 * This runs in the renderer — we use fetch() on the file:// protocol which
 * works in Electron for local files.
 */
async function readGitBranch(directory: string): Promise<string | null> {
  try {
    // .git/HEAD contains either "ref: refs/heads/branch-name" or a detached HEAD hash
    const headPath = `${directory}/.git/HEAD`;
    const response = await fetch(`file://${headPath}`);
    if (!response.ok) return null;
    const text = await response.text();
    const match = text.match(/ref:\s*refs\/heads\/(.+)/);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

function getFolderName(directory: string): string {
  if (!directory) return 'No project';
  const parts = directory.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] || directory;
}

const ProjectSelector: React.FC<ProjectSelectorProps> = ({ compact = false }) => {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load projects + active project on mount + when dropdown opens
  const refresh = useCallback(async () => {
    if (!api?.projects) return;
    try {
      const [list, active]: [any[], any] = await Promise.all([
        api.projects.list(),
        api.projects.getActive(),
      ]);
      setProjects(list || []);
      setActiveProject(active || null);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Read git branch when active project changes
  useEffect(() => {
    if (!activeProject?.directory) {
      setGitBranch(null);
      return;
    }
    readGitBranch(activeProject.directory).then(setGitBranch).catch(() => setGitBranch(null));
  }, [activeProject?.directory]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = useCallback(async (projectId: string) => {
    if (!api?.projects?.setActive) return;
    try {
      await api.projects.setActive(projectId);
      setOpen(false);
      setSearchQuery('');
      await refresh();
    } catch {
      // ignore
    }
  }, [refresh]);

  const handleAddProject = useCallback(async () => {
    if (!api?.dialog?.openDirectory || !api?.projects?.create) return;
    try {
      const dir = await api.dialog.openDirectory('Select project directory');
      if (!dir) return;
      const name = getFolderName(dir);
      await api.projects.create({ name, directory: dir });
      await refresh();
    } catch {
      // ignore
    }
  }, [refresh]);

  const filtered = searchQuery.trim()
    ? projects.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.directory.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : projects;

  const displayName = activeProject?.name || getFolderName(activeProject?.directory || '') || 'No project';

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger button — ghost/transparent, matching other selectors */}
      <button
        type="button"
        onClick={() => !compact && setOpen(v => !v)}
        className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-[13px] transition-colors ${compact ? 'max-w-[160px]' : 'max-w-[200px]'}`}
        style={{
          background: open ? 'var(--v2-overlay-simple-overlay-hover, var(--color-bg-hover))' : 'transparent',
          color: activeProject ? 'var(--v2-text-text-muted, var(--color-text-secondary))' : 'var(--v2-text-text-faint, var(--color-text-tertiary))',
          border: '1px solid transparent',
          fontFamily: 'var(--v2-font-family-text)',
        }}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover, var(--color-bg-hover))';
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.background = 'transparent';
        }}
        title={activeProject?.directory || 'No project selected'}
      >
        {/* Folder icon */}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <span className="truncate">{displayName}</span>
        {/* Git branch (non-compact only) */}
        {!compact && gitBranch && (
          <span className="text-[11px] truncate" style={{ color: 'var(--v2-text-text-faint, var(--color-text-muted))' }}>
            ({gitBranch})
          </span>
        )}
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{
          transform: open ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform 0.15s ease',
          color: 'var(--v2-icon-icon-muted, var(--color-text-tertiary))',
          flexShrink: 0,
        }}>
          <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown — minimal opencode-style */}
      {open && (
        <div
          className="absolute bottom-full left-0 mb-2 rounded-[10px] overflow-hidden animate-fade-in"
          style={{
            background: 'var(--v2-background-bg-base, var(--color-bg-elevated))',
            boxShadow: 'var(--v2-elevation-floating, var(--shadow-popover))',
            minWidth: '220px',
            maxWidth: '280px',
            maxHeight: '320px',
            zIndex: 50,
            padding: '4px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Search input */}
          <div className="px-1 pb-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              autoFocus
              className="w-full px-2 py-1.5 text-[12px] rounded-[6px] outline-none"
              style={{
                background: 'var(--v2-background-bg-layer-02, var(--color-bg-tertiary))',
                color: 'var(--v2-text-text-base, var(--color-text-primary))',
                border: '1px solid var(--v2-border-border-base, var(--color-border-primary))',
                fontFamily: 'var(--v2-font-family-text)',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  if (searchQuery) setSearchQuery('');
                  else setOpen(false);
                }
              }}
            />
          </div>

          {/* Project list */}
          <div className="flex-1 overflow-y-auto" style={{ minHeight: '0' }}>
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-[12px] text-center" style={{ color: 'var(--v2-text-text-faint, var(--color-text-muted))' }}>
                {searchQuery ? 'No matches' : 'No projects yet'}
              </div>
            ) : (
              filtered.map((p, idx) => {
                const isActive = p.id === activeProject?.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => handleSelect(p.id)}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-left rounded-[6px] transition-colors"
                    style={{
                      background: isActive
                        ? 'var(--v2-overlay-simple-overlay-hover, var(--color-accent-soft))'
                        : hoveredIdx === idx
                        ? 'var(--v2-overlay-simple-overlay-hover, var(--color-bg-hover))'
                        : 'transparent',
                    }}
                  >
                    <span
                      className="text-[13px] flex-1 truncate"
                      style={{
                        color: isActive ? 'var(--color-accent)' : 'var(--v2-text-text-base, var(--color-text-primary))',
                        fontFamily: 'var(--v2-font-family-text)',
                        fontWeight: isActive ? 'var(--v2-font-weight-medium)' : 'var(--v2-font-weight-regular)',
                      }}
                    >
                      {p.name || getFolderName(p.directory)}
                    </span>
                    {isActive && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Divider + Add project */}
          <div className="pt-1 mt-1" style={{ borderTop: '1px solid var(--v2-border-border-muted, var(--color-border-secondary))' }}>
            <button
              onClick={handleAddProject}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-left rounded-[6px] transition-colors"
              style={{ color: 'var(--v2-text-text-muted, var(--color-text-secondary))' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover, var(--color-bg-hover))'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span className="text-[13px]" style={{ fontFamily: 'var(--v2-font-family-text)' }}>
                Choose folder...
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectSelector;
