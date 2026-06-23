/**
 * OpenAgent-Desktop - useChat Hook
 *
 * Manages chat interactions with streaming support, tool call handling,
 * permission mode management, and auto-save.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ChatMessage,
  AttachedFile,
  ProviderInfo,
  ToolCall,
  TraceEntry,
  PermissionRequest,
} from '../types';
import { getAPI } from '../utils/api';

const api = getAPI();

interface UseChatOptions {
  sessionId: string | null;
  providers: ProviderInfo[];
  permissionMode: 'auto' | 'approve' | 'smart_approve' | 'chat';
  onMessagesUpdate?: (messages: ChatMessage[]) => void;
  onTraceEntry?: (entry: TraceEntry) => void;
  onPermissionRequest?: (request: PermissionRequest) => void;
  /** Phase 8.3: fired when auto-compaction runs after a chat turn. */
  onContextCompacted?: (data: { savedTokens: number; strategy?: string }) => void;
  // BUGFIX: previously useChat ignored external messages, so loading a saved
  // session showed an empty chat. Now we accept an externalMessages array and
  // sync it into local state whenever it changes (typically when App.tsx loads
  // a session from disk).
  externalMessages?: ChatMessage[];
}

interface UseChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  streamingContent: string;
  streamingThinking: string;
  activeToolCalls: ToolCall[];
  sendMessage: (content: string, files?: AttachedFile[], images?: string[], thinkingEffort?: string) => Promise<void>;
  stopStreaming: () => Promise<void>;
  clearMessages: () => void;
  retryLastMessage: () => Promise<void>;
  loadSession: (messages: ChatMessage[]) => void;
}

