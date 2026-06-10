/**
 * OpenAgent-Desktop - OpenAI Provider
 * Full implementation for OpenAI models and compatible endpoints:
 * - Support GPT-4o, o1, o3, GPT-5 series
 * - OpenAI chat completions format
 * - Function calling / tool use
 * - SSE streaming with "data: " prefix
 * - Support OPENAI_API_KEY, OPENAI_HOST, OPENAI_ORGANIZATION env vars
 * - Reusable as base for: Azure OpenAI, LM Studio, Docker Model Runner,
 *   LiteLLM, Atomic Chat, Novita, Avian, FuturMix, Routstr, SaladCloud,
 *   Scaleway, Venice, Cerebras, xAI, Custom OpenAI, Ollama, Ramalama
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

// ─── OpenAI Models ─────────────────────────────────────────────────────────────

export const OPENAI_MODELS = [
  'gpt-5',
  'gpt-5-turbo',
  'gpt-5-mini',
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4',
  'gpt-4-32k',
  'o3',
  'o3-mini',
  'o1',
  'o1-mini',
  'o1-pro',
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-16k',
  'dall-e-3',
  'whisper-1',
  'tts-1',
  'tts-1-hd',
  'text-embedding-3-large',
  'text-embedding-3-small',
  'text-embedding-ada-002',
] as const;

// ─── OpenAI API Types ──────────────────────────────────────────────────────────

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  tools?: OpenAITool[];
  stream?: boolean;
  n?: number;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  logprobs?: boolean;
  top_logprobs?: number;
  response_format?: {
    type: 'text' | 'json_object' | 'json_schema';
    json_schema?: Record<string, any>;
  };
  seed?: number;
  stream_options?: {
    include_usage: boolean;
  };
}

// ─── OpenAI Provider ───────────────────────────────────────────────────────────

export class OpenAIProvider extends BaseProvider {
  constructor(config: ProviderConfig) {
    super(config, {
      maxRetries: 3,
      baseDelayMs: 1000,
      retryableStatusCodes: [429, 500, 502, 503, 504],
    });
  }

  protected getDefaultHost(): string {
    return this.getEnvVar('OPENAI_HOST') || 'https://api.openai.com';
  }

  protected getDefaultBasePath(): string {
    return '/v1';
  }

  protected getApiKey(): string {
    const key =
      this.getApiKeyFromEnv('OPENAI_API_KEY');
    if (!key && this.config.type === ProviderType.openai) {
      throw new ProviderError(
        'OpenAI API key not configured. Set OPENAI_API_KEY environment variable or configure in settings.',
        ProviderErrorType.AUTHENTICATION,
        this.id
      );
    }
    return key || '';
  }

  // ─── Convert Messages to OpenAI Format ──────────────────────────────────────

  protected convertMessages(messages: Message[]): OpenAIMessage[] {
    const result: OpenAIMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        result.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments:
                typeof tc.arguments === 'string'
                  ? tc.arguments
                  : JSON.stringify(tc.arguments),
            },
          })),
        });
      } else if (msg.role === 'tool') {
        result.push({
          role: 'tool',
          content: msg.content,
          tool_call_id: msg.toolCallId || '',
        });
      } else {
        result.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    return result;
  }

  // ─── Convert Tools ──────────────────────────────────────────────────────────

  protected convertTools(tools?: ToolDefinition[]): OpenAITool[] | undefined {
    if (!tools || tools.length === 0) return undefined;

    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  // ─── Build Request Body ─────────────────────────────────────────────────────

  protected buildRequestBody(request: ChatRequest): OpenAIRequest {
    const messages = this.convertMessages(request.messages);
    const tools = this.convertTools(request.tools);

    const body: OpenAIRequest = {
      model: request.model,
      messages,
      stream: false,
    };

    if (request.maxTokens !== undefined) {
      // For o1/o3 models, maxTokens maps to max_completion_tokens
      if (
        request.model.startsWith('o1') ||
        request.model.startsWith('o3')
      ) {
        (body as any).max_completion_tokens = request.maxTokens;
      } else {
        body.max_tokens = request.maxTokens;
      }
    }

    if (request.temperature !== undefined) {
      // o1/o3 models don't support temperature
      if (
        !request.model.startsWith('o1') &&
        !request.model.startsWith('o3')
      ) {
        body.temperature = request.temperature;
      }
    }

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    return body;
  }

  // ─── Parse OpenAI Response ──────────────────────────────────────────────────

  protected parseResponse(data: any): ChatResponse {
    const choice = data.choices?.[0];
    if (!choice) {
      throw new ProviderError(
        'No choices in OpenAI response',
        ProviderErrorType.INVALID_REQUEST,
        this.id
      );
    }

    const responseMessage = choice.message;
    const content = responseMessage?.content || '';

    const message: Message = {
      role: 'assistant',
      content,
    };

    if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
      message.toolCalls = responseMessage.tool_calls.map(
        (tc: OpenAIToolCall) => {
          let args: Record<string, any> = {};
          try {
            args = JSON.parse(tc.function.arguments);
          } catch {
            args = {};
          }
          return {
            id: tc.id,
            name: tc.function.name,
            arguments: args,
          };
        }
      );
    }

    const usage: TokenUsage | undefined = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens || 0,
          completionTokens: data.usage.completion_tokens || 0,
          totalTokens: data.usage.total_tokens || 0,
        }
      : undefined;

    const thinking =
      responseMessage?.reasoning_content ||
      responseMessage?.reasoning ||
      undefined;

    return {
      id: data.id || this.generateId(),
      message,
      usage,
      thinking,
    };
  }

  // ─── Chat (Non-Streaming) ───────────────────────────────────────────────────

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();
    const apiKey = this.getApiKey();

    try {
      const body = this.buildRequestBody(request);
      const url = `${this.getBaseUrl()}/chat/completions`;

      const headers: Record<string, string> = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      if (this.config.organization) {
        headers['OpenAI-Organization'] = this.config.organization;
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

      this.logRequest(
        request.model,
        Date.now() - startTime,
        false,
        result.usage
      );

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
    // Request usage in stream
    body.stream_options = { include_usage: true };

    const url = `${this.getBaseUrl()}/chat/completions`;

    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    if (this.config.organization) {
      headers['OpenAI-Organization'] = this.config.organization;
    }

    let fullContent = '';
    let usage: TokenUsage | undefined;
    const pendingToolCalls: Map<
      number,
      { id: string; name: string; arguments: string }
    > = new Map();

    try {
      const response = await this.withRetry(async () => {
        return this.makeRequest(url, {
          method: 'POST',
          body: JSON.stringify(body),
          headers,
        });
      });

      for await (const event of this.parseSSEStream(response)) {
        if (event.data === '[DONE]') {
          break;
        }

        let parsed: any;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          continue;
        }

        // Error in stream
        if (parsed.error) {
          throw new ProviderError(
            parsed.error.message || 'Stream error',
            ProviderErrorType.SERVER_ERROR,
            this.id,
            parsed.error.code,
            true
          );
        }

        const choice = parsed.choices?.[0];
        if (!choice) {
          // Usage-only chunk
          if (parsed.usage) {
            usage = {
              promptTokens: parsed.usage.prompt_tokens || 0,
              completionTokens: parsed.usage.completion_tokens || 0,
              totalTokens: parsed.usage.total_tokens || 0,
            };
            yield { type: 'usage', usage };
          }
          continue;
        }

        // Content delta
        const delta = choice.delta;
        if (delta?.content) {
          fullContent += delta.content;
          yield {
            type: 'content',
            content: delta.content,
          };
        }

        // Reasoning/thinking content
        if (delta?.reasoning_content || delta?.reasoning) {
          const thinkingChunk = delta.reasoning_content || delta.reasoning;
          yield {
            type: 'thinking',
            content: thinkingChunk,
          };
        }

        // Tool calls
        if (delta?.tool_calls) {
          for (const tcDelta of delta.tool_calls) {
            const index = tcDelta.index ?? 0;

            if (!pendingToolCalls.has(index)) {
              pendingToolCalls.set(index, {
                id: tcDelta.id || '',
                name: tcDelta.function?.name || '',
                arguments: '',
              });
            }

            const pending = pendingToolCalls.get(index)!;
            if (tcDelta.id) pending.id = tcDelta.id;
            if (tcDelta.function?.name) pending.name = tcDelta.function.name;
            if (tcDelta.function?.arguments) {
              pending.arguments += tcDelta.function.arguments;
            }
          }
        }

        // Finish reason — emit completed tool calls
        if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
          if (pendingToolCalls.size > 0) {
            for (const [, tc] of pendingToolCalls) {
              let args: Record<string, any> = {};
              try {
                args = JSON.parse(tc.arguments);
              } catch {
                args = {};
              }
              yield {
                type: 'tool_call',
                toolCall: {
                  id: tc.id || this.generateId(),
                  name: tc.name,
                  arguments: args,
                },
              };
            }
            pendingToolCalls.clear();
          }
        }

        // Usage from final chunk
        if (parsed.usage) {
          usage = {
            promptTokens: parsed.usage.prompt_tokens || 0,
            completionTokens: parsed.usage.completion_tokens || 0,
            totalTokens: parsed.usage.total_tokens || 0,
          };
          yield { type: 'usage', usage };
        }
      }

      yield { type: 'done' };

      this.logRequest(
        request.model,
        Date.now() - startTime,
        true,
        usage
      );
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
      const apiKey = this.getApiKey();
      if (!apiKey && this.config.type === ProviderType.openai) {
        return false;
      }

      const url = `${this.getBaseUrl()}/models`;

      const headers: Record<string, string> = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await this.makeRequest(url, {
        method: 'GET',
        headers,
      });

      const data = await response.json() as Record<string, any>;
      return !!(data.data && Array.isArray(data.data));
    } catch {
      return false;
    }
  }

  // ─── List Models ────────────────────────────────────────────────────────────

  async listModels(): Promise<string[]> {
    if (this.config.models && this.config.models.length > 0) {
      return this.config.models;
    }

    try {
      const apiKey = this.getApiKey();
      const url = `${this.getBaseUrl()}/models`;

      const headers: Record<string, string> = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await this.makeRequest(url, {
        method: 'GET',
        headers,
      });

      const data = await response.json() as Record<string, any>;
      if (data.data && Array.isArray(data.data)) {
        return data.data
          .map((m: any) => m.id)
          .filter((id: string) => typeof id === 'string')
          .sort();
      }
    } catch {
      // Fall back to default list
    }

    return [...OPENAI_MODELS];
  }
}
