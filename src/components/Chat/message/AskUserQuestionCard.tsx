/**
 * OpenAgent-Desktop — AskUserQuestionCard (Phase 10.8)
 *
 * Fixes from 10.7:
 *   - Per-question locking (answering Q1 no longer locks Q2)
 *   - Each question has its own answered/locked state
 *   - Single answer for ALL questions is sent as "Q1Answer, Q2Answer"
 *   - Minimize per-question when answered
 */

import React, { useState, useEffect, useRef } from 'react';

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
  // Phase 0.3: added customOpen + customText for the "type your own answer" feature.
  const [perQ, setPerQ] = useState<Array<{ selected: Set<string>; locked: boolean; minimized: boolean; customOpen: boolean; customText: string }>>([]);

  // Phase 0.4: Guard against double-submission. The onAnswer side-effect used
  // to live inside the setPerQ updater (a React anti-pattern that caused
  // intermittent "stops mid answer" — the updater can run twice in StrictMode
  // or the side-effect can tear down the component mid-commit). Now onAnswer
  // fires from a useEffect that watches perQ, and submittedRef ensures it
  // only fires ONCE per question set.
  // Phase 0.6: also guard with `answered` — if the card is loading from a
  // persisted session (the tool already has a result), NEVER re-fire onAnswer.
  // Previously the effect re-fired on reload (submittedRef starts false, all
  // questions locked from the init effect) → re-sent the answer to a dead
  // requestId, and combined with an unstable `questions` ref → render loop →
  // app freeze on restart.
  const submittedRef = useRef(false);
  const onAnswerRef = useRef(onAnswer);
  onAnswerRef.current = onAnswer;

  // Phase 0.6: Stabilize the `questions` reference so the init effect below
  // doesn't re-run every render (the parent can pass a new array reference
  // each render even when the content is identical, which caused a setPerQ →
  // re-render → init effect → setPerQ → ... infinite loop = freeze).
  const questionsKey = JSON.stringify(questions);
  const stableQuestions = useRef<AskUserItem[]>(Array.isArray(questions) ? questions : []);
  const stableQuestionsKey = useRef<string>(questionsKey);
  if (questionsKey !== stableQuestionsKey.current) {
    stableQuestions.current = Array.isArray(questions) ? questions : [];
    stableQuestionsKey.current = questionsKey;
  }

  useEffect(() => {
    if (answered) {
      // Initialize from answered prop (comma-separated for multi)
      const answeredLabels = answered.split(',').map(s => s.trim()).filter(Boolean);
      const init = stableQuestions.current.map((q, i) => ({
        selected: new Set(q.multiple ? answeredLabels : (answeredLabels[i] ? [answeredLabels[i]] : [])),
        locked: true,
        minimized: true,
        customOpen: false,
        customText: '',
      }));
      setPerQ(init);
      // Phase 0.6: mark as submitted so the onAnswer effect never re-fires
      // for an already-answered (persisted) card.
      submittedRef.current = true;
    } else {
      // Initialize empty state for each question
      setPerQ(stableQuestions.current.map(() => ({ selected: new Set<string>(), locked: false, minimized: false, customOpen: false, customText: '' })));
    }
  }, [answered, questionsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Phase 0.4: Fire onAnswer from a useEffect (NOT inside the state updater).
  // This decouples the IPC side-effect from React's state update, fixing the
  // intermittent race where the answer was lost or the stream stalled.
  // Phase 0.6: also bail when `answered` is set — the card is restoring from
  // a persisted session and the answer was already sent/recorded.
  useEffect(() => {
    if (answered) return;
    if (submittedRef.current) return;
    if (perQ.length === 0) return;
    const allLocked = perQ.every(q => q.locked);
    if (!allLocked) return;
    const allAnswers = perQ
      .map(q => Array.from(q.selected).join(', '))
      .filter(s => s.length > 0);
    submittedRef.current = true;
    onAnswerRef.current?.(allAnswers.join(', '));
  }, [perQ, answered]);

  if (!questions || questions.length === 0) return null;
  const qs = stableQuestions.current;

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
        // Phase 0.3: close any open custom-answer input when a preset is picked.
        // Phase 0.4: onAnswer is now fired by the useEffect above, NOT here.
        updated[qIndex] = { ...updated[qIndex], selected: new Set([label]), locked: true, minimized: true, customOpen: false, customText: '' };
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
      // Phase 11 + Phase 0.4: onAnswer is now fired by the useEffect above.
      return updated;
    });
  };

  // Phase 0.3: Submit a free-text custom answer.
  // - Single-select: locks the question immediately with the typed text.
  // - Multi-select: adds the typed text to the selected set and clears the
  //   input so the user can add more (does NOT lock — the existing Submit
  //   button finalizes the multi-select question).
  const handleCustomSubmit = (qIndex: number, multiple: boolean) => {
    if (perQ[qIndex]?.locked) return;
    const text = (perQ[qIndex]?.customText || '').trim();
    if (!text) return;
    setPerQ(prev => {
      const updated = [...prev];
      if (multiple) {
        const current = new Set(updated[qIndex]?.selected || []);
        current.add(text);
        updated[qIndex] = { ...updated[qIndex], selected: current, customText: '' };
      } else {
        updated[qIndex] = {
          ...updated[qIndex],
          selected: new Set([text]),
          locked: true,
          minimized: true,
          customOpen: false,
          customText: '',
        };
        // Phase 0.4: onAnswer is now fired by the useEffect above.
      }
      return updated;
    });
  };

  const allAnswered = perQ.length > 0 && perQ.every(q => q.locked);

  // Phase 0.5: Let the user go back and edit an already-answered question.
  // Unlocks the question, un-minimizes it, and resets submittedRef so the
  // useEffect above will re-fire onAnswer when the user re-answers.
  // - For pre-submission edits (not all questions locked yet): no IPC was
  //   sent, so this just lets the user change their mind. submittedRef is
  //   still false, so the guard is a no-op, but resetting it is harmless.
  // - For post-submission edits (all locked, answer already sent): resetting
  //   submittedRef lets the effect re-fire and send the updated answer.
  const handleEdit = (qIndex: number) => {
    submittedRef.current = false;
    setPerQ(prev => {
      const updated = [...prev];
      updated[qIndex] = {
        ...updated[qIndex],
        locked: false,
        minimized: false,
        customOpen: false,
        customText: '',
      };
      return updated;
    });
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
        {qs.map((q, qIdx) => {
          const header = q.header || `Question ${qIdx + 1}`;
          const options = q.options || [];
          const multiple = q.multiple || false;
          const qState = perQ[qIdx] || { selected: new Set<string>(), locked: false, minimized: false, customOpen: false, customText: '' };
          const isAnswered = qState.locked;
          const selectedLabels = Array.from(qState.selected);

          // ─── Minimized view for this question ─────────────────────────
          if (qState.minimized && isAnswered) {
            return (
              <div
                key={qIdx}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all"
                style={{
                  background: 'var(--color-bg-primary)',
                  border: '1px solid var(--color-border-secondary)',
                }}
              >
                <button
                  onClick={() => setPerQ(prev => {
                    const updated = [...prev];
                    updated[qIdx] = { ...updated[qIdx], minimized: false };
                    return updated;
                  })}
                  className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                  style={{ cursor: 'pointer' }}
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
                </button>
                {/* Phase 0.5: Edit button — unlock this question to change the answer */}
                <button
                  onClick={() => handleEdit(qIdx)}
                  title="Edit this answer"
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors flex-shrink-0"
                  style={{ color: 'var(--color-text-muted)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)'; }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                  Edit
                </button>
                <button
                  onClick={() => setPerQ(prev => {
                    const updated = [...prev];
                    updated[qIdx] = { ...updated[qIdx], minimized: false };
                    return updated;
                  })}
                  title="Expand"
                  className="flex-shrink-0"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(90deg)' }}>
                    <path d="M3 5L6 8L9 5" />
                  </svg>
                </button>
              </div>
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
                  <div className="ml-auto flex items-center gap-1">
                    {/* Phase 0.5: Edit button — unlock this question to change the answer */}
                    <button
                      onClick={() => handleEdit(qIdx)}
                      className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors"
                      style={{ color: 'var(--color-text-muted)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)'; }}
                    >
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                      Edit
                    </button>
                    <button
                      onClick={() => setPerQ(prev => {
                        const updated = [...prev];
                        updated[qIdx] = { ...updated[qIdx], minimized: true };
                        return updated;
                      })}
                      className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 7L6 4L9 7" />
                      </svg>
                      Minimize
                    </button>
                  </div>
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

              {/* Phase 0.3: Type your own answer */}
              {!qState.locked && (
                <div className="mt-2">
                  {!qState.customOpen ? (
                    <button
                      onClick={() => setPerQ(prev => {
                        const updated = [...prev];
                        updated[qIdx] = { ...updated[qIdx], customOpen: true };
                        return updated;
                      })}
                      className="flex items-center gap-1.5 text-[11px] transition-colors hover:opacity-80"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                      Type your own answer
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={qState.customText}
                        onChange={(e) => setPerQ(prev => {
                          const updated = [...prev];
                          updated[qIdx] = { ...updated[qIdx], customText: e.target.value };
                          return updated;
                        })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCustomSubmit(qIdx, multiple);
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setPerQ(prev => {
                              const updated = [...prev];
                              updated[qIdx] = { ...updated[qIdx], customOpen: false, customText: '' };
                              return updated;
                            });
                          }
                        }}
                        placeholder={multiple ? 'Type a custom answer and press Enter…' : 'Type your answer and press Enter…'}
                        autoFocus
                        className="flex-1 min-w-0 px-3 py-1.5 rounded-lg text-xs outline-none"
                        style={{
                          background: 'var(--color-bg-primary)',
                          border: '1px solid var(--color-border-secondary)',
                          color: 'var(--color-text-primary)',
                        }}
                      />
                      <button
                        onClick={() => handleCustomSubmit(qIdx, multiple)}
                        disabled={!qState.customText.trim()}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: 'var(--color-accent)', color: 'white' }}
                      >
                        {multiple ? 'Add' : 'Submit'}
                      </button>
                      <button
                        onClick={() => setPerQ(prev => {
                          const updated = [...prev];
                          updated[qIdx] = { ...updated[qIdx], customOpen: false, customText: '' };
                          return updated;
                        })}
                        className="px-2 py-1.5 rounded-lg text-xs transition-colors hover:opacity-80"
                        style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}

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
