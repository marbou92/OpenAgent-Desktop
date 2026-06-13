/**
 * Enhanced Chat Area - OpenCowork Style
 *
 * Main chat area with integrated mode switch, execution context bar,
 * and trace panel toggle. Supports the 3-panel layout.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ChatMessage, ProviderInfo, SessionData, AppSettings, TraceEntry, Toast, AttachedFile } from '../../types';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import ModeSwitch, { AgentMode } from './ModeSwitch';
import ExecutionContextBar, { ExecutionContextBarProps } from '../Layout/ExecutionContextBar';

// ─── Types ────────────────────────────────────────────────────────────────────────

interface ChatAreaProps {
  /** Current session ID */
  sessionId: string | null;
  /** Current session data */
  session: SessionData | null;
  /** Available providers */
  providers: ProviderInfo[];
  /** Chat messages */
  messages: ChatMessage[];
  /** Whether streaming is active */
  isStreaming: boolean;
  /** Streaming content text */
  streamingContent?: string;
  /** Streaming thinking text */
  streamingThinking?: string;
  /** Messages update callback */
  onMessagesUpdate: (messages: ChatMessage[]) => void;
  /** Send message handler */
  onSendMessage: (content: string, files?: AttachedFile[]) => void;
  /** Stop streaming handler */
  onStopStreaming: () => void;
  /** New session handler */
  onNewSession: () => void;
  /** Load session handler */
  onLoadSession: (sessionId: string) => void;
  /** App settings */
  settings: AppSettings;
  /** Add toast notification */
  addToast: (toast: Omit<Toast, 'id'>) => void;
  /** Add trace entry */
  addTraceEntry: (entry: TraceEntry) => void;
  /** Whether the trace/right panel is open */
  tracePanelOpen?: boolean;
  /** Toggle trace panel */
  onToggleTracePanel?: () => void;
  /** Execution context data */
  executionContext?: Partial<ExecutionContextBarProps>;
  /** Attached files */
  attachedFiles?: AttachedFile[];
  /** Remove attached file */
  onRemoveFile?: (index: number) => void;
  /** Clear all attached files */
  onClearFiles?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────────

