/**
 * OpenAgent-Desktop - Message Bubble (Phase 2 Redesign)
 *
 * Cleaner, opencode-inspired message rendering:
 *
 *   You · 14:32                                    [copy] [retry]
 *   ┌──────────────────────────────────────────────┐
 *   │  user message text (markdown)                │
 *   └──────────────────────────────────────────────┘
 *
 *   Assistant · 14:32                              [copy] [retry]
 *   assistant message text (markdown, full-width, no bubble)
 *
 *   ⚙ bash  ✓ completed        ← inline tool call chips
 *     $ npm run build
 *
 * Design decisions:
 *   - No avatars — saves vertical space, keeps focus on content.
 *   - User messages get a soft bubble (right-aligned feel via background only).
 *   - Assistant messages render full-width with NO bubble — just markdown.
 *   - Tool calls render as compact inline chips with status dot + expandable
 *     details (args + result) on click.
 *   - Action buttons (copy/retry) only appear on hover.
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

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isLast: _isLast,
  onRetry,
  onCopy,
}) => {
  const [copied, setCopied] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const renderedContent = useMemo(() => {
    if (!message.content) return '';
    const html = renderMarkdown(message.content);
    return sanitizeHtml(html);
  }, [message.content]);

  // Attach a single delegated click handler for [data-copy-code] buttons.
  useEffect(() => {
    const cleanup = attachCopyCodeHandlers(contentRef.current);
    return cleanup;
  }, [renderedContent]);

  const handleCopyCode = useCallback((code: string, id: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  }, []);

  const formatTime = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isTool = message.role === 'tool';
  const isAssistant = message.role === 'assistant';

  const roleLabel = isUser ? 'You' : isSystem ? 'System' : isTool ? 'Tool' : 'Assistant';
  const roleColor = isUser
    ? 'var(--color-accent)'
    : isSystem
    ? 'var(--color-info)'
    : isTool
    ? 'var(--color-text-tertiary)'
    : 'var(--color-success)';

  return (
    <div className="group animate-fade-in">
      {/* ─── Header row: role · timestamp · streaming indicator ─────── */}
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: roleColor }}
        >
          {roleLabel}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          {formatTime(message.timestamp)}
        </span>
        {message.isStreaming && (
          <div className="typing-indicator" style={{ padding: '0', gap: '3px' }}>
            <div className="dot" style={{ width: '4px', height: '4px' }} />
            <div className="dot" style={{ width: '4px', height: '4px' }} />
            <div className="dot" style={{ width: '4px', height: '4px' }} />
          </div>
        )}
      </div>

      {/* ─── Thinking block (collapsible) ───────────────────────────── */}
      {message.thinking && isAssistant && (
        <ThinkingBlock thinking={message.thinking} />
      )}

      {/* ─── Message Body ───────────────────────────────────────────── */}
      {message.content ? (
        isUser ? (
          // User messages: soft bubble, slight indent
          <div
            className={`inline-block rounded-2xl rounded-tl-md px-4 py-2.5 max-w-[85%] ${
              message.isStreaming ? 'streaming-cursor' : ''
            }`}
            style={{
              background: 'var(--color-accent-soft)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border-primary)',
            }}
          >
            <div
              ref={contentRef}
              className="markdown-content text-sm break-words"
              dangerouslySetInnerHTML={{ __html: renderedContent }}
            />
          </div>
        ) : isSystem ? (
          // System messages: info-tinted, full-width
          <div
            className="rounded-lg px-3 py-2 text-sm"
            style={{
              background: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.2)',
              color: 'var(--color-text-primary)',
            }}
          >
            <div
              ref={contentRef}
              className="markdown-content break-words"
              dangerouslySetInnerHTML={{ __html: renderedContent }}
            />
          </div>
        ) : isTool ? (
          // Tool messages: monospace-ish, dark surface
          <div
            className="rounded-lg px-3 py-2 text-xs font-mono"
            style={{
              background: 'var(--color-bg-tertiary)',
              border: '1px solid var(--color-border-primary)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <div ref={contentRef} className="break-words" dangerouslySetInnerHTML={{ __html: renderedContent }} />
          </div>
        ) : (
          // Assistant messages: NO bubble, full-width markdown
          <div className={`${message.isStreaming ? 'streaming-cursor' : ''}`}>
            <div
              ref={contentRef}
              className="markdown-content text-sm break-words"
              dangerouslySetInnerHTML={{ __html: renderedContent }}
            />
          </div>
        )
      ) : message.isStreaming ? (
        // Streaming with no content yet — show typing dots
        <div className="typing-indicator" style={{ padding: '4px 0' }}>
          <div className="dot" />
          <div className="dot" />
          <div className="dot" />
        </div>
      ) : null}

      {/* ─── File Attachments ───────────────────────────────────────── */}
      {message.files && message.files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {message.files.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-2.5 py-1 rounded-md text-xs"
              style={{
                background: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-border-primary)',
              }}
            >
              <FileIcon type={file.type} />
              <span className="truncate max-w-[160px]" style={{ color: 'var(--color-text-secondary)' }}>
                {file.name}
              </span>
              <span style={{ color: 'var(--color-text-muted)' }}>{formatFileSize(file.size)}</span>
            </div>
          ))}
        </div>
      )}

      {/* ─── Tool Calls ─────────────────────────────────────────────── */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {message.toolCalls.map((tc) => (
            <ToolCallChip
              key={tc.id}
              toolCall={tc}
              onCopy={handleCopyCode}
              copied={copied}
            />
          ))}
        </div>
      )}

      {/* ─── Action buttons (hover only) ────────────────────────────── */}
      {isAssistant && !message.isStreaming && message.content && (
        <div className="mt-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onCopy?.(message.content) || navigator.clipboard.writeText(message.content)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
            title="Copy message"
            aria-label="Copy message"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span>Copy</span>
          </button>
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-accent)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
              title="Regenerate response"
              aria-label="Retry"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              <span>Retry</span>
            </button>
          )}
        </div>
      )}

      {/* ─── Inline error + retry ───────────────────────────────────── */}
      {message.error && onRetry && (
        <div
          className="mt-2 inline-flex items-center gap-2 px-2 py-1 rounded-md text-xs"
          style={{
            background: 'rgba(239,68,68,0.08)',
            color: 'var(--color-error)',
            border: '1px solid rgba(239,68,68,0.2)',
          }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <span className="truncate max-w-[280px]">{message.error}</span>
          <button
            onClick={onRetry}
            className="font-medium underline"
            style={{ color: 'var(--color-accent)' }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Thinking Block ────────────────────────────────────────────────────────────

const ThinkingBlock: React.FC<{ thinking: string }> = ({ thinking }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[11px] transition-colors"
        style={{ color: 'var(--color-trace-thinking)' }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
          }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span>Reasoning</span>
      </button>
      {expanded && (
        <div
          className="mt-1 p-3 rounded-lg text-xs animate-fade-in whitespace-pre-wrap"
          style={{
            background: 'rgba(168,85,247,0.05)',
            color: 'var(--color-text-secondary)',
            borderLeft: '2px solid var(--color-trace-thinking)',
          }}
        >
          {thinking}
        </div>
      )}
    </div>
  );
};

// ─── Tool Call Chip ────────────────────────────────────────────────────────────

const ToolCallChip: React.FC<{
  toolCall: ToolCall;
  onCopy: (code: string, id: string) => void;
  copied: string | null;
}> = ({ toolCall, onCopy, copied }) => {
  const [expanded, setExpanded] = useState(false);

  // Auto-expand while pending so the user sees what's happening live.
  const autoExpand = toolCall.status === 'pending';

  const statusColor =
    toolCall.status === 'completed'
      ? 'var(--color-success)'
      : toolCall.status === 'failed'
      ? 'var(--color-error)'
      : 'var(--color-warning)';

  const statusIcon =
    toolCall.status === 'pending' ? (
      <div
        className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin-slow"
        style={{ borderColor: statusColor, borderTopColor: 'transparent' }}
      />
    ) : toolCall.status === 'completed' ? (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={statusColor}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ) : (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={statusColor}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    );

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{
        background: 'var(--color-bg-secondary)',
        borderColor: 'var(--color-border-primary)',
      }}
    >
      {/* Header bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors"
        style={{ background: 'var(--color-bg-tertiary)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-text-tertiary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: expanded || autoExpand ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
            flexShrink: 0,
          }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        {statusIcon}
        <span
          className="text-xs font-medium font-mono"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {toolCall.name}
        </span>
        <span
          className="text-[10px] uppercase tracking-wider ml-auto"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {toolCall.status}
        </span>
      </button>

      {/* Expandable details */}
      {(expanded || autoExpand) && (
        <div className="p-3 space-y-2 animate-fade-in">
          {Object.keys(toolCall.arguments || {}).length > 0 && (
            <div>
              <div
                className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Arguments
              </div>
              <pre
                className="p-2 rounded text-xs overflow-auto max-h-32 font-mono"
                style={{
                  background: 'var(--color-bg-primary)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border-secondary)',
                }}
              >
                {JSON.stringify(toolCall.arguments, null, 2)}
              </pre>
            </div>
          )}
          {toolCall.result !== undefined && toolCall.result !== null && (
            <div>
              <div
                className="text-[10px] font-semibold uppercase tracking-wider mb-1 flex items-center justify-between"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <span>Result</span>
                <button
                  onClick={() =>
                    onCopy(
                      typeof toolCall.result === 'string'
                        ? toolCall.result
                        : JSON.stringify(toolCall.result, null, 2),
                      toolCall.id,
                    )
                  }
                  className="text-[10px] font-medium transition-colors normal-case tracking-normal"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
                >
                  {copied === toolCall.id ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre
                className="p-2 rounded text-xs overflow-auto max-h-48 font-mono"
                style={{
                  background: 'var(--color-bg-primary)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border-secondary)',
                }}
              >
                {typeof toolCall.result === 'string'
                  ? toolCall.result
                  : JSON.stringify(toolCall.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── File Icon ─────────────────────────────────────────────────────────────────

const FileIcon: React.FC<{ type: string }> = ({ type }) => {
  const iconStyle = { width: 14, height: 14 };

  if (type.startsWith('image/')) {
    return (
      <svg
        {...iconStyle}
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    );
  }

  if (
    type.startsWith('text/') ||
    type.includes('json') ||
    type.includes('javascript') ||
    type.includes('typescript')
  ) {
    return (
      <svg
        {...iconStyle}
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-success)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    );
  }

  if (type.includes('pdf')) {
    return (
      <svg
        {...iconStyle}
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-error)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    );
  }

  return (
    <svg
      {...iconStyle}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-text-tertiary)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  );
};

export default MessageBubble;
