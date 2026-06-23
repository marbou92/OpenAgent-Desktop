/**
 * OpenAgent-Desktop — AskUserQuestionCard (Phase 10.4)
 *
 * When answered, the card MINIMIZES to a compact one-line summary
 * (question + selected answer) instead of staying fully expanded.
 * The user can click the minimized bar to re-expand and see all options.
 * The card stays inline where it was triggered — no popup, no jump.
 *
 * Minimized view:
 *   💬 SCOPE: "Which files?" → ✅ Current working directory
 *
 * Expanded view (click to toggle):
 *   ┌─────────────────────────────────────────────┐
 *   │  Please answer to continue          Answered │
 *   │  SCOPE                                       │
 *   │  Which files?                                │
 *   │  A  Current working directory     ✓          │
 *   │  B  A specific folder                        │
 *   └─────────────────────────────────────────────┘
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
  toolCallId?: string;
  answered?: string | null;
  onAnswer?: (answer: string) => void;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const AskUserQuestionCard: React.FC<AskUserQuestionCardProps> = ({
  questions,
  toolCallId: _toolCallId,
  answered,
  onAnswer,
}) => {
  const answeredSet = new Set(
    (answered || '').split(',').map(s => s.trim()).filter(Boolean)
  );
  const [answers, setAnswers] = useState<Record<number, Set<string>>>({});
  // Phase 10.5: Once answered, lock the card — no more changes allowed.
  const [isLocked, setIsLocked] = useState(false);
  // Phase 10.4: Minimize when answered, allow re-expand on click.
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    if (answered) {
      const init: Record<number, Set<string>> = {};
      questions.forEach((q, i) => {
        if (q.multiple) {
          init[i] = answeredSet;
        } else {
          init[i] = new Set([Array.from(answeredSet)[0]].filter(Boolean) as string[]);
        }
      });
      setAnswers(init);
      setIsLocked(true);
      setMinimized(true); // Auto-minimize when answered
    }
  }, [answered]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!questions || questions.length === 0) return null;

  const handleToggle = (qIndex: number, label: string, multiple: boolean) => {
    // Phase 10.5: Once locked, no changes allowed.
    if (isLocked || answered) return;
    setAnswers(prev => {
      const current = new Set(prev[qIndex] || []);
      if (multiple) {
        if (current.has(label)) current.delete(label);
        else current.add(label);
        return { ...prev, [qIndex]: current };
      } else {
        // Single-select: lock immediately after picking.
        setIsLocked(true);
        onAnswer?.(label);
        return { ...prev, [qIndex]: new Set([label]) };
      }
    });
  };

  const handleSubmitMulti = (qIndex: number) => {
    if (isLocked || answered) return;
    const selected = answers[qIndex];
    if (!selected || selected.size === 0) return;
    setIsLocked(true); // Lock after submit
    onAnswer?.(Array.from(selected).join(', '));
  };

  // Check if any question has been answered (for minimizing)
  const hasAnswer = answered || isLocked;

  // ─── Minimized view: compact one-liner ────────────────────────────────
  if (minimized && hasAnswer) {
    const firstQ = questions[0];
    const header = firstQ.header || 'Question';
    const selectedSet = answers[0] || (answered ? answeredSet : new Set<string>());
    const selectedLabels = Array.from(selectedSet);

    return (
      <button
        onClick={() => setMinimized(false)}
        className="w-full flex items-center gap-2.5 my-2 px-3 py-2 rounded-lg transition-all"
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border-secondary)',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-primary)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-secondary)'; }}
      >
        {/* Question icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success, #10b981)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
          <polyline points="20 6 9 17 4 12" />
        </svg>

        {/* Header badge */}
        <span
          className="text-[9px] font-bold uppercase tracking-wider flex-shrink-0"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {header}
        </span>

        {/* Truncated question */}
        <span className="text-xs flex-shrink-0 truncate max-w-[200px]" style={{ color: 'var(--color-text-muted)' }}>
          {firstQ.question.length > 40 ? firstQ.question.substring(0, 40) + '…' : firstQ.question}
        </span>

        {/* Arrow */}
        <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>→</span>

        {/* Selected answer(s) */}
        <span
          className="text-xs font-medium flex-1 min-w-0 truncate"
          style={{ color: 'var(--color-success, #10b981)' }}
        >
          {selectedLabels.join(', ')}
        </span>

        {/* Expand hint */}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ transform: 'rotate(90deg)' }}>
          <path d="M3 5L6 8L9 5" />
        </svg>
      </button>
    );
  }

  // ─── Expanded view: full card ─────────────────────────────────────────
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
        {/* Phase 10.4: If answered, show a minimize button */}
        {hasAnswer && (
          <button
            onClick={() => setMinimized(true)}
            className="ml-auto flex items-center gap-1 text-[10px] px-2 py-0.5 rounded transition-colors"
            style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg-primary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)'; }}
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7L6 4L9 7" />
            </svg>
            Minimize
          </button>
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
              {/* Section header */}
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

              {/* Options */}
              <div className="space-y-1.5">
                {options.map((opt, oIdx) => {
                  const letter = LETTERS[oIdx] || String(oIdx + 1);
                  const isSelected = selectedSet.has(opt.label);
                  const isDisabled = isLocked || !!answered;

                  return (
                    <button
                      key={`${opt.label}-${oIdx}`}
                      onClick={() => handleToggle(qIdx, opt.label, multiple)}
                      disabled={isDisabled}
                      className="w-full text-left rounded-lg transition-all disabled:cursor-default"
                      style={{
                        background: isSelected ? 'var(--color-accent-soft)' : 'var(--color-bg-primary)',
                        border: `1px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-border-secondary)'}`,
                        opacity: isDisabled && !isSelected ? 0.5 : 1,
                        cursor: isDisabled ? 'default' : 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        if (!isDisabled && !isSelected) e.currentTarget.style.borderColor = 'var(--color-border-primary)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isDisabled && !isSelected) e.currentTarget.style.borderColor = 'var(--color-border-secondary)';
                      }}
                    >
                      <div className="flex items-start gap-3 p-3">
                        {multiple ? (
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
              {multiple && !isLocked && !answered && (
                <button
                  onClick={() => handleSubmitMulti(qIdx)}
                  disabled={selectedSet.size === 0}
                  className="mt-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  style={{ background: 'var(--color-accent)', color: 'white' }}
                >
                  Submit ({selectedSet.size} selected)
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AskUserQuestionCard;
