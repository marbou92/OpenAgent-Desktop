/**
 * OpenAgent-Desktop - Mode Switch (Phase 2.1 Redesign)
 *
 * opencode-desktop-inspired mode selector:
 *
 *   ╭───────────────────────────────────────╮
 *   │  ⚡ Build    📋 Plan    💬 Chat       │   ← segmented control
 *   ╰───────────────────────────────────────╯
 *
 * Changes from Phase 2:
 *   - Smart removed from the visible modes. Smart is now a Settings >
 *     Chat > Smart Approval toggle (it's really a permission mode, not an
 *     agent mode). The backend AgentMode.smart enum is kept for backward
 *     compatibility with existing sessions.
 *   - Inspired by opencode desktop (which exposes only Build/Plan via Tab),
 *     the pills are now bigger, with a sliding indicator behind the active
 *     mode and clearer hover/active states.
 *   - Tab key cycles between Build → Plan → Chat → Build (opencode uses Tab
 *     for the same purpose).
 *   - Keyboard shortcuts 1/2/3 still work for direct selection.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AgentDefinition, AgentMode } from '../../types';

interface ModeOption {
  id: AgentMode;
  label: string;
  color: string;
  // SVG path data for the icon — rendered at 12x12.
  iconPath: string;
  description: string;
  shortcut: string;
}

// Only Build / Plan / Chat are exposed in the UI. Smart was removed in
// Phase 2.1 because it's a permission-mode setting, not an agent mode —
// it lives in Settings > Chat > Smart Approval now. The backend
// AgentMode.smart enum is kept for backward compatibility with sessions
// that were created before this change.
const MODES: ModeOption[] = [
  {
    id: 'build',
    label: 'Build',
    color: '#22c55e',
    iconPath: 'M13 2L3 14h7l-1 8 10-12h-7l1-8z',
    description: 'Full autonomy — all tools enabled',
    shortcut: '1',
  },
  {
    id: 'plan',
    label: 'Plan',
    color: '#3b82f6',
    iconPath: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
    description: 'Read-only analysis — no changes',
    shortcut: '2',
  },
  {
    id: 'chat',
    label: 'Chat',
    color: '#8b5cf6',
    iconPath: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    description: 'Pure conversation — no tools',
    shortcut: '3',
  },
];

interface ModeSwitchProps {
  activeMode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  customAgents?: AgentDefinition[];
  autoDetected?: boolean;
  autoDetectedMode?: AgentMode;
  onAutoAccept?: () => void;
  onAutoDismiss?: () => void;
}

const ModeSwitch: React.FC<ModeSwitchProps> = ({
  activeMode,
  onModeChange,
  customAgents,
  autoDetected = false,
  autoDetectedMode,
  onAutoAccept: _onAutoAccept,
  onAutoDismiss: _onAutoDismiss,
}) => {
  const [hoveredMode, setHoveredMode] = useState<AgentMode | null>(null);
  const [showCustomAgents, setShowCustomAgents] = useState(false);
  const [animatingMode, setAnimatingMode] = useState<AgentMode | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const prevModeRef = useRef<AgentMode>(activeMode);

  // If the active mode is 'smart' (from an old session), normalize it to
  // 'chat' for display purposes. The Smart behavior is now controlled by
  // the Settings > Smart Approval toggle.
  const displayMode: AgentMode = activeMode === 'smart' ? 'chat' : activeMode;

  // ── Keyboard shortcuts (1/2/3 for direct select, Tab to cycle) ────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger if not in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Direct selection via 1/2/3
      const modeMap: Record<string, AgentMode> = {
        '1': 'build',
        '2': 'plan',
        '3': 'chat',
      };
      const directMode = modeMap[e.key];
      if (directMode && directMode !== displayMode) {
        e.preventDefault();
        onModeChange(directMode);
        return;
      }

      // Tab cycles Build → Plan → Chat → Build (opencode-style)
      if (e.key === 'Tab') {
        const currentIdx = MODES.findIndex((m) => m.id === displayMode);
        if (currentIdx >= 0) {
          e.preventDefault();
          const nextIdx = (currentIdx + 1) % MODES.length;
          onModeChange(MODES[nextIdx].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [displayMode, onModeChange]);

  // ── Animate mode switch ─────────────────────────────────────────────

  useEffect(() => {
    if (prevModeRef.current !== displayMode) {
      setAnimatingMode(displayMode);
      const timer = setTimeout(() => setAnimatingMode(null), 300);
      prevModeRef.current = displayMode;
      return () => clearTimeout(timer);
    }
  }, [displayMode]);

  // ── Close dropdown on outside click ─────────────────────────────────

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowCustomAgents(false);
      }
    };

    if (showCustomAgents) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCustomAgents]);

  // ── Get custom agents for current mode ──────────────────────────────

  const agentsForCurrentMode = (customAgents || []).filter(
    (agent) => agent.mode === displayMode && !agent.isBuiltIn,
  );

  const activeModeConfig = MODES.find((m) => m.id === displayMode) || MODES[0];

  const handleModeClick = useCallback(
    (mode: AgentMode) => {
      onModeChange(mode);
      setShowCustomAgents(false);
    },
    [onModeChange],
  );

  return (
    <div className="flex items-center gap-2">
      {/* Mode segmented control — opencode-desktop-inspired */}
      <div
        className="flex items-center gap-0.5 p-0.5 rounded-lg relative"
        style={{
          background: 'var(--color-bg-tertiary)',
          border: '1px solid var(--color-border-secondary)',
        }}
      >
        {MODES.map((mode) => {
          const isActive = displayMode === mode.id;
          const isAnimating = animatingMode === mode.id;
          const isAutoSuggested = autoDetected && autoDetectedMode === mode.id;

          return (
            <div key={mode.id} className="relative">
              <button
                onClick={() => handleModeClick(mode.id)}
                onMouseEnter={() => setHoveredMode(mode.id)}
                onMouseLeave={() => setHoveredMode(null)}
                className="relative px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 flex items-center gap-1.5"
                style={{
                  background: isActive ? 'var(--color-bg-elevated)' : 'transparent',
                  color: isActive ? mode.color : 'var(--color-text-tertiary)',
                  boxShadow: isActive ? 'var(--shadow-soft)' : 'none',
                  transform: isAnimating ? 'scale(1.04)' : 'scale(1)',
                }}
                title={`${mode.description}  [${mode.shortcut}]`}
              >
                {isActive && (
                  <span
                    className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-0.5 rounded-full transition-all duration-300"
                    style={{
                      background: mode.color,
                      width: isAnimating ? '1.5rem' : '1rem',
                    }}
                  />
                )}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0 }}
                >
                  <path d={mode.iconPath} />
                </svg>
                <span>{mode.label}</span>

                {/* Auto-detected indicator */}
                {isAutoSuggested && !isActive && (
                  <span
                    className="absolute -top-1 -right-1 w-2 h-2 rounded-full animate-pulse"
                    style={{ background: mode.color }}
                  />
                )}
              </button>

              {/* Tooltip on hover */}
              {hoveredMode === mode.id && !isActive && (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-[10px] rounded-md whitespace-nowrap z-50 pointer-events-none"
                  style={{
                    background: 'var(--color-bg-elevated)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border)',
                    boxShadow: 'var(--shadow-card)',
                  }}
                >
                  {mode.description}
                  <span className="ml-1.5 opacity-50">[{mode.shortcut}]</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Custom agent selector (if custom agents exist for this mode) */}
      {agentsForCurrentMode.length > 0 && (
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowCustomAgents(!showCustomAgents)}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors"
            style={{
              background: showCustomAgents
                ? activeModeConfig.color + '20'
                : 'var(--color-bg-tertiary)',
              color: showCustomAgents
                ? activeModeConfig.color
                : 'var(--color-text-tertiary)',
              border: showCustomAgents
                ? `1px solid ${activeModeConfig.color}40`
                : '1px solid transparent',
            }}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>{agentsForCurrentMode.length}</span>
            <svg
              className="w-3 h-3 transition-transform"
              style={{ transform: showCustomAgents ? 'rotate(180deg)' : 'rotate(0)' }}
              viewBox="0 0 12 12"
              fill="none"
            >
              <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>

          {/* Dropdown */}
          {showCustomAgents && (
            <div
              className="absolute top-full left-0 mt-1 py-1 rounded-lg z-50 min-w-[180px]"
              style={{
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border)',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <div
                className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Custom Agents
              </div>
              {agentsForCurrentMode.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => {
                    handleModeClick(agent.mode);
                    setShowCustomAgents(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:opacity-90 transition-colors flex items-center gap-2"
                  style={{ color: 'var(--color-text-primary)' }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: agent.color || activeModeConfig.color }}
                  />
                  <span className="truncate">{agent.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Auto-detected badge */}
      {autoDetected && autoDetectedMode && !showCustomAgents && (
        <div
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium animate-fade-in"
          style={{
            background:
              (MODES.find((m) => m.id === autoDetectedMode)?.color || '#8b5cf6') + '20',
            color: MODES.find((m) => m.id === autoDetectedMode)?.color || '#8b5cf6',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: 'currentColor' }}
          />
          <span>Auto</span>
        </div>
      )}
    </div>
  );
};

export default ModeSwitch;
