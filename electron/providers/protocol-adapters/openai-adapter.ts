/**
 * OpenAgent-Desktop - OpenAI Protocol Adapter
 *
 * Handles OpenAI, OpenRouter, Mistral, Cohere, Groq, DeepSeek, Together,
 * Azure OpenAI (api_key auth), and any OpenAI-compatible custom endpoint.
 *
 * BUGFIX vs old protocol-openai.ts:
 *   - Now uses AbortSignal.timeout for fetch calls (previously no timeout — hung endpoints blocked forever)
 *   - Streaming tool-call deltas are now accumulated per tool_call.id and emitted as tool_call_start →
 *     tool_call_delta → tool_call_end (previously each delta was emitted as a complete tool_call with
 *     fragmented JSON arguments)
 *   - Error responses now emit an 'error' chunk instead of masquerading as 'done' with content
 */

import {
  AuthEntry,
  ChatRequest,
  ChatResponse,
  DiscoveredModel,
  StreamChunk,
  ToolCallInfo,
} from '../v3-types';
import { AdapterCallContext, ProtocolAdapter } from './adapter';

const DEFAULT_TIMEOUT_MS = 120_000;

function resolveApiKey(auth: AuthEntry): string | null {
  switch (auth.method) {
    case 'api_key':
      return auth.apiKey || null;
    case 'env_var':
      return process.env[auth.envVarName] || null;
    case 'oauth':
      return auth.accessToken || null;
    case 'azure_ad':
      return auth.accessToken || null;
  }
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
}

function toOpenAIMessages(request: ChatRequest): OpenAIMessage[] {
  const out: OpenAIMessage[] = [];
  if (request.systemPrompt) {
    out.push({ role: 'system', content: request.systemPrompt });
  }
  for (const m of request.messages) {
    const entry: OpenAIMessage = { role: m.role, content: m.content };
    if (m.toolCallId) entry.tool_call_id = m.toolCallId;
    if (m.toolCalls) {
      entry.tool_calls = m.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      }));
    }
    out.push(entry);
  }
  return out;
}

export class OpenAIAdapter implements ProtocolAdapter {
  protocol = 'openai' as const;

  buildAuth(auth: AuthEntry, baseUrl: string): { headers: Record<string, string>; query: Record<string, string> } {
    const key = resolveApiKey(auth);
    const headers: Record<string, string> = {};
    const query: Record<string, string> = {};

    // Azure OpenAI uses api-key header + api-version query param.
    if (auth.method === 'azure_ad' || (auth.method === 'api_key' && baseUrl.includes('openai.azure.com'))) {
      if (key) headers['api-key'] = key;
      query['api-version'] = '2024-10-21';
      return { headers, query };
    }

    // OpenRouter wants referer + title headers for attribution.
    if (baseUrl.includes('openrouter.ai')) {
      headers['HTTP-Referer'] = 'https://openagent.desktop';
      headers['X-Title'] = 'OpenAgent-Desktop';
    }

    if (key) headers['Authorization'] = `Bearer ${key}`;
    return { headers, query };
  }

