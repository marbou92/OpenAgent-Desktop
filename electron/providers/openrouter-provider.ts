/**
 * OpenAgent Desktop - OpenRouter Provider
 * API gateway for 200+ models:
 * - Unified API for multiple providers
 * - OpenAI-compatible chat completions
 * - Support for Claude, GPT-4, Llama, Mistral, etc.
 * - Model routing and fallback
 * - Cost tracking
 * - Support OPENROUTER_API_KEY env var
 */

import {
  ProviderConfig,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  ProviderError,
  ProviderErrorType,
  ProviderType,
} from './types';
import { OpenAIProvider } from './openai-provider';

// ─── OpenRouter Models ─────────────────────────────────────────────────────────

export const OPENROUTER_MODELS = [
  'anthropic/claude-4-20250514',
  'anthropic/claude-sonnet-4-20250514',
  'anthropic/claude-3.7-sonnet',
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-3-opus',
  'anthropic/claude-3-haiku',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'openai/o1',
  'openai/o3-mini',
  'google/gemini-2.5-pro-preview',
  'google/gemini-2.0-flash-001',
  'meta-llama/llama-3.1-405b-instruct',
  'meta-llama/llama-3.1-70b-instruct',
  'meta-llama/llama-3.1-8b-instruct',
  'mistralai/mistral-large',
  'mistralai/codestral-latest',
  'deepseek/deepseek-chat',
  'deepseek/deepseek-coder',
  'qwen/qwen-2.5-72b-instruct',
  'perplexity/sonar-pro',
] as const;

// ─── OpenRouter Provider ───────────────────────────────────────────────────────

export class OpenRouterProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) {
    super(config);
  }

  protected getDefaultHost(): string {
    return 'https://openrouter.ai';
  }

  protected getDefaultBasePath(): string {
    return '/api/v1';
  }

  protected getApiKey(): string {
    const key =
      this.config.apiKey ||
      this.getEnvVar('OPENROUTER_API_KEY') ||
      '';
    if (!key) {
      throw new ProviderError(
        'OpenRouter API key not configured. Set OPENROUTER_API_KEY environment variable.',
        ProviderErrorType.AUTHENTICATION,
        this.id
      );
    }
    return key;
  }

  protected buildRequestBody(request: ChatRequest): any {
    const body = super.buildRequestBody(request);

    // OpenRouter-specific options
    const extraHeaders: Record<string, string> = {};

    if (this.config.customHeaders) {
      // Allow setting HTTP-Referer and X-Title for OpenRouter rankings
      if (this.config.customHeaders['HTTP-Referer']) {
        extraHeaders['HTTP-Referer'] = this.config.customHeaders['HTTP-Referer'];
      }
      if (this.config.customHeaders['X-Title']) {
        extraHeaders['X-Title'] = this.config.customHeaders['X-Title'];
      }
    }

    return body;
  }

  // ─── Chat (Non-Streaming) with OpenRouter headers ───────────────────────────

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();
    const apiKey = this.getApiKey();

    try {
      const body = this.buildRequestBody(request);
      const url = `${this.getBaseUrl()}/chat/completions`;

      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://openagent.dev',
        'X-Title': 'OpenAgent Desktop',
      };

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
    body.stream_options = { include_usage: true };

    const url = `${this.getBaseUrl()}/chat/completions`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://openagent.dev',
      'X-Title': 'OpenAgent Desktop',
    };

    // Delegate to parent streaming implementation
    const pendingToolCalls: Map<
      number,
      { id: string; name: string; arguments: string }
    > = new Map();
    let usage: import('./types').TokenUsage | undefined;

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
          continue;
        }

        if (parsed.error) {
          throw new ProviderError(
            parsed.error.message || 'OpenRouter stream error',
            ProviderErrorType.SERVER_ERROR,
            this.id,
            parsed.error.code,
            true
          );
        }

        const choice = parsed.choices?.[0];
        if (!choice) {
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

        const delta = choice.delta;
        if (delta?.content) {
          yield { type: 'content', content: delta.content };
        }

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

        if (
          choice.finish_reason === 'tool_calls' ||
          choice.finish_reason === 'stop'
        ) {
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
      const apiKey = this.getApiKey();
      const url = `${this.getBaseUrl()}/models`;

      const response = await this.makeRequest(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      const data = await response.json();
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

      const response = await this.makeRequest(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      const data = await response.json();
      if (data.data && Array.isArray(data.data)) {
        return data.data
          .map((m: any) => m.id)
          .filter((id: string) => typeof id === 'string')
          .sort();
      }
    } catch {
      // Fall back
    }

    return [...OPENROUTER_MODELS];
  }
}
