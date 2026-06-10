/**
 * OpenAgent-Desktop - OpenCode Provider
 * Integrates with https://github.com/anomalyco/opencode:
 * - OpenCode API format
 * - Session management
 * - Tool execution via OpenCode
 * - Streaming responses
 * - Support OPENCODE_API_KEY env var
 */

import {
  ProviderConfig,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  ToolCall,
  TokenUsage,
  Message,
  ToolDefinition,
  ProviderError,
  ProviderErrorType,
  ProviderType,
} from './types';
import { BaseProvider } from './base-provider';

// ─── OpenCode Models ───────────────────────────────────────────────────────────

export const OPENCODE_MODELS = [
  'opencode-default',
  'opencode-coder',
  'opencode-reasoner',
  'opencode-planner',
  'opencode-executor',
] as const;

// ─── OpenCode API Types ────────────────────────────────────────────────────────

interface OpenCodeSession {
  id: string;
  model: string;
  createdAt: number;
  metadata?: Record<string, any>;
}

interface OpenCodeMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  metadata?: Record<string, any>;
}

interface OpenCodeRequest {
  session_id?: string;
  messages: OpenCodeMessage[];
  model: string;
  max_tokens?: number;
  temperature?: number;
  tools?: ToolDefinition[];
  stream?: boolean;
}

// ─── OpenCode Provider ─────────────────────────────────────────────────────────

export class OpenCodeProvider extends BaseProvider {
  private sessionId?: string;

  constructor(config: ProviderConfig) {
    super(config, {
      maxRetries: 3,
      baseDelayMs: 1000,
      retryableStatusCodes: [429, 500, 502, 503, 504],
    });
  }

  protected getDefaultHost(): string {
    return this.getEnvVar('OPENCODE_HOST') || 'http://localhost:13284';
  }

  protected getDefaultBasePath(): string {
    return '/api/v1';
  }

  private getApiKey(): string {
    const key =
      this.config.apiKey ||
      this.getEnvVar('OPENCODE_API_KEY') ||
      '';
    // OpenCode may not require an API key for local instances
    return key;
  }

  // ─── Session Management ─────────────────────────────────────────────────────

  async createSession(model?: string): Promise<string> {
    const url = `${this.getBaseUrl()}/sessions`;
    const apiKey = this.getApiKey();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await this.makeRequest(url, {
      method: 'POST',
      body: JSON.stringify({
        model: model || 'opencode-default',
      }),
      headers,
    });

    const data = await response.json();
    this.sessionId = data.id || data.session_id;
    return this.sessionId;
  }

  async getSession(sessionId: string): Promise<OpenCodeSession | null> {
    const url = `${this.getBaseUrl()}/sessions/${sessionId}`;
    const apiKey = this.getApiKey();

    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    try {
      const response = await this.makeRequest(url, {
        method: 'GET',
        headers,
      });

      return await response.json();
    } catch {
      return null;
    }
  }

  async listSessions(): Promise<OpenCodeSession[]> {
    const url = `${this.getBaseUrl()}/sessions`;
    const apiKey = this.getApiKey();

    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    try {
      const response = await this.makeRequest(url, {
        method: 'GET',
        headers,
      });

      const data = await response.json();
      return Array.isArray(data) ? data : data.sessions || [];
    } catch {
      return [];
    }
  }

  // ─── Convert Messages ───────────────────────────────────────────────────────

