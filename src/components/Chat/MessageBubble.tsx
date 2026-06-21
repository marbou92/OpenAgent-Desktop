/**
 * OpenAgent-Desktop - Message Bubble (Phase 6.3 — OpenCowork exact match)
 *
 * Matches OpenCowork's MessageCard layout exactly:
 *
 * USER messages:
 *   - Right-aligned
 *   - Rounded bubble (rounded-[1.65rem]) with accent-soft background
 *   - Max width 80%
 *   - Copy button appears on hover (left of bubble)
 *
 * ASSISTANT messages:
 *   - No bubble, no background — just content on the app background
 *   - Content blocks stacked vertically with small gaps
 *   - Thinking block: collapsible card with Brain icon + preview text
 *
 * THINKING block (OpenCowork style):
 *   - Rounded-2xl card with subtle border
 *   - Brain icon + "Thinking" label + truncated preview when collapsed
 *   - Chevron right/down indicator
 *   - Expanded: shows markdown-rendered thinking text
 *   - NOT auto-expanded — user clicks to expand
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { ChatMessage, ToolCall } from '../../types';
import { renderMarkdown, sanitizeHtml, attachCopyCodeHandlers } from '../../utils/markdown';
import { formatFileSize } from '../../utils/format';

interface MessageBubbleProps {
  message: ChatMessage;
  isLast: boolean;
  onRetry?: () => void;
  onCopy?: (content: string) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isLast: _isLast, onRetry, onCopy }) => {
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
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch { /* ignore */ }
    }
  }, [message.content]);

  const formatTime = (ts: string) => {
    try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  // ─── USER MESSAGE: right-aligned bubble ──────────────────────────────
  if (isUser) {
    return (
      <div className="animate-fade-in flex items-start gap-2 justify-end group" style={{ marginBottom: '20px' }}>
        {/* Copy button — appears on hover, left of bubble */}
        <button
          onClick={handleCopy}
          className="mt-1 w-6 h-6 flex items-center justify-center rounded-md transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
          style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}
          title="Copy"
        >
          {copied ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
          )}
        </button>

        {/* User bubble — rounded, accent-soft, right-aligned, max 80% */}
        <div
          className="px-4 py-3 break-words"
          style={{
            background: 'var(--color-accent-soft)',
            borderRadius: '1.65rem',
            maxWidth: '80%',
            minWidth: 0,
          }}
        >
          <div
            ref={contentRef}
            className="text-sm"
            dangerouslySetInnerHTML={{ __html: renderedContent }}
          />
        </div>
      </div>
    );
  }

  // ─── ASSISTANT MESSAGE: no bubble, just content ──────────────────────
  if (isAssistant) {
    return (
      <div className="animate-fade-in" style={{ marginBottom: '20px' }}>
        <div className="space-y-1.5">
          {/* Thinking block — OpenCowork style collapsible card */}
          {message.thinking && (
            <ThinkingBlock thinking={message.thinking} isStreaming={!!message.isStreaming} />
          )}

          {/* Processing indicator — when streaming but no content yet */}
          {message.isStreaming && !message.content && !message.thinking && (
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-full max-w-fit" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-subtle)' }}>
              <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin-slow" style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
              <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Processing…</span>
            </div>
          )}

          {/* Message content — plain text, NO background */}
          {message.content && (
            <div className={message.isStreaming ? 'streaming-cursor' : ''}>
              <div
                ref={contentRef}
                className="markdown-content text-sm break-words"
                dangerouslySetInnerHTML={{ __html: renderedContent }}
              />
            </div>
          )}

          {/* Files */}
          {message.files && message.files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {message.files.map((file, i) => (
                <div key={i} className="flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs" style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}>
                  <span className="truncate max-w-[160px]" style={{ color: 'var(--color-text-secondary)' }}>{file.name}</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>{formatFileSize(file.size)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Images */}
          {message.images && message.images.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {message.images.map((img, i) => (
                <img key={i} src={img} alt={`Attachment ${i + 1}`} className="max-h-48 rounded-lg border" style={{ borderColor: 'var(--color-border)' }} />
              ))}
            </div>
          )}

          {/* Tool calls */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {message.toolCalls.map((tc) => <ToolCallChip key={tc.id} toolCall={tc} onCopy={(c, id) => navigator.clipboard.writeText(c)} copied={null} />)}
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

// ─── Thinking Block (OpenCowork exact style) ──────────────────────────────────

const ThinkingBlock: React.FC<{ thinking: string; isStreaming: boolean }> = ({ thinking, isStreaming }) => {
  const [expanded, setExpanded] = useState(false);
  const text = thinking || '';
  if (!text) return null;

  // Preview: first ~80 chars
  const preview = text.length > 80 ? text.substring(0, 77) + '...' : text;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--color-border-secondary)', background: 'rgba(0,0,0,0.15)' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
        style={{ background: 'transparent' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        {/* Brain icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
          <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2z" />
          <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2z" />
        </svg>
        <span className="text-xs font-medium flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
          {isStreaming ? 'Thinking…' : 'Thinking'}
        </span>
        {!expanded && (
          <span className="text-[11px] truncate flex-1 min-w-0 italic" style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>
            {preview}
          </span>
        )}
        {/* Chevron */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 ml-auto"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 py-3 animate-fade-in" style={{ borderTop: '1px solid var(--color-border-secondary)' }}>
          <div className="text-sm whitespace-pre-wrap max-w-none" style={{ color: 'var(--color-text-secondary)', lineHeight: '1.6' }}>
            {text}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Tool Call Chip ────────────────────────────────────────────────────────────

const ToolCallChip: React.FC<{ toolCall: ToolCall; onCopy: (code: string, id: string) => void; copied: string | null }> = ({ toolCall, onCopy, copied }) => {
  const [expanded, setExpanded] = useState(false);
  const autoExpand = toolCall.status === 'pending';
  const statusColor = toolCall.status === 'completed' ? 'var(--color-success)' : toolCall.status === 'failed' ? 'var(--color-error)' : 'var(--color-warning)';

  return (
    <div className="rounded-lg border overflow-hidden" style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}>
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors" style={{ background: 'var(--color-bg-tertiary)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}>
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: expanded || autoExpand ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        {toolCall.status === 'pending' ? (
          <div className="w-2.5 h-2.5 border-2 border-t-transparent rounded-full animate-spin-slow" style={{ borderColor: statusColor, borderTopColor: 'transparent' }} />
        ) : toolCall.status === 'completed' ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={statusColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={statusColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        )}
        <span className="text-[11px] font-medium font-mono" style={{ color: 'var(--color-text-primary)' }}>{toolCall.name}</span>
        <span className="text-[9px] uppercase ml-auto" style={{ color: 'var(--color-text-muted)' }}>{toolCall.status}</span>
      </button>
      {(expanded || autoExpand) && (
        <div className="p-2.5 space-y-1.5 animate-fade-in">
          {Object.keys(toolCall.arguments || {}).length > 0 && (
            <pre className="p-1.5 rounded text-[11px] overflow-auto max-h-24 font-mono" style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-secondary)' }}>{JSON.stringify(toolCall.arguments, null, 2)}</pre>
          )}
          {toolCall.result !== undefined && toolCall.result !== null && (
            <pre className="p-1.5 rounded text-[11px] overflow-auto max-h-32 font-mono" style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-secondary)' }}>
              {typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

export default MessageBubble;
