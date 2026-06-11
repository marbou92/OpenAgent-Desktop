/**
 * OpenAgent-Desktop - OpenCode Provider
 * Integrates with https://github.com/anomalyco/opencode
 *
 * OpenCode is an agent runtime server (Hono-based, Bun) that exposes a
 * session-based, event-driven HTTP API — NOT an OpenAI-compatible chat
 * completions endpoint.
 *
 * Architecture:
 *   1. Create/resume a session  →  POST /session
 *   2. Send a user message      →  POST /session/:id/message
 *   3. Collect the response     →  GET  /event  (SSE stream)
 *      - `message.part.updated` events carry streaming text deltas
 *      - `message.updated` events signal message completion
 *      - `session.status` events indicate idle/active/error
 *   4. Permission/question flows are handled via dedicated endpoints
 *
 * Auth: HTTP Basic Auth when OPENCODE_SERVER_PASSWORD is set.
 *       Username defaults to "opencode" (OPENCODE_SERVER_USERNAME).
 */

import {
  ProviderConfig,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  ToolCall,
  TokenUsage,
  Message,
  ProviderError,
  ProviderErrorType,
} from './types';
import { BaseProvider } from './base-provider';

// ─── Default Fallback Models ─────────────────────────────────────────────────
// These are used only when the /app endpoint is unreachable.
// The real model list is discovered dynamically from the server.

export const OPENCODE_MODELS = [
  'opencode-default',
] as const;

// ─── OpenCode API Types ──────────────────────────────────────────────────────

/** Subset of message roles OpenCode uses internally. */
export type OpenCodeMessageRole = 'user' | 'assistant';

/** Status of an OpenCode session. */
export type OpenCodeSessionStatus = 'idle' | 'active' | 'error' | 'retry';

/** Supported SSE event types from GET /event. */
export type OpenCodeEventType =
  | 'message.updated'
  | 'message.part.updated'
  | 'message.removed'
  | 'session.created'
  | 'session.updated'
  | 'session.deleted'
  | 'session.error'
  | 'session.diff'
  | 'session.status'
  | 'question.asked'
  | 'permission.asked'
  | 'todo.updated';

/** A single file attachment sent with a message. */
export interface OpenCodeFileAttachment {
  path: string;
  content: string;
}

/** Model descriptor used in message POST body. */
export interface OpenCodeModelRef {
  providerID: string;
  modelID: string;
}

/** Body sent to POST /session/:id/message. */
export interface OpenCodeMessageBody {
  text: string;
  files?: OpenCodeFileAttachment[];
  agent?: string;
  model?: OpenCodeModelRef;
}

/** A session object returned by the OpenCode server. */
export interface OpenCodeSession {
  id: string;
  createdAt: string;
  title?: string;
  share?: string;
  [key: string]: unknown;
}

/** A message part within an OpenCode message. */
export interface OpenCodeMessagePart {
  type: string;
  text?: string;
  delta?: string;
  [key: string]: unknown;
}

/** A message object returned by the OpenCode server. */
export interface OpenCodeMessage {
  id: string;
  role: OpenCodeMessageRole;
  parts: OpenCodeMessagePart[];
  createdAt: string;
  sessionId: string;
  [key: string]: unknown;
}

/** A pending question from the agent. */
export interface OpenCodeQuestion {
  id: string;
  sessionId: string;
  text: string;
  [key: string]: unknown;
}

/** A pending permission request from the agent. */
export interface OpenCodePermission {
  id: string;
  sessionId: string;
  toolName: string;
  input?: unknown;
  [key: string]: unknown;
}

/** App info returned by GET /app. */
export interface OpenCodeAppInfo {
  name?: string;
  version?: string;
  providers?: Array<{ id: string; name: string; models: string[] }>;
  [key: string]: unknown;
}

/** Config returned by GET /config. */
export interface OpenCodeConfig {
  [key: string]: unknown;
}

