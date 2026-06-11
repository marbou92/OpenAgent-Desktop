/**
 * OpenAgent-Desktop - Base Provider
 * Abstract base class implementing ProviderInterface with:
 * - SSE stream parsing
 * - Retry logic with exponential backoff
 * - Rate limiting
 * - Error handling with typed errors
 * - Prompt caching support detection
 * - Token counting estimation
 * - Request/response logging
 */

import {
  ProviderConfig,
  ProviderInterface,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  ToolCall,
  TokenUsage,
  Message,
  ProviderError,
  ProviderErrorType,
  SSEEvent,
  RateLimitInfo,
  RequestLogEntry,
  ProviderType,
  HealthStatus,
} from './types';

// ─── Token Estimation Constants ────────────────────────────────────────────────

const CHARS_PER_TOKEN = 4;
const TOOL_CALL_OVERHEAD_TOKENS = 20;
const SYSTEM_MESSAGE_OVERHEAD_TOKENS = 10;

// ─── Retry Configuration ───────────────────────────────────────────────────────

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableStatusCodes: [429, 500, 502, 503, 504],
};

// ─── Rate Limiter ──────────────────────────────────────────────────────────────

class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private queue: Array<{ resolve: () => void }> = [];

  constructor(
    private maxTokens: number,
    private refillRateMs: number
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens > 0) {
      this.tokens -= 1;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push({ resolve });
    });
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = Math.floor(elapsed / this.refillRateMs);
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
      while (this.tokens > 0 && this.queue.length > 0) {
        this.tokens -= 1;
        const next = this.queue.shift();
        next?.resolve();
      }
    }
  }
}

// ─── Request Logger ────────────────────────────────────────────────────────────

class RequestLogger {
  private logs: RequestLogEntry[] = [];
  private maxLogs: number = 1000;

  log(entry: Omit<RequestLogEntry, 'id' | 'timestamp'>): RequestLogEntry {
    const full: RequestLogEntry = {
      ...entry,
      id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };
    this.logs.push(full);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
    return full;
  }

  getRecent(count: number = 50): RequestLogEntry[] {
    return this.logs.slice(-count);
  }

  getByProvider(providerId: string, count: number = 50): RequestLogEntry[] {
    return this.logs
      .filter((l) => l.providerId === providerId)
      .slice(-count);
  }

  getErrorRate(providerId: string, windowMs: number = 300000): number {
    const cutoff = Date.now() - windowMs;
    const relevant = this.logs.filter(
      (l) => l.providerId === providerId && l.timestamp >= cutoff
    );
    if (relevant.length === 0) return 0;
    const errors = relevant.filter((l) => !l.success).length;
    return errors / relevant.length;
  }

  clear(): void {
    this.logs = [];
  }
}

// ─── Abstract Base Provider ────────────────────────────────────────────────────

export abstract class BaseProvider implements ProviderInterface {
  readonly id: string;
  readonly config: ProviderConfig;

  protected rateLimiter: RateLimiter;
  protected requestLogger: RequestLogger;
  protected retryConfig: RetryConfig;
  protected rateLimitInfo?: RateLimitInfo;
  protected abortController?: AbortController;

  private static globalLogger: RequestLogger = new RequestLogger();

  constructor(config: ProviderConfig, retryConfig?: Partial<RetryConfig>) {
    this.id = config.id;
    this.config = config;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
    this.rateLimiter = new RateLimiter(10, 1000);
    this.requestLogger = BaseProvider.globalLogger;
  }

  // ─── Abstract Methods ──────────────────────────────────────────────────────

  abstract chat(request: ChatRequest): Promise<ChatResponse>;
  abstract chatStream(request: ChatRequest): AsyncGenerator<StreamChunk>;
  abstract test(): Promise<boolean>;
  abstract listModels(): Promise<string[]>;

  // ─── Authentication ────────────────────────────────────────────────────────

  protected getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const { type, apiKey, customHeaders } = this.config;

