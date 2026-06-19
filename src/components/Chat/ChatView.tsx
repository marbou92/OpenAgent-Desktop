/**
 * OpenAgent-Desktop - Unified Chat View Component
 *
 * Merged from ChatView + ChatArea. Main chat view with:
 * - Mode switch (Build/Plan/Chat/Smart)
 * - Execution context bar
 * - Provider/model selector dropdown
 * - Message list with auto-scroll
 * - Permission request handling
 * - Streaming display, tool calls, and empty state
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ChatMessage, ProviderInfo, SessionData, AppSettings, TraceEntry, Toast, PermissionRequest, AgentMode, AttachedFile } from '../../types';
import { useChat } from '../../hooks/useChat';
import { useFileDrop } from '../../hooks/useFileDrop';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import ModeSwitch from './ModeSwitch';
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
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; displayName: string }>>([]);
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);

  const { messages, isStreaming, error, streamingContent, streamingThinking, activeToolCalls, sendMessage, stopStreaming, retryLastMessage } =
    useChat({
      sessionId,
      providers,
      permissionMode: settings.permissionMode ?? 'smart_approve',
      onMessagesUpdate,
      onTraceEntry: addTraceEntry,
      onPermissionRequest: (req) => setPermissionRequest(req),
      // BUGFIX: pass messages through so loading a saved session shows them.
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

  // Load models when provider changes
  useEffect(() => {
    if (!selectedProviderId || !api?.providers?.listModels) {
      setAvailableModels([]);
      return;
    }
    api.providers.listModels(selectedProviderId).then((models: any[]) => {
      setAvailableModels((models || []).map((m: any) => ({ id: m.id, displayName: m.displayName || m.id })));
    }).catch(() => setAvailableModels([]));
  }, [selectedProviderId]);

  // Save provider+model to session when changed
  const handleProviderChange = useCallback((providerId: string) => {
    setSelectedProviderId(providerId);
    setSelectedModel('');
    if (sessionId && api?.sessions?.update) {
      api.sessions.update(sessionId, { providerId, model: '' });
    }
  }, [sessionId, api]);

  const handleModelChange = useCallback((model: string) => {
    setSelectedModel(model);
    if (sessionId && api?.sessions?.update) {
      api.sessions.update(sessionId, { model });
    }
  }, [sessionId, api]);

  // Auto-scroll
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

  const handleSend = useCallback(async (content: string, files?: AttachedFile[]) => {
    await sendMessage(content, files);
    clearFiles();
  }, [sendMessage, clearFiles]);

  const handlePermissionRespond = useCallback((response: 'allow_once' | 'always_allow' | 'deny_once' | 'always_deny') => {
    if (permissionRequest) {
      if (api?.permissions?.respond) {
        api.permissions.respond(permissionRequest.id, response);
      }
      setPermissionRequest(null);
    }
  }, [permissionRequest]);

  const handleNameSubmit = useCallback(() => {
    setIsEditingName(false);
  }, []);

  const handleCopyMessage = useCallback((content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      addToast({ type: 'success', title: 'Copied to clipboard' });
    });
  }, [addToast]);

  const hasConnectedProvider = providers.length > 0 && providers.some((p) => p.configured);
  const canSend = selectedProviderId && selectedModel;

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
          <ModeSwitch activeMode={activeMode} onModeChange={setActiveMode} />
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
                style={{ color: 'var(--color-text-primary)', borderColor: 'var(--color-accent)', width: '150px' }}
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
          <div className="flex items-center gap-1.5">
            <select
              value={selectedProviderId}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="text-xs px-2 py-1 rounded-md border outline-none cursor-pointer"
              style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
            >
              <option value="">Provider</option>
              {providers.filter((p) => p.configured).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select
              value={selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className="text-xs px-2 py-1 rounded-md border outline-none cursor-pointer max-w-[160px]"
              style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
              disabled={!selectedProviderId}
            >
              <option value="">Model</option>
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>{m.displayName}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: hasConnectedProvider ? 'var(--color-success)' : 'var(--color-error)' }} />
            <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {hasConnectedProvider ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          <button
            onClick={onNewSession}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-hover)'; e.currentTarget.style.color = 'var(--color-accent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
            title="New chat" aria-label="New chat"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          <button
            onClick={onToggleTracePanel}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: tracePanelOpen ? 'var(--color-accent)' : 'var(--color-text-tertiary)', background: tracePanelOpen ? 'var(--color-accent-soft)' : 'transparent' }}
            onMouseEnter={(e) => { if (!tracePanelOpen) { e.currentTarget.style.background = 'var(--color-bg-hover)'; e.currentTarget.style.color = 'var(--color-text-primary)'; }}}
            onMouseLeave={(e) => { if (!tracePanelOpen) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}}
            title="Toggle trace panel" aria-label="Toggle trace panel"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="15" y1="3" x2="15" y2="21" />
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
          providerName={executionContext.providerName ?? selectedProviderId}
          modelName={executionContext.modelName ?? selectedModel}
          onPause={executionContext.onPause}
          onResume={executionContext.onResume}
          onStop={executionContext.onStop}
          onCompact={executionContext.onCompact}
        />
      )}

      {/* Messages Area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto" onScroll={handleScroll}>
        {messages.length === 0 ? (
          <EmptyState onNewSession={onNewSession} />
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
            {messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                isLast={index === messages.length - 1}
                onRetry={message.role === 'assistant' && (message.error || index === messages.length - 1) ? retryLastMessage : undefined}
                onCopy={handleCopyMessage}
              />
            ))}

            {/* Active Tool Calls */}
            {activeToolCalls.length > 0 && (
              <div className="space-y-2">
                {activeToolCalls.map((tc) => (
                  <div
                    key={tc.id}
                    className="rounded-lg p-3 border"
                    style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}
                  >
                    <div className="flex items-center gap-2">
                      {tc.status === 'pending' ? (
                        <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin-slow" style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                      <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        {tc.name}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                        {tc.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Thinking indicator overlay */}
      {isStreaming && streamingThinking && (
        <div
          className="px-4 py-2 flex items-center gap-3 border-t animate-fade-in"
          style={{ background: 'rgba(168,85,247,0.05)', borderColor: 'rgba(168,85,247,0.2)' }}
        >
          <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin-slow" style={{ borderColor: 'var(--color-trace-thinking)', borderTopColor: 'transparent' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--color-trace-thinking)' }}>Thinking...</span>
          <span className="text-xs flex-1 truncate" style={{ color: 'var(--color-text-tertiary)' }}>
            {streamingThinking.slice(0, 120)}{streamingThinking.length > 120 ? '...' : ''}
          </span>
        </div>
      )}

      {/* Auto-scroll indicator */}
      {!autoScroll && messages.length > 0 && (
        <div className="flex justify-center pb-1">
          <button
            onClick={() => { setAutoScroll(true); messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors shadow-lg"
            style={{ background: 'var(--color-bg-elevated)', color: 'var(--color-accent)', border: '1px solid var(--color-border-primary)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            Scroll to bottom
          </button>
        </div>
      )}

      {/* Error Bar */}
      {error && (
        <div
          className="px-4 py-2 flex items-center gap-2 border-t text-sm"
          style={{
            background: 'rgba(239,68,68,0.08)',
            borderColor: 'var(--color-error)',
            color: 'var(--color-error)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <span>{error}</span>
          <button
            onClick={retryLastMessage}
            className="ml-auto text-xs font-medium underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* File Error */}
      {fileError && (
        <div
          className="px-4 py-2 flex items-center gap-2 border-t text-sm"
          style={{
            background: 'rgba(245,158,11,0.08)',
            borderColor: 'var(--color-warning)',
            color: 'var(--color-warning)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>{fileError}</span>
        </div>
      )}

      {/* Chat Input */}
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
      />

      {/* Permission Dialog */}
      <PermissionDialog request={permissionRequest} onRespond={handlePermissionRespond} />
    </div>
  );
};

// Empty State component
const EmptyState: React.FC<{ onNewSession: () => void }> = ({ onNewSession }) => (
  <div className="flex flex-col items-center justify-center h-full px-4">
    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--color-accent-soft)' }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </div>
    <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>Welcome to OpenAgent</h2>
    <p className="text-sm text-center max-w-sm mb-6" style={{ color: 'var(--color-text-tertiary)' }}>
      Start a conversation with your AI agent. Choose a mode, select a provider, and type your message below.
    </p>
    <div className="flex gap-2">
      <button
        onClick={onNewSession}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        style={{ background: 'var(--color-accent)', color: 'white' }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        New Chat
      </button>
    </div>
    <div className="flex flex-wrap gap-2 mt-6 justify-center max-w-md">
      {['Explain this code', 'Write a test', 'Debug an error', 'Refactor function'].map((prompt) => (
        <button
          key={prompt}
          className="px-3 py-1.5 rounded-lg text-xs border transition-colors"
          style={{ background: 'transparent', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-secondary)' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; e.currentTarget.style.color = 'var(--color-accent)'; e.currentTarget.style.background = 'var(--color-accent-soft)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-primary)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
        >
          {prompt}
        </button>
      ))}
    </div>
  </div>
);

export default ChatView;