export function useChat(options: UseChatOptions): UseChatReturn {
  const {
    sessionId,
    providers,
    permissionMode,
    onMessagesUpdate,
    onTraceEntry,
    onPermissionRequest,
    onContextCompacted,
    externalMessages,
  } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingThinking, setStreamingThinking] = useState('');
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCall[]>([]);

  const unsubscribeRef = useRef<(() => void)[]>([]);
  const streamingContentRef = useRef<string>('');
  const streamingThinkingRef = useRef<string>('');
  const lastUserMessageRef = useRef<string>('');
  const lastFilesRef = useRef<AttachedFile[]>([]);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const isStreamingRef = useRef(false);

  // Keep messagesRef in sync
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // BUGFIX: previously useChat never picked up messages loaded by App.tsx —
  // calling handleLoadSession set the Zustand store but useChat still showed
  // an empty list. Now we sync externalMessages into local state when the
  // array reference changes (App sets it on session load).
  //
  // Phase 6.4: Fix React error #185 (infinite loop). The problem was:
  //   useChat updates messages → onMessagesUpdate(setMessages in App)
  //   → App passes new externalMessages → useEffect fires → setMessages again
  //   → infinite loop.
  // Fix: Only sync from externalMessages when we're NOT currently streaming
  // AND the external messages are different from what we already have.
  const lastExternalSyncRef = useRef<ChatMessage[] | null>(null);
  // Phase 6.5: Skip notifying parent when we just synced FROM externalMessages
  const skipNextNotifyRef = useRef(false);
  const lastSessionIdRef = useRef<string | null>(sessionId);
  useEffect(() => {
    // Don't sync from external while streaming — local state is the source of truth
    if (isStreamingRef.current) return;

    // Phase 6.8: If the session ID changed, ALWAYS clear and sync — this
    // handles the "new chat" case where App sets messages to [] but useChat
    // still has the old session's messages in local state.
    const sessionChanged = lastSessionIdRef.current !== sessionId;
    lastSessionIdRef.current = sessionId;

    if (externalMessages && externalMessages.length > 0) {
      // Skip if we already synced this exact array (prevents loop)
      if (!sessionChanged && lastExternalSyncRef.current === externalMessages) return;
      lastExternalSyncRef.current = externalMessages;

      // Mark any streaming messages as finalized since we are loading from disk.
      const sanitized = externalMessages.map(m => ({ ...m, isStreaming: false }));
      // Phase 6.5: Skip the next onMessagesUpdate since we're syncing FROM external
      skipNextNotifyRef.current = true;
      setMessages(sanitized);
      streamingContentRef.current = '';
      streamingThinkingRef.current = '';
      setActiveToolCalls([]);
      setIsStreaming(false);
      isStreamingRef.current = false;
    } else if (externalMessages && externalMessages.length === 0) {
      // Phase 6.8: Clear messages whenever external is empty — not just when
      // sessionId is null. This fixes "new chat shows old messages" because
      // App sets messages to [] on new session, but useChat kept old ones.
      // Only skip if we're already empty and session didn't change.
      if (messagesRef.current.length === 0 && !sessionChanged) return;
      skipNextNotifyRef.current = true;
      setMessages([]);
      lastExternalSyncRef.current = null;
      streamingContentRef.current = '';
      streamingThinkingRef.current = '';
      setActiveToolCalls([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalMessages, sessionId]);

  // Stable callbacks: wrap onTraceEntry / onPermissionRequest in refs so that
  // the streaming subscription effect does not re-subscribe on every render
  // of the parent component. Previously, inline arrows in ChatView caused the
  // subscription to be torn down and re-created on every streaming token,
  // risking dropped events.
  const onTraceEntryRef = useRef(onTraceEntry);
  const onPermissionRequestRef = useRef(onPermissionRequest);
  const onContextCompactedRef = useRef(onContextCompacted);
  useEffect(() => {
    onTraceEntryRef.current = onTraceEntry;
  }, [onTraceEntry]);
  useEffect(() => {
    onPermissionRequestRef.current = onPermissionRequest;
  }, [onPermissionRequest]);
  useEffect(() => {
    onContextCompactedRef.current = onContextCompacted;
  }, [onContextCompacted]);
  // Cleanup listeners on unmount or session change
  useEffect(() => {
    return () => {
      unsubscribeRef.current.forEach(fn => fn());
      unsubscribeRef.current = [];
    };
  }, [sessionId]);

  // Subscribe to stream events when session changes
  useEffect(() => {
    if (!api) return;

    const unsubChunk = api.on.chatStreamChunk((data: { sessionId: string; chunk: string }) => {
      if (data.sessionId !== sessionId) return;
      streamingContentRef.current += data.chunk;
      setStreamingContent(streamingContentRef.current);

      // Update the streaming assistant message
      setMessages(prev => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
          updated[updated.length - 1] = {
            ...lastMsg,
            content: streamingContentRef.current,
          };
        }
        return updated;
      });
    });

    const unsubThinking = api.on.chatStreamThinking((data: { sessionId: string; thinking: string }) => {
      if (data.sessionId !== sessionId) return;
      streamingThinkingRef.current = data.thinking;
      setStreamingThinking(data.thinking);

      // Update the streaming assistant message thinking
      setMessages(prev => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
          updated[updated.length - 1] = {
            ...lastMsg,
            thinking: data.thinking,
          };
        }
        return updated;
      });
    });

    const unsubToolCall = api.on.chatStreamToolCall((data: { sessionId: string; toolCall: Record<string, unknown> }) => {
      if (data.sessionId !== sessionId) return;
      const incomingToolCall = data.toolCall;
      const newToolCall: ToolCall = {
        id: (incomingToolCall.id as string) || crypto.randomUUID(),
        name: (incomingToolCall.name as string) || 'unknown',
        arguments: (incomingToolCall.arguments as Record<string, unknown>) || {},
        status: 'pending',
      };

      setActiveToolCalls(prev => [...prev, newToolCall]);

      // If permission mode requires approval, emit a permission request
      if (permissionMode === 'approve' || permissionMode === 'smart_approve') {
        onPermissionRequestRef.current?.({
          id: newToolCall.id,
          toolName: newToolCall.name,
          args: newToolCall.arguments,
        });
      }
    });

    const unsubToolResult = api.on.chatStreamToolResult((data: { sessionId: string; toolResult: Record<string, unknown> }) => {
      if (data.sessionId !== sessionId) return;

      // Update the tool call with result
      setActiveToolCalls(prev =>
        prev.map(tc => {
          if (tc.id === (data.toolResult as any).id) {
            return {
              ...tc,
              result: (data.toolResult as any).result,
              status: 'completed' as const,
            };
          }
          return tc;
        })
      );
    });

    const unsubEnd = api.on.chatStreamEnd((data: { sessionId: string; content: string }) => {
      if (data.sessionId !== sessionId) return;

      // Finalize the streaming message
      setMessages(prev => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
          updated[updated.length - 1] = {
            ...lastMsg,
            content: data.content || streamingContentRef.current,
            isStreaming: false,
            thinking: streamingThinkingRef.current || lastMsg.thinking,
          };
        }
        return updated;
      });

      setIsStreaming(false);
      isStreamingRef.current = false;
      setStreamingContent('');
      setStreamingThinking('');
      streamingContentRef.current = '';
      streamingThinkingRef.current = '';
      setActiveToolCalls([]);
    });

    const unsubError = api.on.chatStreamError((data: { sessionId: string; error: string }) => {
      if (data.sessionId !== sessionId) return;

      setMessages(prev => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
          updated[updated.length - 1] = {
            ...lastMsg,
            content: `Error: ${data.error}`,
            isStreaming: false,
            error: data.error,
          };
        }
        return updated;
      });

      setIsStreaming(false);
      isStreamingRef.current = false;
      setError(data.error);
      setStreamingContent('');
      setStreamingThinking('');
      streamingContentRef.current = '';
      streamingThinkingRef.current = '';
      setActiveToolCalls([]);
    });

    // Phase 8.2: non-fatal warnings (e.g. max-steps reached with partial content).
    // We don't stop streaming — the stream-end will follow — but we surface the
    // warning so the user knows the agent hit a limit.
    const unsubWarning = api.on.chatStreamWarning((data: { sessionId: string; warning: string }) => {
      if (data.sessionId !== sessionId) return;
      // Stash on the in-flight assistant message so the UI can show it.
      setMessages(prev => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
          updated[updated.length - 1] = {
            ...lastMsg,
            warning: data.warning,
          };
        }
        return updated;
      });
    });

    const unsubCancelled = api.on.chatStreamCancelled((data: { sessionId: string }) => {
      if (data.sessionId !== sessionId) return;

      setMessages(prev => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
          updated[updated.length - 1] = {
            ...lastMsg,
            content: streamingContentRef.current || lastMsg.content,
            isStreaming: false,
          };
        }
        return updated;
      });

      setIsStreaming(false);
      isStreamingRef.current = false;
      setStreamingContent('');
      setStreamingThinking('');
      streamingContentRef.current = '';
      streamingThinkingRef.current = '';
      setActiveToolCalls([]);
    });

    const unsubTrace = api.on.traceEntry((entry: TraceEntry) => {
      if (entry.sessionId === sessionId) {
        onTraceEntryRef.current?.(entry);
      }
    });

    // Listen for permission requests from AgentRunner (Build/Plan/Smart modes).
    // When the agent loop needs user approval for a tool call, main.ts sends
    // a chat:permission-request event with a requestId. The UI shows the
    // PermissionDialog and the user's response is sent back via
    // api.permissions.respond(requestId, response).
    const unsubPermission = api.on.permissionRequest?.((data: { sessionId: string; id: string; toolName: string; args: Record<string, unknown> }) => {
      if (data.sessionId !== sessionId) return;
      onPermissionRequestRef.current?.({
        id: data.id,
        toolName: data.toolName,
        args: data.args,
      });
    }) ?? (() => {});

    // Phase 8.3: auto-compaction ran after a chat turn. Notify the parent
    // so it can toast + reload the (now-compacted) message list.
    const unsubCompacted = api.on?.contextCompacted?.((data: { sessionId?: string; savedTokens: number; strategy?: string }) => {
      if (data.sessionId && data.sessionId !== sessionId) return;
      onContextCompactedRef.current?.({ savedTokens: data.savedTokens, strategy: data.strategy });
    }) ?? (() => {});

    unsubscribeRef.current = [
      unsubChunk,
      unsubThinking,
      unsubToolCall,
      unsubToolResult,
      unsubEnd,
      unsubError,
      unsubWarning,
      unsubCancelled,
      unsubTrace,
      unsubPermission,
      unsubCompacted,
    ];

    return () => {
      unsubscribeRef.current.forEach(fn => fn());
      unsubscribeRef.current = [];
    };
  }, [sessionId, permissionMode]);

  // Notify parent when messages change
  // Phase 6.5: Skip notifying parent if WE just synced from externalMessages
  useEffect(() => {
    if (skipNextNotifyRef.current) {
      skipNextNotifyRef.current = false;
      return;
    }
    onMessagesUpdate?.(messages);
  }, [messages, onMessagesUpdate]);

  const sendMessage = useCallback(async (content: string, files: AttachedFile[] = [], images: string[] = [], thinkingEffort?: string) => {
    if (!sessionId || !api) {
      setError('No active session or API not available');
      return;
    }

    if (isStreamingRef.current) {
      setError('Already streaming a response');
      return;
    }

    setError(null);
    streamingContentRef.current = '';
    streamingThinkingRef.current = '';
    lastUserMessageRef.current = content;
    lastFilesRef.current = files;

    // Create user message — Phase 4: attach images as base64 data URLs
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      files: files.length > 0 ? files : undefined,
      images: images.length > 0 ? images : undefined,
    };

    // Create assistant placeholder
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setIsStreaming(true);
    isStreamingRef.current = true;

    try {
      // The provider+model are stored on the session (set by ChatView's
      // provider/model dropdowns). The chat:stream IPC handler reads them
      // from session.providerId + session.model.
      // We don't need to pass them explicitly — the main process resolves
      // them from the session. Just call chat:stream with the message.
      if (!providers.length) {
        setMessages(prev => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg.role === 'assistant') {
            updated[updated.length - 1] = {
              ...lastMsg,
              content: 'No AI provider configured. Please add an API key in **Settings**.',
              isStreaming: false,
              error: 'No provider configured',
            };
          }
          return updated;
        });
        setIsStreaming(false);
        isStreamingRef.current = false;
        setError('No provider configured');
        return;
      }

      // Start streaming via the Electron API.
      // The provider+model are resolved from the session in main.ts.
      // Phase 4: pass images as base64 data URLs for multi-modal support.
      // Phase 4.2: pass thinking effort level.
      await api.chat.stream(sessionId, content, {
        files: files.map(f => f.path),
        images: images.length > 0 ? images : undefined,
        thinkingEffort,
      });
    } catch (err: any) {
      setMessages(prev => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg.role === 'assistant') {
          updated[updated.length - 1] = {
            ...lastMsg,
            content: `Failed to get response: ${err.message}`,
            isStreaming: false,
            error: err.message,
          };
        }
        return updated;
      });
      setIsStreaming(false);
      isStreamingRef.current = false;
      setError(err.message);
    }
  }, [sessionId, providers]);

  const stopStreaming = useCallback(async () => {
    if (!sessionId || !api) return;

    try {
      await api.chat.cancel(sessionId);
    } catch (err: any) {
      console.error('Failed to cancel streaming:', err);
    }

    // Immediately update local state
    setIsStreaming(false);
    isStreamingRef.current = false;

    setMessages(prev => {
      const updated = [...prev];
      const lastMsg = updated[updated.length - 1];
      if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
        updated[updated.length - 1] = {
          ...lastMsg,
          content: streamingContentRef.current || lastMsg.content || '*(cancelled)*',
          isStreaming: false,
        };
      }
      return updated;
    });

    setStreamingContent('');
    setStreamingThinking('');
    streamingContentRef.current = '';
    streamingThinkingRef.current = '';
    setActiveToolCalls([]);
  }, [sessionId]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    setStreamingContent('');
    setStreamingThinking('');
    setActiveToolCalls([]);
    streamingContentRef.current = '';
    streamingThinkingRef.current = '';
  }, []);

  // Exposed imperative API to load a session's messages from the parent.
  // Useful when the parent has the messages but didn't pass them via
  // externalMessages (e.g. for backward compatibility).
  const loadSession = useCallback((loaded: ChatMessage[]) => {
    const sanitized = loaded.map(m => ({ ...m, isStreaming: false }));
    setMessages(sanitized);
    streamingContentRef.current = '';
    streamingThinkingRef.current = '';
    setActiveToolCalls([]);
    setIsStreaming(false);
    isStreamingRef.current = false;
  }, []);

  const retryLastMessage = useCallback(async () => {
    if (!lastUserMessageRef.current) return;

    // Remove the last assistant message
    setMessages(prev => {
      const updated = [...prev];
      if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
        updated.pop();
      }
      if (updated.length > 0 && updated[updated.length - 1].role === 'user') {
        updated.pop();
      }
      return updated;
    });

    // Re-send
    await sendMessage(lastUserMessageRef.current, lastFilesRef.current);
  }, [sendMessage]);

  return {
    messages,
    isStreaming,
    error,
    streamingContent,
    streamingThinking,
    activeToolCalls,
    sendMessage,
    stopStreaming,
    clearMessages,
    retryLastMessage,
    loadSession,
  };
}