    switch (type) {
      case ProviderType.anthropic:
        headers['x-api-key'] = apiKey || '';
        headers['anthropic-version'] = '2023-06-01';
        break;
      case ProviderType.openai:
      case ProviderType.openrouter:
      case ProviderType.groq:
      case ProviderType.mistral:
      case ProviderType.perplexity:
      case ProviderType.novita:
      case ProviderType.avian:
      case ProviderType.futurmix:
      case ProviderType.routstr:
      case ProviderType.saladcloud:
      case ProviderType.scaleway:
      case ProviderType.venice:
      case ProviderType.cerebras:
      case ProviderType.xai:
      case ProviderType.litellm:
      case ProviderType.atomic_chat:
      case ProviderType.custom_openai:
      case ProviderType.databricks:
      case ProviderType.near_ai:
      case ProviderType.ovhcloud:
      case ProviderType.tetrate:
      case ProviderType.chatgpt_codex:
        headers['Authorization'] = `Bearer ${apiKey || ''}`;
        break;
      case ProviderType.opencode:
        // OpenCode uses HTTP Basic Auth; handled in OpenCodeProvider.
        break;
      case ProviderType.azure_openai:
        headers['api-key'] = apiKey || '';
        break;
      case ProviderType.gemini:
        // Gemini uses query param auth; handled in provider
        break;
      case ProviderType.gcp_vertex:
        // Vertex uses OAuth2; handled in provider
        break;
      case ProviderType.amazon_bedrock:
      case ProviderType.amazon_sagemaker:
        // AWS SigV4; handled in provider
        break;
      case ProviderType.ollama:
      case ProviderType.ollama_cloud:
      case ProviderType.lm_studio:
      case ProviderType.docker_model_runner:
      case ProviderType.ramalama:
        // May not require auth or uses optional Bearer token
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
        break;
      case ProviderType.github_copilot:
        // OAuth token; handled in provider
        headers['Authorization'] = `Bearer ${apiKey || ''}`;
        break;
      case ProviderType.vmware_tanzu:
        headers['Authorization'] = `Bearer ${apiKey || ''}`;
        break;
      case ProviderType.snowflake:
        headers['Authorization'] = `Bearer ${apiKey || ''}`;
        break;
      default:
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
        break;
    }

    if (this.config.organization) {
      headers['OpenAI-Organization'] = this.config.organization;
    }

    if (customHeaders) {
      Object.assign(headers, customHeaders);
    }

