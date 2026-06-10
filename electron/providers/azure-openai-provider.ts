/**
 * OpenAgent-Desktop - Azure OpenAI Provider
 * Azure-specific implementation:
 * - Azure-specific authentication and endpoint format
 * - Support AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT_NAME, AZURE_OPENAI_API_KEY
 * - Deployment-based model selection
 * - Extends OpenAI provider with Azure endpoint format
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

// ─── Azure OpenAI Models ───────────────────────────────────────────────────────

export const AZURE_OPENAI_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4',
  'gpt-4-32k',
  'gpt-35-turbo',
  'gpt-35-turbo-16k',
  'o1',
  'o1-mini',
  'o3-mini',
] as const;

// ─── Azure OpenAI Provider ─────────────────────────────────────────────────────

export class AzureOpenAIProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) {
    super(config);
  }

  protected getDefaultHost(): string {
    return this.getEnvVar('AZURE_OPENAI_ENDPOINT') || '';
  }

  protected getDefaultBasePath(): string {
    return '';
  }

  private getEndpoint(): string {
    const endpoint =
      this.config.apiHost ||
      this.getEnvVar('AZURE_OPENAI_ENDPOINT') ||
      '';
    if (!endpoint) {
      throw new ProviderError(
        'Azure OpenAI endpoint not configured. Set AZURE_OPENAI_ENDPOINT environment variable.',
        ProviderErrorType.CONFIGURATION,
        this.id
      );
    }
    // Remove trailing slash
    return endpoint.replace(/\/+$/, '');
  }

  private getDeploymentName(model: string): string {
    return (
      this.config.deploymentName ||
      this.getEnvVar('AZURE_OPENAI_DEPLOYMENT_NAME') ||
      model
    );
  }

  protected getApiKey(): string {
    const key =
      this.config.apiKey ||
      this.getEnvVar('AZURE_OPENAI_API_KEY') ||
      '';
    if (!key) {
      throw new ProviderError(
        'Azure OpenAI API key not configured. Set AZURE_OPENAI_API_KEY environment variable.',
        ProviderErrorType.AUTHENTICATION,
        this.id
      );
    }
    return key;
  }

  private getApiVersion(): string {
    return '2024-12-01-preview';
  }

  // ─── Build Azure URL ────────────────────────────────────────────────────────

  private buildAzureUrl(model: string, stream: boolean): string {
    const endpoint = this.getEndpoint();
    const deployment = this.getDeploymentName(model);
    const apiVersion = this.getApiVersion();
    const action = stream ? 'chat/completions' : 'chat/completions';
    return `${endpoint}/openai/deployments/${deployment}/${action}?api-version=${apiVersion}`;
  }

  // ─── Chat (Non-Streaming) ───────────────────────────────────────────────────

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();
    const apiKey = this.getApiKey();

    try {
      const body = this.buildRequestBody(request);
      body.stream = false;

      // Remove model from body — Azure uses deployment name in URL
      delete (body as any).model;

      const url = this.buildAzureUrl(request.model, false);

      const response = await this.withRetry(async () => {
        return this.makeRequest(url, {
          method: 'POST',
          body: JSON.stringify(body),
          headers: {
            'api-key': apiKey,
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
    const apiKey = this.getApiKey();

    const body = this.buildRequestBody({ ...request, stream: true });
    body.stream = true;
    body.stream_options = { include_usage: true };
    delete (body as any).model;

    const url = this.buildAzureUrl(request.model, true);

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
          headers: {
            'api-key': apiKey,
            'Content-Type': 'application/json',
          },
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
            parsed.error.message || 'Azure stream error',
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

        if (delta?.reasoning_content || delta?.reasoning) {
          yield {
            type: 'thinking',
            content: delta.reasoning_content || delta.reasoning,
          };
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
      const endpoint = this.getEndpoint();
      const apiVersion = this.getApiVersion();
      const deployment = this.getDeploymentName('gpt-4o');

      const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

      const response = await this.makeRequest(
        url,
        {
          method: 'POST',
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 5,
          }),
          headers: {
            'api-key': apiKey,
            'Content-Type': 'application/json',
          },
        },
        30000
      );

      const data = await response.json() as Record<string, unknown>;
      return !!(data.choices || data.id);
    } catch {
      return false;
    }
  }

  // ─── List Models ────────────────────────────────────────────────────────────

  async listModels(): Promise<string[]> {
    if (this.config.models && this.config.models.length > 0) {
      return this.config.models;
    }

    // Azure uses deployments, not models. Try to list deployments.
    try {
      const apiKey = this.getApiKey();
      const endpoint = this.getEndpoint();
      const apiVersion = this.getApiVersion();

      const url = `${endpoint}/openai/models?api-version=${apiVersion}`;

      const response = await this.makeRequest(url, {
        method: 'GET',
        headers: {
          'api-key': apiKey,
        },
      });

      const data = await response.json() as Record<string, any>;
      if (data.data && Array.isArray(data.data)) {
        return data.data.map((m: any) => m.id).sort();
      }
    } catch {
      // Fall back
    }

    return [...AZURE_OPENAI_MODELS];
  }
}
