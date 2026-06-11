/**
 * OpenAgent-Desktop - Chat View Component
 *
 * Main chat view with:
 * - Provider/model selector dropdown at the top
 * - Message list with auto-scroll
 * - Permission request handling (approve/deny buttons)
 * - "Thinking" indicator with expandable trace
 * - Message retry button
 * - Copy code block button
 * - "New Session" button
 * - Streaming display, tool calls, and empty state
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ChatMessage, ProviderInfo, SessionData, AppSettings, TraceEntry, Toast } from '../../types';
import { useChat } from '../../hooks/useChat';
import { useFileDrop } from '../../hooks/useFileDrop';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';

const api = (window as any).openagent;

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
}

const ChatView: React.FC<ChatViewProps> = ({
  sessionId,
  session,
  providers,
  messages: externalMessages,
  isStreaming: externalIsStreaming,
  onMessagesUpdate,
  onNewSession,
  onLoadSession,
  settings,
  addToast,
  addTraceEntry,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTrace, setShowTrace] = useState(false);
  const [permissionQueue, setPermissionQueue] = useState<any[]>([]);

  // Provider/Model selector state
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const activeProvider = providers.find((p) => p.id === selectedProviderId) || providers.find((p) => p.isDefault) || providers[0];
  const activeModel = selectedModel || activeProvider?.models?.[0] || settings.defaultModel;

  const {
    messages,
    isStreaming,
    error,
    streamingThinking,
    activeToolCalls,
    sendMessage,
    stopStreaming,
    clearMessages,
    retryLastMessage,
  } = useChat({
    sessionId,
    providers,
    permissionMode: settings.permissionMode,
    onMessagesUpdate,
    onTraceEntry: addTraceEntry,
    onPermissionRequest: (request) => {
      setPermissionQueue((prev) => [...prev, request]);
    },
  });

  // File drop support
  const { droppedFiles, removeFile, clearFiles, addFiles, fileError } = useFileDrop({
    onFilesDropped: (files) => {
      addToast({ type: 'info', title: `${files.length} file(s) attached` });
    },
    maxFileSize: 50 * 1024 * 1024,
    maxFiles: 10,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  // Detect if user has scrolled up
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setAutoScroll(isNearBottom);
  }, []);

  // Close provider dropdown on outside click
  useEffect(() => {
    if (!showProviderDropdown) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.provider-dropdown-container')) {
        setShowProviderDropdown(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showProviderDropdown]);

  // Handle send
  const handleSend = useCallback(async (content: string, files?: any[]) => {
    await sendMessage(content, files);
    clearFiles();
  }, [sendMessage, clearFiles]);

  // Handle permission approve/deny
  const handlePermissionApprove = useCallback((requestId: string) => {
    const request = permissionQueue.find((r) => r.id === requestId);
    if (request) {
      request.onApprove();
      setPermissionQueue((prev) => prev.filter((r) => r.id !== requestId));
    }
  }, [permissionQueue]);

  const handlePermissionDeny = useCallback((requestId: string) => {
    const request = permissionQueue.find((r) => r.id === requestId);
    if (request) {
      request.onDeny();
      setPermissionQueue((prev) => prev.filter((r) => r.id !== requestId));
    }
  }, [permissionQueue]);

  // Handle copy message
  const handleCopyMessage = useCallback((content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      addToast({ type: 'success', title: 'Copied to clipboard' });
    });
  }, [addToast]);

  // Empty state - no session
  if (!sessionId) {
    return <WelcomeScreen onNewSession={onNewSession} />;
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)' }}>
      {/* Chat Header Bar - Provider/Model Selector + New Session */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-secondary)' }}
      >
        {/* Provider / Model Selector */}
        <div className="relative provider-dropdown-container">
          <button
            onClick={() => setShowProviderDropdown(!showProviderDropdown)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors"
            style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
          >
            <div
              className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold"
              style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
            >
              {activeProvider?.type?.slice(0, 2).toUpperCase() || 'AI'}
            </div>
            <span className="font-medium">{activeProvider?.name || 'No Provider'}</span>
            <span style={{ color: 'var(--color-text-muted)' }}>·</span>
            <span className="font-mono text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {activeModel}
            </span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-text-muted)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transform: showProviderDropdown ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.15s ease' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {/* Dropdown */}
          {showProviderDropdown && (
            <div
              className="absolute top-full left-0 mt-1 w-72 rounded-xl border shadow-xl z-20 animate-fade-in overflow-hidden"
              style={{ background: 'var(--color-bg-elevated)', borderColor: 'var(--color-border-primary)' }}
            >
              <div className="p-2 border-b" style={{ borderColor: 'var(--color-border-secondary)' }}>
                <span className="text-xs font-semibold px-2" style={{ color: 'var(--color-text-muted)' }}>
                  SELECT PROVIDER & MODEL
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {providers.length === 0 ? (
                  <div className="p-4 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    No providers configured. Add one in Settings.
                  </div>
                ) : (
                  providers.map((provider) => (
                    <div key={provider.id}>
                      <div
                        className="px-3 py-2 flex items-center gap-2 cursor-pointer transition-colors"
                        style={{ background: selectedProviderId === provider.id ? 'var(--color-accent-soft)' : 'transparent' }}
                        onClick={() => {
                          setSelectedProviderId(provider.id);
                          if (provider.models.length > 0) {
                            setSelectedModel(provider.models[0]);
                          }
                        }}
                        onMouseEnter={(e) => {
                          if (selectedProviderId !== provider.id) e.currentTarget.style.background = 'var(--color-bg-hover)';
                        }}
                        onMouseLeave={(e) => {
                          if (selectedProviderId !== provider.id) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <div
                          className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
                        >
                          {provider.type.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{provider.name}</div>
                          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{provider.type}</div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {provider.isDefault && (
                            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>Default</span>
                          )}
                          <span className="w-2 h-2 rounded-full" style={{ background: provider.configured ? 'var(--color-success)' : 'var(--color-error)' }} />
                        </div>
                      </div>
                      {selectedProviderId === provider.id && provider.models.length > 0 && (
                        <div className="pl-10 pr-3 pb-2 space-y-0.5">
                          {provider.models.map((model) => (
                            <button
                              key={model}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedModel(model);
                                setShowProviderDropdown(false);
                                addToast({ type: 'info', title: `Switched to ${model}` });
                              }}
                              className="w-full text-left px-2 py-1 rounded text-xs font-mono transition-colors"
                              style={{
                                background: selectedModel === model ? 'var(--color-accent-soft)' : 'transparent',
                                color: selectedModel === model ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                              }}
                            >
                              {model}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-2">
          {/* Thinking trace toggle */}
          <button
            onClick={() => setShowTrace(!showTrace)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: showTrace ? 'var(--color-trace-thinking)' : 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => !showTrace && (e.currentTarget.style.background = 'var(--color-bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            title="Toggle thinking trace"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>

          {/* New Session button */}
          <button
            onClick={onNewSession}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
            style={{ borderColor: 'var(--color-border-primary)', color: 'var(--color-text-secondary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-accent)';
              e.currentTarget.style.color = 'var(--color-accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border-primary)';
              e.currentTarget.style.color = 'var(--color-text-secondary)';
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Session
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {/* Empty messages state */}
        {messages.length === 0 && (
          <EmptyChatState onNewSession={onNewSession} />
        )}

        {/* Message List */}
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {messages.map((message, index) => (
            <MessageBubble
              key={message.id}
              message={message}
              isLast={index === messages.length - 1}
              onRetry={message.role === 'assistant' && (message.error || index === messages.length - 1) ? retryLastMessage : undefined}
              onCopy={handleCopyMessage}
            />
          ))}

          {/* Active Permission Requests */}
          {permissionQueue.map((request) => (
            <PermissionRequestCard
              key={request.id}
              request={request}
              onApprove={handlePermissionApprove}
              onDeny={handlePermissionDeny}
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
          <button
            onClick={() => setShowTrace(!showTrace)}
            className="text-xs px-2 py-0.5 rounded transition-colors"
            style={{ color: 'var(--color-accent)', background: 'var(--color-accent-soft)' }}
          >
            {showTrace ? 'Hide' : 'Show'} Trace
          </button>
        </div>
      )}

      {/* Scroll to bottom button */}
      {!autoScroll && (
        <button
          onClick={() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            setAutoScroll(true);
          }}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 p-2 rounded-full shadow-lg border transition-colors animate-fade-in"
          style={{
            background: 'var(--color-bg-elevated)',
            borderColor: 'var(--color-border-primary)',
            color: 'var(--color-text-secondary)',
          }}
          aria-label="Scroll to bottom"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
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
    </div>
  );
};

// ─── Permission Request Card ───────────────────────────────────────────────────

const PermissionRequestCard: React.FC<{
  request: any;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
}> = ({ request, onApprove, onDeny }) => (
  <div className="permission-request">
    <div className="flex items-start gap-3">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(245,158,11,0.15)' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium" style={{ color: 'var(--color-warning)' }}>
          Permission Request
        </p>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          The agent wants to run <strong style={{ color: 'var(--color-text-primary)' }}>{request.toolName}</strong>
          {request.reason && (
            <span style={{ color: 'var(--color-text-tertiary)' }}> — {request.reason}</span>
          )}
        </p>
        {request.toolArguments && Object.keys(request.toolArguments).length > 0 && (
          <pre
            className="mt-2 p-2 rounded text-xs overflow-auto max-h-32"
            style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-tertiary)' }}
          >
            {JSON.stringify(request.toolArguments, null, 2)}
          </pre>
        )}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => onApprove(request.id)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
            style={{ background: 'var(--color-success)', color: 'white' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Allow
          </button>
          <button
            onClick={() => onDeny(request.id)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1.5"
            style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Deny
          </button>
        </div>
      </div>
    </div>
  </div>
);

// ─── Welcome Screen ────────────────────────────────────────────────────────────

const WelcomeScreen: React.FC<{ onNewSession: () => void }> = ({ onNewSession }) => (
  <div className="flex flex-col items-center justify-center h-full px-8">
    <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 shadow-lg" style={{ background: 'linear-gradient(135deg, var(--color-accent), #6d28d9)', boxShadow: '0 8px 32px rgba(139,92,246,0.25)' }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    </div>
    <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
      Welcome to OpenAgent-Desktop
    </h1>
    <p className="text-center max-w-md mb-8" style={{ color: 'var(--color-text-tertiary)' }}>
      Your personal AI assistant with sandboxed execution, extensions, and recipe automation.
    </p>
    <button
      onClick={onNewSession}
      className="px-6 py-3 rounded-xl font-medium transition-all hover:shadow-lg active:scale-95"
      style={{ background: 'var(--color-accent)', color: 'white', boxShadow: '0 4px 16px rgba(139,92,246,0.3)' }}
    >
      Start a New Chat
    </button>
    <div className="mt-12 grid grid-cols-3 gap-6 max-w-2xl">
      {[
        { icon: '📄', title: 'File Analysis', desc: 'Drop any file and get instant insights' },
        { icon: '📊', title: 'Generate Documents', desc: 'Create PPTs, Word docs, Excel sheets' },
        { icon: '🖥️', title: 'Desktop Control', desc: 'Control GUI apps safely in a sandbox' },
      ].map((feature, i) => (
        <div
          key={i}
          className="text-center p-4 rounded-xl border"
          style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}
        >
          <div className="text-2xl mb-2">{feature.icon}</div>
          <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{feature.title}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>{feature.desc}</div>
        </div>
      ))}
    </div>
  </div>
);

// ─── Empty Chat State ──────────────────────────────────────────────────────────

const EmptyChatState: React.FC<{ onNewSession: () => void }> = ({ onNewSession }) => (
  <div className="flex flex-col items-center justify-center py-20">
    <div
      className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
      style={{ background: 'var(--color-accent-soft)' }}
    >
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </div>
    <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
      Start a conversation
    </h2>
    <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
      Type a message below or drag files to attach them
    </p>
    <div className="mt-6 flex flex-wrap gap-2 justify-center">
      {[
        'Explain this code',
        'Write a test',
        'Refactor my function',
        'Review for security',
      ].map((suggestion) => (
        <button
          key={suggestion}
          className="px-3 py-1.5 rounded-lg text-xs border transition-colors"
          style={{ borderColor: 'var(--color-border-primary)', color: 'var(--color-text-secondary)' }}
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
          {suggestion}
        </button>
      ))}
    </div>
  </div>
);

export default ChatView;