    return headers;
  }

  protected getBaseUrl(): string {
    const host =
      this.config.apiHost ||
      this.getDefaultHost();
    const basePath =
      this.config.apiBasePath ||
      this.getDefaultBasePath();
    return `${host}${basePath}`;
  }

  protected abstract getDefaultHost(): string;
  protected abstract getDefaultBasePath(): string;

  // ─── SSE Parsing ───────────────────────────────────────────────────────────

  protected async *parseSSEStream(
    response: Response
  ): AsyncGenerator<SSEEvent> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new ProviderError(
        'Response body is not readable',
        ProviderErrorType.STREAM_PARSE,
        this.id
      );
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';

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
            currentEvent = trimmed.slice(6).trim();
          } else if (trimmed.startsWith('data:')) {
            const data = trimmed.slice(5).trim();
            if (data === '[DONE]') {
              return;
            }
            yield {
              event: currentEvent || undefined,
              data,
            };
            currentEvent = '';
          } else if (trimmed.startsWith('id:')) {
            // SSE event ID — consumed but not yielded separately
          } else if (trimmed.startsWith('retry:')) {
            // Retry hint from server
          } else if (trimmed === '') {
            // End of event — reset
            currentEvent = '';
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        const remaining = buffer.trim();
        if (remaining.startsWith('data:')) {
          const data = remaining.slice(5).trim();
          if (data !== '[DONE]') {
            yield {
              event: currentEvent || undefined,
              data,
            };
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ─── Retry Logic ───────────────────────────────────────────────────────────

  protected async withRetry<T>(
    fn: () => Promise<T>,
    isRetryable?: (error: Error) => boolean
  ): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === this.retryConfig.maxRetries) {
          break;
        }

        const shouldRetry =
          isRetryable?.(lastError) ?? this.isRetryableError(lastError);

        if (!shouldRetry) {
          break;
        }

        const delay = this.calculateBackoff(attempt);
        await this.sleep(delay);
      }
    }
    throw lastError;
  }

  protected isRetryableError(error: Error): boolean {
    if (error instanceof ProviderError) {
      if (error.retryable) return true;
      if (
        error.type === ProviderErrorType.RATE_LIMIT ||
        error.type === ProviderErrorType.SERVER_ERROR ||
        error.type === ProviderErrorType.NETWORK ||
        error.type === ProviderErrorType.TIMEOUT
      ) {
        return true;
      }
      if (
        error.statusCode &&
        this.retryConfig.retryableStatusCodes.includes(error.statusCode)
      ) {
        return true;
      }
      return false;
    }
    // Network-level errors
    const message = error.message.toLowerCase();
    if (
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('etimedout') ||
      message.includes('socket hang up') ||
      message.includes('network') ||
      message.includes('fetch failed')
    ) {
      return true;
    }
    return false;
  }

  protected calculateBackoff(attempt: number): number {
    const jitter = Math.random() * 0.3 + 0.85;
    const delay =
      this.retryConfig.baseDelayMs *
      Math.pow(this.retryConfig.backoffMultiplier, attempt) *
      jitter;
    return Math.min(delay, this.retryConfig.maxDelayMs);
  }

  // ─── Rate Limiting ─────────────────────────────────────────────────────────

  protected async acquireRateLimit(): Promise<void> {
    await this.rateLimiter.acquire();
  }

  protected updateRateLimitFromHeaders(headers: Headers): void {
    const remaining = headers.get('x-ratelimit-remaining');
    const limit = headers.get('x-ratelimit-limit');
    const reset = headers.get('x-ratelimit-reset');

    if (remaining && limit) {
      this.rateLimitInfo = {
        remaining: parseInt(remaining, 10),
        limit: parseInt(limit, 10),
        resetAt: reset ? parseInt(reset, 10) * 1000 : Date.now() + 60000,
      };
    }
  }

  // ─── HTTP Request Helper ───────────────────────────────────────────────────

  protected async makeRequest(
    url: string,
    options: RequestInit,
    timeoutMs: number = 120000
  ): Promise<Response> {
    await this.acquireRateLimit();

    this.abortController = new AbortController();
    const timeoutId = setTimeout(
      () => this.abortController?.abort(),
      timeoutMs
    );

    try {
      const mergedOptions: RequestInit = {
        ...options,
        signal: this.abortController.signal,
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
          ...(options.headers as Record<string, string> || {}),
        },
      };

      const response = await fetch(url, mergedOptions);
      this.updateRateLimitFromHeaders(response.headers);

      if (!response.ok) {
        await this.handleHttpError(response);
      }

      return response;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ProviderError(
          'Request timed out',
          ProviderErrorType.TIMEOUT,
          this.id,
          undefined,
          true
        );
      }
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        error instanceof Error ? error.message : String(error),
        ProviderErrorType.NETWORK,
        this.id,
        undefined,
        true,
        error instanceof Error ? error : undefined
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  protected async handleHttpError(response: Response): Promise<never> {
    let body: string;
    try {
      body = await response.text();
    } catch {
      body = '';
    }

    let errorType: ProviderErrorType;
    let retryable = false;

    switch (response.status) {
      case 401:
      case 403:
        errorType = ProviderErrorType.AUTHENTICATION;
        break;
      case 429:
        errorType = ProviderErrorType.RATE_LIMIT;
        retryable = true;
        break;
      case 404:
        errorType = ProviderErrorType.MODEL_NOT_FOUND;
        break;
      case 400:
        errorType = ProviderErrorType.INVALID_REQUEST;
        break;
      case 402:
      case 451:
        errorType = ProviderErrorType.QUOTA_EXCEEDED;
        break;
      default:
        if (response.status >= 500) {
          errorType = ProviderErrorType.SERVER_ERROR;
          retryable = true;
        } else {
          errorType = ProviderErrorType.UNKNOWN;
        }
        break;
    }

    throw new ProviderError(
      `HTTP ${response.status}: ${body || response.statusText}`,
      errorType,
      this.id,
      response.status,
      retryable
    );
  }

  // ─── Token Estimation ──────────────────────────────────────────────────────

  protected estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  protected estimateMessageTokens(message: Message): number {
    let tokens = this.estimateTokens(message.content);

    if (message.role === 'system') {
      tokens += SYSTEM_MESSAGE_OVERHEAD_TOKENS;
    }

    if (message.toolCalls) {
      for (const tc of message.toolCalls) {
        tokens += TOOL_CALL_OVERHEAD_TOKENS;
        tokens += this.estimateTokens(tc.name);
        tokens += this.estimateTokens(JSON.stringify(tc.arguments));
      }
    }

    if (message.toolCallId) {
      tokens += this.estimateTokens(message.toolCallId);
    }

    return tokens;
  }

  protected estimateRequestTokens(request: ChatRequest): number {
    let total = 0;
    for (const msg of request.messages) {
      total += this.estimateMessageTokens(msg);
    }
    if (request.tools) {
      for (const tool of request.tools) {
        total += this.estimateTokens(tool.name);
        total += this.estimateTokens(tool.description);
        total += this.estimateTokens(JSON.stringify(tool.parameters));
      }
    }
    return total;
  }

  // ─── Logging ───────────────────────────────────────────────────────────────

  protected logRequest(
    model: string,
    durationMs: number,
    streamed: boolean,
    usage?: TokenUsage,
    error?: string
  ): void {
    this.requestLogger.log({
      providerId: this.id,
      providerType: this.config.type,
      model,
      durationMs,
      promptTokens: usage?.promptTokens,
      completionTokens: usage?.completionTokens,
      success: !error,
      error,
      streamed,
    });
  }

  // ─── Thinking Trace Extraction ─────────────────────────────────────────────

  protected extractThinking(content: string): {
    thinking: string;
    response: string;
  } {
    const thinkingMatch = content.match(
      /<thinking>([\s\S]*?)<\/thinking>/i
    );
    if (thinkingMatch) {
      return {
        thinking: thinkingMatch[1].trim(),
        response: content.replace(thinkingMatch[0], '').trim(),
      };
    }
    return { thinking: '', response: content };
  }

  // ─── Prompt Caching Detection ──────────────────────────────────────────────

  protected supportsPromptCaching(): boolean {
    const cachingProviders: ProviderType[] = [
      ProviderType.anthropic,
      ProviderType.openai,
      ProviderType.gemini,
      ProviderType.openrouter,
    ];
    return cachingProviders.includes(this.config.type);
  }

  // ─── Utility Methods ───────────────────────────────────────────────────────

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  protected truncateForLog(text: string, maxLength: number = 500): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...[truncated]';
  }

  // ─── Cancel ────────────────────────────────────────────────────────────────

  cancel(): void {
    this.abortController?.abort();
  }

  // ─── Health Check ──────────────────────────────────────────────────────────

  async healthCheck(): Promise<{
    status: HealthStatus;
    latencyMs: number;
    error?: string;
  }> {
    const start = Date.now();
    try {
      const isHealthy = await this.test();
      const latencyMs = Date.now() - start;
      return {
        status: isHealthy ? HealthStatus.healthy : HealthStatus.unhealthy,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - start;
      return {
        status: HealthStatus.unhealthy,
        latencyMs,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ─── Environment Variable Helpers ──────────────────────────────────────────

  protected getEnvVar(name: string): string | undefined {
    if (typeof process !== 'undefined' && process.env) {
      return process.env[name];
    }
    return undefined;
  }

  protected getApiKeyFromEnv(envVarName: string): string | undefined {
    return this.config.apiKey || this.getEnvVar(envVarName);
  }
}

export { RateLimiter, RequestLogger, DEFAULT_RETRY_CONFIG };
export type { RetryConfig };
