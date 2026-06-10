/**
 * OpenAgent-Desktop - Ollama Provider
 * Local model runner:
 * - OpenAI-compatible endpoint
 * - Support for all Ollama models
 * - No API key required (local)
 * - SSE streaming
 * - Support OLLAMA_HOST env var
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
  ProviderType,
} from './types';
import { BaseProvider } from './base-provider';

// ─── Ollama Models ─────────────────────────────────────────────────────────────

export const OLLAMA_MODELS = [
  'llama3.1',
  'llama3',
  'mistral',
  'codellama',
  'gemma2',
  'phi3',
  'qwen2',
  'deepseek-coder-v2',
  'mixtral',
  'dolphin-mixtral',
  'nous-hermes2',
  'starcoder2',
  'command-r',
  'llava',
  'nomic-embed-text',
] as const;

// ─── Ollama Provider ───────────────────────────────────────────────────────────

export class OllamaProvider extends BaseProvider {
  constructor(config: ProviderConfig) {
    super(config, {
      maxRetries: 2,
      baseDelayMs: 500,
      maxDelayMs: 10000,
      retryableStatusCodes: [500, 502, 503],
    });
  }

  protected getDefaultHost(): string {
    return this.getEnvVar('OLLAMA_HOST') || 'http://localhost:11434';
  }

  protected getDefaultBasePath(): string {
    return '';
  }

  // ─── Convert Messages to Ollama/OpenAI Format ───────────────────────────────

  private convertMessages(messages: Message[]): Array<any> {
    const result: Array<any> = [];

    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        result.push({
          role: 'assistant',
          content: msg.content || '',
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
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

  private convertTools(
    tools?: import('./types').ToolDefinition[]
  ): any[] | undefined {
    if (!tools || tools.length === 0) return undefined;

    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  // ─── Build Request Body ─────────────────────────────────────────────────────

  private buildRequestBody(request: ChatRequest): Record<string, any> {
    const messages = this.convertMessages(request.messages);
    const tools = this.convertTools(request.tools);

    const body: Record<string, any> = {
      model: request.model,
      messages,
      stream: false,
    };

    if (request.maxTokens !== undefined) {
      body.options = { ...body.options, num_predict: request.maxTokens };
    }

    if (request.temperature !== undefined) {
      body.options = { ...body.options, temperature: request.temperature };
    }

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    return body;
  }

  // ─── Parse Response ─────────────────────────────────────────────────────────

  private parseResponse(data: any): ChatResponse {
    const message = data.message || {};
    const content = message.content || '';

    const resultMessage: Message = {
      role: 'assistant',
      content,
    };

    if (message.tool_calls && message.tool_calls.length > 0) {
      resultMessage.toolCalls = message.tool_calls.map((tc: any) => {
        let args: Record<string, any> = {};
        try {
          args =
            typeof tc.function?.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : tc.function?.arguments || {};
        } catch {
          args = {};
        }
        return {
          id: tc.id || this.generateId(),
          name: tc.function?.name || '',
          arguments: args,
        };
      });
    }

    const usage: TokenUsage | undefined = data.eval_count !== undefined
      ? {
          promptTokens: data.prompt_eval_count || 0,
          completionTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        }
      : undefined;

    return {
      id: `ollama_${this.generateId()}`,
      message: resultMessage,
      usage,
    };
  }

  // ─── Chat (Non-Streaming) ───────────────────────────────────────────────────

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();

    try {
      const body = this.buildRequestBody(request);
      const url = `${this.getBaseUrl()}/api/chat`;

      const response = await this.withRetry(async () => {
        return this.makeRequest(url, {
          method: 'POST',
          body: JSON.stringify(body),
          headers: {
            'Content-Type': 'application/json',
          },
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

    const body = this.buildRequestBody({ ...request, stream: true });
    const url = `${this.getBaseUrl()}/api/chat`;

    let usage: TokenUsage | undefined;

    try {
      const response = await this.withRetry(async () => {
        return this.makeRequest(url, {
          method: 'POST',
          body: JSON.stringify(body),
          headers: {
            'Content-Type': 'application/json',
          },
        });
      });

      // Ollama streams JSON objects line by line
      const reader = response.body?.getReader();
      if (!reader) {
        throw new ProviderError(
          'Response body not readable',
          ProviderErrorType.STREAM_PARSE,
          this.id
        );
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);

            if (data.message?.content) {
              yield { type: 'content', content: data.message.content };
            }

            if (data.message?.tool_calls) {
              for (const tc of data.message.tool_calls) {
                let args: Record<string, any> = {};
                try {
                  args =
                    typeof tc.function?.arguments === 'string'
                      ? JSON.parse(tc.function.arguments)
                      : tc.function?.arguments || {};
                } catch {
                  args = {};
                }
                yield {
                  type: 'tool_call',
                  toolCall: {
                    id: tc.id || this.generateId(),
                    name: tc.function?.name || '',
                    arguments: args,
                  },
                };
              }
            }

            if (data.done) {
              if (data.eval_count !== undefined) {
                usage = {
                  promptTokens: data.prompt_eval_count || 0,
                  completionTokens: data.eval_count || 0,
                  totalTokens:
                    (data.prompt_eval_count || 0) + (data.eval_count || 0),
                };
                yield { type: 'usage', usage };
              }
            }
          } catch {
            continue;
          }
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
      const url = `${this.getBaseUrl()}/api/tags`;

      const response = await this.makeRequest(url, {
        method: 'GET',
        headers: {},
      });

      const data = await response.json() as Record<string, any>;
      return !!(data.models && Array.isArray(data.models));
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
      const url = `${this.getBaseUrl()}/api/tags`;

      const response = await this.makeRequest(url, {
        method: 'GET',
        headers: {},
      });

      const data = await response.json() as Record<string, any>;
      if (data.models && Array.isArray(data.models)) {
        return data.models.map((m: any) => m.name).sort();
      }
    } catch {
      // Fall back
    }

    return [...OLLAMA_MODELS];
  }
}
