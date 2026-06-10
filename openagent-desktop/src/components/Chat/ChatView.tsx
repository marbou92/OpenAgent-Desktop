/**
 * OpenAgent Desktop - Chat View Component
 *
 * Main chat view with message list, auto-scroll, thinking trace toggle,
 * streaming display, tool calls, permission requests, and empty state.
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

  // Empty state - no session
  if (!sessionId) {
    return <WelcomeScreen onNewSession={onNewSession} />;
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)' }}>
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
              onRetry={message.role === 'assistant' && message.error ? retryLastMessage : undefined}
            />
          ))}

          {/* Active Permission Requests */}
          {permissionQueue.map((request) => (
            <div
              key={request.id}
              className="permission-request"
            >
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
                      onClick={() => handlePermissionApprove(request.id)}
                      className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                      style={{ background: 'var(--color-success)', color: 'white' }}
                    >
                      Allow
                    </button>
                    <button
                      onClick={() => handlePermissionDeny(request.id)}
                      className="px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors"
                      style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}
                    >
                      Deny
                    </button>
                  </div>
                </div>
              </div>
            </div>
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
      />
    </div>
  );
};

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
      Welcome to OpenAgent Desktop
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
