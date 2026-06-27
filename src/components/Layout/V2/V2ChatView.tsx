/**
 * OpenAgent-Desktop — V2 Chat View (Phase 1.5)
 *
 * The Modern-layout active chat. A floating rounded card on the deep background
 * containing:
 *   - A slim header (session name, streaming status, trace toggle)
 *   - The message timeline (reuses MessageBubble — all the AskUserQuestion /
 *     TodoWrite / tool-call rendering from phases 0.x is preserved)
 *   - The V2 composer docked at the bottom of the card
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ deep bg                                                      │
 *   │  ┌────────────────────────────────────────────────────────┐  │
 *   │  │ Session Name        [● Ready]  [trace]                  │  │ ← header
 *   │  ├────────────────────────────────────────────────────────┤  │
 *   │  │                                                        │  │
 *   │  │  Message timeline (MessageBubble × N)                   │  │ ← scrollable
 *   │  │                                                        │  │
 *   │  ├────────────────────────────────────────────────────────┤  │
 *   │  │ [+]  [Model ▾]                                  [⬆]   │  │ ← V2Composer
 *   │  └────────────────────────────────────────────────────────┘  │
 *   └──────────────────────────────────────────────────────────────┘
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { ChatMessage, ProviderInfo, Toast, AppSettings, AttachedFile } from '../../../types';
import MessageBubble from '../../Chat/MessageBubble';
import V2Composer from './V2Composer';

const api = (window as any).openagent;

interface V2ChatViewProps {
  sessionId: string | null;
  session: { name?: string } | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  streamingContent: string;
  streamingThinking: string;
  providers: ProviderInfo[];
  selectedProviderId: string;
  selectedModel: string;
  onProviderChange: (providerId: string) => void;
  onModelChange: (model: string) => void;
  onSend: (content: string, files?: AttachedFile[]) => void;
  onStop: () => void;
  onRetry: () => void;
  onCopyMessage: (content: string) => void;
  onImagesAttached?: (images: string[]) => void;
  askUserRequestId: string | null;
  onAskUserAnswer: (requestId: string, answer: string) => void;
  permissionRequest: { id: string; toolName: string; args: Record<string, unknown> } | null;
  onPermissionRespond: (requestId: string, response: string) => void;
  v2TracePanelOpen: boolean;
  onToggleTracePanel: () => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

const V2ChatView: React.FC<V2ChatViewProps> = ({
  session,
  messages,
  isStreaming,
  error,
  streamingContent,
  streamingThinking,
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
  v2TracePanelOpen,
  onToggleTracePanel,
}) => {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = React.useState(true);
  const [sessionName, setSessionName] = React.useState(session?.name || 'New Chat');
  const [isEditingName, setIsEditingName] = React.useState(false);

  // Sync session name when session changes
  useEffect(() => {
    setSessionName(session?.name || 'New Chat');
  }, [session?.name]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  // Scroll handler — detect if user scrolled up
  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAutoScroll(atBottom);
  }, []);

  const handleNameSubmit = useCallback(() => {
    setIsEditingName(false);
    // Name persistence is handled by the parent; here we just exit edit mode.
  }, []);

  const hasConnectedProvider = providers.length > 0 && providers.some((p) => p.configured);

  return (
    <div
      className="h-full w-full flex items-center justify-center p-2"
      style={{ background: 'var(--v2-background-bg-deep)' }}
    >
      {/* The floating chat card */}
      <div
        className="flex flex-col h-full w-full max-w-[1080px] overflow-hidden"
        style={{
          background: 'var(--v2-background-bg-base)',
          borderRadius: 'var(--v2-radius-lg)',
          boxShadow: 'var(--v2-elevation-raised)',
        }}
      >
        {/* ─── Slim header ─── */}
        <div
          className="flex items-center justify-between px-4 flex-shrink-0"
          style={{
            height: '36px',
            borderBottom: '1px solid var(--v2-border-border-muted)',
            background: 'var(--v2-background-bg-layer-01)',
          }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {isEditingName ? (
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                onBlur={handleNameSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNameSubmit();
                  if (e.key === 'Escape') setIsEditingName(false);
                }}
                className="text-[13px] bg-transparent outline-none px-1"
                style={{
                  color: 'var(--v2-text-text-base)',
                  fontFamily: 'var(--v2-font-family-text)',
                  fontWeight: 'var(--v2-font-weight-medium)',
                  borderBottom: '1px solid var(--v2-icon-icon-accent)',
                  width: '220px',
                }}
                autoFocus
              />
            ) : (
              <button
                onClick={() => setIsEditingName(true)}
                className="text-[13px] truncate hover:opacity-80 transition-opacity max-w-[280px]"
                style={{
                  color: 'var(--v2-text-text-base)',
                  fontFamily: 'var(--v2-font-family-text)',
                  fontWeight: 'var(--v2-font-weight-medium)',
                }}
                title="Click to edit session name"
              >
                {sessionName || 'New Chat'}
              </button>
            )}
          </div>

          {/* Status pill */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] flex-shrink-0"
            style={{
              background: isStreaming
                ? (streamingThinking && !streamingContent
                  ? 'rgba(168,85,247,0.1)'
                  : 'rgba(34,197,94,0.1)')
                : hasConnectedProvider
                ? 'rgba(34,197,94,0.1)'
                : 'rgba(239,68,68,0.1)',
              color: isStreaming
                ? (streamingThinking && !streamingContent
                  ? 'var(--v2-icon-icon-accent)'
                  : 'var(--v2-text-text-base)')
                : hasConnectedProvider ? 'var(--v2-text-text-base)' : 'var(--v2-text-text-base)',
              fontFamily: 'var(--v2-font-family-text)',
            }}
          >
            {isStreaming ? (
              streamingThinking && !streamingContent ? (
                <span className="thinking-dots"><span /><span /><span /></span>
              ) : (
                <span className="generating-pulse" />
              )
            ) : (
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: hasConnectedProvider ? 'var(--v2-icon-icon-accent)' : 'var(--v2-text-text-base)' }}
              />
            )}
            <span>
              {isStreaming
                ? (streamingThinking && !streamingContent ? 'Thinking' : 'Generating')
                : hasConnectedProvider ? 'Ready' : 'Setup needed'}
            </span>
          </div>

          {/* Trace toggle */}
          <button
            onClick={onToggleTracePanel}
            className="flex items-center justify-center h-7 w-7 rounded transition-colors ml-1 flex-shrink-0"
            style={{
              color: v2TracePanelOpen ? 'var(--v2-icon-icon-accent)' : 'var(--v2-icon-icon-muted)',
              background: v2TracePanelOpen ? 'var(--v2-overlay-simple-overlay-hover)' : 'transparent',
            }}
            onMouseEnter={(e) => {
              if (!v2TracePanelOpen) e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover)';
            }}
            onMouseLeave={(e) => {
              if (!v2TracePanelOpen) e.currentTarget.style.background = 'transparent';
            }}
            title="Trace"
            aria-label="Toggle trace panel"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
          </button>
        </div>

        {/* ─── Streaming status bar (thin, only when streaming) ─── */}
        {isStreaming && (
          <div
            className="flex items-center gap-2 px-4 py-1.5 flex-shrink-0 text-[11px]"
            style={{
              background: 'var(--v2-background-bg-layer-01)',
              borderBottom: '1px solid var(--v2-border-border-muted)',
              color: 'var(--v2-text-text-muted)',
              fontFamily: 'var(--v2-font-family-text)',
            }}
          >
            {streamingThinking && !streamingContent ? (
              <>
                <span className="thinking-dots"><span /><span /><span /></span>
                <span style={{ color: 'var(--v2-icon-icon-accent)', fontWeight: 'var(--v2-font-weight-medium)' }}>Thinking</span>
                <span className="flex-1 truncate">
                  {streamingThinking.slice(0, 120)}{streamingThinking.length > 120 ? '…' : ''}
                </span>
              </>
            ) : streamingContent ? (
              <>
                <span className="generating-pulse" />
                <span style={{ color: 'var(--v2-icon-icon-accent)', fontWeight: 'var(--v2-font-weight-medium)' }}>Generating</span>
                <span className="flex-1 truncate font-mono">
                  {streamingContent.slice(-100)}
                </span>
              </>
            ) : (
              <>
                <div className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--v2-icon-icon-accent)', borderTopColor: 'transparent' }} />
                <span>Connecting…</span>
              </>
            )}
          </div>
        )}

        {/* ─── Error bar ─── */}
        {error && (
          <div
            className="flex items-center gap-2 px-4 py-2 flex-shrink-0 text-[11px]"
            style={{
              background: 'rgba(239,68,68,0.08)',
              borderBottom: '1px solid var(--v2-border-border-muted)',
              color: 'var(--v2-text-text-base)',
              fontFamily: 'var(--v2-font-family-text)',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span className="flex-1 truncate">{error}</span>
            <button onClick={onRetry} className="font-medium underline">Retry</button>
          </div>
        )}

        {/* ─── Message timeline ─── */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto"
          onScroll={handleScroll}
        >
          <div className="max-w-[720px] mx-auto px-4 py-6 space-y-5">
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
                onCopy={onCopyMessage}
                askUserRequestId={askUserRequestId}
                onAskUserAnswer={(requestId, answer) => {
                  if (api?.permissions?.respondToQuestion) {
                    api.permissions.respondToQuestion(requestId, answer);
                  }
                  onAskUserAnswer(requestId, answer);
                }}
                onPermissionRespond={() => {
                  // Permission handling is delegated to the parent in V2 mode
                }}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* ─── Scroll-to-bottom indicator ─── */}
        {!autoScroll && (
          <div className="flex justify-center pb-1.5 -mt-9 relative z-10">
            <button
              onClick={() => {
                setAutoScroll(true);
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-colors"
              style={{
                background: 'var(--v2-background-bg-layer-03)',
                color: 'var(--v2-text-text-base)',
                boxShadow: 'var(--v2-elevation-floating)',
                fontFamily: 'var(--v2-font-family-text)',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
              Jump to latest
            </button>
          </div>
        )}

        {/* ─── Docked V2 composer ─── */}
        <div className="flex-shrink-0 px-4 pb-4 pt-1">
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
          />
        </div>
      </div>
    </div>
  );
};

export default V2ChatView;
