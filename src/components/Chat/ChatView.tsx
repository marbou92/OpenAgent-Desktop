/**
 * OpenAgent-Desktop - Chat View (Phase 2 Redesign)
 *
 * Redesigned chat surface inspired by open-cowork / opencode-desktop:
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │ ◀ ModeSwitch  Session name (editable)        ⚙ 📋 +  │ ← slim header
 *   ├──────────────────────────────────────────────────────┤
 *   │                                                      │
 *   │            ┌─ centered message column ─┐             │
 *   │            │  user message             │             │
 *   │            │  assistant message        │             │
 *   │            │  tool call (inline)       │             │
 *   │            │  ...                      │             │
 *   │            └───────────────────────────┘             │
 *   │                                                      │
 *   ├──────────────────────────────────────────────────────┤
 *   │ [Model ▾]  ╭─────────────────────────────────────╮   │ ← composer
 *   │            │  Type a message... (/ for commands) │   │
 *   │            ╰──────────────────────────────────────╯  │
 *   │            [📎]                              [➤]     │
 *   └──────────────────────────────────────────────────────┘
 *
 * The composer lives in ChatInput. The model selector is rendered inside the
 * composer so it's always one click away without taking header space.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  ChatMessage,
  ProviderInfo,
  SessionData,
  AppSettings,
  TraceEntry,
  Toast,
  PermissionRequest,
  AgentMode,
  AttachedFile,
} from '../../types';
import { useChat } from '../../hooks/useChat';
import { useFileDrop } from '../../hooks/useFileDrop';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import ModeSwitch from './ModeSwitch';
import ChatEmptyState from './ChatEmptyState';
import ExecutionContextBar, { ExecutionContextBarProps } from '../Layout/ExecutionContextBar';
import PermissionDialog from './PermissionDialog';
import { getAPI } from '../../utils/api';

const api = getAPI();

interface ChatViewProps {
  sessionId: string | null;
  session: SessionData | null;
  providers: ProviderInfo[];
  messages: ChatMessage[];
  isStreaming: boolean;
  onMessagesUpdate: (messages: ChatMessage[]) => void;
  onNewSession: () => void;
  onLoadSession: (sessionId: string) => void;
  settings: AppSettings;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  addTraceEntry: (entry: TraceEntry) => void;
  tracePanelOpen?: boolean;
  onToggleTracePanel?: () => void;
  executionContext?: Partial<ExecutionContextBarProps>;
}

const ChatView: React.FC<ChatViewProps> = ({
  sessionId,
  session,
  providers,
  messages: externalMessages,
  isStreaming: _externalIsStreaming,
  onMessagesUpdate,
  onNewSession,
  onLoadSession: _onLoadSession,
  settings,
  addToast,
  addTraceEntry,
  tracePanelOpen = false,
  onToggleTracePanel,
  executionContext,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [activeMode, setActiveMode] = useState<AgentMode>('chat');
  const [sessionName, setSessionName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string>('');

  const {
    messages,
    isStreaming,
    error,
    streamingContent,
    streamingThinking,
    activeToolCalls,
    sendMessage,
    stopStreaming,
    retryLastMessage,
  } = useChat({
    sessionId,
    providers,
    permissionMode: settings.permissionMode ?? 'smart_approve',
    onMessagesUpdate,
    onTraceEntry: addTraceEntry,
    onPermissionRequest: (req) => setPermissionRequest(req),
    externalMessages,
  });

  const { droppedFiles, removeFile, clearFiles, fileError } = useFileDrop({
    onFilesDropped: (files) => {
      addToast({ type: 'info', title: `${files.length} file(s) attached` });
    },
  });

  // Sync selected provider/model from session — only when sessionId changes,
  // not on every session object reference change (which causes infinite loops).
  useEffect(() => {
    if (session) {
      setSelectedProviderId(session.providerId || '');
      setSelectedModel(session.model || '');
      setSessionName(session.name);
    } else {
      setSelectedProviderId('');
      setSelectedModel('');
      setSessionName('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Save provider+model to session when changed
  const handleProviderChange = useCallback(
    (providerId: string) => {
      setSelectedProviderId(providerId);
      setSelectedModel('');
      if (sessionId && api?.sessions?.update) {
        api.sessions.update(sessionId, { providerId, model: '' });
      }
    },
    [sessionId],
  );

  const handleModelChange = useCallback(
    (model: string) => {
      setSelectedModel(model);
      if (sessionId && api?.sessions?.update) {
        api.sessions.update(sessionId, { model });
      }
    },
    [sessionId],
  );

  // Auto-scroll — only when messages length or streaming content actually changes.
  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent, autoScroll]);

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    setAutoScroll(atBottom);
  }, []);

  const handleSend = useCallback(
    async (content: string, files?: AttachedFile[]) => {
      await sendMessage(content, files);
      clearFiles();
    },
    [sendMessage, clearFiles],
  );

  // Called when the empty-state "suggested prompt" button is clicked.
  // We don't auto-send — we pre-fill the composer and let the user edit.
  const handlePickPrompt = useCallback((prompt: string) => {
    setPendingPrompt(prompt);
  }, []);

  // Clear the pending prompt once ChatInput has consumed it.
  const handlePendingPromptConsumed = useCallback(() => {
    setPendingPrompt('');
  }, []);

  const handlePermissionRespond = useCallback(
    (response: 'allow_once' | 'always_allow' | 'deny_once' | 'always_deny') => {
      if (permissionRequest) {
        if (api?.permissions?.respond) {
          api.permissions.respond(permissionRequest.id, response);
        }
        setPermissionRequest(null);
      }
    },
    [permissionRequest],
  );

  const handleNameSubmit = useCallback(() => {
    setIsEditingName(false);
    if (sessionId && api?.sessions?.update && sessionName) {
      api.sessions.update(sessionId, { name: sessionName });
    }
  }, [sessionId, sessionName]);

  const handleCopyMessage = useCallback(
    (content: string) => {
      navigator.clipboard.writeText(content).then(() => {
        addToast({ type: 'success', title: 'Copied to clipboard' });
      });
    },
    [addToast],
  );

  const hasConnectedProvider = providers.length > 0 && providers.some((p) => p.configured);
  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)' }}>
      {/* ─── Slim Header ───────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-3 border-b flex-shrink-0"
        style={{
          borderColor: 'var(--color-border-secondary)',
          background: 'var(--color-bg-secondary)',
          height: 'var(--titlebar-height)',
        }}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <ModeSwitch activeMode={activeMode} onModeChange={setActiveMode} />

          {/* Session name (inline-editable) */}
          <div className="flex items-center min-w-0">
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
                className="text-sm font-medium bg-transparent outline-none border-b px-1"
                style={{
                  color: 'var(--color-text-primary)',
                  borderColor: 'var(--color-accent)',
                  width: '180px',
                }}
                autoFocus
              />
            ) : (
              <button
                onClick={() => setIsEditingName(true)}
                className="text-sm font-medium truncate hover:opacity-80 transition-opacity max-w-[220px]"
                style={{ color: 'var(--color-text-primary)' }}
                title="Click to edit session name"
              >
                {sessionName || 'New Chat'}
              </button>
            )}
          </div>
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-1">
          {/* Connection status pill */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium"
            style={{
              background: hasConnectedProvider
                ? 'rgba(34,197,94,0.1)'
                : 'rgba(239,68,68,0.1)',
              color: hasConnectedProvider ? 'var(--color-success)' : 'var(--color-error)',
            }}
            title={hasConnectedProvider ? 'At least one provider is configured' : 'No providers configured — open Settings'}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: hasConnectedProvider ? 'var(--color-success)' : 'var(--color-error)' }}
            />
            <span>{hasConnectedProvider ? 'Ready' : 'Setup needed'}</span>
          </div>

          {/* Trace panel toggle */}
          <button
            onClick={onToggleTracePanel}
            className="p-1.5 rounded-lg transition-colors"
            style={{
              color: tracePanelOpen ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
              background: tracePanelOpen ? 'var(--color-accent-soft)' : 'transparent',
            }}
            onMouseEnter={(e) => {
              if (!tracePanelOpen) {
                e.currentTarget.style.background = 'var(--color-bg-hover)';
                e.currentTarget.style.color = 'var(--color-text-primary)';
              }
            }}
            onMouseLeave={(e) => {
              if (!tracePanelOpen) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--color-text-tertiary)';
              }
            }}
            title="Toggle trace panel"
            aria-label="Toggle trace panel"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
          </button>

          {/* New chat */}
          <button
            onClick={onNewSession}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-hover)';
              e.currentTarget.style.color = 'var(--color-accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--color-text-tertiary)';
            }}
            title="New chat"
            aria-label="New chat"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>

      {/* ─── Execution Context Bar (only when running) ────────────────── */}
      {executionContext && executionContext.isRunning && (
        <ExecutionContextBar
          isRunning={executionContext.isRunning ?? false}
          isPaused={executionContext.isPaused}
          startAt={executionContext.startAt ?? null}
          endAt={executionContext.endAt ?? null}
          currentStep={executionContext.currentStep}
          maxSteps={executionContext.maxSteps}
          agentMode={executionContext.agentMode ?? activeMode}
          tokenUsage={executionContext.tokenUsage}
          contextWindow={executionContext.contextWindow}
          providerName={executionContext.providerName ?? selectedProviderId}
          modelName={executionContext.modelName ?? selectedModel}
          onPause={executionContext.onPause}
          onResume={executionContext.onResume}
          onStop={executionContext.onStop}
          onCompact={executionContext.onCompact}
        />
      )}

      {/* ─── Messages Area ────────────────────────────────────────────── */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        {!hasMessages ? (
          <ChatEmptyState
            onPickPrompt={handlePickPrompt}
            onNewSession={onNewSession}
            noProvidersConfigured={!hasConnectedProvider}
          />
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
            {messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                isLast={index === messages.length - 1}
                onRetry={
                  message.role === 'assistant' &&
                  (message.error || index === messages.length - 1)
                    ? retryLastMessage
                    : undefined
                }
                onCopy={handleCopyMessage}
              />
            ))}

            {/* Active tool calls (when streaming) */}
            {activeToolCalls.length > 0 && (
              <div className="space-y-2">
                {activeToolCalls.map((tc) => (
                  <div
                    key={tc.id}
                    className="rounded-lg border px-3 py-2 flex items-center gap-2.5"
                    style={{
                      background: 'var(--color-bg-secondary)',
                      borderColor: 'var(--color-border-primary)',
                    }}
                  >
                    {tc.status === 'pending' ? (
                      <div
                        className="w-3.5 h-3.5 border-2 rounded-full animate-spin-slow flex-shrink-0"
                        style={{
                          borderColor: 'var(--color-accent)',
                          borderTopColor: 'transparent',
                        }}
                      />
                    ) : (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--color-success)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="flex-shrink-0"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                    <span
                      className="text-xs font-medium font-mono"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {tc.name}
                    </span>
                    <span
                      className="text-[10px] uppercase tracking-wider"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {tc.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ─── Streaming status bar (thinking / writing) ────────────────── */}
      {isStreaming && (
        <div
          className="flex items-center gap-2 px-4 py-1.5 border-t text-xs"
          style={{
            background: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border-secondary)',
            color: 'var(--color-text-tertiary)',
          }}
        >
          {streamingThinking ? (
            <>
              <div
                className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin-slow"
                style={{
                  borderColor: 'var(--color-trace-thinking)',
                  borderTopColor: 'transparent',
                }}
              />
              <span style={{ color: 'var(--color-trace-thinking)' }}>Thinking...</span>
              <span className="flex-1 truncate" style={{ color: 'var(--color-text-muted)' }}>
                {streamingThinking.slice(0, 140)}
                {streamingThinking.length > 140 ? '…' : ''}
              </span>
            </>
          ) : streamingContent ? (
            <>
              <div
                className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin-slow"
                style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }}
              />
              <span>Generating...</span>
              <span className="flex-1 truncate" style={{ color: 'var(--color-text-muted)' }}>
                {streamingContent.slice(-140)}
              </span>
            </>
          ) : (
            <>
              <div
                className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin-slow"
                style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }}
              />
              <span>Connecting...</span>
            </>
          )}
        </div>
      )}

      {/* ─── Scroll-to-bottom indicator ───────────────────────────────── */}
      {!autoScroll && hasMessages && (
        <div className="flex justify-center pb-1.5 -mt-9 relative z-10">
          <button
            onClick={() => {
              setAutoScroll(true);
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium shadow-lg transition-colors"
            style={{
              background: 'var(--color-bg-elevated)',
              color: 'var(--color-accent)',
              border: '1px solid var(--color-border-primary)',
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

      {/* ─── Error Bar ────────────────────────────────────────────────── */}
      {error && (
        <div
          className="px-4 py-2 flex items-center gap-2 border-t text-xs"
          style={{
            background: 'rgba(239,68,68,0.08)',
            borderColor: 'var(--color-error)',
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
          <button
            onClick={retryLastMessage}
            className="text-xs font-medium underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* ─── File Error ───────────────────────────────────────────────── */}
      {fileError && (
        <div
          className="px-4 py-2 flex items-center gap-2 border-t text-xs"
          style={{
            background: 'rgba(245,158,11,0.08)',
            borderColor: 'var(--color-warning)',
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
          <span>{fileError}</span>
        </div>
      )}

      {/* ─── Composer (with inline model selector) ────────────────────── */}
      <ChatInput
        onSend={handleSend}
        onStop={stopStreaming}
        isStreaming={isStreaming}
        attachedFiles={droppedFiles}
        onRemoveFile={removeFile}
        onClearFiles={clearFiles}
        disabled={!sessionId}
        streamingThinking={streamingThinking}
        onNewSession={onNewSession}
        // Phase 2: pass provider/model state down so the selector lives
        // inside the composer, not the header.
        providers={providers}
        selectedProviderId={selectedProviderId}
        selectedModel={selectedModel}
        onProviderChange={handleProviderChange}
        onModelChange={handleModelChange}
        // Pre-fill support: empty-state prompts flow into the textarea.
        pendingPrompt={pendingPrompt}
        onPendingPromptConsumed={handlePendingPromptConsumed}
      />

      {/* ─── Permission Dialog ────────────────────────────────────────── */}
      <PermissionDialog request={permissionRequest} onRespond={handlePermissionRespond} />
    </div>
  );
};

export default ChatView;
