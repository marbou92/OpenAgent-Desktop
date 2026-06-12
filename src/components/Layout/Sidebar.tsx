/**
 * OpenAgent-Desktop - Sidebar Component
 *
 * Navigation items with icons, active session indicator,
 * provider status, quick actions, and version display.
 * Dark theme design with accent colors.
 */

import React, { useState } from 'react';
import { ViewType, SessionInfo, ProviderInfo } from '../../types';

interface SidebarProps {
  currentView: ViewType;
  currentSessionId: string | null;
  sessions: SessionInfo[];
  providers: ProviderInfo[];
  version: string;
  onNavigate: (view: ViewType) => void;
  onNewSession: () => void;
  onLoadSession: (sessionId: string) => void;
  onImportRecipe: () => void;
  onToggleSidebar: () => void;
}

interface NavItem {
  view: ViewType;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    view: 'chat',
    label: 'Chat',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    view: 'extensions',
    label: 'Extensions',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    view: 'recipes',
    label: 'Recipes',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    view: 'sessions',
    label: 'Sessions',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    view: 'hooks',
    label: 'Hooks',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 1 0 10 10" />
        <path d="M12 12l8-8" />
        <circle cx="20" cy="4" r="2" />
      </svg>
    ),
  },
  {
    view: 'sandbox',
    label: 'Sandbox',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <path d="M12 12h.01" />
        <path d="M17 12h.01" />
        <path d="M7 12h.01" />
      </svg>
    ),
  },
  {
    view: 'projects',
    label: 'Projects',
    icon: <span style={{ fontSize: '18px', lineHeight: 1 }}>📁</span>,
  },
  {
    view: 'skills',
    label: 'Skills',
    icon: <span style={{ fontSize: '18px', lineHeight: 1 }}>⚡</span>,
  },
  {
    view: 'settings',
    label: 'Settings',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  currentSessionId,
  sessions,
  providers,
  version,
  onNavigate,
  onNewSession,
  onLoadSession,
  onImportRecipe,
  onToggleSidebar,
}) => {
  const [sessionsExpanded, setSessionsExpanded] = useState(true);

  const hasConnectedProvider = providers.some((p) => p.configured);
  const activeSession = sessions.find((s) => s.id === currentSessionId);
  const recentSessions = sessions.slice(0, 5);

  return (
    <aside
      className="flex flex-col h-full border-r"
      style={{
        width: 'var(--sidebar-width)',
        background: 'var(--color-bg-secondary)',
        borderColor: 'var(--color-border-secondary)',
      }}
    >
      {/* Logo / Header */}
      <div
        className="titlebar-drag flex items-center gap-3 px-4 border-b"
        style={{
          height: 'var(--titlebar-height)',
          borderColor: 'var(--color-border-secondary)',
        }}
      >
        <div className="titlebar-no-drag flex items-center gap-2 flex-1 min-w-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--color-accent), #6d28d9)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
            OpenAgent-Desktop
          </span>
        </div>
        <button
          onClick={onToggleSidebar}
          className="titlebar-no-drag p-1 rounded transition-colors flex-shrink-0"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          aria-label="Collapse sidebar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>
      </div>

      {/* Quick Actions */}
      <div className="px-3 py-3 space-y-2">
        <button
          onClick={onNewSession}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            background: 'var(--color-accent)',
            color: 'white',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Chat
        </button>
        <button
          onClick={onImportRecipe}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors"
          style={{
            background: 'transparent',
            borderColor: 'var(--color-border-primary)',
            color: 'var(--color-text-secondary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-bg-hover)';
            e.currentTarget.style.borderColor = 'var(--color-accent)';
            e.currentTarget.style.color = 'var(--color-accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = 'var(--color-border-primary)';
            e.currentTarget.style.color = 'var(--color-text-secondary)';
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Import Recipe
        </button>
      </div>

      {/* Navigation */}
      <nav className="px-2 flex-1 overflow-y-auto">
        <div className="space-y-0.5">
          {navItems.map((item) => (
            <button
              key={item.view}
              onClick={() => onNavigate(item.view)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
              style={{
                background: currentView === item.view ? 'var(--color-accent-soft)' : 'transparent',
                color: currentView === item.view ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                fontWeight: currentView === item.view ? 600 : 400,
              }}
              onMouseEnter={(e) => {
                if (currentView !== item.view) {
                  e.currentTarget.style.background = 'var(--color-bg-hover)';
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (currentView !== item.view) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                }
              }}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.view === 'chat' && activeSession && (
                <span className="ml-auto text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
                  1
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Recent Sessions */}
        {recentSessions.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setSessionsExpanded(!sessionsExpanded)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium w-full"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transform: sessionsExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              Recent Sessions
            </button>
            {sessionsExpanded && (
              <div className="space-y-0.5 mt-1">
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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <span className="truncate">{session.name}</span>
                    <span className="ml-auto flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
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
      <div className="px-3 py-3 border-t" style={{ borderColor: 'var(--color-border-secondary)' }}>
        {/* Provider Status */}
        <div className="flex items-center gap-2 mb-2 px-1">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: hasConnectedProvider ? 'var(--color-success)' : 'var(--color-error)' }}
          />
          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            {hasConnectedProvider
              ? `${providers.filter((p) => p.configured).length} provider${providers.filter((p) => p.configured).length !== 1 ? 's' : ''} connected`
              : 'No providers connected'}
          </span>
        </div>
        {/* Version */}
        <div className="px-1">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            v{version}
          </span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
