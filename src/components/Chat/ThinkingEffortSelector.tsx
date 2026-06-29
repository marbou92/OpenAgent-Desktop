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
  // Phase 1.9.3: 'extended' removed per user request.
];

// Phase 1.9.3: EFFORT_COLORS removed — the minimal trigger/dropdown no longer
// uses per-level colors (just accent for active, muted for inactive).

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

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(v => !v)}
        disabled={disabled}
        className="flex items-center gap-1 px-2 py-1.5 rounded-md text-[13px] transition-colors disabled:opacity-50"
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
        title={`Thinking: ${currentLevel.label}`}
      >
        {/* Phase 1.9.3: minimal — text + chevron only, no icon. */}
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

      {/* Dropdown menu — Phase 1.9.3: minimal opencode-style (no radio dots, no descriptions, just label + checkmark) */}
      {open && (
        <div
          className="absolute bottom-full left-0 mb-2 rounded-[10px] overflow-hidden animate-fade-in"
          style={{
            background: 'var(--v2-background-bg-base, var(--color-bg-elevated))',
            boxShadow: 'var(--v2-elevation-floating, var(--shadow-popover))',
            minWidth: '140px',
            zIndex: 50,
            padding: '4px',
          }}
        >
          {LEVELS.map((level) => {
            const isActive = level.id === effort;
            return (
              <button
                key={level.id}
                onClick={() => handleSelect(level.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left rounded-[6px] transition-colors"
                style={{
                  background: isActive ? 'var(--v2-overlay-simple-overlay-hover, var(--color-accent-soft))' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover, var(--color-bg-hover))';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
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
                  {level.label}
                </span>
                {isActive && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ThinkingEffortSelector;