  private convertMessages(messages: Message[]): OpenCodeMessage[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      toolCalls: msg.toolCalls,
      toolCallId: msg.toolCallId,
      metadata: msg.metadata,
    }));
  }

  // ─── Build Request Body ─────────────────────────────────────────────────────

  private buildRequestBody(request: ChatRequest): OpenCodeRequest {
    const messages = this.convertMessages(request.messages);

    const body: OpenCodeRequest = {
      messages,
      model: request.model,
      stream: false,
    };

    if (this.sessionId) {
      body.session_id = this.sessionId;
    }

    if (request.maxTokens !== undefined) {
      body.max_tokens = request.maxTokens;
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
    }

    return body;
  }

  // ─── Parse Response ─────────────────────────────────────────────────────────

  private parseResponse(data: any): ChatResponse {
    const messageData = data.message || data;
    const content = messageData.content || '';
    const toolCalls: ToolCall[] = [];

    if (messageData.tool_calls && Array.isArray(messageData.tool_calls)) {
      for (const tc of messageData.tool_calls) {
        toolCalls.push({
          id: tc.id || this.generateId(),
          name: tc.name || tc.function?.name || '',
          arguments:
            typeof tc.arguments === 'string'
              ? (() => {
                  try { return JSON.parse(tc.arguments); } catch { return {}; }
                })()
              : tc.arguments || tc.function?.arguments || {},
        });
      }
    }

    // Handle OpenCode-specific tool results format
    if (data.tool_results && Array.isArray(data.tool_results)) {
      for (const tr of data.tool_results) {
        toolCalls.push({
          id: tr.id || this.generateId(),
          name: tr.name || 'tool_result',
          arguments: { result: tr.result || tr.content || '' },
        });
      }
    }

    const message: Message = {
      role: 'assistant',
      content,
    };

    if (toolCalls.length > 0) {
      message.toolCalls = toolCalls;
    }

    const usage: TokenUsage | undefined = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens || data.usage.input_tokens || 0,
          completionTokens: data.usage.completion_tokens || data.usage.output_tokens || 0,
          totalTokens:
            data.usage.total_tokens ||
            (data.usage.prompt_tokens || data.usage.input_tokens || 0) +
              (data.usage.completion_tokens || data.usage.output_tokens || 0),
        }
      : undefined;

    return {
      id: data.id || this.generateId(),
      message,
      usage,
      thinking: data.thinking || data.reasoning || undefined,
    };
  }

  // ─── Chat (Non-Streaming) ───────────────────────────────────────────────────

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();
    const apiKey = this.getApiKey();

    try {
      const body = this.buildRequestBody(request);
      const url = `${this.getBaseUrl()}/chat`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await this.withRetry(async () => {
        return this.makeRequest(url, {
          method: 'POST',
          body: JSON.stringify(body),
          headers,
        });
      });

      const data = await response.json();
      const result = this.parseResponse(data);

      this.logRequest(request.model, Date.now() - startTime, false, result.usage);
      return result;
    } catch (error) {
      this.logRequest(
        request.model,
        Date.now() - startTime,
        false,
        undefined,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  // ─── Chat (Streaming) ───────────────────────────────────────────────────────

  async *chatStream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    const startTime = Date.now();
    const apiKey = this.getApiKey();

    const body = this.buildRequestBody({ ...request, stream: true });
    const url = `${this.getBaseUrl()}/chat`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    let usage: TokenUsage | undefined;

    try {
      const response = await this.withRetry(async () => {
        return this.makeRequest(url, {
          method: 'POST',
          body: JSON.stringify(body),
          headers,
        });
      });

      for await (const event of this.parseSSEStream(response)) {
        if (event.data === '[DONE]') break;

        let parsed: any;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          // Try as plain text content
          if (event.data) {
            yield { type: 'content', content: event.data };
          }
          continue;
        }

        // OpenCode streaming format
        if (parsed.type === 'content' || parsed.content) {
          yield {
            type: 'content',
            content: parsed.content || parsed.text || '',
          };
        } else if (parsed.type === 'thinking' || parsed.thinking) {
          yield {
            type: 'thinking',
            content: parsed.thinking || parsed.content || '',
          };
        } else if (parsed.type === 'tool_call' || parsed.tool_call) {
          const tc = parsed.tool_call || parsed;
          yield {
            type: 'tool_call',
            toolCall: {
              id: tc.id || this.generateId(),
              name: tc.name || tc.function?.name || '',
              arguments:
                typeof tc.arguments === 'string'
                  ? (() => {
                      try { return JSON.parse(tc.arguments); } catch { return {}; }
                    })()
                  : tc.arguments || tc.function?.arguments || {},
            },
          };
        } else if (parsed.type === 'tool_result' || parsed.tool_result) {
          const tr = parsed.tool_result || parsed;
          yield {
            type: 'tool_result',
            content: tr.result || tr.content || '',
          };
        } else if (parsed.type === 'usage' || parsed.usage) {
          usage = {
            promptTokens: parsed.usage?.prompt_tokens || 0,
            completionTokens: parsed.usage?.completion_tokens || 0,
            totalTokens: parsed.usage?.total_tokens || 0,
          };
          yield { type: 'usage', usage };
        } else if (parsed.type === 'done') {
          break;
        }
      }

      yield { type: 'done' };
      this.logRequest(request.model, Date.now() - startTime, true, usage);
    } catch (error) {
      this.logRequest(
        request.model,
        Date.now() - startTime,
        true,
        undefined,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  // ─── Test Connection ────────────────────────────────────────────────────────

  async test(): Promise<boolean> {
    try {
      const url = `${this.getBaseUrl()}/health`;
      const apiKey = this.getApiKey();

      const headers: Record<string, string> = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await this.makeRequest(url, {
        method: 'GET',
        headers,
      });

      return response.ok;
    } catch {
      // Try alternate health check
      try {
        const url = `${this.getBaseUrl()}/sessions`;
        const apiKey = this.getApiKey();
        const headers: Record<string, string> = {};
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
        const response = await this.makeRequest(url, {
          method: 'GET',
          headers,
        });
        return response.ok;
      } catch {
        return false;
      }
    }
  }

  // ─── List Models ────────────────────────────────────────────────────────────

  async listModels(): Promise<string[]> {
    if (this.config.models && this.config.models.length > 0) {
      return this.config.models;
    }

    try {
      const url = `${this.getBaseUrl()}/models`;
      const apiKey = this.getApiKey();
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await this.makeRequest(url, {
        method: 'GET',
        headers,
      });

      const data = await response.json();
      if (Array.isArray(data)) {
        return data.map((m: any) => m.id || m.name || m).sort();
      }
      if (data.data && Array.isArray(data.data)) {
        return data.data.map((m: any) => m.id || m.name).sort();
      }
      if (data.models && Array.isArray(data.models)) {
        return data.models.map((m: any) => m.id || m.name).sort();
      }
    } catch {
      // Fall back
    }

    return [...OPENCODE_MODELS];
  }
}
