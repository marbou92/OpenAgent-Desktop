/**
 * OpenAgent-Desktop — AskUserQuestionCard (Phase 10 — OpenCowork style)
 *
 * Renders AskUserQuestion tool calls INLINE in the chat message — not as
 * a popup dialog. Matches OpenCowork's visual design:
 *
 *   ┌─────────────────────────────────────────────┐
 *   │  Please answer to continue                  │
 *   ├─────────────────────────────────────────────┤
 *   │  SCOPE                                       │
 *   │  Which files should I organize?              │
 *   │                                              │
 *   │  ┌─ A ──────────────────────────────────┐   │
 *   │  │  Current working directory            │   │
 *   │  │  Organize files in /home/user/project │   │
 *   │  └──────────────────────────────────────┘   │
 *   │  ┌─ B ──────────────────────────────────┐   │
 *   │  │  A specific folder                    │   │
 *   │  │  I'll ask for the path                │   │
 *   │  └──────────────────────────────────────┘   │
 *   │                                              │
 *   │  METHOD                                      │
 *   │  How should I organize them?                 │
 *   │  ...                                         │
 *   └─────────────────────────────────────────────┘
 *
 * Features:
 *   - ALL questions rendered inline (not just the first one)
 *   - Card-style options with letter labels (A, B, C, D...)
 *   - Multi-select support: when multiple=true, uses checkboxes +
 *     a "Submit" button instead of immediate single-select
 *   - Selected options highlighted with accent color + checkmark
 *   - Answered questions show the selected option(s) below
 *   - No popup/modal — everything inline in the chat
 */

import React, { useState, useEffect } from 'react';

interface AskUserOption {
  label: string;
  description?: string;
}

interface AskUserItem {
  question: string;
  header?: string;
  options: AskUserOption[];
  multiple?: boolean;
}

