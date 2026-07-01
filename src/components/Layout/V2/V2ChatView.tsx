/**
 * OpenAgent-Desktop — V2 Chat View (Phase 2.0.3)
 *
 * The Modern-layout chat surface. A floating rounded card on a deep bg:
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ deep bg                                                       │
 *   │  ┌────────────────────────────────────────────────────────┐  │
 *   │  │ Session name     [Generating…]              [Trace] [⚙]│  │ ← slim header
 *   │  ├────────────────────────────────────────────────────────┤  │
 *   │  │                                                        │  │
 *   │  │  message timeline (MessageBubble x N)                   │  │
 *   │  │                                                        │  │
 *   │  │  [Jump to latest ↓]                                    │  │
 *   │  ├────────────────────────────────────────────────────────┤  │
 *   │  │ streaming status bar (Connecting/Thinking/Generating)  │  │
 *   │  │ error bar (only when error)                            │  │
 *   │  ├────────────────────────────────────────────────────────┤  │
 *   │  │ V2Composer (docked)                                    │  │
 *   │  └────────────────────────────────────────────────────────┘  │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * V2ChatView is a pure presentation component — all data flows in via props.
 * The parent owns the streaming state, message list, error, etc. so the
 * shell can swap views (home / new-session / chat) without losing state.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  ChatMessage,
  ProviderInfo,
  SessionData,
  Toast,
  PermissionRequest,
  AgentMode,
  AgentDefinition,
  AttachedFile,
} from '../../../types';
import MessageBubble from '../../Chat/MessageBubble';
import V2Composer from './V2Composer';
import { ThinkingEffort } from '../../Chat/ThinkingEffortSelector';
// Phase 2.4.3: directory badge
import DirectoryBadge from '../../Chat/DirectoryBadge';

interface V2ChatViewProps {
  sessionId: string | null;
  session: SessionData | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  /** Live-streaming assistant text (not yet committed to a message). */
  streamingContent?: string;
  /** Live-streaming thinking text. */
  streamingThinking?: string;
  providers: ProviderInfo[];
  selectedProviderId: string;
  selectedModel: string;
  onProviderChange: (providerId: string) => void;
  onModelChange: (model: string) => void;
  onSend: (content: string, files?: AttachedFile[]) => void;
  onStop: () => void;
  onRetry?: () => void;
  onCopyMessage?: (content: string) => void;
  onImagesAttached?: (images: string[]) => void;
  /** Active AskUserQuestion request ID (matches a tool-call id in messages). */
  askUserRequestId?: string | null;
  /** Called when the user answers an inline AskUserQuestion. */
  onAskUserAnswer?: (requestId: string, answer: string | null) => void;
  /** Active permission request (for the inline permission prompt). */
  permissionRequest?: PermissionRequest | null;
  /** Called when the user responds to an inline permission prompt. */
  onPermissionRespond?: (
    requestId: string,
    response: 'allow_once' | 'always_allow' | 'deny_once' | 'always_deny',
  ) => void;
  /** Whether the V2 trace panel is open. */
  v2TracePanelOpen?: boolean;
  /** Toggle the V2 trace panel. */
  onToggleTracePanel?: () => void;
  /** Toast helper (for copy notifications etc.). */
  addToast?: (toast: Omit<Toast, 'id'>) => void;
  // ─── Composer pass-through props ──────────────────────────────────
  thinkingEffort?: ThinkingEffort;
  onThinkingEffortChange?: (effort: ThinkingEffort) => void;
  modelSupportsReasoning?: boolean;
  showThinkingEffort?: boolean;
  activeMode?: AgentMode;
  onModeChange?: (mode: AgentMode) => void;
  customAgents?: AgentDefinition[];
  showAgentMode?: boolean;
}

