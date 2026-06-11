/**
 * OpenAgent-Desktop - GitHub Copilot Provider
 * Full implementation:
 * - Device flow OAuth authentication
 * - Models from OpenAI, Anthropic, Google via Copilot infra
 * - No manual API key needed
 * - Token management with refresh
 * - Copilot-specific API format
 */

import {
  ProviderConfig,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  TokenUsage,
  Message,
  ProviderError,
  ProviderErrorType,
} from './types';
import { BaseProvider } from './base-provider';

// ─── Copilot Models ────────────────────────────────────────────────────────────

export const COPILOT_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'o1',
  'o1-mini',
  'o3-mini',
  'claude-3.5-sonnet',
  'claude-3-opus',
  'claude-3-haiku',
  'gemini-2.0-flash',
  'gemini-1.5-pro',
  'gpt-4',
  'gpt-4-turbo',
] as const;

// ─── OAuth Types ───────────────────────────────────────────────────────────────

interface CopilotToken {
  token: string;
  expiresAt: number;
  endpoints: {
    api: string;
    ['origin-tracker']: string;
    [key: string]: string;
  };
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface DeviceTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  error?: string;
  error_description?: string;
}

// ─── GitHub Copilot Provider ───────────────────────────────────────────────────

export class GitHubCopilotProvider extends BaseProvider {
  private static readonly CLIENT_ID = 'Iv1.b507a08c87ecfe98';
  private static readonly DEVICE_CODE_URL =
    'https://github.com/login/device/code';
  private static readonly TOKEN_URL =
    'https://github.com/login/oauth/access_token';
  private static readonly COPILOT_API_URL =
    'https://api.githubcopilot.com';

  private copilotToken?: CopilotToken;
  private githubToken?: string;
  private tokenRefreshPromise?: Promise<CopilotToken>;

  constructor(config: ProviderConfig) {
    super(config, {
      maxRetries: 3,
      baseDelayMs: 1000,
      retryableStatusCodes: [429, 500, 502, 503, 504],
    });
    this.githubToken =
      config.apiKey || this.getEnvVar('GITHUB_COPILOT_TOKEN') || '';
  }

  protected getDefaultHost(): string {
    return GitHubCopilotProvider.COPILOT_API_URL;
  }

  protected getDefaultBasePath(): string {
    return '';
  }

  // ─── Device Flow OAuth ──────────────────────────────────────────────────────

  async startDeviceFlow(): Promise<{
    userCode: string;
    verificationUri: string;
  }> {
    const response = await fetch(GitHubCopilotProvider.DEVICE_CODE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: `client_id=${GitHubCopilotProvider.CLIENT_ID}&scope=user:email`,
    });

    if (!response.ok) {
      throw new ProviderError(
        'Failed to start device flow',
        ProviderErrorType.AUTHENTICATION,
        this.id
      );
    }

