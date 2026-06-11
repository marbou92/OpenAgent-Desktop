/**
 * OpenAgent-Desktop - Message Bubble Component
 *
 * Different styles for user/assistant/system/tool messages,
 * markdown rendering, code blocks with copy button, image display,
 * tool call display with expand/collapse, timestamp, and retry button.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { ChatMessage, ToolCall } from '../../types';
import { renderMarkdown, sanitizeHtml } from '../../utils/markdown';

interface MessageBubbleProps {
  message: ChatMessage;
  isLast: boolean;
  onRetry?: () => void;
  onCopy?: (content: string) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isLast, onRetry, onCopy }) => {
  const [toolCallsExpanded, setToolCallsExpanded] = useState(false);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const renderedContent = useMemo(() => {
    if (!message.content) return '';
    const html = renderMarkdown(message.content);
    return sanitizeHtml(html);
  }, [message.content]);

  const handleCopyCode = useCallback((code: string, id: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  }, []);

  const formatTime = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isTool = message.role === 'tool';
  const isAssistant = message.role === 'assistant';

  return (
    <div
      className={`animate-fade-in flex gap-3 group ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{
          background: isUser
            ? 'var(--color-accent-soft)'
            : isSystem
            ? 'rgba(59,130,246,0.15)'
            : 'linear-gradient(135deg, var(--color-accent), #6d28d9)',
        }}
      >
        {isUser ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        ) : isSystem ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-info)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        )}
      </div>

      {/* Message Content */}
      <div className={`flex-1 min-w-0 ${isUser ? 'text-right' : 'text-left'}`}>
        {/* Header */}
        <div className={`flex items-center gap-2 mb-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
            {isUser ? 'You' : isSystem ? 'System' : isTool ? 'Tool' : 'Assistant'}
          </span>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {formatTime(message.timestamp)}
          </span>
          {message.isStreaming && (
            <div className="typing-indicator">
              <div className="dot" />
              <div className="dot" />
              <div className="dot" />
            </div>
          )}
        </div>

        {/* Thinking indicator */}
        {message.thinking && isAssistant && (
          <div className="mb-2">
            <button
              onClick={() => setThinkingExpanded(!thinkingExpanded)}
              className="flex items-center gap-1 text-xs transition-colors"
              style={{ color: 'var(--color-trace-thinking)' }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transform: thinkingExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              Thinking...
            </button>
            {thinkingExpanded && (
              <div
                className="mt-1 p-3 rounded-lg text-xs animate-fade-in"
                style={{ background: 'rgba(168,85,247,0.08)', color: 'var(--color-text-secondary)', borderLeft: '3px solid var(--color-trace-thinking)' }}
              >
                {message.thinking}
              </div>
            )}
          </div>
        )}

        {/* Message Body */}
        <div
          className={`inline-block rounded-2xl px-4 py-2.5 max-w-full text-left ${
            isUser
              ? 'rounded-tr-sm'
              : isSystem
              ? 'rounded-tl-sm'
              : 'rounded-tl-sm'
          } ${message.isStreaming ? 'streaming-cursor' : ''}`}
          style={{
            background: isUser
              ? 'var(--color-accent)'
              : isSystem
              ? 'rgba(59,130,246,0.1)'
              : isTool
              ? 'var(--color-bg-tertiary)'
              : 'var(--color-bg-secondary)',
            color: isUser ? 'white' : 'var(--color-text-primary)',
            border: isSystem ? '1px solid rgba(59,130,246,0.2)' : isTool ? '1px solid var(--color-border-primary)' : '1px solid var(--color-border-secondary)',
          }}
        >
          {message.content ? (
            <div
              className="markdown-content text-sm break-words"
              dangerouslySetInnerHTML={{ __html: renderedContent }}
            />
          ) : message.isStreaming ? (
            <div className="typing-indicator py-1">
              <div className="dot" />
              <div className="dot" />
              <div className="dot" />
            </div>
          ) : null}
        </div>

        {/* File Attachments */}
        {message.files && message.files.length > 0 && (
          <div className={`flex flex-wrap gap-2 mt-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
            {message.files.map((file, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-primary)' }}
              >
                <FileIcon type={file.type} />
                <span className="truncate max-w-[150px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {file.name}
                </span>
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {formatFileSize(file.size)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Tool Calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setToolCallsExpanded(!toolCallsExpanded)}
              className="flex items-center gap-1 text-xs transition-colors"
              style={{ color: 'var(--color-trace-tool-call)' }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transform: toolCallsExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              {message.toolCalls.length} tool call{message.toolCalls.length > 1 ? 's' : ''}
            </button>
            {toolCallsExpanded && (
              <div className="mt-1 space-y-2 animate-fade-in">
                {message.toolCalls.map((tc) => (
                  <ToolCallDisplay key={tc.id} toolCall={tc} onCopy={handleCopyCode} copied={copied} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons for Assistant Messages */}
        {isAssistant && !message.isStreaming && message.content && (
          <div className="mt-1.5 flex items-center gap-1.5">
            {/* Copy button */}
            <button
              onClick={() => onCopy?.(message.content) || navigator.clipboard.writeText(message.content)}
              className="p-1 rounded transition-colors opacity-0 group-hover:opacity-100"
              style={{ color: 'var(--color-text-muted)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
              title="Copy message"
              aria-label="Copy message"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
            {/* Retry button */}
            {onRetry && (
              <button
                onClick={onRetry}
                className="p-1 rounded transition-colors opacity-0 group-hover:opacity-100"
                style={{ color: 'var(--color-text-muted)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-accent)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                title="Regenerate response"
                aria-label="Retry"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Error & Retry */}
        {message.error && onRetry && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--color-error)' }}>
              {message.error}
            </span>
            <button
              onClick={onRetry}
              className="text-xs font-medium px-2 py-0.5 rounded transition-colors"
              style={{ color: 'var(--color-accent)', background: 'var(--color-accent-soft)' }}
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Tool Call Display ─────────────────────────────────────────────────────────

const ToolCallDisplay: React.FC<{
  toolCall: ToolCall;
  onCopy: (code: string, id: string) => void;
  copied: string | null;
}> = ({ toolCall, onCopy, copied }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
        style={{ background: 'var(--color-bg-tertiary)' }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-trace-tool-call)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{
            background:
              toolCall.status === 'completed'
                ? 'var(--color-success)'
                : toolCall.status === 'failed'
                ? 'var(--color-error)'
                : 'var(--color-warning)',
          }}
        />
        <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
          {toolCall.name}
        </span>
        <span className="text-xs ml-auto" style={{ color: 'var(--color-text-muted)' }}>
          {toolCall.status}
        </span>
      </div>
      {expanded && (
        <div className="p-3 animate-fade-in">
          <div className="mb-2">
            <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
              Arguments
            </div>
            <pre
              className="p-2 rounded text-xs overflow-auto max-h-32"
              style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-secondary)' }}
            >
              {JSON.stringify(toolCall.arguments, null, 2)}
            </pre>
          </div>
          {toolCall.result !== undefined && (
            <div>
              <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
                Result
              </div>
              <pre
                className="p-2 rounded text-xs overflow-auto max-h-48 relative"
                style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-secondary)' }}
              >
                {typeof toolCall.result === 'string'
                  ? toolCall.result
                  : JSON.stringify(toolCall.result, null, 2)}
                <button
                  onClick={() =>
                    onCopy(
                      typeof toolCall.result === 'string'
                        ? toolCall.result
                        : JSON.stringify(toolCall.result, null, 2),
                      toolCall.id
                    )
                  }
                  className="absolute top-1 right-1 p-1 rounded text-xs transition-colors"
                  style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
                >
                  {copied === toolCall.id ? 'Copied!' : 'Copy'}
                </button>
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
      <svg {...iconStyle} viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    );
  }

  if (type.startsWith('text/') || type.includes('json') || type.includes('javascript') || type.includes('typescript')) {
    return (
      <svg {...iconStyle} viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      <svg {...iconStyle} viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    );
  }

  return (
    <svg {...iconStyle} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  );
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default MessageBubble;
