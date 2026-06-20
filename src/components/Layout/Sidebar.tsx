/**
 * OpenAgent-Desktop - Sidebar (Phase 3 Redesign)
 *
 * Collapsible hybrid sidebar inspired by opencode desktop:
 *
 *   EXPANDED (~260px):              COLLAPSED (icon rail ~60px):
 *   ┌──────────────────┐            ┌────┐
 *   │ 🪄 New Chat      │            │ 🪄 │
 *   ├──────────────────┤            ├────┤
 *   │ 💬 Chat          │            │ 💬 │
 *   │ 🕐 Sessions      │            │ 🕐 │
 *   │ ⚙️ Settings      │            │ ⚙️ │
 *   ├──────────────────┤            ├────┤
 *   │ ▸ More           │            │ ⋯  │
 *   ├──────────────────┤            ├────┤
 *   │ ● 2 providers     │            │ ●  │
 *   │ v2.0.0           │            │    │
 *   └──────────────────┘            └────┘
 *
 * Features:
 *   - Collapsible: expanded ↔ icon rail with smooth width transition
 *   - 3 primary nav items (Chat, Sessions, Settings)
 *   - "More" section for secondary views (Extensions, Recipes, Hooks,
 *     Sandbox, Projects, Skills) — collapsible in expanded mode,
 *     shows as a popover in collapsed mode
 *   - New Chat button at top (icon-only when collapsed)
 *   - Provider status + version in footer
 *   - Tooltips in collapsed mode
 */

import React, { useState } from 'react';
import { ViewType, SessionInfo, ProviderInfo } from '../../types';

interface SidebarProps {
  currentView: ViewType;
  currentSessionId: string | null;
  sessions: SessionInfo[];
  providers: ProviderInfo[];
  version: string;
  collapsed: boolean;
  onNavigate: (view: ViewType) => void;
  onNewSession: () => void;
  onLoadSession: (sessionId: string) => void;
  onImportRecipe: () => void;
  onToggleSidebar: () => void;
}

interface NavItem {
  view: ViewType;
  label: string;
  iconPath: string;
}

