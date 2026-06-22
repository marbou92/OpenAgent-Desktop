/**
 * OpenAgent-Desktop — Direct OpenAI-Compatible Chat Stream (Phase 9.7)
 *
 * Bypasses the AI SDK's streamText() and sends the HTTP request directly
 * to the provider's /chat/completions endpoint. This is how opencode
 * (github.com/anomalyco/opencode) does it — and it's the reason tools
 * work reliably there.
 *
 * The AI SDK v4's @ai-sdk/openai-compatible package adds wrapping layers
 * (jsonSchema(), tool() helper, etc.) that some models (especially
 * DeepSeek) don't handle correctly. The model either:
 *   1. Doesn't receive the tool definitions properly → falls back to
 *      emitting tool calls as text (DSML, XML, code blocks)
 *   2. Receives them but the SDK doesn't parse the response correctly
 *
 * By sending the raw HTTP request with tools as `{ type: "function",
 * function: { name, description, parameters: rawJsonSchema } }`, the
 * model receives proper OpenAI-compatible tool definitions and responds
 * with native `tool_calls` in the SSE stream — which we parse directly.
 *
 * Flow:
 *   1. Build the request body (messages, tools, system prompt, etc.)
 *   2. POST to /chat/completions with stream: true
 *   3. Parse the SSE stream chunk by chunk
 *   4. For each chunk:
 *      - text content → yield 'content'
 *      - reasoning_content → yield 'thinking'
 *      - tool_calls → yield 'tool_call_start'/'tool_call_delta'/'tool_call_end'
 *   5. When tool_calls are complete, the caller executes them and sends
 *      the results back as a new message for the next iteration.
 */

import { AuthProvider, StreamChunk } from './opencode-types';

export interface DirectToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // Raw JSON Schema — NOT wrapped with jsonSchema()
  execute?: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface DirectStreamOptions {
  auth: AuthProvider;
  baseUrl: string;
  model: string;
  messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>;
  systemPrompt?: string;
  tools?: DirectToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  thinkingEffort?: string;
  signal?: AbortSignal;
  providerOptions?: Record<string, unknown>;
}

/**
 * Stream a chat completion directly via HTTP, bypassing the AI SDK.
 * Yields StreamChunk objects compatible with the existing chat-engine.
 */
