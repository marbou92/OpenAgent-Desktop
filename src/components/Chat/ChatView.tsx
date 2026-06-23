/**
 * OpenAgent-Desktop - Chat View (Phase 2.2 Redesign)
 *
 * Redesigned chat surface inspired by open-cowork / opencode-desktop:
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │  Session name (editable)              Ready  ⚙  +    │ ← minimal header
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
 *   │ ╭──────────────────────────────────────────────────╮ │ ← composer
 *   │ │  Type a message... (/ for commands)              │ │
 *   │ ╰──────────────────────────────────────────────────╯ │
 *   │ [📎] [Build ▾] [Model ▾]                  [➤ Send]  │
 *   │  ^^^^^^^^^^^  ^^^^^^^^^^^^^                          │
 *   │  AgentSelector  ModelSelector                        │
 *   └──────────────────────────────────────────────────────┘
 *
 * Phase 2.2 changes (vs Phase 2):
 *   - Mode switch REMOVED from the header. The header is now minimal:
 *     just the session name on the left and connection/trace/new-chat on
 *     the right.
 *   - Build/Plan selector moved INTO the composer's bottom-left row,
 *     sitting next to the model selector. This matches opencode desktop,
 *     which places the agent dropdown inside the prompt-input footer.
 *   - Only Build and Plan are exposed. Chat is no longer a UI mode (old
 *     sessions with mode='chat' or 'smart' normalize to 'build').
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
import ChatEmptyState from './ChatEmptyState';
import ThinkingEffortSelector, { ThinkingEffort } from './ThinkingEffortSelector';
import ExecutionContextBar, { ExecutionContextBarProps } from '../Layout/ExecutionContextBar';
import PermissionDialog from './PermissionDialog';
import TodoPanel from '../Layout/RightPanel/TodoPanel';
import TodoWriteCard from './message/TodoWriteCard';
import StructuredOutputPanel from './StructuredOutputPanel';
import { getAPI } from '../../utils/api';

// Phase 2.2: ModeSwitch is gone. The Build/Plan selector now lives inside
// the composer (AgentSelector component), matching opencode desktop.

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
  // Phase 2.2: default to 'build' (was 'chat'). Only Build and Plan are
  // selectable from the UI now; old sessions with 'chat'/'smart' normalize
  // to 'build' via AgentSelector's normalizeMode().
  const [activeMode, setActiveMode] = useState<AgentMode>('build');
  const [sessionName, setSessionName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
  // Phase 10.2: Map of toolCallId → askUserRequestId. When the agent calls
  // AskUserQuestion, main.ts fires chat:ask-user with a unique requestId.
  // We store it here keyed by... actually we can't key by toolCallId because
  // the ask-user event doesn't include it. Instead, we store the LATEST
  // requestId and the card uses it directly. To handle multiple simultaneous
  // questions (rare), we use a queue.
  const [askUserRequestId, setAskUserRequestId] = useState<string | null>(null);
  // Phase 8.6: Todo list — shown inline in the chat area (not the right
  // sidebar). Collapsible. Only renders when there are todos.
  const [todoCount, setTodoCount] = useState(0);
  const [todoPanelExpanded, setTodoPanelExpanded] = useState(true);
  // Phase 10.7: The latest todos for the composer-connected todo list.
  const [composerTodos, setComposerTodos] = useState<any[]>([]);
  const [pendingPrompt, setPendingPrompt] = useState<string>('');
  // Phase 4: image attachments (base64 data URLs) + structured output panel
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [structurePanelOpen, setStructurePanelOpen] = useState(false);
  // Phase 4.2: thinking effort level
  const [thinkingEffort, setThinkingEffort] = useState<ThinkingEffort>('medium');
  const [modelSupportsReasoning, setModelSupportsReasoning] = useState(false);

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
    onAskUser: (req) => setAskUserRequestId(req.id),
    onContextCompacted: (data) => {
      // Phase 8.3: show a toast when auto-compaction runs.
      addToast({
        type: 'info',
        title: 'Context compacted',
        message: `${data.savedTokens.toLocaleString()} tokens saved via ${data.strategy || 'auto'} compaction`,
      });
    },
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
      setModelSupportsReasoning(false); // Reset until we load the new provider's models
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

  // Phase 4.2: check if the selected model supports reasoning (for the thinking effort selector)
  useEffect(() => {
    if (!selectedProviderId || !selectedModel || !api?.providers?.listModels) {
      setModelSupportsReasoning(false);
      return;
    }
    api.providers.listModels(selectedProviderId).then((models: any[]) => {
      const model = (models || []).find((m: any) => m.id === selectedModel);
      setModelSupportsReasoning(!!model?.supportsThinking);
    }).catch(() => setModelSupportsReasoning(false));
  }, [selectedProviderId, selectedModel, api]);

  // Auto-scroll — only when messages length or streaming content actually changes.
  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent, autoScroll]);

  // Phase 10.7: Subscribe to todos:updated events. Store the actual todos
  // for the composer-connected todo list (Codex Desktop style — the list
  // sits directly above the input area).
  useEffect(() => {
    const api = (window as any).openagent;
    if (!api?.on?.todosUpdated) return;

    // Initial load
    if (sessionId && api?.todos?.list) {
      api.todos.list(sessionId).then((todos: any[]) => {
        setTodoCount(todos?.length || 0);
        setComposerTodos(todos || []);
      }).catch(() => {});
    }

    const unsub = api.on.todosUpdated((data: { sessionId: string; todos: any[] }) => {
      if (data.sessionId !== sessionId) return;
      setTodoCount(data.todos.length);
      setComposerTodos(data.todos || []);
    });
    return () => unsub?.();
  }, [sessionId]);

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    setAutoScroll(atBottom);
  }, []);

  const handleSend = useCallback(
    async (content: string, files?: AttachedFile[]) => {
      // Phase 4: pass attached images to sendMessage for multi-modal support
      const images = attachedImages.length > 0 ? attachedImages : undefined;
      // Phase 4.2: pass thinking effort to sendMessage
      await sendMessage(content, files, images, thinkingEffort);
      clearFiles();
      setAttachedImages([]); // Clear images after send
    },
    [sendMessage, clearFiles, attachedImages, thinkingEffort],
  );

  // Phase 4: handle image attachment from the file picker
  const handleImagesAttached = useCallback((images: string[]) => {
    setAttachedImages(prev => [...prev, ...images]);
  }, []);

  // Phase 4: remove an attached image
  const handleRemoveImage = useCallback((index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  }, []);

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

  // Phase 8.5: AskUserQuestion response handler. Sends the user's selected
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
      {/* ─── Slim Header (Phase 2.2 — minimal, no mode switch) ──────────── */}
      <div
        className="flex items-center justify-between px-3 border-b flex-shrink-0"
        style={{
          borderColor: 'var(--color-border-secondary)',
          background: 'var(--color-bg-secondary)',
          height: 'var(--titlebar-height)',
        }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Session name (inline-editable) — moved to the leading edge
              now that the mode switch lives in the composer. */}
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
                  width: '220px',
                }}
                autoFocus
              />
            ) : (
              <button
                onClick={() => setIsEditingName(true)}
                className="text-sm font-medium truncate hover:opacity-80 transition-opacity max-w-[280px]"
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
          {/* Phase 4.6: Status pill — shows streaming state when active, Ready when idle */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium"
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
                  ? 'var(--color-trace-thinking)'
                  : 'var(--color-success)')
                : hasConnectedProvider ? 'var(--color-success)' : 'var(--color-error)',
            }}
            title={isStreaming
              ? (streamingThinking && !streamingContent ? 'AI is thinking…' : 'AI is generating…')
              : hasConnectedProvider ? 'At least one provider is configured' : 'No providers configured'}
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
                style={{ background: hasConnectedProvider ? 'var(--color-success)' : 'var(--color-error)' }}
              />
            )}
            <span>
              {isStreaming
                ? (streamingThinking && !streamingContent ? 'Thinking' : 'Generating')
                : hasConnectedProvider ? 'Ready' : 'Setup needed'}
            </span>
          </div>

          {/* Right panel toggle (Phase 3.1 — opens the tabbed Trace/Context/Notes panel) */}
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
            title="Open panel (Trace, Context, Notes)"
            aria-label="Open panel"
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
                askUserRequestId={askUserRequestId}
                onAskUserAnswer={(requestId, answer) => {
                  if (api?.permissions?.respondToQuestion) {
                    api.permissions.respondToQuestion(requestId, answer);
                  }
                  setAskUserRequestId(null);
                }}
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

      {/* ─── Phase 4.6: Claude-style streaming status bar ─────────────────── */}
      {isStreaming && (
        <div
          className="flex items-center gap-2 px-4 py-2 border-t text-xs"
          style={{
            background: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border-secondary)',
          }}
        >
          {streamingThinking && !streamingContent ? (
            // Thinking phase — animated dots + purple "Thinking" label
            <>
              <span className="thinking-dots">
                <span /><span /><span />
              </span>
              <span className="font-medium" style={{ color: 'var(--color-trace-thinking)' }}>
                Thinking
              </span>
              <span className="flex-1 truncate text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                {streamingThinking.slice(0, 120)}
                {streamingThinking.length > 120 ? '…' : ''}
              </span>
            </>
          ) : streamingContent ? (
            // Generating phase — green pulse + "Generating" label + text preview
            <>
              <span className="generating-pulse" />
              <span className="font-medium" style={{ color: 'var(--color-success)' }}>
                Generating
              </span>
              <span className="flex-1 truncate text-[11px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                {streamingContent.slice(-100)}
              </span>
            </>
          ) : (
            // Connecting phase — spinner + "Connecting" label
            <>
              <div
                className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin-slow"
                style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }}
              />
              <span style={{ color: 'var(--color-text-tertiary)' }}>Connecting…</span>
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

      {/* ─── Phase 10.9: Todo dropdown above composer (DaisyUI style, expands upward) ── */}
      {composerTodos.length > 0 && (
        <TodoWriteCard
          todos={composerTodos}
          isStreaming={isStreaming}
        />
      )}

      {/* ─── Composer (with inline agent + model selectors) ────────────── */}
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
        // Phase 2.2: pass agent (Build/Plan) state down — the selector now
        // lives in the composer's bottom-left row, next to the model selector.
        activeMode={activeMode}
        onModeChange={setActiveMode}
        // Pre-fill support: empty-state prompts flow into the textarea.
        pendingPrompt={pendingPrompt}
        onPendingPromptConsumed={handlePendingPromptConsumed}
        // Phase 4: image attachment callback
        onImagesAttached={handleImagesAttached}
        // Phase 4: /structure slash command opens the structured output panel
        onStructureCommand={() => setStructurePanelOpen(true)}
        // Phase 4.2: thinking effort
        thinkingEffort={thinkingEffort}
        onThinkingEffortChange={setThinkingEffort}
        modelSupportsReasoning={modelSupportsReasoning}
      />

      {/* ─── Phase 4: Image attachment preview ─────────────────────────── */}
      {attachedImages.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {attachedImages.map((img, idx) => (
            <div key={idx} className="relative group">
              <img
                src={img}
                alt={`Attachment ${idx + 1}`}
                className="w-16 h-16 rounded-lg object-cover border"
                style={{ borderColor: 'var(--color-border-primary)' }}
              />
              <button
                onClick={() => handleRemoveImage(idx)}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: 'var(--color-error)', color: 'white' }}
                aria-label="Remove image"
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ─── Permission Dialog ────────────────────────────────────────── */}
      <PermissionDialog request={permissionRequest} onRespond={handlePermissionRespond} />

      {/* ─── Phase 4: Structured Output Panel ──────────────────────────── */}
      <StructuredOutputPanel
        open={structurePanelOpen}
        onClose={() => setStructurePanelOpen(false)}
        model={selectedProviderId && selectedModel ? `${selectedProviderId}/${selectedModel}` : ''}
      />
    </div>
  );
};

export default ChatView;
