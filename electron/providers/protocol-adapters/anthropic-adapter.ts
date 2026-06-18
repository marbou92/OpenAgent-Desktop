/**
 * OpenAgent-Desktop - Anthropic Protocol Adapter
 *
 * Handles Anthropic and Vertex AI's Claude models (when called via the
 * Anthropic-compatible Vertex endpoint).
 *
 * BUGFIX vs old protocol-anthropic.ts:
 *   - Now correctly parses the content_block_start / content_block_delta /
 *     content_block_stop sequence for tool_use (previously looked for a
 *     nonexistent 'tool_use' event type — tool calls were never parsed)
 *   - Prompt token usage is now correctly extracted from message_start
 *     (previously hardcoded to 0)
 *   - AbortSignal.timeout used for non-stream calls
 *   - Error responses emit 'error' chunks
 */

import {
  AuthProvider,
  ChatRequest,
  ChatResponse,
  DiscoveredModel,
  StreamChunk,
  ToolCallInfo,
} from '../opencode-types';
import { AdapterCallContext, ProtocolAdapter } from './adapter';

const DEFAULT_TIMEOUT_MS = 120_000;
const ANTHROPIC_VERSION = '2023-06-01';

function resolveApiKey(auth: AuthProvider): string | null {
  switch (auth.type) {
    case 'api':
      return auth.key || null;
    case 'oauth':
      return auth.access || null;
    case 'wellknown':
      return auth.token || null;
  }
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

function toAnthropicMessages(request: ChatRequest): { system: string | undefined; messages: AnthropicMessage[] } {
  const messages: AnthropicMessage[] = [];
  let system: string | undefined;

  if (request.systemPrompt) {
    system = request.systemPrompt;
  }
  for (const m of request.messages) {
    if (m.role === 'system') {
      // Merge into the system prompt (Anthropic only supports one).
      system = system ? `${system}\n\n${m.content}` : m.content;
      continue;
    }
    if (m.role === 'tool') {
      // Tool results are part of the user turn in Anthropic's format.
      messages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content }],
      });
      continue;
    }
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      const blocks: AnthropicContentBlock[] = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls) {
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments });
      }
      messages.push({ role: 'assistant', content: blocks });
      continue;
    }
    messages.push({ role: m.role as 'user' | 'assistant', content: m.content });
  }
  return { system, messages };
}

export class AnthropicAdapter implements ProtocolAdapter {
  protocol = 'anthropic' as const;

  buildAuth(auth: AuthProvider, _baseUrl: string): { headers: Record<string, string>; query: Record<string, string> } {
    const key = resolveApiKey(auth);
    const headers: Record<string, string> = {
      'anthropic-version': ANTHROPIC_VERSION,
    };
    if (key) headers['x-api-key'] = key;
    return { headers, query: {} };
  }