const V2ChatView: React.FC<V2ChatViewProps> = ({
  sessionId,
  session,
  messages,
  isStreaming,
  error,
  streamingContent = '',
  streamingThinking = '',
  providers,
  selectedProviderId,
  selectedModel,
  onProviderChange,
  onModelChange,
  onSend,
  onStop,
  onRetry,
  onCopyMessage,
  onImagesAttached,
  askUserRequestId,
  onAskUserAnswer,
  permissionRequest,
  onPermissionRespond,
  v2TracePanelOpen = false,
  onToggleTracePanel,
  addToast,
  thinkingEffort,
  onThinkingEffortChange,
  modelSupportsReasoning,
  showThinkingEffort,
  activeMode,
  onModeChange,
  customAgents,
  showAgentMode,
}) => {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const hasMessages = messages.length > 0;
  const sessionName = session?.name || (sessionId ? 'New session' : 'Chat');

  // ── Auto-scroll on new content ─────────────────────────────────────
  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent, streamingThinking, autoScroll]);

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const atBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    setAutoScroll(atBottom);
  }, []);

  const handleJumpToLatest = useCallback(() => {
    setAutoScroll(true);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleCopy = useCallback(
    (content: string) => {
      if (onCopyMessage) {
        onCopyMessage(content);
      } else {
        try {
          void navigator.clipboard.writeText(content);
        } catch {
          /* ignore */
        }
      }
      addToast?.({ type: 'success', title: 'Copied', duration: 1500 });
    },
    [onCopyMessage, addToast],
  );

  return (
    <div
      className="h-full w-full flex items-stretch justify-center overflow-hidden"
      style={{
        background: 'var(--v2-background-bg-deep, var(--v2-background-bg-base))',
        fontFamily: 'var(--v2-font-family-text)',
        padding: '0 16px 16px',
      }}
    >
      {/* Floating card — fills available width, max-w 1024px. */}
      <div
        className="flex flex-col h-full w-full"
        style={{
          maxWidth: '1024px',
          background: 'var(--v2-background-bg-base)',
          borderRadius: 'var(--v2-radius-xl, 16px)',
          boxShadow: 'var(--v2-elevation-raised)',
          border: '1px solid var(--v2-border-border-muted)',
          overflow: 'hidden',
          marginTop: '16px',
        }}
      >
        {/* ─── Slim header ────────────────────────────────────────────── */}
        <div
          className="flex items-center gap-2 px-4 flex-shrink-0"
          style={{
            height: '40px',
            borderBottom: '1px solid var(--v2-border-border-muted)',
          }}
        >
          <span
            className="text-[13px] font-medium truncate flex-1 min-w-0"
            style={{
              color: 'var(--v2-text-text-base)',
              fontWeight: 'var(--v2-font-weight-medium)',
            }}
            title={sessionName}
          >
            {sessionName}
          </span>

          {/* Streaming status chip */}
          {isStreaming && (
            <span
              className="flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full"
              style={{
                color: 'var(--color-accent, var(--v2-blue-600))',
                background: 'var(--v2-overlay-simple-overlay-hover)',
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{
                  background: 'var(--color-accent, var(--v2-blue-600))',
                }}
              />
              {streamingThinking && !streamingContent
                ? 'Thinking'
                : streamingContent
                ? 'Generating'
                : 'Connecting'}
            </span>
          )}
        </div>

        {/* Phase 2.4.3: Directory badge — shows the current working directory */}
        <DirectoryBadge />

        {/* ─── Message timeline ───────────────────────────────────────── */}
        <div
          ref={messagesContainerRef}
          className="flex-1 min-h-0 overflow-y-auto relative"
          onScroll={handleScroll}
        >
          {hasMessages ? (
            <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
              {messages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isLast={index === messages.length - 1}
                  onRetry={
                    message.role === 'assistant' &&
                    (message.error || index === messages.length - 1)
                      ? onRetry
                      : undefined
                  }
                  onCopy={handleCopy}
                  askUserRequestId={askUserRequestId}
                  onAskUserAnswer={onAskUserAnswer}
                  onPermissionRespond={onPermissionRespond}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <div
              className="flex flex-col items-center justify-center h-full px-6 text-center"
              style={{ color: 'var(--v2-text-text-muted)' }}
            >
              <div
                className="flex items-center justify-center mb-4"
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: 'var(--v2-radius-xl, 16px)',
                  background:
                    'linear-gradient(135deg, var(--color-accent, var(--v2-blue-600)), #6d28d9)',
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <div
                style={{
                  color: 'var(--v2-text-text-base)',
                  fontSize: '14px',
                  fontWeight: 'var(--v2-font-weight-medium)',
                  marginBottom: '4px',
                }}
              >
                Start the conversation
              </div>
              <div
                style={{
                  color: 'var(--v2-text-text-muted)',
                  fontSize: '12px',
                }}
              >
                Type a message below to begin.
              </div>
            </div>
          )}

          {/* Scroll-to-bottom indicator */}
          {!autoScroll && hasMessages && (
            <div className="sticky bottom-2 flex justify-center pointer-events-none">
              <button
                type="button"
                onClick={handleJumpToLatest}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium pointer-events-auto transition-colors"
                style={{
                  background: 'var(--v2-background-bg-base)',
                  color: 'var(--color-accent, var(--v2-blue-600))',
                  border: '1px solid var(--v2-border-border-base)',
                  boxShadow: 'var(--v2-elevation-floating)',
                }}
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
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                Jump to latest
              </button>
            </div>
          )}
        </div>

        {/* ─── Streaming status bar ───────────────────────────────────── */}
        {isStreaming && (
          <div
            className="flex items-center gap-2 px-4 py-1.5 flex-shrink-0 text-[11px]"
            style={{
              background: 'var(--v2-background-bg-deep, var(--v2-background-bg-base))',
              borderTop: '1px solid var(--v2-border-border-muted)',
              color: 'var(--v2-text-text-muted)',
            }}
          >
            {streamingThinking && !streamingContent ? (
              <>
                <span className="thinking-dots">
                  <span />
                  <span />
                  <span />
                </span>
                <span
                  className="font-medium"
                  style={{ color: 'var(--v2-text-text-muted)' }}
                >
                  Thinking
                </span>
                <span className="flex-1 truncate text-[11px]">
                  {streamingThinking.slice(0, 120)}
                  {streamingThinking.length > 120 ? '…' : ''}
                </span>
              </>
            ) : streamingContent ? (
              <>
                <span
                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{
                    background: 'var(--color-accent, var(--v2-blue-600))',
                  }}
                />
                <span
                  className="font-medium"
                  style={{ color: 'var(--color-accent, var(--v2-blue-600))' }}
                >
                  Generating
                </span>
                <span className="flex-1 truncate text-[11px] font-mono">
                  {streamingContent.slice(-100)}
                </span>
              </>
            ) : (
              <>
                <div
                  className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin-slow"
                  style={{
                    borderColor: 'var(--color-accent, var(--v2-blue-600))',
                    borderTopColor: 'transparent',
                  }}
                />
                <span>Connecting…</span>
              </>
            )}
          </div>
        )}

        {/* ─── Error bar ──────────────────────────────────────────────── */}
        {error && (
          <div
            className="flex items-center gap-2 px-4 py-2 flex-shrink-0 text-[12px]"
            style={{
              background: 'rgba(239,68,68,0.08)',
              borderTop: '1px solid var(--v2-border-border-muted)',
              color: 'var(--color-error)',
            }}
          >
            <svg
              width="14"
              height="14"
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
            <span className="flex-1 truncate">{error}</span>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="text-[12px] font-medium underline"
                style={{ color: 'var(--color-error)' }}
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* ─── Inline permission prompt (above composer) ──────────────── */}
        {permissionRequest && onPermissionRespond && (
          <div
            className="flex items-center gap-2 px-4 py-2 flex-shrink-0 text-[12px]"
            style={{
              background: 'rgba(245,158,11,0.08)',
              borderTop: '1px solid var(--v2-border-border-muted)',
              color: 'var(--color-warning)',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span className="flex-1 truncate">
              {permissionRequest.toolName} — {permissionRequest.reason || 'permission required'}
            </span>
            <button
              type="button"
              onClick={() => onPermissionRespond(permissionRequest.id, 'allow_once')}
              className="px-2 py-0.5 rounded text-[11px] font-medium"
              style={{
                background: 'var(--color-accent, var(--v2-blue-600))',
                color: 'white',
              }}
            >
              Allow
            </button>
            <button
              type="button"
              onClick={() => onPermissionRespond(permissionRequest.id, 'deny_once')}
              className="px-2 py-0.5 rounded text-[11px] font-medium"
              style={{
                background: 'var(--v2-overlay-simple-overlay-hover)',
                color: 'var(--v2-text-text-base)',
              }}
            >
              Deny
            </button>
          </div>
        )}

        {/* ─── Docked V2Composer ──────────────────────────────────────── */}
        <div
          className="flex-shrink-0 px-3 py-3"
          style={{ borderTop: '1px solid var(--v2-border-border-muted)' }}
        >
          <V2Composer
            onSend={onSend}
            onStop={onStop}
            isStreaming={isStreaming}
            providers={providers}
            selectedProviderId={selectedProviderId}
            selectedModel={selectedModel}
            onProviderChange={onProviderChange}
            onModelChange={onModelChange}
            onImagesAttached={onImagesAttached}
            thinkingEffort={thinkingEffort}
            onThinkingEffortChange={onThinkingEffortChange}
            modelSupportsReasoning={modelSupportsReasoning}
            showThinkingEffort={showThinkingEffort}
            activeMode={activeMode}
            onModeChange={onModeChange}
            customAgents={customAgents}
            showAgentMode={showAgentMode}
          />
        </div>
      </div>
    </div>
  );
};

export default V2ChatView;
