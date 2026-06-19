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
      {/* Trigger button — ghost-styled, matches opencode desktop's Select */}
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 max-w-[160px]"
        style={{
          background: open ? 'var(--color-bg-hover)' : 'transparent',
          color: open ? activeConfig.color : 'var(--color-text-secondary)',
          border: '1px solid transparent',
        }}
        onMouseEnter={(e) => {
          if (!disabled && !open) {
            e.currentTarget.style.background = 'var(--color-bg-hover)';
            e.currentTarget.style.color = activeConfig.color;
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled && !open) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--color-text-secondary)';
          }
        }}
        title={`${activeConfig.description}  [${activeConfig.shortcut}]  — Tab to cycle`}
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
          style={{ flexShrink: 0, color: activeConfig.color }}
        >
          <path d={activeConfig.iconPath} />
        </svg>
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

      {/* Dropdown menu */}
      {open && (
        <div
          className="absolute bottom-full left-0 mb-2 rounded-lg overflow-hidden animate-fade-in"
          style={{
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-primary)',
            boxShadow: 'var(--shadow-popover)',
            minWidth: '220px',
            zIndex: 50,
          }}
        >
          {/* Primary modes */}
          <div
            className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider border-b"
            style={{
              color: 'var(--color-text-muted)',
              borderColor: 'var(--color-border-secondary)',
            }}
          >
            Agent
          </div>
          {MODES.map((mode, idx) => {
            const isActive = mode.id === displayMode;
            return (
              <button
                key={mode.id}
                onClick={() => handleSelect(mode.id)}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                style={{
                  background: isActive
                    ? 'var(--color-accent-soft)'
                    : hoveredIdx === idx
                    ? 'var(--color-bg-hover)'
                    : 'transparent',
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={mode.color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0 }}
                >
                  <path d={mode.iconPath} />
                </svg>
                <div className="min-w-0 flex-1">
                  <div
                    className="text-xs font-medium truncate"
                    style={{
                      color: isActive ? 'var(--color-accent)' : 'var(--color-text-primary)',
                    }}
                  >
                    {mode.label}
                  </div>
                  <div
                    className="text-[10px] truncate"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {mode.description}
                  </div>
                </div>
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{
                    background: 'var(--color-bg-tertiary)',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  {mode.shortcut}
                </span>
              </button>
            );
          })}

          {/* Custom agents for the current mode (if any) */}
          {customForCurrent.length > 0 && (
            <>
              <div
                className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider border-t"
                style={{
                  color: 'var(--color-text-muted)',
                  borderColor: 'var(--color-border-secondary)',
                }}
              >
                Custom — {activeConfig.label}
              </div>
              {customForCurrent.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => handleSelect(agent.mode)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors"
                  style={{ color: 'var(--color-text-primary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: agent.color || activeConfig.color }}
                  />
                  <span className="text-xs truncate">{agent.name}</span>
                </button>
              ))}
            </>
          )}

          {/* Footer hint */}
          <div
            className="px-3 py-1.5 text-[10px] border-t flex items-center justify-between"
            style={{
              color: 'var(--color-text-muted)',
              borderColor: 'var(--color-border-secondary)',
              background: 'var(--color-bg-secondary)',
            }}
          >
            <span>Tab to cycle</span>
            <span>1/2 to select</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentSelector;
