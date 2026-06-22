/**
 * OpenAgent-Desktop - Message Bubble (Phase 7 — OpenCowork message features)
 *
 * Features:
 * - User messages: right-aligned rounded bubble
 * - Assistant messages: flat, no bubble, content on background
 * - ThinkingBlock: Brain icon, collapsible, preview, serif content
 * - ToolUseCard: merged tool call + result in one card (OpenCowork style)
 * - AskUserQuestion: special card with question + options
 * - CodeBlock: syntax-highlighted with copy button (via markdown renderer)
 * - Streaming cursor: blinking bar at end of streaming text
 * - Image blocks: inline images with borders
 * - File attachment chips: inline file references
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { ChatMessage } from '../../types';
import { renderMarkdown, sanitizeHtml, attachCopyCodeHandlers } from '../../utils/markdown';
import { formatFileSize } from '../../utils/format';
import ThinkingBlock from './message/ThinkingBlock';
import ToolUseCard from './message/ToolUseCard';
import TodoWriteCard from './message/TodoWriteCard';
import AskUserQuestionCard from './message/AskUserQuestionCard';

interface MessageBubbleProps {
  message: ChatMessage;
  isLast: boolean;
  onRetry?: () => void;
  onCopy?: (content: string) => void;
  /** Phase 10: Called when the user answers an inline AskUserQuestion. */
  onAskUserAnswer?: (toolCallId: string, answer: string) => void;
  /** Phase 10: The active ask-user request ID (for matching tool calls). */
  askUserRequestId?: string | null;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isLast: _isLast, onRetry, onCopy, onAskUserAnswer, askUserRequestId }) => {
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const renderedContent = useMemo(() => {
    if (!message.content) return '';
    return sanitizeHtml(renderMarkdown(message.content));
  }, [message.content]);

  useEffect(() => {
    const cleanup = attachCopyCodeHandlers(contentRef.current);
    return cleanup;
  }, [renderedContent]);

  const handleCopy = useCallback(async () => {
    const text = message.content || '';
    if (text) {
      try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
    }
  }, [message.content]);

  const formatTime = (ts: string) => {
    try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
  };

  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  // ─── USER MESSAGE: right-aligned bubble ──────────────────────────────
  if (isUser) {
    return (
      <div className="animate-fade-in flex items-start gap-2 justify-end group" style={{ marginBottom: '20px' }}>
        <button onClick={handleCopy}
          className="mt-1 w-6 h-6 flex items-center justify-center rounded-md transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
          style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')} title="Copy">
          {copied ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
          )}
        </button>
        <div className="px-4 py-3 break-words" style={{ background: 'var(--color-accent-soft)', borderRadius: '1.65rem', maxWidth: '80%', minWidth: 0 }}>
          {/* Images */}
          {message.images && message.images.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {message.images.map((img, i) => (
                <img key={i} src={img} alt={`Attachment ${i + 1}`} className="w-full max-w-full rounded-lg" style={{ border: '1px solid var(--color-border)', maxHeight: '400px', objectFit: 'contain' }} />
              ))}
            </div>
          )}
          {/* File attachment chips */}
          {message.files && message.files.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {message.files.map((file, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                  <span className="text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{file.name}</span>
                </div>
              ))}
            </div>
          )}
          <div ref={contentRef} className="text-sm" dangerouslySetInnerHTML={{ __html: renderedContent }} />
        </div>
      </div>
    );
  }

  // ─── ASSISTANT MESSAGE: no bubble, content blocks ────────────────────
  if (isAssistant) {
    return (
      <div className="animate-fade-in group" style={{ marginBottom: '20px' }}>
        <div className="space-y-1.5">
          {/* Thinking block — OpenCowork style */}
          {message.thinking && (
            <ThinkingBlock thinking={message.thinking} isStreaming={!!message.isStreaming} />
          )}

          {/* Processing indicator — when streaming but no content yet */}
          {message.isStreaming && !message.content && !message.thinking && (
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-full max-w-fit" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-secondary)' }}>
              <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin-slow" style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
              <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Processing…</span>
            </div>
          )}

          {/* Message content — plain text, NO background, with streaming cursor */}
          {message.content && (
            <div>
              <div ref={contentRef} className="markdown-content text-sm break-words" dangerouslySetInnerHTML={{ __html: renderedContent }} />
              {message.isStreaming && (
                <span className="inline-block w-2 h-4 ml-1 align-middle" style={{ background: 'var(--color-accent)', animation: 'cursor-blink 0.8s ease-in-out infinite' }} />
              )}
            </div>
          )}

          {/* Tool calls — inline cards for TodoWrite + AskUserQuestion,
              regular ToolUseCard for everything else */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="space-y-1.5">
              {message.toolCalls.map((tc) => {
                // Phase 9.4: Render TodoWrite as an inline checklist card.
                if (tc.name === 'TodoWrite' && tc.arguments) {
                  // Phase 10.1: Check for clear: true
                  if (tc.arguments.clear === true) return null;
                  const todos = tc.arguments.todos;
                  if (!Array.isArray(todos) || todos.length === 0) return null;
                  return (
                    <TodoWriteCard
                      key={tc.id}
                      todos={todos as any[]}
                      isStreaming={!!message.isStreaming}
                    />
                  );
                }
                // Phase 9.4: Render AskUserQuestion as an inline question card.
                if (tc.name === 'AskUserQuestion' && tc.arguments?.questions) {
                  return (
                    <AskUserQuestionCard
                      key={tc.id}
                      questions={tc.arguments.questions as any[]}
                      toolCallId={tc.id}
                      answered={typeof tc.result === 'string' ? extractAnswerFromResult(tc.result) : null}
                      onAnswer={(answer) => {
                        // Phase 10: Send the answer back to main.ts via the
                        // ask-user IPC flow. Use the requestId from the
                        // chat:ask-user event (stored in askUserRequestId).
                        if (askUserRequestId && onAskUserAnswer) {
                          onAskUserAnswer(askUserRequestId, answer);
                        }
                      }}
                    />
                  );
                }
                // Default: regular ToolUseCard for bash/read/edit/etc.
                return <ToolUseCard key={tc.id} toolCall={tc} />;
              })}
            </div>
          )}

          {/* Action buttons — hover only */}
          {!message.isStreaming && message.content && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pt-1">
              <button onClick={handleCopy}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors"
                style={{ color: 'var(--color-text-muted)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
              {onRetry && (
                <button onClick={onRetry}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors"
                  style={{ color: 'var(--color-text-muted)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-accent)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                  Retry
                </button>
              )}
            </div>
          )}
        </div>

        {/* Error */}
        {message.error && onRetry && (
          <div className="mt-2 inline-flex items-center gap-2 px-2 py-1 rounded-md text-xs" style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--color-error)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <span className="truncate max-w-[280px]">{message.error}</span>
            <button onClick={onRetry} className="font-medium underline" style={{ color: 'var(--color-accent)' }}>Retry</button>
          </div>
        )}

        {/* Phase 8.2: Non-fatal warning (e.g. max-steps reached with partial content) */}
        {message.warning && (
          <div className="mt-2 inline-flex items-center gap-2 px-2 py-1 rounded-md text-xs" style={{ background: 'rgba(245,158,11,0.08)', color: 'var(--color-text-secondary)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(245,158,11,1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span className="truncate max-w-[400px]">{message.warning}</span>
          </div>
        )}
      </div>
    );
  }

  // ─── SYSTEM / TOOL messages ──────────────────────────────────────────
  return (
    <div className="animate-fade-in" style={{ marginBottom: '20px' }}>
      <div className="rounded-lg px-3 py-2 text-xs font-mono" style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-primary)', color: 'var(--color-text-secondary)' }}>
        <span className="text-[10px] font-semibold uppercase mr-2" style={{ color: 'var(--color-text-muted)' }}>{message.role}</span>
        <span>{formatTime(message.timestamp)}</span>
        <div ref={contentRef} className="break-words mt-1" dangerouslySetInnerHTML={{ __html: renderedContent }} />
      </div>
    </div>
  );
};

/**
 * Phase 9.4: Extract the user's selected answer from the AskUserQuestion
 * tool result string. The result format is:
 *   "Question: <q>\nUser's answer: <selected option>"
 * Returns null if the result doesn't match (e.g. "User dismissed...").
 */
function extractAnswerFromResult(result: string): string | null {
  if (!result) return null;
  const match = result.match(/User's answer:\s*(.+)/);
  return match ? match[1].trim() : null;
}

export default MessageBubble;
