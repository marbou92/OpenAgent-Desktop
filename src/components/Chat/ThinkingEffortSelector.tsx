/**
 * OpenAgent-Desktop - Thinking Effort Selector (Phase 4.2 + Phase 8.4)
 *
 * A ghost-styled dropdown for controlling reasoning/thinking effort on
 * models that support it. Sits next to the [Build ▾] and [Model ▾]
 * selectors in the composer's bottom-left row.
 *
 *   🧠 Medium ▾   ← click opens a menu with:
 *                    ○ Off      — no reasoning
 *                    ○ Low      — fast, minimal reasoning
 *                    ● Medium   — balanced (default)
 *                    ○ High     — deep reasoning
 *                    ○ Max      — maximum effort
 *                    ○ Extended — Phase 8.4: max reasoning + boosted
 *                                 maxTokens + boosted maxSteps for hard
 *                                 multi-step problems
 *
 * The selector ONLY renders when the current model supports reasoning
 * (checked via the `modelSupportsReasoning` prop). Non-reasoning models
 * don't show the selector at all.
 *
 * The effort level is passed to the AI SDK via `providerOptions`:
 *   - OpenAI native:    { openai: { reasoningEffort: 'low'|'medium'|'high' } }
 *   - Anthropic:        { anthropic: { thinking: { budgetTokens: N } } }
 *                        (extended = 128K — double the max budget)
 *   - Google:           { google: { thinkingConfig: { thinkingBudget: N } } }
 *                        (extended = 65536 — double the max budget)
 *   - OpenAI-compatible: { openai-compatible: { reasoningEffort: 'low'|'medium'|'high' } }
 *                        (sent as `reasoning_effort` in the request body)
 *
 * "Off" means no providerOptions are passed (the model uses its default,
 * which for reasoning models is usually some level of reasoning).
 * "Extended" (Phase 8.4) is the highest tier — it doubles the reasoning
 * budget vs "Max" AND boosts maxTokens (+8K) and maxSteps (+50) so the
 * agent can iterate longer on hard problems.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

export type ThinkingEffort = 'off' | 'low' | 'medium' | 'high' | 'max' | 'extended';

interface ThinkingEffortSelectorProps {
  effort: ThinkingEffort;
  onChange: (effort: ThinkingEffort) => void;
  /** When false, the selector renders nothing (model doesn't support reasoning). */
  modelSupportsReasoning: boolean;
  disabled?: boolean;
}

const LEVELS: { id: ThinkingEffort; label: string; description: string }[] = [
  { id: 'off', label: 'Off', description: 'No reasoning — fastest' },
  { id: 'low', label: 'Low', description: 'Minimal reasoning — fast' },
  { id: 'medium', label: 'Medium', description: 'Balanced reasoning (default)' },
  { id: 'high', label: 'High', description: 'Deep reasoning — slower' },
  { id: 'max', label: 'Max', description: 'Maximum effort — slowest, best quality' },
  { id: 'extended', label: 'Extended', description: 'Phase 8.4: max reasoning + boosted steps/tokens for hard problems' },
];

const EFFORT_COLORS: Record<ThinkingEffort, string> = {
  off: 'var(--color-text-muted)',
  low: 'var(--color-info)',
  medium: 'var(--color-accent)',
  high: 'var(--color-warning)',
  max: 'var(--color-error)',
  extended: '#a855f7', // Purple — visually distinct from "max" (red)
};

const ThinkingEffortSelector: React.FC<ThinkingEffortSelectorProps> = ({
  effort,
  onChange,
  modelSupportsReasoning,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
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

  const handleSelect = useCallback((level: ThinkingEffort) => {
    onChange(level);
    setOpen(false);
  }, [onChange]);

  // Don't render if the model doesn't support reasoning
  if (!modelSupportsReasoning) return null;

  const currentLevel = LEVELS.find(l => l.id === effort) || LEVELS[2]; // default to medium
  const color = EFFORT_COLORS[effort];

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(v => !v)}
        disabled={disabled}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
        style={{
          background: open ? 'var(--color-bg-hover)' : 'transparent',
          color: open ? color : 'var(--color-text-secondary)',
          border: '1px solid transparent',
        }}
        onMouseEnter={(e) => {
          if (!disabled && !open) {
            e.currentTarget.style.background = 'var(--color-bg-hover)';
            e.currentTarget.style.color = color;
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled && !open) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--color-text-secondary)';
          }
        }}
        title={`Thinking: ${currentLevel.label} — ${currentLevel.description}`}
      >
        {/* Brain icon */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0, color }}
        >
          <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2z" />
          <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2z" />
        </svg>
        <span className="truncate">{currentLevel.label}</span>
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
            minWidth: '200px',
            zIndex: 50,
          }}
        >
          <div
            className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider border-b"
            style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border-secondary)' }}
          >
            Thinking Effort
          </div>
          {LEVELS.map((level) => {
            const isActive = level.id === effort;
            const levelColor = EFFORT_COLORS[level.id];
            return (
              <button
                key={level.id}
                onClick={() => handleSelect(level.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                style={{
                  background: isActive ? 'var(--color-accent-soft)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'var(--color-bg-hover)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                {/* Radio dot */}
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    background: isActive ? levelColor : 'transparent',
                    border: `1.5px solid ${isActive ? levelColor : 'var(--color-text-muted)'}`,
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div
                    className="text-xs font-medium"
                    style={{
                      color: isActive ? levelColor : 'var(--color-text-primary)',
                    }}
                  >
                    {level.label}
                  </div>
                  <div className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                    {level.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ThinkingEffortSelector;
