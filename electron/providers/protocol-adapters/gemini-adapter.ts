/**
 * OpenAgent-Desktop - Gemini Protocol Adapter
 *
 * Handles Google Gemini (generativelanguage.googleapis.com) and custom
 * Gemini-compatible endpoints.
 *
 * BUGFIX vs old protocol-gemini.ts:
 *   - System prompt is now actually sent via systemInstruction
 *     (previously extracted but never put on the request body — system
 *     prompts were silently dropped for custom Gemini providers)
 *   - API key is sent via x-goog-api-key header instead of ?key= URL param
 *     (prevents leakage in proxy logs)
 *   - AbortSignal.timeout used for non-stream calls
 *   - Stream chunks correctly parsed from the gemini streaming format
 */

import {
  AuthProvider,
  ChatRequest,
  ChatResponse,
  DiscoveredModel,
  StreamChunk,
  ToolCallInfo,
  ToolDefinition,
} from '../opencode-types';
import { AdapterCallContext, ProtocolAdapter } from './adapter';

/** Convert ChatMessage.content (string | array) to a plain string for non-multi-modal adapters. */
function _contentToString(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.filter((p: any) => p.type === "text").map((p: any) => p.text).join("");
  return "";
}

const DEFAULT_TIMEOUT_MS = 120_000;

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

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

function toGeminiContents(request: ChatRequest): { systemInstruction: string | undefined; contents: GeminiContent[] } {
  let systemInstruction: string | undefined;
  const contents: GeminiContent[] = [];

  if (request.systemPrompt) systemInstruction = request.systemPrompt;

  for (const m of request.messages) {
    if (m.role === 'system') {
      systemInstruction = systemInstruction ? `${systemInstruction}\n\n${(m.content as string)}` : (m.content as string);
      continue;
    }
    if (m.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: m.toolCallId || 'tool', response: { result: (m.content as string) } } }],
      });
      continue;
    }
    if (m.role === 'assistant') {
      const parts: GeminiPart[] = [];
      if ((m.content as string)) parts.push({ text: (m.content as string) });
      if (m.toolCalls) {
        for (const tc of m.toolCalls) {
          parts.push({ functionCall: { name: tc.name, args: tc.arguments } });
        }
      }
      contents.push({ role: 'model', parts });
      continue;
    }
    contents.push({ role: 'user', parts: [{ text: (m.content as string) }] });
  }
  return { systemInstruction, contents };
}

function geminiTools(tools: ToolDefinition[] | undefined): { functionDeclarations: { name: string; description: string; parameters: Record<string, unknown> }[] } | undefined {
  if (!tools || tools.length === 0) return undefined;
  return {
    functionDeclarations: tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  };
}

export class GeminiAdapter implements ProtocolAdapter {
  protocol = 'gemini' as const;

  buildAuth(auth: AuthProvider, _baseUrl: string): { headers: Record<string, string>; query: Record<string, string> } {
    const key = resolveApiKey(auth);
    const headers: Record<string, string> = {};
    if (key) headers['x-goog-api-key'] = key; // header, not URL param — safer
    return { headers, query: {} };
  }

  async chat(request: ChatRequest, ctx: AdapterCallContext): Promise<ChatResponse> {
    const { headers } = this.buildAuth(ctx.auth, ctx.baseUrl);
    const { systemInstruction, contents } = toGeminiContents(request);
    const model = request.model;
    const url = `${ctx.baseUrl.replace(/\/$/, '')}/v1beta/models/${model}:generateContent`;

    const body: Record<string, unknown> = { contents };
    if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
    if (request.maxTokens) body.generationConfig = { maxOutputTokens: request.maxTokens };
    if (request.temperature !== undefined) {
      body.generationConfig = { ...(body.generationConfig as object || {}), temperature: request.temperature };
    }
    const tools = geminiTools(request.tools);
    if (tools) body.tools = [tools];

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctx.signal ?? AbortSignal.timeout(ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini protocol error ${response.status}: ${text}`);
    }
    const data = await response.json() as any;
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    let content = '';
    const toolCalls: ToolCallInfo[] = [];
    for (const part of parts) {
      if (part.text) content += part.text;
      if (part.functionCall) {
        toolCalls.push({ id: `call_${toolCalls.length}`, name: part.functionCall.name, arguments: part.functionCall.args || {} });
      }
    }
    return {
      id: data.responseId || '',
      content,
      model,
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount || 0,
        completionTokens: data.usageMetadata.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata.totalTokenCount,
      } : undefined,
      toolCalls: toolCalls.length ? toolCalls : undefined,
    };
  }

  async *chatStream(request: ChatRequest, ctx: AdapterCallContext): AsyncGenerator<StreamChunk> {
    const { headers } = this.buildAuth(ctx.auth, ctx.baseUrl);
    const { systemInstruction, contents } = toGeminiContents(request);
    const model = request.model;
    const url = `${ctx.baseUrl.replace(/\/$/, '')}/v1beta/models/${model}:streamGenerateContent?alt=sse`;

    const body: Record<string, unknown> = { contents };
    if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
    if (request.maxTokens) body.generationConfig = { maxOutputTokens: request.maxTokens };
    if (request.temperature !== undefined) {
      body.generationConfig = { ...(body.generationConfig as object || {}), temperature: request.temperature };
    }
    const tools = geminiTools(request.tools);
    if (tools) body.tools = [tools];

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers, 'Accept': 'text/event-stream' },
      body: JSON.stringify(body),
      signal: ctx.signal,
    });
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      yield { type: 'error', error: { message: `Gemini stream error ${response.status}: ${text}`, code: String(response.status) } };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let toolCallIdx = 0;
    const inFlightTools: Map<number, { id: string; name: string }> = new Map();

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
            const candidate = event.candidates?.[0];
            const parts = candidate?.content?.parts || [];
            for (const part of parts) {
              if (part.text) yield { type: 'content', content: part.text };
              if (part.functionCall) {
                const idx = toolCallIdx++;
                const id = `call_${idx}`;
                const name = part.functionCall.name;
                inFlightTools.set(idx, { id, name });
                yield { type: 'tool_call_start', toolCall: { index: idx, id, name } };
                yield { type: 'tool_call_delta', toolCall: { index: idx, arguments: part.functionCall.args || {} } };
                yield { type: 'tool_call_end', toolCall: { index: idx, id, name, arguments: part.functionCall.args || {} } };
                inFlightTools.delete(idx);
              }
            }
            if (event.usageMetadata) {
              yield {
                type: 'usage',
                usage: {
                  promptTokens: event.usageMetadata.promptTokenCount || 0,
                  completionTokens: event.usageMetadata.candidatesTokenCount || 0,
                  totalTokens: event.usageMetadata.totalTokenCount,
                },
              };
            }
          } catch {
            // skip
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
    const response = await fetch(`${ctx.baseUrl.replace(/\/$/, '')}/v1beta/models`, {
      method: 'GET',
      headers,
      signal: ctx.signal ?? AbortSignal.timeout(ctx.timeoutMs ?? 30_000),
    });
    if (!response.ok) {
      throw new Error(`Failed to list Gemini models: ${response.status}`);
    }
    const data = await response.json() as any;
    const list: any[] = data.models || [];
    return list
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m): DiscoveredModel => ({
        id: m.name?.replace(/^models\//, '') || m.name,
        displayName: m.displayName,
        contextWindow: m.inputTokenLimit,
        supportsStreaming: m.supportedGenerationMethods?.includes('streamGenerateContent') ?? true,
        supportsToolUse: m.supportedGenerationMethods?.includes('generateContent') ?? true,
      }));
  }
}