export async function* directChatStream(opts: DirectStreamOptions): AsyncGenerator<StreamChunk> {
  const { auth, baseUrl, model, messages, systemPrompt, tools, temperature, maxTokens, signal, providerOptions } = opts;

  // Build the request body — raw OpenAI Chat Completions format.
  const body: Record<string, unknown> = {
    model,
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...messages,
    ],
    stream: true,
    stream_options: { include_usage: true },
  };

  if (tools && tools.length > 0) {
    body.tools = tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters, // Raw JSON Schema — no wrapping!
      },
    }));
    body.tool_choice = 'auto';
  }

  if (temperature !== undefined) body.temperature = temperature;
  if (maxTokens !== undefined) body.max_tokens = maxTokens;

  // Merge provider-specific options (e.g. reasoning_effort for DeepSeek).
  if (providerOptions) {
    Object.assign(body, flattenProviderOptions(providerOptions));
  }

  // Build the URL.
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions';

  // Build headers.
  const apiKey = auth.type === 'api' ? auth.key :
                 auth.type === 'oauth' ? auth.access :
                 auth.type === 'wellknown' ? auth.token : '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  console.info(`[DirectStream] POST ${url} (model=${model}, tools=${tools?.length || 0})`);

  // Send the request.
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status} from ${url}: ${errorText}`);
  }

  if (!response.body) {
    throw new Error('No response body from ' + url);
  }

  // Parse the SSE stream.
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulatedContent = '';
  let accumulatedThinking = '';
  // Tool call accumulation — OpenAI streams tool arguments across multiple deltas.
  const toolCallAccumulators = new Map<number, { id: string; name: string; arguments: string }>();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines (separated by \n\n).
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last incomplete line in the buffer.

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue; // Skip empty lines + comments.
        if (!trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6); // Remove "data: " prefix.
        if (data === '[DONE]') {
          // Flush any accumulated tool calls.
          for (const [, tc] of toolCallAccumulators) {
            let parsedArgs: Record<string, unknown> = {};
            try {
              parsedArgs = tc.arguments ? JSON.parse(tc.arguments) : {};
            } catch {
              // Arguments might be incomplete or malformed.
              console.warn(`[DirectStream] Failed to parse tool args for ${tc.name}:`, tc.arguments);
            }
            yield {
              type: 'tool_call_end',
              toolCall: {
                id: tc.id,
                name: tc.name,
                arguments: parsedArgs,
              },
            } as StreamChunk;
          }
          toolCallAccumulators.clear();

          // Yield reasoning-to-content fallback (same as chat-engine).
          if (!accumulatedContent.trim() && accumulatedThinking.trim()) {
            yield { type: 'content', content: accumulatedThinking } as StreamChunk;
          }
          yield { type: 'done' } as StreamChunk;
          return;
        }

        // Parse the JSON chunk.
        let chunk: any;
        try {
          chunk = JSON.parse(data);
        } catch {
          continue; // Skip malformed JSON.
        }

        // Process choices.
        const choices = chunk.choices || [];
        for (const choice of choices) {
          const delta = choice.delta;
          if (!delta) continue;

          // Text content.
          if (delta.content) {
            accumulatedContent += delta.content;
            yield { type: 'content', content: delta.content } as StreamChunk;
          }

          // Reasoning content (DeepSeek, OpenCode Zen, etc.).
          if (delta.reasoning_content) {
            accumulatedThinking += delta.reasoning_content;
            yield { type: 'thinking', content: delta.reasoning_content } as StreamChunk;
          }

          // Tool calls — accumulate arguments across deltas.
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index ?? 0;
              if (!toolCallAccumulators.has(index)) {
                // First delta for this tool call — yield a start event.
                toolCallAccumulators.set(index, {
                  id: tc.id || `call-${Date.now()}-${index}`,
                  name: tc.function?.name || '',
                  arguments: '',
                });
                yield {
                  type: 'tool_call_start',
                  toolCall: {
                    id: tc.id || `call-${Date.now()}-${index}`,
                    name: tc.function?.name || '',
                  },
                } as StreamChunk;
              }

              const acc = toolCallAccumulators.get(index)!;
              if (tc.function?.name) acc.name = tc.function.name;
              if (tc.function?.arguments) {
                acc.arguments += tc.function.arguments;
                yield {
                  type: 'tool_call_delta',
                  toolCall: { id: acc.id, arguments: tc.function.arguments },
                } as StreamChunk;
              }
            }
          }
        }

        // Usage info.
        if (chunk.usage) {
          yield {
            type: 'usage',
            usage: {
              promptTokens: chunk.usage.prompt_tokens || 0,
              completionTokens: chunk.usage.completion_tokens || 0,
            },
          } as StreamChunk;
        }

        // Phase 10.3: Flush tool calls when finish_reason is 'tool_calls'.
        // Some providers send finish_reason in a chunk BEFORE [DONE].
        // If we wait for [DONE], the renderer may have already finalized
        // the message and won't render the tool call card.
        if (choices[0]?.finish_reason === 'tool_calls' && toolCallAccumulators.size > 0) {
          for (const [, tc] of toolCallAccumulators) {
            let parsedArgs: Record<string, unknown> = {};
            try {
              parsedArgs = tc.arguments ? JSON.parse(tc.arguments) : {};
            } catch {
              console.warn(`[DirectStream] Failed to parse tool args for ${tc.name}:`, tc.arguments);
            }
            yield {
              type: 'tool_call_end',
              toolCall: {
                id: tc.id,
                name: tc.name,
                arguments: parsedArgs,
              },
            } as StreamChunk;
          }
          toolCallAccumulators.clear();
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // If we didn't get a [DONE] event, yield done anyway.
  yield { type: 'done' } as StreamChunk;
}

/**
 * Flatten provider options into top-level body fields.
 * e.g. { 'openai-compatible': { reasoningEffort: 'high' } }
 *   → { reasoning_effort: 'high' }
 */
function flattenProviderOptions(opts: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const [, value] of Object.entries(opts)) {
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        // Convert camelCase to snake_case (reasoningEffort → reasoning_effort).
        const snakeKey = k.replace(/([A-Z])/g, '_$1').toLowerCase();
        flat[snakeKey] = v;
      }
    }
  }
  return flat;
}
