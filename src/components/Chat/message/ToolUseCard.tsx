/**
 * ToolUseCard — merged tool call + result card (OpenCowork style)
 * Shows tool name, status, arguments (collapsed), and result (collapsed) in ONE card.
 * Special cases:
 *   - AskUserQuestion renders as a question card
 *   - When _pendingPermission is set, renders the permission approval UI INLINE
 *     (no separate floating dialog). This keeps the permission prompt at the
 *     position where the tool call was triggered, like AskUserQuestion does.
 */
import React, { useState, memo } from 'react';
import { ToolCall } from '../../../types';

interface ToolUseCardProps {
  toolCall: ToolCall;
  onCopy?: (code: string, id: string) => void;
  copied?: string | null;
  /** Phase 1.2: Called when the user responds to an inline permission prompt. */
  onPermissionRespond?: (requestId: string, response: 'allow_once' | 'always_allow' | 'deny_once' | 'always_deny') => void;
}

const ToolUseCard = memo(function ToolUseCard({ toolCall, onPermissionRespond }: ToolUseCardProps) {
  const [expanded, setExpanded] = useState(false);

  // Check for AskUserQuestion tool — case-insensitive, handles multiple naming conventions
  const toolNameLower = toolCall.name.toLowerCase();
  const isAskUserQuestion = toolNameLower === 'askuserquestion' || toolNameLower === 'ask_user_question' || toolNameLower === 'ask-user-question';
  const isRunning = toolCall.status === 'pending';
  const isError = toolCall.status === 'failed';
  const isDenied = toolCall.status === 'denied';
  const isSuccess = toolCall.status === 'completed';
  const hasPendingPermission = !!toolCall._pendingPermission;

  // ─── AskUserQuestion special card ──────────────────────────────
  if (isAskUserQuestion) {
    // Parse questions from arguments — handle multiple possible structures
    const args = toolCall.arguments as any || {};
    const questions: any[] = args.questions || args.qs || (Array.isArray(args) ? args : []) || [];
    return (
      <div className="rounded-xl overflow-hidden my-2" style={{ border: '2px solid rgba(214,122,82,0.3)', background: 'linear-gradient(to bottom right, rgba(214,122,82,0.05), transparent)' }}>
        <div className="px-4 py-3 flex items-center gap-3" style={{ background: 'rgba(214,122,82,0.1)', borderBottom: '1px solid rgba(214,122,82,0.2)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(214,122,82,0.2)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          </div>
          <span className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>Question</span>
        </div>
        <div className="p-4 space-y-5">
          {questions.map((q: any, qIdx: number) => (
            <div key={qIdx} className="space-y-2">
              {q.header && <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded uppercase tracking-wide" style={{ background: 'rgba(214,122,82,0.1)', color: 'var(--color-accent)' }}>{q.header}</span>}
              <p className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>{q.question}</p>
              {q.options && q.options.length > 0 && (
                <div className="space-y-1.5 mt-2">
                  {q.options.map((option: any, optIdx: number) => (
                    <div key={optIdx} className="w-full p-3 rounded-lg text-left" style={{ border: '1px solid var(--color-border-secondary)', background: 'var(--color-bg-tertiary)' }}>
                      <div className="flex items-start gap-2.5">
                        <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 text-xs font-semibold" style={{ background: 'var(--color-border-secondary)', color: 'var(--color-text-secondary)' }}>
                          {String.fromCharCode(65 + optIdx)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{option.label}</span>
                          {option.description && <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{option.description}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Build a human-readable preview of the tool args ───────────
  const permArgs = toolCall._pendingPermission?.args || toolCall.arguments || {};
  let preview = '';
  let toolLabel = toolCall.name;
  if (toolCall.name === 'bash' && permArgs.command) {
    toolLabel = 'Run command';
    preview = String(permArgs.command);
  } else if ((toolCall.name === 'edit' || toolCall.name === 'write') && permArgs.path) {
    toolLabel = `${toolCall.name === 'edit' ? 'Edit' : 'Write'} file`;
    preview = String(permArgs.path);
  } else if (toolCall.name === 'read' && permArgs.path) {
    toolLabel = 'Read file';
    preview = String(permArgs.path);
  } else if (toolCall.name === 'glob' && permArgs.pattern) {
    toolLabel = 'Search files';
    preview = String(permArgs.pattern);
  } else if (toolCall.name === 'grep' && permArgs.pattern) {
    toolLabel = 'Search content';
    preview = String(permArgs.pattern);
  } else {
    preview = JSON.stringify(permArgs, null, 2);
  }

  // ─── Inline permission approval card ──────────────────────────
  // When _pendingPermission is set, render the approval UI inline instead
  // of the normal tool card. This keeps the prompt at the position where
  // the tool call was triggered (like AskUserQuestion), and avoids a
  // separate floating dialog.
  if (hasPendingPermission && onPermissionRespond) {
    const requestId = toolCall._pendingPermission!.requestId;
    return (
      <div
        className="rounded-2xl overflow-hidden my-1.5"
        style={{
          border: '1px solid rgba(214,122,82,0.3)',
          background: 'rgba(214,122,82,0.05)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2.5 px-3 py-2.5 border-b"
          style={{ borderColor: 'rgba(214,122,82,0.2)', background: 'rgba(214,122,82,0.08)' }}
        >
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(214,122,82,0.15)' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Permission Required
            </span>
            <span className="text-[11px] ml-2" style={{ color: 'var(--color-text-muted)' }}>
              {toolLabel}
            </span>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wide flex-shrink-0" style={{ color: 'var(--color-accent)' }}>
            Waiting
          </span>
        </div>

        {/* Preview of what the tool wants to do */}
        <div className="px-3 py-2">
          <pre
            className="text-xs font-mono whitespace-pre-wrap break-all rounded-lg p-2 max-h-28 overflow-auto"
            style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-secondary)' }}
          >
            {preview}
          </pre>
        </div>

        {/* Buttons */}
        <div className="px-3 pb-3 flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => onPermissionRespond(requestId, 'allow_once')}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
            style={{
              background: 'rgba(34,197,94,0.1)',
              color: '#22c55e',
              border: '1px solid rgba(34,197,94,0.2)',
            }}
          >
            Allow Once
          </button>
          <button
            onClick={() => onPermissionRespond(requestId, 'always_allow')}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
            style={{ background: '#22c55e', color: 'white' }}
          >
            Always Allow
          </button>
          <button
            onClick={() => onPermissionRespond(requestId, 'deny_once')}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
            style={{
              background: 'rgba(239,68,68,0.1)',
              color: '#ef4444',
              border: '1px solid rgba(239,68,68,0.2)',
            }}
          >
            Deny
          </button>
          <button
            onClick={() => onPermissionRespond(requestId, 'always_deny')}
            className="text-[10px] px-2 py-1 rounded transition-colors ml-auto"
            style={{ color: 'var(--color-text-muted)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)'; }}
          >
            Always deny
          </button>
        </div>
      </div>
    );
  }

  // ─── Regular tool card ─────────────────────────────────────────
  // Denied uses a red-orange color distinct from error (which is more
  // alarm-red) so the user can visually tell "I blocked this" vs "the
  // tool crashed".
  const statusColor = isDenied ? '#ef4444' : isError ? 'var(--color-error)' : isRunning ? 'var(--color-accent)' : 'var(--color-success)';
  const borderColor = isDenied ? 'rgba(239,68,68,0.3)' : isError ? 'rgba(239,68,68,0.25)' : isRunning ? 'rgba(214,122,82,0.15)' : 'var(--color-border-secondary)';
  const bgColor = isDenied ? 'rgba(239,68,68,0.08)' : isError ? 'rgba(239,68,68,0.05)' : isRunning ? 'rgba(214,122,82,0.05)' : 'rgba(0,0,0,0.15)';

  // Get summary for collapsed state
  const getSummary = (): string => {
    if (!toolCall.result) return '';
    const content = typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result);
    if (isDenied || isError) {
      const firstLine = content.split(/\r?\n/)[0];
      return firstLine.length > 60 ? firstLine.substring(0, 57) + '...' : firstLine;
    }
    if (content.length < 60) return content.trim();
    const lines = content.trim().split(/\r?\n/);
    return `${lines.length} lines`;
  };

  const summary = getSummary();

  return (
    <div className="rounded-2xl overflow-hidden my-1.5" style={{ border: `1px solid ${borderColor}`, background: bgColor }}>
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors"
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        {/* Status icon */}
        <div className="flex-shrink-0" style={{ color: statusColor }}>
          {isRunning ? (
            <div className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin-slow" style={{ borderColor: statusColor, borderTopColor: 'transparent' }} />
          ) : isDenied ? (
            // Denied: red circle with a horizontal bar (blocked icon)
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={statusColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
          ) : isError ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={statusColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={statusColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="9 12 11 14 15 10" /></svg>
          )}
        </div>
        {/* Tool name */}
        <span className="text-xs font-mono truncate flex-1 min-w-0" style={{ color: 'var(--color-text-secondary)' }}>{toolCall.name}</span>
        {/* Status label — show "Denied" when blocked by permissions */}
        {isDenied && !expanded && (
          <span className="text-[10px] font-semibold uppercase tracking-wide flex-shrink-0" style={{ color: '#ef4444' }}>Denied</span>
        )}
        {/* Summary when collapsed */}
        {isSuccess && summary && !expanded && (
          <span className="text-[11px] truncate max-w-[180px] flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>{summary}</span>
        )}
        {/* Chevron */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      {/* Expanded content */}
      {expanded && (
        <div className="animate-fade-in" style={{ borderTop: '1px solid var(--color-border-secondary)' }}>
          {/* Input */}
          <div className="px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>Input</div>
            <pre className="text-xs font-mono whitespace-pre-wrap break-all rounded-lg p-2.5" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-secondary)' }}>
              {JSON.stringify(toolCall.arguments, null, 2)}
            </pre>
          </div>
          {/* Output */}
          {toolCall.result !== undefined && toolCall.result !== null && (
            <div className="px-3 py-2" style={{ borderTop: '1px solid var(--color-border-secondary)' }}>
              <div className="text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
                {isDenied ? 'Denied' : 'Output'}
              </div>
              <pre className={`text-xs font-mono whitespace-pre-wrap break-all rounded-lg p-2.5 max-h-[300px] overflow-y-auto ${isError ? '' : ''}`}
                style={{
                  background: (isDenied || isError) ? 'rgba(239,68,68,0.05)' : 'var(--color-bg-tertiary)',
                  color: (isDenied || isError) ? 'var(--color-error)' : 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border-secondary)',
                }}>
                {typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default ToolUseCard;
