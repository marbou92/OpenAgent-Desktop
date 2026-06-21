/**
 * OpenAgent-Desktop — AskUserQuestionDialog (Phase 8.5)
 *
 * Renders the agent's AskUserQuestion tool call as a modal dialog with
 * the actual questions + multiple-choice options. The user picks an
 * option (or dismisses), and the answer is sent back to the main process
 * via api.permissions.respondToQuestion(requestId, answer).
 *
 * Replaces the generic PermissionDialog for AskUserQuestion calls —
 * previously the user just saw "Tool: AskUserQuestion" + raw JSON and
 * could only Allow/Deny, so the agent never got the actual answer.
 *
 * Supports multiple questions in a single call (the tool schema allows
 * an array). For now we only let the user answer the FIRST question and
 * dismiss the rest — matching the common case where the agent asks one
 * clarifying question at a time. The agent can call the tool again for
 * the next question.
 */

import React, { useState } from 'react';
import { AskUserQuestionItem } from '../../types';

interface AskUserQuestionDialogProps {
  /** The request payload from main.ts. null = no dialog open. */
  request: {
    id: string;
    toolName: string;
    questions: AskUserQuestionItem[];
  } | null;
  /** Called with the selected option label, or null if dismissed. */
  onRespond: (requestId: string, answer: string | null) => void;
}

const AskUserQuestionDialog: React.FC<AskUserQuestionDialogProps> = ({ request, onRespond }) => {
  const [selected, setSelected] = useState<string | null>(null);

  if (!request) return null;

  // We render the first question. (The tool schema allows multiple, but
  // answering them sequentially via repeated tool calls is cleaner UI.)
  const question: AskUserQuestionItem | undefined = request.questions?.[0];
  if (!question) {
    // Malformed request — just dismiss.
    return (
      <ModalShell>
        <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          The agent called AskUserQuestion but provided no questions. Dismissing.
        </div>
        <div className="flex justify-end mt-4">
          <button
            onClick={() => onRespond(request.id, null)}
            className="px-4 py-2 rounded-lg text-xs font-medium"
            style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)' }}
          >
            Dismiss
          </button>
        </div>
      </ModalShell>
    );
  }

  const header = question.header || 'Question';
  const options = question.options || [];

  const handlePick = (label: string) => {
    onRespond(request.id, label);
    setSelected(null);
  };

  const handleDismiss = () => {
    onRespond(request.id, null);
    setSelected(null);
  };

  return (
    <ModalShell>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">💬</span>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {header}
        </h3>
      </div>

      {/* Question text */}
      <div
        className="mb-4 p-3 rounded-lg text-sm leading-relaxed"
        style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)' }}
      >
        {question.question}
      </div>

      {/* Options */}
      <div className="space-y-2 mb-4">
        {options.length === 0 && (
          <div className="text-xs italic" style={{ color: 'var(--color-text-muted)' }}>
            No options provided.
          </div>
        )}
        {options.map((opt, idx) => {
          const isSelected = selected === opt.label;
          return (
            <button
              key={`${opt.label}-${idx}`}
              onClick={() => setSelected(opt.label)}
              className="w-full text-left p-3 rounded-lg transition-all"
              style={{
                background: isSelected ? 'var(--color-accent-soft)' : 'var(--color-bg-primary)',
                border: `1px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-border-secondary)'}`,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) e.currentTarget.style.borderColor = 'var(--color-border-primary)';
              }}
              onMouseLeave={(e) => {
                if (!isSelected) e.currentTarget.style.borderColor = 'var(--color-border-secondary)';
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
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: 'var(--color-accent)' }}
                    />
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
              </div>
            </button>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={handleDismiss}
          className="px-3 py-2 rounded-lg text-xs font-medium transition-colors"
          style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
        >
          Dismiss
        </button>
        <button
          onClick={() => selected && handlePick(selected)}
          disabled={!selected}
          className="px-4 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'var(--color-accent)', color: 'white' }}
        >
          Answer
        </button>
      </div>

      {/* Multiple-questions hint */}
      {request.questions.length > 1 && (
        <div className="mt-3 text-[10px] italic" style={{ color: 'var(--color-text-muted)' }}>
          {request.questions.length - 1} more question(s) will be asked after this one.
        </div>
      )}
    </ModalShell>
  );
};

// ─── Modal shell (backdrop + centered card) ───────────────────────────────────

const ModalShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center p-4"
    style={{ background: 'rgba(0,0,0,0.4)' }}
  >
    <div
      className="rounded-xl border shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in"
      style={{ background: 'var(--color-bg-elevated)', borderColor: 'var(--color-border-primary)' }}
    >
      <div className="p-5">{children}</div>
    </div>
  </div>
);

export default AskUserQuestionDialog;
