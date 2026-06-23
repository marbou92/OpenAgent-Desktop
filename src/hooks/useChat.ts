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
  /** Phase 8.5: fired when the agent calls AskUserQuestion. */
  onAskUser?: (request: { id: string; toolName: string; questions: Array<{ question: string; header?: string; options: Array<{ label: string; description?: string }> }> }) => void;
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
    onAskUser,
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
  const activeToolCallsRef = useRef<ToolCall[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const lastExternalSyncRef = useRef<ChatMessage[] | null>(null);
  const skipNextNotifyRef = useRef(false);
  const lastSessionIdRef = useRef<string | null>(sessionId);
  useEffect(() => {
    if (isStreamingRef.current) return;
    const sessionChanged = lastSessionIdRef.current !== sessionId;
    lastSessionIdRef.current = sessionId;
    if (externalMessages && externalMessages.length > 0) {
      if (!sessionChanged && lastExternalSyncRef.current === externalMessages) return;
      lastExternalSyncRef.current = externalMessages;
      const sanitized = externalMessages.map(m => ({ ...m, isStreaming: false }));
      skipNextNotifyRef.current = true;
      setMessages(sanitized);
      streamingContentRef.current = '';
      streamingThinkingRef.current = '';
      setActiveToolCalls([]);
      setIsStreaming(false);
      isStreamingRef.current = false;
    } else if (externalMessages && externalMessages.length === 0) {
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

  const onTraceEntryRef = useRef(onTraceEntry);
  const onPermissionRequestRef = useRef(onPermissionRequest);
  const onContextCompactedRef = useRef(onContextCompacted);
  const onAskUserRef = useRef(onAskUser);
  useEffect(() => { onTraceEntryRef.current = onTraceEntry; }, [onTraceEntry]);
  useEffect(() => { onPermissionRequestRef.current = onPermissionRequest; }, [onPermissionRequest]);
  useEffect(() => { onContextCompactedRef.current = onContextCompacted; }, [onContextCompacted]);
  useEffect(() => { onAskUserRef.current = onAskUser; }, [onAskUser]);

  useEffect(() => {
    return () => {
      unsubscribeRef.current.forEach(fn => fn());
      unsubscribeRef.current = [];
    };
  }, [sessionId]);

  useEffect(() => {
    if (!api) return;

    const unsubChunk = api.on.chatStreamChunk((data: { sessionId: string; chunk: string }) => {
      if (data.sessionId !== sessionId) return;
      streamingContentRef.current += data.chunk;
      setStreamingContent(streamingContentRef.current);
      setMessages(prev => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
          updated[updated.length - 1] = { ...lastMsg, content: streamingContentRef.current };
        }
        return updated;
      });
    });

    const unsubThinking = api.on.chatStreamThinking((data: { sessionId: string; thinking: string }) => {
      if (data.sessionId !== sessionId) return;
      const accumulated = streamingThinkingRef.current + data.thinking;
      streamingThinkingRef.current = accumulated;
      setStreamingThinking(accumulated);
      setMessages(prev => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
          updated[updated.length - 1] = { ...lastMsg, thinking: accumulated };
        }
        return updated;
      });
    });

    const unsubToolCall = api.on.chatStreamToolCall((data: { sessionId: string; toolCall: Record<string, unknown> }) => {
      if (data.sessionId !== sessionId) return;
      const incomingToolCall = data.toolCall;
      const splitOffset = streamingContentRef.current.length;
      const newToolCall: ToolCall = {
        id: (incomingToolCall.id as string) || crypto.randomUUID(),
        name: (incomingToolCall.name as string) || 'unknown',
        arguments: (incomingToolCall.arguments as Record<string, unknown>) || {},
        status: 'pending',
        ...({ _splitOffset: splitOffset } as any),
      };

      setActiveToolCalls(prev => [...prev, newToolCall]);
      activeToolCallsRef.current = [...activeToolCallsRef.current, newToolCall];

      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (!lastMsg || lastMsg.role !== 'assistant' || !lastMsg.isStreaming) {
          return prev;
        }
        const existing = lastMsg.toolCalls || [];
        if (existing.some(tc => tc.id === newToolCall.id)) {
          return prev;
        }
        const updated = [...prev];
        updated[updated.length - 1] = { ...lastMsg, toolCalls: [...existing, newToolCall] };
        return updated;
      });

      // Phase 0.6: REMOVED the renderer-side permission check.
      // Previously fired onPermissionRequest with newToolCall.id which didn't
      // match main.ts's 'perm-...' IDs, causing the dialog to be unresolvable.
      // Permissions are handled SOLELY by main.ts via checkPermission →
      // requestPermission → chat:permission-request with 'perm-...' ID.
    });

    const unsubToolResult = api.on.chatStreamToolResult((data: { sessionId: string; toolResult: Record<string, unknown> }) => {
      if (data.sessionId !== sessionId) return;
      const toolResult = data.toolResult as any;
      // Phase 0.8: If the tool was denied (by policy or user), set status
      // to 'denied' so the ToolUseCard renders a "Denied" state instead of
      // the default "Completed" checkmark.
      const isDenied = toolResult?.denied === true;
      const resultValue = toolResult?.result ?? toolResult?.content;
      const newStatus = isDenied ? 'denied' : 'completed';
      // Update both the state AND the ref — the ref is read by chatStreamEnd
      // to finalize the message, so without updating it here the denied
      // status would be lost when the message is finalized.
      activeToolCallsRef.current = activeToolCallsRef.current.map(tc =>
        tc.id === toolResult.id
          ? { ...tc, result: resultValue, status: newStatus as 'denied' | 'completed' }
          : tc
      );
      setActiveToolCalls(prev =>
        prev.map(tc => {
          if (tc.id === toolResult.id) {
            return {
              ...tc,
              result: resultValue,
              status: newStatus as 'denied' | 'completed',
            };
          }
          return tc;
        })
      );
    });

    const unsubEnd = api.on.chatStreamEnd((data: { sessionId: string; content: string }) => {
      if (data.sessionId !== sessionId) return;
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (!lastMsg || lastMsg.role !== 'assistant' || !lastMsg.isStreaming) {
          return prev;
        }
        const existingToolCalls = lastMsg.toolCalls || [];
        // Phase 0.8: Merge active tool calls (which have the latest statuses
        // — 'completed' or 'denied') OVER existing ones, instead of only
        // adding missing ones. Without this, denied tool calls would keep
        // their stale 'pending' status in the finalized message.
        const allToolCalls = [...existingToolCalls];
        for (const atc of activeToolCallsRef.current) {
          const idx = allToolCalls.findIndex(tc => tc.id === atc.id);
          if (idx >= 0) {
            // Update with the latest status + result from the ref
            allToolCalls[idx] = { ...allToolCalls[idx], ...atc };
          } else {
            allToolCalls.push(atc);
          }
        }
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...lastMsg,
          content: data.content || streamingContentRef.current,
          isStreaming: false,
          thinking: streamingThinkingRef.current || lastMsg.thinking,
          toolCalls: allToolCalls,
        };
        return updated;
      });
      setIsStreaming(false);
      isStreamingRef.current = false;
      setStreamingContent('');
      setStreamingThinking('');
      streamingContentRef.current = '';
      streamingThinkingRef.current = '';
      activeToolCallsRef.current = [];
      setActiveToolCalls([]);
    });

    const unsubError = api.on.chatStreamError((data: { sessionId: string; error: string }) => {
      if (data.sessionId !== sessionId) return;
      setMessages(prev => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
          updated[updated.length - 1] = { ...lastMsg, content: `Error: ${data.error}`, isStreaming: false, error: data.error };
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

    const unsubWarning = api.on.chatStreamWarning?.((data: { sessionId: string; warning: string }) => {
      if (data.sessionId !== sessionId) return;
      setMessages(prev => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
          updated[updated.length - 1] = { ...lastMsg, warning: data.warning };
        }
        return updated;
      });
    }) ?? (() => {});

    const unsubCancelled = api.on.chatStreamCancelled((data: { sessionId: string }) => {
      if (data.sessionId !== sessionId) return;
      setMessages(prev => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
          updated[updated.length - 1] = { ...lastMsg, content: streamingContentRef.current || lastMsg.content, isStreaming: false };
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

    const unsubPermission = api.on.permissionRequest?.((data: { sessionId: string; id: string; toolName: string; args: Record<string, unknown> }) => {
      if (data.sessionId !== sessionId) return;
      onPermissionRequestRef.current?.({ id: data.id, toolName: data.toolName, args: data.args });
    }) ?? (() => {});

    const unsubAskUser = api.on?.askUser?.((data: { sessionId: string; id: string; toolName: string; args?: { questions?: Array<any> }; questions?: Array<any> }) => {
      if (data.sessionId !== sessionId) return;
      const questions = data.questions || data.args?.questions || [];
      onAskUserRef.current?.({ id: data.id, toolName: data.toolName, questions });
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (!lastMsg || lastMsg.role !== 'assistant' || !lastMsg.toolCalls) {
          return prev;
        }
        let found = false;
        const newToolCalls = lastMsg.toolCalls.map(tc => {
          if (tc.name === 'AskUserQuestion' && !tc.result && !tc.arguments?._askRequestId && !found) {
            found = true;
            return { ...tc, arguments: { ...tc.arguments, _askRequestId: data.id } };
          }
          return tc;
        });
        if (!found) return prev;
        const updated = [...prev];
        updated[updated.length - 1] = { ...lastMsg, toolCalls: newToolCalls };
        return updated;
      });
    }) ?? (() => {});

    const unsubCompacted = api.on?.contextCompacted?.((data: { sessionId?: string; savedTokens: number; strategy?: string }) => {
      if (data.sessionId && data.sessionId !== sessionId) return;
      onContextCompactedRef.current?.({ savedTokens: data.savedTokens, strategy: data.strategy });
    }) ?? (() => {});

    unsubscribeRef.current = [
      unsubChunk, unsubThinking, unsubToolCall, unsubToolResult, unsubEnd,
      unsubError, unsubWarning, unsubCancelled, unsubTrace, unsubPermission,
      unsubAskUser, unsubCompacted,
    ];

    return () => {
      unsubscribeRef.current.forEach(fn => fn());
      unsubscribeRef.current = [];
    };
  }, [sessionId, permissionMode]);

  useEffect(() => {
    if (skipNextNotifyRef.current) {
      skipNextNotifyRef.current = false;
      return;
    }
    onMessagesUpdate?.(messages);
  }, [messages, onMessagesUpdate]);

  const sendMessage = useCallback(async (content: string, files: AttachedFile[] = [], images: string[] = [], thinkingEffort?: string) => {
    if (!sessionId || !api) { setError('No active session or API not available'); return; }
    if (isStreamingRef.current) { setError('Already streaming a response'); return; }
    setError(null);
    streamingContentRef.current = '';
    streamingThinkingRef.current = '';
    activeToolCallsRef.current = [];
    lastUserMessageRef.current = content;
    lastFilesRef.current = files;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(), role: 'user', content, timestamp: new Date().toISOString(),
      files: files.length > 0 ? files : undefined, images: images.length > 0 ? images : undefined,
    };
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(), role: 'assistant', content: '', timestamp: new Date().toISOString(), isStreaming: true,
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setIsStreaming(true);
    isStreamingRef.current = true;

    try {
      if (!providers.length) {
        setMessages(prev => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg.role === 'assistant') {
            updated[updated.length - 1] = { ...lastMsg, content: 'No AI provider configured. Please add an API key in **Settings**.', isStreaming: false, error: 'No provider configured' };
          }
          return updated;
        });
        setIsStreaming(false); isStreamingRef.current = false; setError('No provider configured'); return;
      }
      await api.chat.stream(sessionId, content, {
        files: files.map(f => f.path), images: images.length > 0 ? images : undefined, thinkingEffort,
      });
    } catch (err: any) {
      setMessages(prev => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg.role === 'assistant') {
          updated[updated.length - 1] = { ...lastMsg, content: `Failed to get response: ${err.message}`, isStreaming: false, error: err.message };
        }
        return updated;
      });
      setIsStreaming(false); isStreamingRef.current = false; setError(err.message);
    }
  }, [sessionId, providers]);

  const stopStreaming = useCallback(async () => {
    if (!sessionId || !api) return;
    try { await api.chat.cancel(sessionId); } catch (err: any) { console.error('Failed to cancel streaming:', err); }
    setIsStreaming(false); isStreamingRef.current = false;
    setMessages(prev => {
      const updated = [...prev];
      const lastMsg = updated[updated.length - 1];
      if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
        updated[updated.length - 1] = { ...lastMsg, content: streamingContentRef.current || lastMsg.content || '*(cancelled)*', isStreaming: false };
      }
      return updated;
    });
    setStreamingContent(''); setStreamingThinking('');
    streamingContentRef.current = ''; streamingThinkingRef.current = '';
    setActiveToolCalls([]);
  }, [sessionId]);

  const clearMessages = useCallback(() => {
    setMessages([]); setError(null); setStreamingContent(''); setStreamingThinking(''); setActiveToolCalls([]);
    streamingContentRef.current = ''; streamingThinkingRef.current = ''; activeToolCallsRef.current = [];
  }, []);

  const loadSession = useCallback((loaded: ChatMessage[]) => {
    const sanitized = loaded.map(m => ({ ...m, isStreaming: false }));
    setMessages(sanitized);
    streamingContentRef.current = ''; streamingThinkingRef.current = '';
    setActiveToolCalls([]); setIsStreaming(false); isStreamingRef.current = false;
    activeToolCallsRef.current = [];
  }, []);

  const retryLastMessage = useCallback(async () => {
    if (!lastUserMessageRef.current) return;
    setMessages(prev => {
      const updated = [...prev];
      if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') updated.pop();
      if (updated.length > 0 && updated[updated.length - 1].role === 'user') updated.pop();
      return updated;
    });
    await sendMessage(lastUserMessageRef.current, lastFilesRef.current);
  }, [sendMessage]);

  return {
    messages, isStreaming, error, streamingContent, streamingThinking, activeToolCalls,
    sendMessage, stopStreaming, clearMessages, retryLastMessage, loadSession,
  };
}