    const data = await response.json() as DeviceCodeResponse;
    return {
      userCode: data.user_code,
      verificationUri: data.verification_uri,
    };
  }

  async pollForToken(deviceCode: string): Promise<string> {
    const maxAttempts = 60;
    const interval = 5000;

    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(interval);

      const response = await fetch(GitHubCopilotProvider.TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: `client_id=${GitHubCopilotProvider.CLIENT_ID}&device_code=${deviceCode}&grant_type=urn:ietf:params:oauth:grant-type:device_code`,
      });

      const data = await response.json() as DeviceTokenResponse;

      if (data.error === 'authorization_pending') {
        continue;
      }

      if (data.error === 'slow_down') {
        await this.sleep(5000);
        continue;
      }

      if (data.error === 'expired_token') {
        throw new ProviderError(
          'Device flow expired. Please try again.',
          ProviderErrorType.AUTHENTICATION,
          this.id
        );
      }

      if (data.error === 'access_denied') {
        throw new ProviderError(
          'Access denied by user.',
          ProviderErrorType.AUTHENTICATION,
          this.id
        );
      }

      if (data.access_token) {
        this.githubToken = data.access_token;
        return data.access_token;
      }
    }

    throw new ProviderError(
      'Device flow timed out',
      ProviderErrorType.AUTHENTICATION,
      this.id
    );
  }

  // ─── Get Copilot Token ──────────────────────────────────────────────────────

  async getCopilotToken(): Promise<CopilotToken> {
    // Return cached token if still valid
    if (this.copilotToken && Date.now() < this.copilotToken.expiresAt) {
      return this.copilotToken;
    }

    // Deduplicate refresh requests
    if (this.tokenRefreshPromise) {
      return this.tokenRefreshPromise;
    }

    this.tokenRefreshPromise = this.refreshCopilotToken();
    try {
      const token = await this.tokenRefreshPromise;
      return token;
    } finally {
      this.tokenRefreshPromise = undefined;
    }
  }

  private async refreshCopilotToken(): Promise<CopilotToken> {
    if (!this.githubToken) {
      throw new ProviderError(
        'GitHub token not available. Complete device flow authentication first.',
        ProviderErrorType.AUTHENTICATION,
        this.id
      );
    }

    const response = await fetch(
      'https://api.github.com/copilot_internal/v2/token',
      {
        method: 'GET',
        headers: {
          Authorization: `token ${this.githubToken}`,
          Accept: 'application/json',
          'Editor-Version': 'OpenAgent-Desktop/1.0',
          'Editor-Plugin-Version': 'OpenAgent-Copilot/1.0',
        },
      }
    );

    if (!response.ok) {
      throw new ProviderError(
        `Failed to get Copilot token: ${response.status}`,
        ProviderErrorType.AUTHENTICATION,
        this.id,
        response.status
      );
    }

    const data = await response.json() as Record<string, any>;
    this.copilotToken = {
      token: data.token,
      expiresAt: (data.expires_at || 0) * 1000,
      endpoints: data.endpoints || {
        api: GitHubCopilotProvider.COPILOT_API_URL,
      },
    };

    return this.copilotToken;
  }

  // ─── Convert Messages ───────────────────────────────────────────────────────

  private convertMessages(messages: Message[]): Array<any> {
    const result: Array<any> = [];

    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        result.push({
          role: 'assistant',
          content: msg.content || null,
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
      n: 1,
    };

    if (request.maxTokens !== undefined) {
      body.max_tokens = request.maxTokens;
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    // Copilot-specific headers in the request
    body.intent = 'conversation-panel';

    return body;
  }

  // ─── Build Request Headers ──────────────────────────────────────────────────

  private async getRequestHeaders(): Promise<Record<string, string>> {
    const token = await this.getCopilotToken();
    return {
      Authorization: `Bearer ${token.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Editor-Version': 'OpenAgent-Desktop/1.0',
      'Editor-Plugin-Version': 'OpenAgent-Copilot/1.0',
      'Copilot-Integration-Id': 'vscode-chat',
      'Openai-Organization': 'github-copilot',
      'Openai-Intent': 'conversation-panel',
    };
  }

  // ─── Parse Response ─────────────────────────────────────────────────────────

  private parseResponse(data: any): ChatResponse {
    const choice = data.choices?.[0];
    if (!choice) {
      throw new ProviderError(
        'No choices in Copilot response',
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
      message.toolCalls = responseMessage.tool_calls.map((tc: any) => {
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
      });
    }

    const usage: TokenUsage | undefined = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens || 0,
          completionTokens: data.usage.completion_tokens || 0,
          totalTokens: data.usage.total_tokens || 0,
        }
      : undefined;

    return {
      id: data.id || this.generateId(),
      message,
      usage,
    };
  }

  // ─── Chat (Non-Streaming) ───────────────────────────────────────────────────

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();

    try {
      const body = this.buildRequestBody(request);
      const headers = await this.getRequestHeaders();
      const token = await this.getCopilotToken();
      const apiBase = token.endpoints.api || GitHubCopilotProvider.COPILOT_API_URL;
      const url = `${apiBase}/chat/completions`;

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
      if (
        error instanceof ProviderError &&
        error.type === ProviderErrorType.AUTHENTICATION
      ) {
        // Token might have expired, try to refresh
        try {
          this.copilotToken = undefined;
          const body = this.buildRequestBody(request);
          const headers = await this.getRequestHeaders();
          const token = await this.getCopilotToken();
          const apiBase = token.endpoints.api || GitHubCopilotProvider.COPILOT_API_URL;
          const url = `${apiBase}/chat/completions`;

          const response = await this.makeRequest(url, {
            method: 'POST',
            body: JSON.stringify(body),
            headers,
          });

          const data = await response.json();
          const result = this.parseResponse(data);

          this.logRequest(request.model, Date.now() - startTime, false, result.usage);
          return result;
        } catch {
          // Throw original error
        }
      }

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
    const headers = await this.getRequestHeaders();
    const token = await this.getCopilotToken();
    const apiBase = token.endpoints.api || GitHubCopilotProvider.COPILOT_API_URL;
    const url = `${apiBase}/chat/completions`;

    const pendingToolCalls: Map<
      number,
      { id: string; name: string; arguments: string }
    > = new Map();
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
          continue;
        }

        if (parsed.error) {
          throw new ProviderError(
            parsed.error.message || 'Copilot stream error',
            ProviderErrorType.SERVER_ERROR,
            this.id,
            undefined,
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
      if (!this.githubToken) {
        return false;
      }

      const token = await this.getCopilotToken();
      const apiBase = token.endpoints.api || GitHubCopilotProvider.COPILOT_API_URL;

      const response = await fetch(`${apiBase}/models`, {
        method: 'GET',
        headers: await this.getRequestHeaders(),
      });

      return response.ok;
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
      const token = await this.getCopilotToken();
      const apiBase = token.endpoints.api || GitHubCopilotProvider.COPILOT_API_URL;
      const headers = await this.getRequestHeaders();

      const response = await this.makeRequest(`${apiBase}/models`, {
        method: 'GET',
        headers,
      });

      const data = await response.json() as Record<string, any>;
      if (data.data && Array.isArray(data.data)) {
        return data.data.map((m: any) => m.id).sort();
      }
    } catch {
      // Fall back
    }

    return [...COPILOT_MODELS];
  }

  // ─── Authentication State ───────────────────────────────────────────────────

  isAuthenticated(): boolean {
    return !!this.githubToken;
  }

  getGithubToken(): string | undefined {
    return this.githubToken;
  }

  setGithubToken(token: string): void {
    this.githubToken = token;
    this.copilotToken = undefined;
  }
}