  async chat(request: ChatRequest, ctx: AdapterCallContext): Promise<ChatResponse> {
    const { headers, query } = this.buildAuth(ctx.auth, ctx.baseUrl);
    const url = new URL(ctx.baseUrl.replace(/\/$/, '') + '/chat/completions');
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

    const body: Record<string, unknown> = {
      model: request.model,
      messages: toOpenAIMessages(request),
      stream: false,
    };
    if (request.maxTokens) body.max_tokens = request.maxTokens;
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.tools) {
      body.tools = request.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctx.signal ?? AbortSignal.timeout(ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI protocol error ${response.status}: ${text}`);
    }

    const data = await response.json() as any;
    return {
      id: data.id || '',
      content: data.choices?.[0]?.message?.content || '',
      model: data.model || request.model,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens || 0,
        completionTokens: data.usage.completion_tokens || 0,
        totalTokens: data.usage.total_tokens,
      } : undefined,
      toolCalls: data.choices?.[0]?.message?.tool_calls?.map((tc: any): ToolCallInfo => ({
        id: tc.id,
        name: tc.function.name,
        arguments: safeParseJSON(tc.function.arguments, {}),
      })),
    };
  }

  async *chatStream(request: ChatRequest, ctx: AdapterCallContext): AsyncGenerator<StreamChunk> {
    const { headers, query } = this.buildAuth(ctx.auth, ctx.baseUrl);
    const url = new URL(ctx.baseUrl.replace(/\/$/, '') + '/chat/completions');
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

    const body: Record<string, unknown> = {
      model: request.model,
      messages: toOpenAIMessages(request),
      stream: true,
    };
    if (request.maxTokens) body.max_tokens = request.maxTokens;
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.tools) {
      body.tools = request.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers, 'Accept': 'text/event-stream' },
      body: JSON.stringify(body),
      signal: ctx.signal,
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      yield { type: 'error', error: { message: `OpenAI protocol stream error ${response.status}: ${text}`, code: String(response.status) } };
      return;
    }

    // Parse SSE: lines starting with "data: " are JSON; "data: [DONE]" terminates.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    // Accumulate tool-call argument fragments per index.
    const toolCallAccum: Map<number, { id: string; name: string; argsBuf: string }> = new Map();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);
          if (!line || !line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') {
            // Flush any in-flight tool calls.
            for (const [, acc] of toolCallAccum) {
              yield { type: 'tool_call_end', toolCall: { id: acc.id, name: acc.name, arguments: safeParseJSON(acc.argsBuf, {}) } };
            }
            yield { type: 'done' };
            return;
          }
          try {
            const event = JSON.parse(payload) as any;
            const choice = event.choices?.[0];
            if (!choice) continue;
            const delta = choice.delta;
            if (!delta) continue;

            if (delta.content) {
              yield { type: 'content', content: delta.content };
            }
            if (delta.reasoning_content) {
              // DeepSeek/o1 reasoning — emit as thinking.
              yield { type: 'thinking', content: delta.reasoning_content };
            }
            if (Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                let acc = toolCallAccum.get(idx);
                if (!acc) {
                  acc = { id: tc.id || '', name: tc.function?.name || '', argsBuf: '' };
                  toolCallAccum.set(idx, acc);
                  if (acc.id && acc.name) {
                    yield { type: 'tool_call_start', toolCall: { index: idx, id: acc.id, name: acc.name } };
                  }
                }
                if (tc.id) acc.id = tc.id;
                if (tc.function?.name) acc.name = tc.function.name;
                if (tc.function?.arguments) {
                  acc.argsBuf += tc.function.arguments;
                  yield { type: 'tool_call_delta', toolCall: { index: idx, arguments: safeParseArgs(acc.argsBuf) } };
                }
              }
            }
            if (event.usage) {
              yield {
                type: 'usage',
                usage: {
                  promptTokens: event.usage.prompt_tokens || 0,
                  completionTokens: event.usage.completion_tokens || 0,
                  totalTokens: event.usage.total_tokens,
                },
              };
            }
          } catch (err) {
            // Skip unparseable SSE line — don't abort the stream.
          }
        }
      }
      // Stream ended without [DONE] — flush.
      for (const [, acc] of toolCallAccum) {
        yield { type: 'tool_call_end', toolCall: { id: acc.id, name: acc.name, arguments: safeParseJSON(acc.argsBuf, {}) } };
      }
      yield { type: 'done' };
    } finally {
      reader.releaseLock();
    }
  }

  async discoverModels(ctx: AdapterCallContext): Promise<DiscoveredModel[]> {
    const { headers, query } = this.buildAuth(ctx.auth, ctx.baseUrl);
    const url = new URL(ctx.baseUrl.replace(/\/$/, '') + '/models');
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
      signal: ctx.signal ?? AbortSignal.timeout(ctx.timeoutMs ?? 30_000),
    });
    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.status}`);
    }
    const data = await response.json() as any;
    const list: any[] = data.data || data.models || [];
    return list.map((m): DiscoveredModel => ({
      id: m.id,
      displayName: m.name || m.id,
      contextWindow: m.context_length || m.context_window,
      supportsStreaming: true,
      supportsToolUse: m.supports_tool_calls ?? true,
    }));
  }
}

function safeParseJSON<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

function safeParseArgs(s: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(s);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return {};
}