const ChatArea: React.FC<ChatAreaProps> = ({
  sessionId,
  session,
  providers,
  messages,
  isStreaming,
  streamingContent: _streamingContent,
  streamingThinking,
  onMessagesUpdate: _onMessagesUpdate,
  onSendMessage,
  onStopStreaming,
  onNewSession,
  onLoadSession: _onLoadSession,
  settings,
  addToast: _addToast,
  addTraceEntry: _addTraceEntry,
  tracePanelOpen = false,
  onToggleTracePanel,
  executionContext,
  attachedFiles = [],
  onRemoveFile,
  onClearFiles,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [activeMode, setActiveMode] = useState<AgentMode>('build');
  const [sessionName, setSessionName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [selectedModel, setSelectedModel] = useState('');

  // ── Sync selected provider/model ─────────────────────────────────────────

  useEffect(() => {
    if (session) {
      setSelectedProviderId(session.providerId);
      setSelectedModel(session.model);
      setSessionName(session.name);
    } else {
      const defaultProvider = providers.find((p) => p.isDefault && p.configured);
      setSelectedProviderId(defaultProvider?.id || settings.defaultProviderId);
      setSelectedModel(settings.defaultModel);
      setSessionName('');
    }
  }, [session, providers, settings]);

  // ── Auto-scroll ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  // ── Detect scroll position ───────────────────────────────────────────────

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const atBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    setAutoScroll(atBottom);
  }, []);

  // ── Connection status ────────────────────────────────────────────────────

  const hasConnectedProvider = providers.some((p) => p.configured);
  const activeProvider = providers.find((p) => p.id === selectedProviderId);

  // ── Session name edit ────────────────────────────────────────────────────

  const handleNameSubmit = useCallback(() => {
    setIsEditingName(false);
    // In real app, would call API to rename session
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)' }}>
      {/* Top Bar */}
      <div
        className="flex items-center justify-between px-4 border-b"
        style={{
          borderColor: 'var(--color-border-secondary)',
          background: 'var(--color-bg-secondary)',
          height: 'var(--titlebar-height)',
        }}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Mode switch */}
          <ModeSwitch
            activeMode={activeMode}
            onModeChange={setActiveMode}
          />

          {/* Session name */}
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
                  width: '150px',
                }}
                autoFocus
              />
            ) : (
              <button
                onClick={() => setIsEditingName(true)}
                className="text-sm font-medium truncate hover:opacity-80 transition-opacity max-w-[200px]"
                style={{ color: 'var(--color-text-primary)' }}
                title="Click to edit session name"
              >
                {sessionName || 'New Chat'}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Provider/Model selector */}
          <div className="flex items-center gap-1.5">
            <select
              value={selectedProviderId}
              onChange={(e) => setSelectedProviderId(e.target.value)}
              className="text-xs px-2 py-1 rounded-md border outline-none cursor-pointer"
              style={{
                background: 'var(--color-bg-tertiary)',
                borderColor: 'var(--color-border-primary)',
                color: 'var(--color-text-primary)',
              }}
            >
              <option value="">Provider</option>
              {providers
                .filter((p) => p.configured)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>

            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="text-xs px-2 py-1 rounded-md border outline-none cursor-pointer max-w-[160px]"
              style={{
                background: 'var(--color-bg-tertiary)',
                borderColor: 'var(--color-border-primary)',
                color: 'var(--color-text-primary)',
              }}
            >
              <option value="">Model</option>
              {activeProvider?.models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>

          {/* Connection status */}
          <div className="flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: hasConnectedProvider ? 'var(--color-success)' : 'var(--color-error)' }}
            />
            <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {hasConnectedProvider ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          {/* New Chat button */}
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
          </button>
        </div>
      </div>

      {/* Execution Context Bar */}
      {executionContext && (
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
          providerName={executionContext.providerName ?? activeProvider?.name}
          modelName={executionContext.modelName ?? selectedModel}
          onPause={executionContext.onPause}
          onResume={executionContext.onResume}
          onStop={executionContext.onStop}
          onCompact={executionContext.onCompact}
        />
      )}

      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        {messages.length === 0 ? (
          <EmptyState onNewSession={onNewSession} />
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-4">
            {messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                isLast={index === messages.length - 1}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Auto-scroll indicator */}
      {!autoScroll && messages.length > 0 && (
        <div className="flex justify-center pb-1">
          <button
            onClick={() => {
              setAutoScroll(true);
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors shadow-lg"
            style={{
              background: 'var(--color-bg-elevated)',
              color: 'var(--color-accent)',
              border: '1px solid var(--color-border-primary)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            Scroll to bottom
          </button>
        </div>
      )}

      {/* Chat Input */}
      <ChatInput
        onSend={onSendMessage}
        onStop={onStopStreaming}
        isStreaming={isStreaming}
        attachedFiles={attachedFiles}
        onRemoveFile={onRemoveFile ?? (() => {})}
        onClearFiles={onClearFiles ?? (() => {})}
        disabled={!sessionId}
        streamingThinking={streamingThinking}
        onNewSession={onNewSession}
      />
    </div>
  );
};

// ─── Empty State ───────────────────────────────────────────────────────────────────

const EmptyState: React.FC<{ onNewSession: () => void }> = ({ onNewSession }) => (
  <div className="flex flex-col items-center justify-center h-full px-4">
    <div
      className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
      style={{ background: 'var(--color-accent-soft)' }}
    >
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </div>
    <h2
      className="text-lg font-semibold mb-1"
      style={{ color: 'var(--color-text-primary)' }}
    >
      Welcome to OpenAgent
    </h2>
    <p
      className="text-sm text-center max-w-sm mb-6"
      style={{ color: 'var(--color-text-tertiary)' }}
    >
      Start a conversation with your AI agent. Choose a mode, select a provider, and type your message below.
    </p>
    <div className="flex gap-2">
      <button
        onClick={onNewSession}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        style={{
          background: 'var(--color-accent)',
          color: 'white',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        New Chat
      </button>
    </div>

    {/* Quick actions */}
    <div className="flex flex-wrap gap-2 mt-6 justify-center max-w-md">
      {['Explain this code', 'Write a test', 'Debug an error', 'Refactor function'].map(
        (prompt) => (
          <button
            key={prompt}
            className="px-3 py-1.5 rounded-lg text-xs border transition-colors"
            style={{
              background: 'transparent',
              borderColor: 'var(--color-border-primary)',
              color: 'var(--color-text-secondary)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-accent)';
              e.currentTarget.style.color = 'var(--color-accent)';
              e.currentTarget.style.background = 'var(--color-accent-soft)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border-primary)';
              e.currentTarget.style.color = 'var(--color-text-secondary)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            {prompt}
          </button>
        ),
      )}
    </div>
  </div>
);

export default ChatArea;
