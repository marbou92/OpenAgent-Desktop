/**
 * OpenAgent-Desktop - Amazon Bedrock Provider
 * Full implementation:
 * - AWS authentication (profile or access keys)
 * - Bedrock-specific message format
 * - Support for Claude, Jurassic-2, etc. via Bedrock
 * - AWS SigV4 auth signing
 * - SSE streaming via Bedrock invokeWithResponseStream
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
import { webcrypto } from 'crypto';
const subtleCrypto = webcrypto.subtle;

// ─── Bedrock Models ────────────────────────────────────────────────────────────

export const BEDROCK_MODELS = [
  'anthropic.claude-4-20250514-v1:0',
  'anthropic.claude-sonnet-4-20250514-v1:0',
  'anthropic.claude-3-7-sonnet-20250219-v1:0',
  'anthropic.claude-3-5-sonnet-20241022-v2:0',
  'anthropic.claude-3-5-haiku-20241022-v1:0',
  'anthropic.claude-3-opus-20240229-v1:0',
  'anthropic.claude-3-haiku-20240307-v1:0',
  'amazon.nova-pro-v1:0',
  'amazon.nova-lite-v1:0',
  'amazon.nova-micro-v1:0',
  'amazon.titan-text-premier-v1:0',
  'ai21.jamba-1-5-mini-v1:0',
  'ai21.jamba-1-5-large-v1:0',
  'cohere.command-r-v1:0',
  'cohere.command-r-plus-v1:0',
  'meta.llama3-1-405b-instruct-v1:0',
  'meta.llama3-1-70b-instruct-v1:0',
  'meta.llama3-1-8b-instruct-v1:0',
  'mistral.mistral-large-2407-v1:0',
  'mistral.mixtral-8x7b-instruct-v0:1',
] as const;

// ─── AWS SigV4 Signing ─────────────────────────────────────────────────────────

interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

class AwsSigV4Signer {
  private readonly algorithm = 'AWS4-HMAC-SHA256';
  private readonly service = 'bedrock';

  constructor(
    private credentials: AwsCredentials,
    private region: string
  ) {}

  async sign(
    method: string,
    url: URL,
    headers: Record<string, string>,
    body: string
  ): Promise<Record<string, string>> {
    const now = new Date();
    const dateStamp = this.formatDate(now);
    const amzDate = this.formatAmzDate(now);

    const signedHeaders: string[] = ['content-type', 'host', 'x-amz-date'];
    if (this.credentials.sessionToken) {
      signedHeaders.push('x-amz-security-token');
    }

    const canonicalHeaders = this.buildCanonicalHeaders(
      headers,
      signedHeaders,
      amzDate
    );
    const signedHeadersStr = signedHeaders.join(';');

    const credentialScope = `${dateStamp}/${this.region}/${this.service}/aws4_request`;
    const payloadHash = await this.sha256Hex(body);

    const canonicalRequest = [
      method,
      url.pathname,
      url.search,
      canonicalHeaders,
      '',
      signedHeadersStr,
      payloadHash,
    ].join('\n');

    const stringToSign = [
      this.algorithm,
      amzDate,
      credentialScope,
      await this.sha256Hex(canonicalRequest),
    ].join('\n');

    const signingKey = await this.getSigningKey(dateStamp);
    const signature = await this.hmacHex(signingKey, stringToSign);

    const authHeader = `${this.algorithm} Credential=${this.credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`;

    const result: Record<string, string> = {
      ...headers,
      'x-amz-date': amzDate,
      Authorization: authHeader,
    };

    if (this.credentials.sessionToken) {
      result['x-amz-security-token'] = this.credentials.sessionToken;
    }

    return result;
  }

  private async getSigningKey(dateStamp: string): Promise<ArrayBuffer> {
    const kDate = await this.hmac(
      `AWS4${this.credentials.secretAccessKey}`,
      dateStamp
    );
    const kRegion = await this.hmac(kDate, this.region);
    const kService = await this.hmac(kRegion, this.service);
    return this.hmac(kService, 'aws4_request');
  }

  private async hmac(key: string | ArrayBuffer, data: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    const keyData =
      typeof key === 'string' ? encoder.encode(key) : key;
    const cryptoKey = await subtleCrypto.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    return subtleCrypto.sign('HMAC', cryptoKey, encoder.encode(data));
  }

  private async hmacHex(key: ArrayBuffer, data: string): Promise<string> {
    const sig = await this.hmac(key, data);
    return this.arrayBufferToHex(sig);
  }

  private async sha256Hex(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const hash = await subtleCrypto.digest(
      'SHA-256',
      encoder.encode(data)
    );
    return this.arrayBufferToHex(hash);
  }

  private arrayBufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private buildCanonicalHeaders(
    headers: Record<string, string>,
    signedHeaders: string[],
    amzDate: string
  ): string {
    const all: Record<string, string> = {
      ...headers,
      'x-amz-date': amzDate,
    };
    if (this.credentials.sessionToken) {
      all['x-amz-security-token'] = this.credentials.sessionToken;
    }

    return signedHeaders
      .map((h) => `${h}:${all[h]?.trim() || ''}`)
      .join('\n') + '\n';
  }

  private formatDate(d: Date): string {
    return d.toISOString().replace(/[-:]/g, '').slice(0, 8);
  }

  private formatAmzDate(d: Date): string {
    return d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '')
      .replace(/Z$/, 'Z');
  }
}

// ─── Bedrock Provider ──────────────────────────────────────────────────────────

export class AmazonBedrockProvider extends BaseProvider {
  private signer: AwsSigV4Signer;

  constructor(config: ProviderConfig) {
    super(config, {
      maxRetries: 3,
      baseDelayMs: 1000,
      retryableStatusCodes: [429, 500, 502, 503, 504],
    });
    this.signer = new AwsSigV4Signer(
      this.getCredentials(),
      this.getRegion()
    );
  }

  protected getDefaultHost(): string {
    const region = this.getRegion();
    return `https://bedrock-runtime.${region}.amazonaws.com`;
  }

  protected getDefaultBasePath(): string {
    return '';
  }

  private getRegion(): string {
    return (
      this.config.region ||
      this.getEnvVar('AWS_REGION') ||
      this.getEnvVar('AWS_DEFAULT_REGION') ||
      'us-east-1'
    );
  }

  private getCredentials(): AwsCredentials {
    const accessKeyId =
      this.config.apiKey ||
      this.getEnvVar('AWS_ACCESS_KEY_ID') ||
      '';
    const secretAccessKey =
      this.config.customHeaders?.['aws_secret_access_key'] ||
      this.getEnvVar('AWS_SECRET_ACCESS_KEY') ||
      '';
    const sessionToken =
      this.getEnvVar('AWS_SESSION_TOKEN') || undefined;

    if (!accessKeyId || !secretAccessKey) {
      throw new ProviderError(
        'AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.',
        ProviderErrorType.AUTHENTICATION,
        this.id
      );
    }

    return { accessKeyId, secretAccessKey, sessionToken };
  }

  private getModelId(model: string): string {
    return model;
  }

  // ─── Build Invoke URL ───────────────────────────────────────────────────────

  private buildInvokeUrl(model: string, stream: boolean): string {
    const base = this.getBaseUrl();
    const modelId = encodeURIComponent(this.getModelId(model));
    if (stream) {
      return `${base}/model/${modelId}/invoke-with-response-stream`;
    }
    return `${base}/model/${modelId}/invoke`;
  }

  // ─── Convert Messages to Bedrock/Anthropic Format ───────────────────────────

  private convertToAnthropicFormat(messages: Message[]): {
    system?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: any }>;
  } {
    const systemMessages: string[] = [];
    const result: Array<{ role: 'user' | 'assistant'; content: any }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemMessages.push(msg.content);
        continue;
      }

      if (msg.role === 'tool') {
        // Convert tool result to user message
        result.push({
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

      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        const content: any[] = [];
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        for (const tc of msg.toolCalls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          });
        }
        result.push({ role: 'assistant', content });
        continue;
      }

      result.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    return {
      system: systemMessages.join('\n\n') || undefined,
      messages: result,
    };
  }

  // ─── Build Request Body ─────────────────────────────────────────────────────

  private buildRequestBody(request: ChatRequest): Record<string, any> {
    const { system, messages } = this.convertToAnthropicFormat(
      request.messages
    );

    const body: Record<string, any> = {
      anthropic_version: 'bedrock-2023-05-31',
      messages,
      max_tokens: request.maxTokens || 4096,
    };

    if (system) {
      body.system = system;
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    return body;
  }

  // ─── Parse Bedrock Response ─────────────────────────────────────────────────

  private parseResponse(data: any): ChatResponse {
    const content = data.content || [];
    let textContent = '';
    const toolCalls: ToolCall[] = [];

    for (const block of content) {
      if (block.type === 'text') {
        textContent += block.text || '';
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
    };
  }

  // ─── Sign Request ───────────────────────────────────────────────────────────

  private async signRequest(
    method: string,
    url: string,
    body: string
  ): Promise<Record<string, string>> {
    const parsedUrl = new URL(url);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      host: parsedUrl.host,
    };
    return this.signer.sign(method, parsedUrl, headers, body);
  }

  // ─── Chat (Non-Streaming) ───────────────────────────────────────────────────

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();

    try {
      const body = this.buildRequestBody(request);
      const url = this.buildInvokeUrl(request.model, false);
      const bodyStr = JSON.stringify(body);
      const signedHeaders = await this.signRequest('POST', url, bodyStr);

      const response = await this.withRetry(async () => {
        return fetch(url, {
          method: 'POST',
          headers: signedHeaders,
          body: bodyStr,
        });
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new ProviderError(
          `Bedrock error ${response.status}: ${errorBody}`,
          response.status === 403
            ? ProviderErrorType.AUTHENTICATION
            : response.status === 429
              ? ProviderErrorType.RATE_LIMIT
              : ProviderErrorType.SERVER_ERROR,
          this.id,
          response.status,
          response.status >= 500 || response.status === 429
        );
      }

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
    const url = this.buildInvokeUrl(request.model, true);
    const bodyStr = JSON.stringify(body);
    const signedHeaders = await this.signRequest('POST', url, bodyStr);

    let usage: TokenUsage | undefined;
    let currentToolCall: Partial<ToolCall> | null = null;
    let currentToolCallInput = '';

    try {
      const response = await this.withRetry(async () => {
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            ...signedHeaders,
            Accept: 'text/event-stream',
          },
          body: bodyStr,
        });
        if (!resp.ok) {
          const errorBody = await resp.text();
          throw new ProviderError(
            `Bedrock stream error ${resp.status}: ${errorBody}`,
            ProviderErrorType.SERVER_ERROR,
            this.id,
            resp.status,
            true
          );
        }
        return resp;
      });

      for await (const event of this.parseSSEStream(response)) {
        let parsed: any;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          continue;
        }

        const chunk = parsed;

        if (chunk.bytes) {
          let decoded: any;
          try {
            const bytes = atob(chunk.bytes);
            const uint8 = new Uint8Array(bytes.length);
            for (let i = 0; i < bytes.length; i++) {
              uint8[i] = bytes.charCodeAt(i);
            }
            decoded = JSON.parse(new TextDecoder().decode(uint8));
          } catch {
            continue;
          }

          if (decoded.type === 'content_block_delta') {
            const delta = decoded.delta;
            if (delta?.type === 'text_delta') {
              yield { type: 'content', content: delta.text };
            } else if (delta?.type === 'input_json_delta') {
              currentToolCallInput += delta.partial_json || '';
            }
          } else if (decoded.type === 'content_block_start') {
            const block = decoded.content_block;
            if (block?.type === 'tool_use') {
              currentToolCall = {
                id: block.id,
                name: block.name,
              };
              currentToolCallInput = '';
            }
          } else if (decoded.type === 'content_block_stop') {
            if (currentToolCall) {
              let args: Record<string, any> = {};
              try {
                args = JSON.parse(currentToolCallInput || '{}');
              } catch {
                args = {};
              }
              yield {
                type: 'tool_call',
                toolCall: {
                  id: currentToolCall.id || this.generateId(),
                  name: currentToolCall.name || '',
                  arguments: args,
                },
              };
              currentToolCall = null;
              currentToolCallInput = '';
            }
          } else if (decoded.type === 'message_delta') {
            if (decoded.usage) {
              usage = {
                promptTokens: decoded.usage.input_tokens || 0,
                completionTokens: decoded.usage.output_tokens || 0,
                totalTokens:
                  (decoded.usage.input_tokens || 0) +
                  (decoded.usage.output_tokens || 0),
              };
              yield { type: 'usage', usage };
            }
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
      const body = JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
      });
      const url = this.buildInvokeUrl(
        'anthropic.claude-3-haiku-20240307-v1:0',
        false
      );
      const signedHeaders = await this.signRequest('POST', url, body);

      const response = await fetch(url, {
        method: 'POST',
        headers: signedHeaders,
        body,
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
    return [...BEDROCK_MODELS];
  }
}
