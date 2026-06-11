/**
 * OpenAgent-Desktop - Anthropic Provider
 * Full implementation for Claude models:
 * - Claude 4, 3.5 Sonnet, 3 Opus, etc.
 * - Anthropic-specific API format (content blocks)
 * - Extended thinking support (budget_tokens)
 * - Prompt caching with cache_control
 * - Tool use format (tool_use content blocks)
 * - SSE streaming with event types
 * - Support ANTHROPIC_API_KEY and ANTHROPIC_HOST env vars
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
} from './types';
import { BaseProvider } from './base-provider';

// ─── Anthropic Models ──────────────────────────────────────────────────────────

export const ANTHROPIC_MODELS = [
  'claude-4-20250514',
  'claude-4-opus-20250514',
  'claude-sonnet-4-20250514',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-sonnet-20240620',
  'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229',
  'claude-3-haiku-20240307',
] as const;

// ─── Anthropic API Types ───────────────────────────────────────────────────────

interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, any>;
  tool_use_id?: string;
  content?: string | AnthropicContentBlock[];
  cache_control?: { type: 'ephemeral' };
  thinking?: string;
  signature?: string;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, any>;
  cache_control?: { type: 'ephemeral' };
}

interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  temperature?: number;
  system?: string | AnthropicContentBlock[];
  tools?: AnthropicTool[];
  stream?: boolean;
  thinking?: {
    type: 'enabled';
    budget_tokens: number;
  };
  metadata?: {
    user_id?: string;
  };
}

// ─── Anthropic Provider ────────────────────────────────────────────────────────

export class AnthropicProvider extends BaseProvider {
  private static readonly API_VERSION = '2023-06-01';

  constructor(config: ProviderConfig) {
    super(config, {
      maxRetries: 3,
      baseDelayMs: 1000,
      retryableStatusCodes: [429, 500, 502, 503, 529],
    });
  }

  protected getDefaultHost(): string {
    return this.getEnvVar('ANTHROPIC_HOST') || 'https://api.anthropic.com';
  }

  protected getDefaultBasePath(): string {
    return '/v1';
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'x-api-key': this.getApiKeyFromEnv('ANTHROPIC_API_KEY') || '',
      'anthropic-version': AnthropicProvider.API_VERSION,
      'content-type': 'application/json',
    };
  }

  private getApiKey(): string {
    const key = this.getApiKeyFromEnv('ANTHROPIC_API_KEY');
    if (!key) {
      throw new ProviderError(
        'Anthropic API key not configured. Set ANTHROPIC_API_KEY environment variable or configure in settings.',
        ProviderErrorType.AUTHENTICATION,
        this.id
      );
    }
    return key;
  }

  // ─── Convert Messages to Anthropic Format ────────────────────────────────────

  private convertMessages(
    messages: Message[]
  ): { system: string | AnthropicContentBlock[]; messages: AnthropicMessage[] } {
    const systemMessages: string[] = [];
    const anthropicMessages: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemMessages.push(msg.content);
        continue;
      }

      if (msg.role === 'assistant') {
        const contentBlocks: AnthropicContentBlock[] = [];

        if (msg.content) {
          contentBlocks.push({ type: 'text', text: msg.content });
        }

        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            contentBlocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.arguments,
            });
          }
        }

        anthropicMessages.push({
          role: 'assistant',
          content: contentBlocks.length === 1 && contentBlocks[0].type === 'text'
            ? contentBlocks[0].text!
            : contentBlocks,
        });
        continue;
      }

      if (msg.role === 'tool') {
        anthropicMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.toolCallId || '',
              content: msg.content,
            },
          ],
        });
        continue;
      }

      // user messages
      anthropicMessages.push({
        role: 'user',
        content: msg.content,
      });
    }

    const system = systemMessages.join('\n\n');
    return { system, messages: anthropicMessages };
  }

  // ─── Convert Tools ──────────────────────────────────────────────────────────

  private convertTools(
    tools?: ToolDefinition[]
  ): AnthropicTool[] | undefined {
    if (!tools || tools.length === 0) return undefined;

    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }

  // ─── Detect Extended Thinking ───────────────────────────────────────────────

  private isThinkingModel(model: string): boolean {
    return (
      model.startsWith('claude-4') ||
      model.startsWith('claude-3-7') ||
      model.includes('extended') ||
      model.includes('thinking')
    );
  }

  // ─── Build Request Body ─────────────────────────────────────────────────────

  private buildRequestBody(request: ChatRequest): AnthropicRequest {
    const { system, messages } = this.convertMessages(request.messages);
    const tools = this.convertTools(request.tools);

    const body: AnthropicRequest = {
      model: request.model,
      messages,
      max_tokens: request.maxTokens || 8192,
      stream: false,
    };

    if (system) {
      // Apply prompt caching to system message
      if (this.supportsPromptCaching() && system.length > 500) {
        body.system = [
          {
            type: 'text',
            text: system,
            cache_control: { type: 'ephemeral' },
          },
        ] as any;
      } else {
        body.system = system;
      }
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    // Extended thinking support
    if (this.isThinkingModel(request.model)) {
      const thinkingBudget = request.maxTokens
        ? Math.min(Math.floor(request.maxTokens * 0.8), 32000)
        : 10000;
      body.thinking = {
        type: 'enabled',
        budget_tokens: thinkingBudget,
      };
      // When thinking is enabled, max_tokens must be >= budget_tokens + 1
      body.max_tokens = Math.max(body.max_tokens, thinkingBudget + 1024);
      // Temperature must not be set when thinking is enabled for some models
      if (request.temperature === undefined) {
        delete body.temperature;
      }
    }

    return body;
  }

  // ─── Parse Anthropic Response ───────────────────────────────────────────────

  private parseResponse(data: any): ChatResponse {
    const contentBlocks: AnthropicContentBlock[] = data.content || [];
    let textContent = '';
    let thinkingContent = '';
    const toolCalls: ToolCall[] = [];

    for (const block of contentBlocks) {
      if (block.type === 'text' && block.text) {
        textContent += block.text;
      } else if (block.type === 'thinking' && block.thinking) {
        thinkingContent += block.thinking;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id || this.generateId(),
          name: block.name || '',
          arguments: block.input || {},
        });
      }
    }

    const message: Message = {
      role: 'assistant',
      content: textContent,
    };

    if (toolCalls.length > 0) {
      message.toolCalls = toolCalls;
    }

    const usage: TokenUsage | undefined = data.usage
      ? {
          promptTokens: data.usage.input_tokens || 0,
          completionTokens: data.usage.output_tokens || 0,
          totalTokens:
            (data.usage.input_tokens || 0) +
            (data.usage.output_tokens || 0),
        }
      : undefined;

    return {
      id: data.id || this.generateId(),
      message,
      usage,
      thinking: thinkingContent || undefined,
    };
  }

  // ─── Chat (Non-Streaming) ───────────────────────────────────────────────────

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();
    const apiKey = this.getApiKey();

    try {
      const body = this.buildRequestBody({ ...request, stream: false });
      const url = `${this.getBaseUrl()}/messages`;

      const response = await this.withRetry(async () => {
        return this.makeRequest(url, {
          method: 'POST',
          body: JSON.stringify(body),
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': AnthropicProvider.API_VERSION,
          },
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
    const url = `${this.getBaseUrl()}/messages`;

    let _fullContent = '';
    let _thinkingContent = '';
    let currentToolCall: Partial<ToolCall> | null = null;
    let currentToolCallInput = '';
    let usage: TokenUsage | undefined;
    let _responseId = '';

    try {
      const response = await this.withRetry(async () => {
        return this.makeRequest(url, {
          method: 'POST',
          body: JSON.stringify(body),
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': AnthropicProvider.API_VERSION,
          },
        });
      });

      for await (const event of this.parseSSEStream(response)) {
        const eventData = event.data;

        let parsed: any;
        try {
          parsed = JSON.parse(eventData);
        } catch {
          continue;
        }

        switch (event.event || parsed.type) {
          case 'message_start': {
            _responseId = parsed.message?.id || this.generateId();
            if (parsed.message?.usage) {
              usage = {
                promptTokens: parsed.message.usage.input_tokens || 0,
                completionTokens: 0,
                totalTokens: parsed.message.usage.input_tokens || 0,
              };
            }
            break;
          }

          case 'content_block_start': {
            const block = parsed.content_block;
            if (block?.type === 'thinking') {
              // Thinking block started
            } else if (block?.type === 'tool_use') {
              currentToolCall = {
                id: block.id,
                name: block.name,
              };
              currentToolCallInput = '';
            }
            break;
          }

          case 'content_block_delta': {
            const delta = parsed.delta;
            if (delta?.type === 'thinking_delta') {
              _thinkingContent += delta.thinking || '';
              yield {
                type: 'thinking',
                content: delta.thinking,
              };
            } else if (delta?.type === 'text_delta') {
              _fullContent += delta.text || '';
              yield {
                type: 'content',
                content: delta.text,
              };
            } else if (delta?.type === 'input_json_delta') {
              currentToolCallInput += delta.partial_json || '';
            }
            break;
          }

          case 'content_block_stop': {
            if (currentToolCall) {
              let args: Record<string, any> = {};
              try {
                args = JSON.parse(currentToolCallInput || '{}');
              } catch {
                args = {};
              }

              const toolCall: ToolCall = {
                id: currentToolCall.id || this.generateId(),
                name: currentToolCall.name || '',
                arguments: args,
              };

              yield {
                type: 'tool_call',
                toolCall,
              };

              currentToolCall = null;
              currentToolCallInput = '';
            }
            break;
          }

          case 'message_delta': {
            if (parsed.usage) {
              const completionTokens = parsed.usage.output_tokens || 0;
              if (usage) {
                usage.completionTokens = completionTokens;
                usage.totalTokens = usage.promptTokens + completionTokens;
              } else {
                usage = {
                  promptTokens: 0,
                  completionTokens,
                  totalTokens: completionTokens,
                };
              }
              yield {
                type: 'usage',
                usage,
              };
            }
            break;
          }

          case 'message_stop': {
            break;
          }

          case 'ping': {
            break;
          }

          default: {
            // Unknown event type — skip
            break;
          }
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
      const url = `${this.getBaseUrl()}/messages`;

      const response = await this.makeRequest(url, {
        method: 'POST',
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 10,
        }),
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': AnthropicProvider.API_VERSION,
        },
      });

      const data = await response.json() as Record<string, unknown>;
      return !!(data.id || data.content);
    } catch {
      return false;
    }
  }

  // ─── List Models ────────────────────────────────────────────────────────────

  async listModels(): Promise<string[]> {
    if (this.config.models && this.config.models.length > 0) {
      return this.config.models;
    }
    return [...ANTHROPIC_MODELS];
  }
}