  async chat(request: ChatRequest, ctx: AdapterCallContext): Promise<ChatResponse> {
    const { headers } = this.buildAuth(ctx.auth, ctx.baseUrl);
    const { system, messages } = toAnthropicMessages(request);
    const body: Record<string, unknown> = {
      model: request.model,
      messages,
      max_tokens: request.maxTokens ?? 4096,
      stream: false,
    };
    if (system) body.system = system;
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.tools) {
      body.tools = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const response = await fetch(ctx.baseUrl.replace(/\/$/, '') + '/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctx.signal ?? AbortSignal.timeout(ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic protocol error ${response.status}: ${text}`);
    }
    const data = await response.json() as any;

    let content = '';
    const toolCalls: ToolCallInfo[] = [];
    for (const block of data.content || []) {
      if (block.type === 'text') content += block.text;
      else if (block.type === 'tool_use') {
        toolCalls.push({ id: block.id, name: block.name, arguments: block.input || {} });
      }
    }
    return {
      id: data.id || '',
      content,
      model: data.model || request.model,
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens || 0,
        completionTokens: data.usage.output_tokens || 0,
      } : undefined,
      toolCalls: toolCalls.length ? toolCalls : undefined,
    };
  }

  async *chatStream(request: ChatRequest, ctx: AdapterCallContext): AsyncGenerator<StreamChunk> {
    const { headers } = this.buildAuth(ctx.auth, ctx.baseUrl);
    const { system, messages } = toAnthropicMessages(request);
    const body: Record<string, unknown> = {
      model: request.model,
      messages,
      max_tokens: request.maxTokens ?? 4096,
      stream: true,
    };
    if (system) body.system = system;
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.tools) {
      body.tools = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const response = await fetch(ctx.baseUrl.replace(/\/$/, '') + '/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers, 'Accept': 'text/event-stream' },
      body: JSON.stringify(body),
      signal: ctx.signal,
    });
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      yield { type: 'error', error: { message: `Anthropic stream error ${response.status}: ${text}`, code: String(response.status) } };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    // Per-content-block state. Anthropic streams content_block_start,
    // then content_block_delta (many), then content_block_stop.
    const blocks: Map<number, { type: string; id?: string; name?: string; argsBuf: string; textBuf: string }> = new Map();

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
          if (!payload) continue;
          try {
            const event = JSON.parse(payload) as any;
            switch (event.type) {
              case 'message_start': {
                if (event.message?.usage) {
                  yield {
                    type: 'usage',
                    usage: {
                      promptTokens: event.message.usage.input_tokens || 0,
                      completionTokens: 0, // emitted later in message_delta
                    },
                  };
                }
                break;
              }
              case 'content_block_start': {
                const idx = event.index ?? 0;
                const block = event.content_block;
                blocks.set(idx, {
                  type: block?.type || 'text',
                  id: block?.id,
                  name: block?.name,
                  argsBuf: '',
                  textBuf: '',
                });
                if (block?.type === 'tool_use' && block.id && block.name) {
                  yield { type: 'tool_call_start', toolCall: { index: idx, id: block.id, name: block.name } };
                }
                break;
              }
              case 'content_block_delta': {
                const idx = event.index ?? 0;
                const block = blocks.get(idx);
                if (!block) break;
                const delta = event.delta;
                if (delta?.type === 'text_delta' && delta.text) {
                  block.textBuf += delta.text;
                  yield { type: 'content', content: delta.text };
                } else if (delta?.type === 'thinking_delta' && delta.thinking) {
                  yield { type: 'thinking', content: delta.thinking };
                } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
                  block.argsBuf += delta.partial_json;
                  yield { type: 'tool_call_delta', toolCall: { index: idx, arguments: safeParseArgs(block.argsBuf) } };
                }
                break;
              }
              case 'content_block_stop': {
                const idx = event.index ?? 0;
                const block = blocks.get(idx);
                if (block && block.type === 'tool_use') {
                  yield {
                    type: 'tool_call_end',
                    toolCall: {
                      index: idx,
                      id: block.id,
                      name: block.name,
                      arguments: safeParseJSON(block.argsBuf, {}),
                    },
                  };
                }
                blocks.delete(idx);
                break;
              }
              case 'message_delta': {
                if (event.usage) {
                  yield {
                    type: 'usage',
                    usage: {
                      promptTokens: 0, // already emitted in message_start
                      completionTokens: event.usage.output_tokens || 0,
                    },
                  };
                }
                break;
              }
              case 'message_stop': {
                yield { type: 'done' };
                return;
              }
              case 'error': {
                yield { type: 'error', error: { message: event.error?.message || 'Unknown Anthropic stream error', code: event.error?.type } };
                return;
              }
            }
          } catch {
            // skip unparseable
          }
        }
      }
      yield { type: 'done' };
    } finally {
      reader.releaseLock();
    }
  }

  async discoverModels(ctx: AdapterCallContext): Promise<DiscoveredModel[]> {
    const { headers } = this.buildAuth(ctx.auth, ctx.baseUrl);
    const response = await fetch(ctx.baseUrl.replace(/\/$/, '') + '/v1/models', {
      method: 'GET',
      headers,
      signal: ctx.signal ?? AbortSignal.timeout(ctx.timeoutMs ?? 30_000),
    });
    if (!response.ok) {
      throw new Error(`Failed to list Anthropic models: ${response.status}`);
    }
    const data = await response.json() as any;
    const list: any[] = data.data || [];
    return list.map((m): DiscoveredModel => ({
      id: m.id,
      displayName: m.display_name || m.id,
      contextWindow: m.context_window,
      supportsStreaming: true,
      supportsToolUse: true,
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