/** Tool info returned by GET /tool. */
export interface OpenCodeToolInfo {
  name: string;
  description?: string;
  [key: string]: unknown;
}

/** Parsed SSE event envelope from GET /event. */
export interface OpenCodeSSEEvent {
  type: OpenCodeEventType;
  data: Record<string, unknown>;
}

// ─── OpenCode Provider ───────────────────────────────────────────────────────

export class OpenCodeProvider extends BaseProvider {
  /** Currently active session ID (resumed across calls). */
  private activeSessionId?: string;

  /** Cache of the /app response for model discovery. */
  private appInfoCache?: OpenCodeAppInfo;
  private appInfoCacheExpiry = 0;
  private static readonly APP_INFO_CACHE_TTL_MS = 60_000;

  constructor(config: ProviderConfig) {
    super(config, {
      maxRetries: 3,
      baseDelayMs: 1000,
      retryableStatusCodes: [429, 500, 502, 503, 504],
    });
  }

  // ─── Host / Base Path ──────────────────────────────────────────────────────

  protected getDefaultHost(): string {
    return this.getEnvVar('OPENCODE_HOST') || 'http://localhost:4096';
  }

  protected getDefaultBasePath(): string {
    // OpenCode has no API prefix — routes sit at the root.
    return '';
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────

  /**
   * Build HTTP Basic Auth headers when a server password is configured.
   *
   * OpenCode uses Basic Auth (not Bearer tokens). The password comes from
   * OPENCODE_SERVER_PASSWORD; the username defaults to "opencode" and can
   * be overridden via OPENCODE_SERVER_USERNAME.
   */
  private getBasicAuthHeaders(): Record<string, string> {
    const password =
      this.config.apiKey ||
      this.getEnvVar('OPENCODE_SERVER_PASSWORD') ||
      this.getEnvVar('OPENCODE_API_KEY') ||
      '';

    if (!password) {
      return {};
    }

    const username =
      this.getEnvVar('OPENCODE_SERVER_USERNAME') || 'opencode';

    const encoded = Buffer.from(`${username}:${password}`).toString('base64');
    return { Authorization: `Basic ${encoded}` };
  }

  /**
   * Merge authentication headers with any caller-supplied headers.
   */
  private mergeHeaders(
    extra?: Record<string, string>,
  ): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...this.getBasicAuthHeaders(),
      ...extra,
    };
  }

  // ─── URL Helper ────────────────────────────────────────────────────────────

  /** Build a full URL for an OpenCode REST endpoint. */
  private url(path: string): string {
    return `${this.getBaseUrl()}${path}`;
  }

  // ─── Session Management ───────────────────────────────────────────────────

  /** Create a new OpenCode session. */
  async createSession(): Promise<OpenCodeSession> {
    const response = await this.withRetry(() =>
      this.makeRequest(this.url('/session'), {
        method: 'POST',
        headers: this.mergeHeaders(),
        body: JSON.stringify({}),
      }),
    );

    const session = (await response.json()) as OpenCodeSession;
    this.activeSessionId = session.id;
    return session;
  }

  /** List all sessions. */
  async listSessions(): Promise<OpenCodeSession[]> {
    try {
      const response = await this.makeRequest(this.url('/session'), {
        method: 'GET',
        headers: this.mergeHeaders(),
      });

      const data = await response.json();
      return Array.isArray(data) ? (data as OpenCodeSession[]) : [];
    } catch {
      return [];
    }
  }

  /** Get a specific session by ID. */
  async getSession(sessionId: string): Promise<OpenCodeSession | null> {
    try {
      const response = await this.makeRequest(
        this.url(`/session/${sessionId}`),
        {
          method: 'GET',
          headers: this.mergeHeaders(),
        },
      );
      return (await response.json()) as OpenCodeSession;
    } catch {
      return null;
    }
  }

  /** Delete a session. */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const response = await this.makeRequest(
        this.url(`/session/${sessionId}`),
        {
          method: 'DELETE',
          headers: this.mergeHeaders(),
        },
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  /** Get messages in a session. */
  async getSessionMessages(sessionId: string): Promise<OpenCodeMessage[]> {
    try {
      const response = await this.makeRequest(
        this.url(`/session/${sessionId}/message`),
        {
          method: 'GET',
          headers: this.mergeHeaders(),
        },
      );
      const data = await response.json();
      return Array.isArray(data) ? (data as OpenCodeMessage[]) : [];
    } catch {
      return [];
    }
  }

  /**
   * Ensure we have an active session, creating one if necessary.
   * If the stored session ID is stale we create a new one.
   */
  private async ensureSession(): Promise<string> {
    if (this.activeSessionId) {
      const existing = await this.getSession(this.activeSessionId);
      if (existing) {
        return this.activeSessionId;
      }
      // Session was deleted — create fresh.
      this.activeSessionId = undefined;
    }

    const session = await this.createSession();
    return session.id;
  }

  // ─── Send Message ─────────────────────────────────────────────────────────

  /**
   * Send a user message to a session.
   *
   * The server processes the message asynchronously; the assistant response
   * arrives over the SSE event stream (GET /event). This method only
   * triggers the message — callers should use `chat()` / `chatStream()` to
   * collect the full response.
   */
  async sendMessage(
    sessionId: string,
    body: OpenCodeMessageBody,
  ): Promise<void> {
    await this.withRetry(() =>
      this.makeRequest(this.url(`/session/${sessionId}/message`), {
        method: 'POST',
        headers: this.mergeHeaders(),
        body: JSON.stringify(body),
      }),
    );
  }

  // ─── SSE Event Stream ─────────────────────────────────────────────────────

  /**
   * Connect to the OpenCode SSE event stream (GET /event) and yield parsed
   * events until the session becomes idle or the stream closes.
   *
   * OpenCode's SSE format:
   *   event: <type>
   *   data: <JSON payload>
   */
  async *listenToEventStream(
    sessionId: string,
    signal?: AbortSignal,
  ): AsyncGenerator<OpenCodeSSEEvent> {
    const headers = this.mergeHeaders({ Accept: 'text/event-stream' });

    const response = await fetch(this.url('/event'), {
      method: 'GET',
      headers,
      signal,
    });

    if (!response.ok) {
      throw new ProviderError(
        `SSE connection failed: HTTP ${response.status}`,
        ProviderErrorType.NETWORK,
        this.id,
        response.status,
        true,
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new ProviderError(
        'SSE response body is not readable',
        ProviderErrorType.STREAM_PARSE,
        this.id,
      );
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let currentEventType = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();

          if (trimmed.startsWith('event:')) {
            currentEventType = trimmed.slice(6).trim();
          } else if (trimmed.startsWith('data:')) {
            const raw = trimmed.slice(5).trim();
            if (!raw || raw === '[DONE]') {
              currentEventType = '';
              continue;
            }

            let parsed: Record<string, unknown>;
            try {
              parsed = JSON.parse(raw);
            } catch {
              currentEventType = '';
              continue;
            }

            const eventType = currentEventType as OpenCodeEventType;
            currentEventType = '';

            // Filter events to only those relevant to our session
            const eventSessionId =
              parsed.sessionID ?? parsed.sessionId ?? parsed.id;
            if (
              sessionId &&
              eventSessionId &&
              String(eventSessionId) !== sessionId
            ) {
              continue;
            }

            yield { type: eventType, data: parsed };

            // If the session transitioned to idle, the agent is done.
            if (
              eventType === 'session.status' &&
              (parsed as { type?: string }).type === 'idle'
            ) {
              return;
            }
          } else if (trimmed === '') {
            // End of SSE event frame.
            currentEventType = '';
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ─── Chat (Non-Streaming) ─────────────────────────────────────────────────

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();

    try {
      const sessionId = await this.ensureSession();

      // Extract the last user message as the prompt text.
      const lastUserMsg = [...request.messages]
        .reverse()
        .find((m) => m.role === 'user');
      const text = lastUserMsg?.content || '';

      // Build the message body.
      const body: OpenCodeMessageBody = { text };

      // If the model string looks like "provider/model", split it.
      if (request.model && request.model !== 'opencode-default') {
        const slashIdx = request.model.indexOf('/');
        if (slashIdx > 0) {
          body.model = {
            providerID: request.model.slice(0, slashIdx),
            modelID: request.model.slice(slashIdx + 1),
          };
        } else {
          // Try using the string as modelID with no explicit provider.
          body.model = { providerID: '', modelID: request.model };
        }
      }

      await this.sendMessage(sessionId, body);

      // Collect the assistant response from the event stream.
      const abortCtrl = new AbortController();
      let assistantContent = '';
      let assistantMessageId = '';
      let usage: TokenUsage | undefined;

      for await (const event of this.listenToEventStream(
        sessionId,
        abortCtrl.signal,
      )) {
        if (event.type === 'message.part.updated') {
          const part = event.data as OpenCodeMessagePart;
          if (part.delta) {
            assistantContent += part.delta;
          } else if (part.text) {
            assistantContent = part.text;
          }
        } else if (event.type === 'message.updated') {
          const msg = event.data as OpenCodeMessage;
          if (msg.role === 'assistant') {
            assistantMessageId = msg.id || assistantMessageId;
            // Reconstruct full text from parts if present.
            if (msg.parts && msg.parts.length > 0) {
              assistantContent = msg.parts
                .map((p) => p.text || '')
                .filter(Boolean)
                .join('');
            }
          }
          // Once we see the completed assistant message, we can stop.
          if (msg.role === 'assistant' && assistantContent) {
            abortCtrl.abort();
            break;
          }
        } else if (event.type === 'session.status') {
          if ((event.data as { type?: string }).type === 'idle') {
            abortCtrl.abort();
            break;
          }
        }
      }

      const message: Message = {
        role: 'assistant',
        content: assistantContent,
      };

      const result: ChatResponse = {
        id: assistantMessageId || this.generateId(),
        message,
        usage,
      };

      this.logRequest(request.model, Date.now() - startTime, false, usage);
      return result;
    } catch (error) {
      this.logRequest(
        request.model,
        Date.now() - startTime,
        false,
        undefined,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  // ─── Chat (Streaming) ─────────────────────────────────────────────────────

  async *chatStream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    const startTime = Date.now();
    let usage: TokenUsage | undefined;

    try {
      const sessionId = await this.ensureSession();

      // Extract the last user message.
      const lastUserMsg = [...request.messages]
        .reverse()
        .find((m) => m.role === 'user');
      const text = lastUserMsg?.content || '';

      const body: OpenCodeMessageBody = { text };

      if (request.model && request.model !== 'opencode-default') {
        const slashIdx = request.model.indexOf('/');
        if (slashIdx > 0) {
          body.model = {
            providerID: request.model.slice(0, slashIdx),
            modelID: request.model.slice(slashIdx + 1),
          };
        } else {
          body.model = { providerID: '', modelID: request.model };
        }
      }

      await this.sendMessage(sessionId, body);

      // Stream the response from the SSE event stream.
      for await (const event of this.listenToEventStream(sessionId)) {
        switch (event.type) {
          case 'message.part.updated': {
            const part = event.data as OpenCodeMessagePart;
            const delta = part.delta || '';
            if (delta) {
              // Distinguish thinking vs. content based on part type.
              if (part.type === 'thinking' || part.type === 'reasoning') {
                yield { type: 'thinking', content: delta };
              } else if (
                part.type === 'tool-invocation' ||
                part.type === 'tool-call'
              ) {
                // Tool call part — emit as tool_call chunk.
                const toolName =
                  (part as Record<string, unknown>).toolName ?? '';
                const args =
                  (part as Record<string, unknown>).args ??
                  (part as Record<string, unknown>).arguments ??
                  {};
                yield {
                  type: 'tool_call',
                  toolCall: {
                    id: this.generateId(),
                    name: String(toolName),
                    arguments:
                      typeof args === 'string'
                        ? (() => {
                            try {
                              return JSON.parse(args);
                            } catch {
                              return {};
                            }
                          })()
                        : (args as Record<string, unknown>),
                  },
                };
              } else if (
                part.type === 'tool-result' ||
                part.type === 'tool-result-invocation'
              ) {
                const result =
                  (part as Record<string, unknown>).result ??
                  (part as Record<string, unknown>).output ??
                  '';
                yield {
                  type: 'tool_result',
                  content: String(result),
                };
              } else {
                // Default: treat as content.
                yield { type: 'content', content: delta };
              }
            }
            break;
          }

          case 'message.updated': {
            const msg = event.data as OpenCodeMessage;
            // If we receive a completed assistant message without having
            // seen individual part deltas, emit the full content.
            if (msg.role === 'assistant' && msg.parts) {
              const fullText = msg.parts
                .map((p) => p.text || '')
                .filter(Boolean)
                .join('');
              if (fullText) {
                yield { type: 'content', content: fullText };
              }
            }
            break;
          }

          case 'message.removed':
            // Message was deleted — nothing to yield.
            break;

          case 'session.status': {
            const statusData = event.data as {
              type?: string;
              attempt?: number;
              message?: string;
            };
            if (statusData.type === 'idle') {
              // Agent finished — end the stream.
              yield { type: 'done' };
              this.logRequest(
                request.model,
                Date.now() - startTime,
                true,
                usage,
              );
              return;
            }
            if (statusData.type === 'error') {
              throw new ProviderError(
                `OpenCode session error: ${statusData.message || 'unknown'}`,
                ProviderErrorType.SERVER_ERROR,
                this.id,
                undefined,
                true,
              );
            }
            break;
          }

          case 'session.error': {
            const errData = event.data as { message?: string };
            throw new ProviderError(
              `OpenCode session error: ${errData.message || 'unknown'}`,
              ProviderErrorType.SERVER_ERROR,
              this.id,
              undefined,
              true,
            );
          }

          case 'question.asked':
          case 'permission.asked':
            // These are informational — the UI can poll for them
            // separately via the question/permission endpoints.
            // We don't block the stream for them.
            break;

          default:
            // Ignore unrecognised event types.
            break;
        }
      }

      // Stream ended without explicit idle — yield done.
      yield { type: 'done' };
      this.logRequest(request.model, Date.now() - startTime, true, usage);
    } catch (error) {
      if (error instanceof ProviderError) throw error;

      this.logRequest(
        request.model,
        Date.now() - startTime,
        true,
        undefined,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  // ─── Permission / Question Handling ───────────────────────────────────────

  /** List pending questions. */
  async listQuestions(): Promise<OpenCodeQuestion[]> {
    try {
      const response = await this.makeRequest(this.url('/question/'), {
        method: 'GET',
        headers: this.mergeHeaders(),
      });
      const data = await response.json();
      return Array.isArray(data) ? (data as OpenCodeQuestion[]) : [];
    } catch {
      return [];
    }
  }

  /** Answer a pending question. */
  async replyQuestion(
    questionId: string,
    answer: string,
  ): Promise<boolean> {
    try {
      const response = await this.makeRequest(
        this.url(`/question/${questionId}/reply`),
        {
          method: 'POST',
          headers: this.mergeHeaders(),
          body: JSON.stringify({ text: answer }),
        },
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  /** Reject a pending question. */
  async rejectQuestion(questionId: string): Promise<boolean> {
    try {
      const response = await this.makeRequest(
        this.url(`/question/${questionId}/reject`),
        {
          method: 'POST',
          headers: this.mergeHeaders(),
        },
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  /** List pending permission requests. */
  async listPermissions(): Promise<OpenCodePermission[]> {
    try {
      const response = await this.makeRequest(this.url('/permission/'), {
        method: 'GET',
        headers: this.mergeHeaders(),
      });
      const data = await response.json();
      return Array.isArray(data) ? (data as OpenCodePermission[]) : [];
    } catch {
      return [];
    }
  }

  /** Approve or deny a permission request. */
  async replyPermission(
    permissionId: string,
    approved: boolean,
  ): Promise<boolean> {
    try {
      const response = await this.makeRequest(
        this.url(`/permission/${permissionId}/reply`),
        {
          method: 'POST',
          headers: this.mergeHeaders(),
          body: JSON.stringify({ approved }),
        },
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  // ─── App / Config / Tool Info ─────────────────────────────────────────────

  /** Get app info (includes available providers and models). */
  async getAppInfo(): Promise<OpenCodeAppInfo | null> {
    try {
      const response = await this.makeRequest(this.url('/app'), {
        method: 'GET',
        headers: this.mergeHeaders(),
      });
      return (await response.json()) as OpenCodeAppInfo;
    } catch {
      return null;
    }
  }

  /** Get server configuration. */
  async getConfig(): Promise<OpenCodeConfig | null> {
    try {
      const response = await this.makeRequest(this.url('/config'), {
        method: 'GET',
        headers: this.mergeHeaders(),
      });
      return (await response.json()) as OpenCodeConfig;
    } catch {
      return null;
    }
  }

  /** List available tools. */
  async listTools(): Promise<OpenCodeToolInfo[]> {
    try {
      const response = await this.makeRequest(this.url('/tool'), {
        method: 'GET',
        headers: this.mergeHeaders(),
      });
      const data = await response.json();
      return Array.isArray(data) ? (data as OpenCodeToolInfo[]) : [];
    } catch {
      return [];
    }
  }

  // ─── Test Connection ──────────────────────────────────────────────────────

  async test(): Promise<boolean> {
    try {
      const response = await this.makeRequest(this.url('/session'), {
        method: 'GET',
        headers: this.mergeHeaders(),
      });
      return response.ok;
    } catch {
      // Fallback: try /app endpoint.
      try {
        const response = await this.makeRequest(this.url('/app'), {
          method: 'GET',
          headers: this.mergeHeaders(),
        });
        return response.ok;
      } catch {
        return false;
      }
    }
  }

  // ─── List Models ──────────────────────────────────────────────────────────

  async listModels(): Promise<string[]> {
    // 1. Prefer explicit config.
    if (this.config.models && this.config.models.length > 0) {
      return this.config.models;
    }

    // 2. Try the /app endpoint for dynamic discovery.
    const now = Date.now();
    if (
      !this.appInfoCache ||
      now > this.appInfoCacheExpiry
    ) {
      this.appInfoCache = (await this.getAppInfo()) ?? undefined;
      this.appInfoCacheExpiry = now + OpenCodeProvider.APP_INFO_CACHE_TTL_MS;
    }

    if (this.appInfoCache?.providers) {
      const models: string[] = [];
      for (const provider of this.appInfoCache.providers) {
        for (const modelId of provider.models) {
          models.push(`${provider.id}/${modelId}`);
        }
      }
      if (models.length > 0) {
        return models.sort();
      }
    }

    // 3. Fallback static list.
    return [...OPENCODE_MODELS];
  }

  // ─── Session Status ───────────────────────────────────────────────────────

  /** Get the status of all sessions. */
  async getSessionStatuses(): Promise<
    Record<string, { type: OpenCodeSessionStatus; [k: string]: unknown }>
  > {
    try {
      const response = await this.makeRequest(this.url('/session/status'), {
        method: 'GET',
        headers: this.mergeHeaders(),
      });
      return (await response.json()) as Record<
        string,
        { type: OpenCodeSessionStatus; [k: string]: unknown }
      >;
    } catch {
      return {};
    }
  }
}
