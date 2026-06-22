/**
 * OpenAgent-Desktop — AskUserQuestionCard (Phase 10.8)
 *
 * Fixes from 10.7:
 *   - Per-question locking (answering Q1 no longer locks Q2)
 *   - Each question has its own answered/locked state
 *   - Single answer for ALL questions is sent as "Q1Answer, Q2Answer"
 *   - Minimize per-question when answered
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
  // Per-question state: which options are selected + whether each is locked.
  const [perQ, setPerQ] = useState<Array<{ selected: Set<string>; locked: boolean; minimized: boolean }>>([]);

  useEffect(() => {
    if (answered) {
      // Initialize from answered prop (comma-separated for multi)
      const answeredLabels = answered.split(',').map(s => s.trim()).filter(Boolean);
      const answeredSet = new Set(answeredLabels);
      const init = questions.map((q, i) => ({
        selected: new Set(q.multiple ? answeredLabels : (answeredLabels[i] ? [answeredLabels[i]] : [])),
        locked: true,
        minimized: true,
      }));
      setPerQ(init);
    } else {
      // Initialize empty state for each question
      setPerQ(questions.map(() => ({ selected: new Set<string>(), locked: false, minimized: false })));
    }
  }, [answered, questions]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!questions || questions.length === 0) return null;

  const handleToggle = (qIndex: number, label: string, multiple: boolean) => {
    if (perQ[qIndex]?.locked) return;
    setPerQ(prev => {
      const updated = [...prev];
      const current = new Set(updated[qIndex]?.selected || []);
      if (multiple) {
        if (current.has(label)) current.delete(label);
        else current.add(label);
        updated[qIndex] = { ...updated[qIndex], selected: current };
      } else {
        // Single-select: lock THIS question only + minimize.
        // Phase 11: Do NOT send the answer yet — wait until ALL questions
        // are locked. Sending early resolves the tool call prematurely,
        // causing the agent to re-ask the remaining questions.
        updated[qIndex] = { selected: new Set([label]), locked: true, minimized: true };
      }
      // Phase 11: Only send the answer when ALL questions are locked.
      const allLocked = updated.every(q => q.locked);
      if (allLocked) {
        const allAnswers = updated.map(q => Array.from(q.selected).join(', ')).filter(s => s.length > 0);
        onAnswer?.(allAnswers.join(', '));
      }
      return updated;
    });
  };

  const handleSubmitMulti = (qIndex: number) => {
    if (perQ[qIndex]?.locked) return;
    const selected = perQ[qIndex]?.selected;
    if (!selected || selected.size === 0) return;
    setPerQ(prev => {
      const updated = [...prev];
      updated[qIndex] = { ...updated[qIndex], locked: true, minimized: true };
      // Phase 11: Only send when ALL questions are locked.
      const allLocked = updated.every(q => q.locked);
      if (allLocked) {
        const allAnswers = updated.map(q => Array.from(q.selected).join(', ')).filter(s => s.length > 0);
        onAnswer?.(allAnswers.join(', '));
      }
      return updated;
    });
  };

  const allAnswered = perQ.length > 0 && perQ.every(q => q.locked);

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
        {allAnswered && (
          <span
            className="text-[10px] px-2 py-0.5 rounded-full ml-auto"
            style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--color-success, #10b981)' }}
          >
            All answered
          </span>
        )}
      </div>

      {/* Questions */}
      <div className="p-4 space-y-4">
        {questions.map((q, qIdx) => {
          const header = q.header || `Question ${qIdx + 1}`;
          const options = q.options || [];
          const multiple = q.multiple || false;
          const qState = perQ[qIdx] || { selected: new Set<string>(), locked: false, minimized: false };
          const isAnswered = qState.locked;
          const selectedLabels = Array.from(qState.selected);

          // ─── Minimized view for this question ─────────────────────────
          if (qState.minimized && isAnswered) {
            return (
              <button
                key={qIdx}
                onClick={() => setPerQ(prev => {
                  const updated = [...prev];
                  updated[qIdx] = { ...updated[qIdx], minimized: false };
                  return updated;
                })}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all"
                style={{
                  background: 'var(--color-bg-primary)',
                  border: '1px solid var(--color-border-secondary)',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-primary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-secondary)'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success, #10b981)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="text-[9px] font-bold uppercase tracking-wider flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                  {header}
                </span>
                <span className="text-xs flex-shrink-0 truncate max-w-[180px]" style={{ color: 'var(--color-text-muted)' }}>
                  {q.question.length > 35 ? q.question.substring(0, 35) + '…' : q.question}
                </span>
                <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>→</span>
                <span className="text-xs font-medium flex-1 min-w-0 truncate" style={{ color: 'var(--color-success, #10b981)' }}>
                  {selectedLabels.join(', ')}
                </span>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ transform: 'rotate(90deg)' }}>
                  <path d="M3 5L6 8L9 5" />
                </svg>
              </button>
            );
          }

          // ─── Expanded view for this question ──────────────────────────
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
                {isAnswered && (
                  <button
                    onClick={() => setPerQ(prev => {
                      const updated = [...prev];
                      updated[qIdx] = { ...updated[qIdx], minimized: true };
                      return updated;
                    })}
                    className="ml-auto text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 7L6 4L9 7" />
                    </svg>
                    Minimize
                  </button>
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
                  const isSelected = qState.selected.has(opt.label);
                  const isDisabled = qState.locked;

                  return (
                    <button
                      key={`${opt.label}-${oIdx}`}
                      onClick={() => handleToggle(qIdx, opt.label, multiple)}
                      disabled={isDisabled}
                      className="w-full text-left rounded-lg transition-all disabled:cursor-default"
                      style={{
                        background: isSelected ? 'var(--color-accent-soft)' : 'var(--color-bg-primary)',
                        border: `1px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-border-secondary)'}`,
                        opacity: isDisabled && !isSelected ? 0.4 : 1,
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
              {multiple && !qState.locked && (
                <button
                  onClick={() => handleSubmitMulti(qIdx)}
                  disabled={qState.selected.size === 0}
                  className="mt-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  style={{ background: 'var(--color-accent)', color: 'white' }}
                >
                  Submit ({qState.selected.size} selected)
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
