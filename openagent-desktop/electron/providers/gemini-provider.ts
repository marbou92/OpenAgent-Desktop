/**
 * OpenAgent-Desktop - Google Gemini Provider
 * Full implementation for Gemini models:
 * - Support Gemini 2.5 Pro, 2.0 Flash, etc.
 * - Gemini API format (contents, parts)
 * - Thinking levels support
 * - Function calling in Gemini format
 * - SSE streaming
 * - Support GOOGLE_API_KEY env var
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

// ─── Gemini Models ─────────────────────────────────────────────────────────────

export const GEMINI_MODELS = [
  'gemini-2.5-pro-preview-05-06',
  'gemini-2.5-flash-preview-05-20',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
] as const;

// ─── Gemini API Types ──────────────────────────────────────────────────────────

interface GeminiPart {
  text?: string;
  functionCall?: {
    name: string;
    args: Record<string, any>;
  };
  functionResponse?: {
    name: string;
    response: Record<string, any>;
  };
  thought?: boolean;
  thoughtSignature?: string;
}

interface GeminiContent {
  role?: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters?: Record<string, any>;
}

interface GeminiTool {
  functionDeclarations: GeminiFunctionDeclaration[];
}

interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: {
    parts: Array<{ text: string }>;
  };
  tools?: GeminiTool[];
  generationConfig?: {
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    thinkingConfig?: {
      thinkingBudget?: number;
    };
  };
}

// ─── Gemini Provider ───────────────────────────────────────────────────────────

export class GeminiProvider extends BaseProvider {
  constructor(config: ProviderConfig) {
    super(config, {
      maxRetries: 3,
      baseDelayMs: 1000,
      retryableStatusCodes: [429, 500, 502, 503, 504],
    });
  }

  protected getDefaultHost(): string {
    return 'https://generativelanguage.googleapis.com';
  }

  protected getDefaultBasePath(): string {
    return '/v1beta';
  }

  private getApiKey(): string {
    const key = this.getApiKeyFromEnv('GOOGLE_API_KEY');
    if (!key) {
      throw new ProviderError(
        'Google API key not configured. Set GOOGLE_API_KEY environment variable or configure in settings.',
        ProviderErrorType.AUTHENTICATION,
        this.id
      );
    }
    return key;
  }

  // ─── Convert Messages to Gemini Format ──────────────────────────────────────

  private convertMessages(
    messages: Message[]
  ): { systemInstruction?: { parts: Array<{ text: string }> }; contents: GeminiContent[] } {
    let systemInstruction: { parts: Array<{ text: string }> } | undefined;
    const contents: GeminiContent[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = { parts: [{ text: msg.content }] };
        continue;
      }

      if (msg.role === 'assistant') {
        const parts: GeminiPart[] = [];

        if (msg.content) {
          parts.push({ text: msg.content });
        }

        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.arguments,
              },
            });
          }
        }

        contents.push({ role: 'model', parts });
        continue;
      }

      if (msg.role === 'tool') {
        // Function response
        let responseData: Record<string, any> = {};
        try {
          responseData = JSON.parse(msg.content);
        } catch {
          responseData = { result: msg.content };
        }

        contents.push({
          role: 'function',
          parts: [
            {
              functionResponse: {
                name: msg.metadata?.functionName || msg.toolCallId || '',
                response: responseData,
              },
            },
          ],
        });
        continue;
      }

      // User messages
      contents.push({
        role: 'user',
        parts: [{ text: msg.content }],
      });
    }

    // Ensure alternating user/model turns
    // Gemini requires alternating roles. Merge consecutive same-role messages.
    const merged: GeminiContent[] = [];
    for (const content of contents) {
      const last = merged[merged.length - 1];
      if (last && last.role === content.role) {
        last.parts.push(...content.parts);
      } else {
        merged.push({ ...content, parts: [...content.parts] });
      }
    }

    return { systemInstruction, contents: merged };
  }

  // ─── Convert Tools ──────────────────────────────────────────────────────────

  private convertTools(
    tools?: ToolDefinition[]
  ): GeminiTool[] | undefined {
    if (!tools || tools.length === 0) return undefined;

    return [
      {
        functionDeclarations: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })),
      },
    ];
  }

  // ─── Build Request Body ─────────────────────────────────────────────────────

  private buildRequestBody(request: ChatRequest): GeminiRequest {
    const { systemInstruction, contents } = this.convertMessages(
      request.messages
    );
    const tools = this.convertTools(request.tools);

    const body: GeminiRequest = {
      contents,
      generationConfig: {},
    };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    if (request.maxTokens !== undefined) {
      body.generationConfig!.maxOutputTokens = request.maxTokens;
    }

    if (request.temperature !== undefined) {
      body.generationConfig!.temperature = request.temperature;
    }

    // Thinking levels support
    const thinkingLevel = this.getEnvVar('GEMINI_THINKING_LEVEL');
    if (thinkingLevel && this.isThinkingModel(request.model)) {
      const budgetMap: Record<string, number> = {
        low: 1024,
        medium: 8192,
        high: 24576,
      };
      const budget = budgetMap[thinkingLevel.toLowerCase()] || 8192;
      body.generationConfig!.thinkingConfig = {
        thinkingBudget: budget,
      };
    }

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    return body;
  }

  private isThinkingModel(model: string): boolean {
    return (
      model.includes('2.5') ||
      model.includes('thinking') ||
      model.includes('pro-preview')
    );
  }

  // ─── Build URL ──────────────────────────────────────────────────────────────

  private buildUrl(model: string, stream: boolean): string {
    const apiKey = this.getApiKey();
    const action = stream ? 'streamGenerateContent' : 'generateContent';
    const base = this.getBaseUrl();
    return `${base}/models/${model}:${action}?key=${apiKey}${stream ? '&alt=sse' : ''}`;
  }

  // ─── Parse Gemini Response ──────────────────────────────────────────────────

  private parseResponse(data: any): ChatResponse {
    const candidate = data.candidates?.[0];
    if (!candidate) {
      throw new ProviderError(
        'No candidates in Gemini response',
        ProviderErrorType.INVALID_REQUEST,
        this.id
      );
    }

    const parts: GeminiPart[] = candidate.content?.parts || [];
    let textContent = '';
    let thinkingContent = '';
    const toolCalls: ToolCall[] = [];

    for (const part of parts) {
      if (part.text !== undefined) {
        if (part.thought) {
          thinkingContent += part.text;
        } else {
          textContent += part.text;
        }
      } else if (part.functionCall) {
        toolCalls.push({
          id: `fc_${this.generateId()}`,
          name: part.functionCall.name,
          arguments: part.functionCall.args || {},
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

    const usage: TokenUsage | undefined = data.usageMetadata
      ? {
          promptTokens: data.usageMetadata.promptTokenCount || 0,
          completionTokens: data.usageMetadata.candidatesTokenCount || 0,
          totalTokens:
            (data.usageMetadata.totalTokenCount || 0),
        }
      : undefined;

    return {
      id: `gemini_${this.generateId()}`,
      message,
      usage,
      thinking: thinkingContent || undefined,
    };
  }

  // ─── Chat (Non-Streaming) ───────────────────────────────────────────────────

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();

    try {
      const body = this.buildRequestBody(request);
      const url = this.buildUrl(request.model, false);

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

    const body = this.buildRequestBody(request);
    const url = this.buildUrl(request.model, true);

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

      for await (const event of this.parseSSEStream(response)) {
        let parsed: any;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          continue;
        }

        const candidate = parsed.candidates?.[0];
        if (!candidate) {
          // Usage only chunk
          if (parsed.usageMetadata) {
            usage = {
              promptTokens: parsed.usageMetadata.promptTokenCount || 0,
              completionTokens:
                parsed.usageMetadata.candidatesTokenCount || 0,
              totalTokens: parsed.usageMetadata.totalTokenCount || 0,
            };
            yield { type: 'usage', usage };
          }
          continue;
        }

        const parts: GeminiPart[] = candidate.content?.parts || [];

        for (const part of parts) {
          if (part.text !== undefined) {
            if (part.thought) {
              yield {
                type: 'thinking',
                content: part.text,
              };
            } else {
              yield {
                type: 'content',
                content: part.text,
              };
            }
          } else if (part.functionCall) {
            yield {
              type: 'tool_call',
              toolCall: {
                id: `fc_${this.generateId()}`,
                name: part.functionCall.name,
                arguments: part.functionCall.args || {},
              },
            };
          }
        }

        if (parsed.usageMetadata) {
          usage = {
            promptTokens: parsed.usageMetadata.promptTokenCount || 0,
            completionTokens:
              parsed.usageMetadata.candidatesTokenCount || 0,
            totalTokens: parsed.usageMetadata.totalTokenCount || 0,
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
      const url = `${this.getBaseUrl()}/models?key=${apiKey}`;

      const response = await this.makeRequest(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
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
      const apiKey = this.getApiKey();
      const url = `${this.getBaseUrl()}/models?key=${apiKey}`;

      const response = await this.makeRequest(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (data.models && Array.isArray(data.models)) {
        return data.models
          .map((m: any) => m.name?.replace('models/', '') || '')
          .filter((name: string) => name && name.startsWith('gemini'))
          .sort();
      }
    } catch {
      // Fall back to default list
    }

    return [...GEMINI_MODELS];
  }
}
