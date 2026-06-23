/**
 * OpenAgent-Desktop — AskUserQuestionCard (Phase 9.4)
 *
 * Renders an AskUserQuestion tool call INLINE in the chat message — shows
 * the question + option buttons directly in the message flow. When the
 * user clicks an option, it sends the answer back via the same
 * permissions.respondToQuestion IPC flow that the modal dialog uses.
 *
 * This is an ALTERNATIVE to the modal AskUserQuestionDialog — both can
 * coexist. The inline card is better for chat history (the Q&A is
 * preserved in the message), while the modal is better for blocking
 * the agent until the user answers.
 *
 * We use the inline card as the PRIMARY rendering. The modal still
 * exists for the blocking flow, but the inline card makes the
 * conversation readable after the fact.
 */

import React, { useState } from 'react';

interface AskUserOption {
  label: string;
  description?: string;
}

interface AskUserItem {
  question: string;
  header?: string;
  options: AskUserOption[];
}

interface AskUserQuestionCardProps {
  questions: AskUserItem[];
  /** The tool call ID — used to send the answer back via IPC. */
  toolCallId?: string;
  /** Whether the user has already answered (shows the selected answer). */
  answered?: string | null;
  /** Called when the user picks an option. */
  onAnswer?: (answer: string) => void;
}

export const AskUserQuestionCard: React.FC<AskUserQuestionCardProps> = ({
  questions,
  toolCallId: _toolCallId,
  answered,
  onAnswer,
}) => {
  const [selected, setSelected] = useState<string | null>(answered || null);

  if (!questions || questions.length === 0) return null;

  // Render the first question (matching the modal's behavior).
  const q: AskUserItem = questions[0];
  const header = q.header || 'Question';
  const options = q.options || [];
  const isAnswered = selected !== null;

  const handlePick = (label: string) => {
    if (isAnswered) return; // Don't allow re-answering
    setSelected(label);
    onAnswer?.(label);
  };

  return (
    <div
      className="rounded-xl border my-2 overflow-hidden"
      style={{ borderColor: 'var(--color-border-primary)', background: 'var(--color-bg-secondary)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ background: 'var(--color-bg-tertiary)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {header}
        </span>
        {isAnswered && (
          <span
            className="text-[10px] px-1.5 py-0 rounded-full ml-auto"
            style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--color-success, #10b981)' }}
          >
            Answered
          </span>
        )}
      </div>

      {/* Question text */}
      <div className="px-3 py-2.5">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
          {q.question}
        </p>
      </div>

      {/* Options */}
      <div className="px-3 pb-3 space-y-1.5">
        {options.map((opt, idx) => {
          const isSelected = selected === opt.label;
          return (
            <button
              key={`${opt.label}-${idx}`}
              onClick={() => handlePick(opt.label)}
              disabled={isAnswered}
              className="w-full text-left p-2.5 rounded-lg transition-all disabled:cursor-default"
              style={{
                background: isSelected
                  ? 'var(--color-accent-soft)'
                  : isAnswered
                  ? 'var(--color-bg-tertiary)'
                  : 'var(--color-bg-primary)',
                border: `1px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-border-secondary)'}`,
                cursor: isAnswered ? 'default' : 'pointer',
                opacity: isAnswered && !isSelected ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isAnswered) e.currentTarget.style.borderColor = 'var(--color-accent)';
              }}
              onMouseLeave={(e) => {
                if (!isAnswered) e.currentTarget.style.borderColor = 'var(--color-border-secondary)';
              }}
            >
              <div className="flex items-start gap-2.5">
                {/* Radio dot */}
                <span
                  className="w-3.5 h-3.5 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center"
                  style={{
                    border: `1.5px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-text-muted)'}`,
                  }}
                >
                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />
                  )}
                </span>
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
                {isSelected && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Show selected answer */}
      {isAnswered && (
        <div
          className="px-3 py-2 border-t text-xs"
          style={{ borderColor: 'var(--color-border-secondary)', color: 'var(--color-text-muted)' }}
        >
          <strong style={{ color: 'var(--color-text-secondary)' }}>Your answer:</strong> {selected}
        </div>
      )}

      {/* Multiple questions hint */}
      {questions.length > 1 && (
        <div
          className="px-3 py-1.5 border-t text-[10px] italic"
          style={{ borderColor: 'var(--color-border-secondary)', color: 'var(--color-text-muted)' }}
        >
          {questions.length - 1} more question(s) will follow.
        </div>
      )}
    </div>
  );
};

export default AskUserQuestionCard;