interface AskUserQuestionCardProps {
  questions: AskUserItem[];
  /** The tool call ID — used to send the answer back via IPC. */
  toolCallId?: string;
  /** Whether the user has already answered (comma-separated labels for multi). */
  answered?: string | null;
  /** Called when the user picks an option (single-select) or submits (multi). */
  onAnswer?: (answer: string) => void;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const AskUserQuestionCard: React.FC<AskUserQuestionCardProps> = ({
  questions,
  toolCallId: _toolCallId,
  answered,
  onAnswer,
}) => {
  // Parse the answered string into a set of selected labels.
  // For single-select: "Option A" → Set(["Option A"])
  // For multi-select: "Option A, Option B" → Set(["Option A", "Option B"])
  const answeredSet = new Set(
    (answered || '').split(',').map(s => s.trim()).filter(Boolean)
  );
  const [answers, setAnswers] = useState<Record<number, Set<string>>>({});

  // Initialize from answered prop
  useEffect(() => {
    if (answered) {
      const init: Record<number, Set<string>> = {};
      questions.forEach((q, i) => {
        if (q.multiple) {
          init[i] = answeredSet;
        } else {
          // For single-select, only the first answered label applies
          init[i] = new Set([Array.from(answeredSet)[0]].filter(Boolean) as string[]);
        }
      });
      setAnswers(init);
    }
  }, [answered]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!questions || questions.length === 0) return null;

  const handleToggle = (qIndex: number, label: string, multiple: boolean) => {
    if (answered) return; // Already answered — don't allow changes

    setAnswers(prev => {
      const current = new Set(prev[qIndex] || []);
      if (multiple) {
        if (current.has(label)) {
          current.delete(label);
        } else {
          current.add(label);
        }
        return { ...prev, [qIndex]: current };
      } else {
        // Single-select: replace
        const newSet = new Set([label]);
        // Auto-submit for single-select
        onAnswer?.(label);
        return { ...prev, [qIndex]: newSet };
      }
    });
  };

  const handleSubmitMulti = (qIndex: number) => {
    const selected = answers[qIndex];
    if (!selected || selected.size === 0) return;
    const answerStr = Array.from(selected).join(', ');
    onAnswer?.(answerStr);
  };

  return (
    <div
      className="rounded-xl border my-3 overflow-hidden"
      style={{ borderColor: 'var(--color-border-primary)', background: 'var(--color-bg-secondary)' }}
    >
      {/* Prompt header */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b"
        style={{ borderColor: 'var(--color-border-secondary)', background: 'var(--color-bg-tertiary)' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
          Please answer to continue
        </span>
        {answered && (
          <span
            className="text-[10px] px-2 py-0.5 rounded-full ml-auto"
            style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--color-success, #10b981)' }}
          >
            Answered
          </span>
        )}
      </div>

      {/* Questions */}
      <div className="p-4 space-y-5">
        {questions.map((q, qIdx) => {
          const header = q.header || `Question ${qIdx + 1}`;
          const options = q.options || [];
          const multiple = q.multiple || false;
          const selectedSet = answers[qIdx] || (answered ? answeredSet : new Set<string>());
          const isAnswered = selectedSet.size > 0;

          return (
            <div key={qIdx}>
              {/* Section header (like "SCOPE", "METHOD") */}
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{ color: 'var(--color-accent)', background: 'var(--color-accent-soft)' }}
                >
                  {header}
                </span>
                {multiple && (
                  <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                    (select all that apply)
                  </span>
                )}
              </div>

              {/* Question text */}
              <p className="text-sm mb-2.5" style={{ color: 'var(--color-text-primary)' }}>
                {q.question}
              </p>

              {/* Options as cards with letter labels */}
              <div className="space-y-1.5">
                {options.map((opt, oIdx) => {
                  const letter = LETTERS[oIdx] || String(oIdx + 1);
                  const isSelected = selectedSet.has(opt.label);
                  const isDisabled = !!answered;

                  return (
                    <button
                      key={`${opt.label}-${oIdx}`}
                      onClick={() => handleToggle(qIdx, opt.label, multiple)}
                      disabled={isDisabled}
                      className="w-full text-left rounded-lg transition-all disabled:cursor-default"
                      style={{
                        background: isSelected
                          ? 'var(--color-accent-soft)'
                          : 'var(--color-bg-primary)',
                        border: `1px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-border-secondary)'}`,
                        opacity: isDisabled && !isSelected ? 0.5 : 1,
                        cursor: isDisabled ? 'default' : 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        if (!isDisabled && !isSelected) {
                          e.currentTarget.style.borderColor = 'var(--color-border-primary)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isDisabled && !isSelected) {
                          e.currentTarget.style.borderColor = 'var(--color-border-secondary)';
                        }
                      }}
                    >
                      <div className="flex items-start gap-3 p-3">
                        {/* Letter label or checkbox/radio */}
                        {multiple ? (
                          // Checkbox for multi-select
                          <span
                            className="w-4 h-4 rounded flex-shrink-0 mt-0.5 flex items-center justify-center transition-all"
                            style={{
                              border: `1.5px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-text-muted)'}`,
                              background: isSelected ? 'var(--color-accent)' : 'transparent',
                            }}
                          >
                            {isSelected && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </span>
                        ) : (
                          // Letter label for single-select (OpenCowork style)
                          <span
                            className="text-[10px] font-bold w-5 h-5 rounded flex-shrink-0 mt-0.5 flex items-center justify-center"
                            style={{
                              background: isSelected ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                              color: isSelected ? 'white' : 'var(--color-text-muted)',
                            }}
                          >
                            {letter}
                          </span>
                        )}

                        {/* Option content */}
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-xs font-medium"
                            style={{ color: isSelected ? 'var(--color-accent)' : 'var(--color-text-primary)' }}
                          >
                            {opt.label}
                          </div>
                          {opt.description && (
                            <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                              {opt.description}
                            </div>
                          )}
                        </div>

                        {/* Checkmark for selected single-select */}
                        {!multiple && isSelected && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Submit button for multi-select */}
              {multiple && !answered && (
                <button
                  onClick={() => handleSubmitMulti(qIdx)}
                  disabled={selectedSet.size === 0}
                  className="mt-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  style={{ background: 'var(--color-accent)', color: 'white' }}
                >
                  Submit ({selectedSet.size} selected)
                </button>
              )}

              {/* Show selected answer(s) after answering */}
              {isAnswered && answered && (
                <div
                  className="mt-2 px-3 py-1.5 rounded-md text-xs"
                  style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}
                >
                  <strong style={{ color: 'var(--color-text-secondary)' }}>Your answer:</strong>{' '}
                  {Array.from(selectedSet).join(', ')}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AskUserQuestionCard;
