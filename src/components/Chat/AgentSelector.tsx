/**
 * OpenAgent-Desktop - Agent Selector (Phase 2.2 — opencode-desktop-style)
 *
 * Replaces the old ModeSwitch segmented control. opencode desktop places
 * the agent/mode selector as a single small ghost-styled dropdown button
 * in the BOTTOM-LEFT of the prompt-input composer, sitting next to the
 * model selector. We follow the same layout here.
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  ⚡ Build ▾   🤖 gpt-4o ▾                  [➤ Send]      │
 *   │  ^^^^^^^^^^^   ^^^^^^^^^^^^^                             │
 *   │  AgentSelector  ModelSelector                             │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Only Build and Plan are exposed in the UI (opencode desktop's two
 * agents). Chat and Smart are NOT selectable — old sessions that had
 * those modes normalize to Build at display time.
 *
 * Keyboard:
 *   - Tab cycles Build ⇄ Plan (opencode's Tab behaviour).
 *   - 1 / 2 select Build / Plan directly.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AgentDefinition, AgentMode } from '../../types';

interface ModeOption {
  id: AgentMode;
  label: string;
  color: string;
  // SVG path data — rendered at 12x12.
  iconPath: string;
  description: string;
  shortcut: string;
}

// Only Build and Plan are exposed in the UI (opencode desktop has exactly
// these two agents). Chat and Smart exist in the backend AgentMode enum
// for backward compatibility but are NOT selectable from the UI — old
// sessions with those modes normalize to Build at display time.
const MODES: ModeOption[] = [
  {
    id: 'build',
    label: 'Build',
    color: '#22c55e',
    iconPath: 'M13 2L3 14h7l-1 8 10-12h-7l1-8z',
    description: 'Full-access agent for development work',
    shortcut: '1',
  },
  {
    id: 'plan',
    label: 'Plan',
    color: '#3b82f6',
    iconPath: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
    description: 'Read-only agent for analysis and exploration',
    shortcut: '2',
  },
];

interface AgentSelectorProps {
  activeMode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  customAgents?: AgentDefinition[];
  disabled?: boolean;
}

/**
 * Normalize any backend AgentMode to one of the two UI-visible modes.
 * Old sessions stored with 'chat' or 'smart' (which are no longer
 * selectable from the UI) fall back to 'build'.
 */
function normalizeMode(mode: AgentMode): 'build' | 'plan' {
  return mode === 'plan' ? 'plan' : 'build';
}

const AgentSelector: React.FC<AgentSelectorProps> = ({
  activeMode,
  onModeChange,
  customAgents,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // The mode we actually display. Anything other than 'plan' shows as 'build'.
  const displayMode = normalizeMode(activeMode);
  const activeConfig = MODES.find((m) => m.id === displayMode) || MODES[0];

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Direct selection via 1/2
      const modeMap: Record<string, AgentMode> = {
        '1': 'build',
        '2': 'plan',
      };
      const directMode = modeMap[e.key];
      if (directMode && directMode !== displayMode) {
        e.preventDefault();
        onModeChange(directMode);
        return;
      }

      // Tab cycles Build ⇄ Plan (opencode-style — only two agents).
      if (e.key === 'Tab') {
        const next: AgentMode = displayMode === 'build' ? 'plan' : 'build';
        e.preventDefault();
        onModeChange(next);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [displayMode, onModeChange]);

  // ── Close menu on outside click ───────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = useCallback(
    (mode: AgentMode) => {
      onModeChange(mode);
      setOpen(false);
    },
    [onModeChange],
  );

  // Build the list of options: the two primary modes, plus any custom
  // agents defined for the current mode (so users can pick a specialised
  // preset like "Frontend Dev" under Build).
  const customForCurrent = (customAgents || []).filter(
    (a) => !a.isBuiltIn && a.mode === displayMode,
  );

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger button — Phase 1.9.3: minimal ghost (text + chevron, muted) */}
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className="flex items-center gap-1 px-2 py-1.5 rounded-md text-[13px] transition-colors disabled:opacity-50 max-w-[160px]"
        style={{
          background: open ? 'var(--v2-overlay-simple-overlay-hover, var(--color-bg-hover))' : 'transparent',
          color: 'var(--v2-text-text-muted, var(--color-text-secondary))',
          border: '1px solid transparent',
          fontFamily: 'var(--v2-font-family-text)',
        }}
        onMouseEnter={(e) => {
          if (!disabled && !open) {
            e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover, var(--color-bg-hover))';
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled && !open) {
            e.currentTarget.style.background = 'transparent';
          }
        }}
        title={`${activeConfig.description} — Tab to cycle`}
      >
        {/* Phase 1.9.3: no icon — text + chevron only. */}
        <span className="truncate">{activeConfig.label}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 0.15s ease',
            color: 'var(--color-text-tertiary)',
            flexShrink: 0,
          }}
        >
          <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown menu — Phase 1.9.3: minimal opencode-style (no icons, no chips, no footer) */}
      {open && (
        <div
          className="absolute bottom-full left-0 mb-2 rounded-[10px] overflow-hidden animate-fade-in"
          style={{
            background: 'var(--v2-background-bg-base, var(--color-bg-elevated))',
            boxShadow: 'var(--v2-elevation-floating, var(--shadow-popover))',
            minWidth: '160px',
            zIndex: 50,
            padding: '4px',
          }}
        >
          {MODES.map((mode, idx) => {
            const isActive = mode.id === displayMode;
            return (
              <button
                key={mode.id}
                onClick={() => handleSelect(mode.id)}
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
                  {mode.label}
                </span>
                {isActive && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}

          {/* Custom agents for the current mode (if any) — minimal style */}
          {customForCurrent.length > 0 && (
            <>
              <div
                className="px-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider"
                style={{ color: 'var(--v2-text-text-faint, var(--color-text-muted))' }}
              >
                Custom
              </div>
              {customForCurrent.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => handleSelect(agent.mode)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-left rounded-[6px] transition-colors"
                  style={{ color: 'var(--v2-text-text-base, var(--color-text-primary))' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover, var(--color-bg-hover))')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="text-[13px] truncate flex-1" style={{ fontFamily: 'var(--v2-font-family-text)' }}>
                    {agent.name}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AgentSelector;