// Primary navigation — always visible at the top of the nav section.
const PRIMARY_NAV: NavItem[] = [
  { view: 'chat', label: 'Chat', iconPath: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
  { view: 'sessions', label: 'Sessions', iconPath: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
  { view: 'settings', label: 'Settings', iconPath: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' },
];

// Secondary navigation — hidden inside the "More" section.
const SECONDARY_NAV: NavItem[] = [
  { view: 'extensions', label: 'Extensions', iconPath: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z' },
  { view: 'recipes', label: 'Recipes', iconPath: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' },
  { view: 'hooks', label: 'Hooks', iconPath: 'M12 2a10 10 0 1 0 10 10 M12 12l8-8 M20 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4z' },
  { view: 'sandbox', label: 'Sandbox', iconPath: 'M2 6h20v12H2z M12 12h.01 M17 12h.01 M7 12h.01' },
  { view: 'projects', label: 'Projects', iconPath: 'M3 7h18v14H3z M3 7l3-4h12l3 4 M9 12h6' },
  { view: 'skills', label: 'Skills', iconPath: 'M13 2L3 14h7l-1 8 10-12h-7l1-8z' },
];

const EXPANDED_WIDTH = 260;
const COLLAPSED_WIDTH = 60;

const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  currentSessionId,
  sessions,
  providers,
  version,
  collapsed,
  onNavigate,
  onNewSession,
  onLoadSession,
  onImportRecipe: _onImportRecipe,
  onToggleSidebar,
}) => {
  const [moreExpanded, setMoreExpanded] = useState(false);
  const [morePopoverOpen, setMorePopoverOpen] = useState(false);
  const [sessionsExpanded, setSessionsExpanded] = useState(true);

  const hasConnectedProvider = providers.some((p) => p.configured);
  const configuredCount = providers.filter((p) => p.configured).length;
  const recentSessions = sessions.slice(0, 5);

  const isSecondaryActive = SECONDARY_NAV.some((n) => n.view === currentView);

  const width = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  const handleNavClick = (view: ViewType) => {
    onNavigate(view);
    setMorePopoverOpen(false);
  };

  // ─── Collapsed icon-rail mode ──────────────────────────────────────────
  if (collapsed) {
    return (
      <aside
        className="flex flex-col h-full border-r flex-shrink-0 transition-[width] duration-200 ease-out"
        style={{
          width,
          background: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border-secondary)',
        }}
      >
        {/* Top: expand button + New Chat icon */}
        <div
          className="titlebar-drag flex flex-col items-center gap-2 pt-3 pb-2 border-b"
          style={{ borderColor: 'var(--color-border-secondary)' }}
        >
          <button
            onClick={onToggleSidebar}
            className="titlebar-no-drag p-2 rounded-lg transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
          <button
            onClick={onNewSession}
            className="titlebar-no-drag p-2 rounded-lg transition-colors"
            style={{ background: 'var(--color-accent)', color: 'white' }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            aria-label="New chat"
            title="New chat"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        {/* Nav icons */}
        <nav className="flex-1 flex flex-col items-center gap-1 py-3">
          {PRIMARY_NAV.map((item) => {
            const isActive = currentView === item.view;
            return (
              <button
                key={item.view}
                onClick={() => handleNavClick(item.view)}
                className="p-2.5 rounded-lg transition-colors relative group"
                style={{
                  background: isActive ? 'var(--color-accent-soft)' : 'transparent',
                  color: isActive ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'var(--color-bg-hover)';
                    e.currentTarget.style.color = 'var(--color-text-primary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--color-text-tertiary)';
                  }
                }}
                title={item.label}
                aria-label={item.label}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.iconPath} />
                </svg>
                {isActive && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
                    style={{ background: 'var(--color-accent)' }}
                  />
                )}
              </button>
            );
          })}

          {/* Divider */}
          <div className="w-8 h-px my-1" style={{ background: 'var(--color-border-secondary)' }} />

          {/* More button — opens a popover with secondary nav */}
          <div className="relative">
            <button
              onClick={() => setMorePopoverOpen(!morePopoverOpen)}
              className="p-2.5 rounded-lg transition-colors relative"
              style={{
                background: isSecondaryActive || morePopoverOpen ? 'var(--color-accent-soft)' : 'transparent',
                color: isSecondaryActive || morePopoverOpen ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
              }}
              onMouseEnter={(e) => {
                if (!isSecondaryActive && !morePopoverOpen) {
                  e.currentTarget.style.background = 'var(--color-bg-hover)';
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSecondaryActive && !morePopoverOpen) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--color-text-tertiary)';
                }
              }}
              title="More"
              aria-label="More views"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
                <circle cx="5" cy="12" r="1" />
              </svg>
            </button>

            {/* Popover with secondary nav items */}
            {morePopoverOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMorePopoverOpen(false)}
                />
                <div
                  className="absolute left-full ml-2 top-0 rounded-xl overflow-hidden animate-fade-in z-50"
                  style={{
                    background: 'var(--color-bg-elevated)',
                    border: '1px solid var(--color-border-primary)',
                    boxShadow: 'var(--shadow-popover)',
                    minWidth: '180px',
                  }}
                >
                  <div
                    className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider border-b"
                    style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border-secondary)' }}
                  >
                    More
                  </div>
                  {SECONDARY_NAV.map((item) => {
                    const isActive = currentView === item.view;
                    return (
                      <button
                        key={item.view}
                        onClick={() => handleNavClick(item.view)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors"
                        style={{
                          background: isActive ? 'var(--color-accent-soft)' : 'transparent',
                          color: isActive ? 'var(--color-accent)' : 'var(--color-text-primary)',
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) e.currentTarget.style.background = 'var(--color-bg-hover)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d={item.iconPath} />
                        </svg>
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </nav>

        {/* Footer: provider status dot */}
        <div className="flex flex-col items-center gap-2 py-3 border-t" style={{ borderColor: 'var(--color-border-secondary)' }}>
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: hasConnectedProvider ? 'var(--color-success)' : 'var(--color-error)' }}
            title={hasConnectedProvider ? `${configuredCount} providers connected` : 'No providers connected'}
          />
        </div>
      </aside>
    );
  }

  // ─── Expanded full sidebar mode ─────────────────────────────────────────
  return (
    <aside
      className="flex flex-col h-full border-r flex-shrink-0 transition-[width] duration-200 ease-out"
      style={{
        width,
        background: 'var(--color-bg-secondary)',
        borderColor: 'var(--color-border-secondary)',
      }}
    >
      {/* Header: logo + collapse button */}
      <div
        className="titlebar-drag flex items-center justify-between px-3 border-b"
        style={{ height: 'var(--titlebar-height)', borderColor: 'var(--color-border-secondary)' }}
      >
        <div className="titlebar-no-drag flex items-center gap-2 min-w-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-hover))' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
            OpenAgent
          </span>
        </div>
        <button
          onClick={onToggleSidebar}
          className="titlebar-no-drag p-1.5 rounded-lg transition-colors flex-shrink-0"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        </button>
      </div>

      {/* New Chat button */}
      <div className="px-3 py-3">
        <button
          onClick={onNewSession}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: 'var(--color-accent)', color: 'white' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-accent-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-accent)')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Chat
        </button>
      </div>

      {/* Navigation */}
      <nav className="px-2 flex-1 overflow-y-auto">
        {/* Primary nav */}
        <div className="space-y-0.5">
          {PRIMARY_NAV.map((item) => {
            const isActive = currentView === item.view;
            return (
              <button
                key={item.view}
                onClick={() => handleNavClick(item.view)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
                style={{
                  background: isActive ? 'var(--color-accent-soft)' : 'transparent',
                  color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'var(--color-bg-hover)';
                    e.currentTarget.style.color = 'var(--color-text-primary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                  }
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d={item.iconPath} />
                </svg>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* More section */}
        <div className="mt-2">
          <button
            onClick={() => setMoreExpanded(!moreExpanded)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider w-full transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
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
              style={{ transform: moreExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            More
          </button>
          {moreExpanded && (
            <div className="space-y-0.5 mt-0.5 animate-fade-in">
              {SECONDARY_NAV.map((item) => {
                const isActive = currentView === item.view;
                return (
                  <button
                    key={item.view}
                    onClick={() => handleNavClick(item.view)}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors"
                    style={{
                      background: isActive ? 'var(--color-accent-soft)' : 'transparent',
                      color: isActive ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'var(--color-bg-hover)';
                        e.currentTarget.style.color = 'var(--color-text-secondary)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--color-text-tertiary)';
                      }
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d={item.iconPath} />
                    </svg>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Sessions */}
        {recentSessions.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setSessionsExpanded(!sessionsExpanded)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider w-full transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
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
                style={{ transform: sessionsExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              Recent
            </button>
            {sessionsExpanded && (
              <div className="space-y-0.5 mt-0.5">
                {recentSessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => {
                      onLoadSession(session.id);
                      onNavigate('chat');
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors text-left"
                    style={{
                      background: currentSessionId === session.id ? 'var(--color-accent-soft)' : 'transparent',
                      color: currentSessionId === session.id ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                    }}
                    onMouseEnter={(e) => {
                      if (currentSessionId !== session.id) {
                        e.currentTarget.style.background = 'var(--color-bg-hover)';
                        e.currentTarget.style.color = 'var(--color-text-secondary)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (currentSessionId !== session.id) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--color-text-tertiary)';
                      }
                    }}
                  >
                    <span className="truncate flex-1">{session.name}</span>
                    <span className="flex-shrink-0 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                      {session.messageCount}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Footer: Provider Status & Version */}
      <div className="px-3 py-2.5 border-t" style={{ borderColor: 'var(--color-border-secondary)' }}>
        <div className="flex items-center gap-2 px-1">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: hasConnectedProvider ? 'var(--color-success)' : 'var(--color-error)' }}
          />
          <span className="text-[11px] truncate" style={{ color: 'var(--color-text-tertiary)' }}>
            {hasConnectedProvider
              ? `${configuredCount} provider${configuredCount !== 1 ? 's' : ''} connected`
              : 'No providers connected'}
          </span>
        </div>
        <div className="px-1 mt-1">
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            v{version}
          </span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
