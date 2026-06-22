/**
 * OpenAgent-Desktop - AI SDK Chat Engine
 *
 * The core chat engine built on the Vercel AI SDK. Replaces the old
 * AgentRunner + protocol adapter approach with a single unified path:
 *
 *   streamText() for streaming chat + agent loops
 *   generateText() for non-streaming (recipes, etc.)
 *
 * The AI SDK handles:
 *   - Real-time token streaming (text-delta parts)
 *   - Tool-call accumulation (no manual JSON fragment parsing)
 *   - Multi-step agent loops (maxSteps, stopWhen)
 *   - Multi-modal content (images, files)
 *   - Token usage tracking
 *   - Retries with backoff
 *
 * Tools are defined with execute() handlers that wrap permission checks
 * + the tool executor. The SDK calls execute() automatically when the LLM
 * requests a tool call.
 */

import * as crypto from 'crypto';
import { AuthProvider, ChatRequest, ChatResponse, StreamChunk, ProviderDefinition } from './opencode-types';
import { AuthStore } from './auth-store-v2';
import { OpencodeConfig } from './opencode-config';
import { getOpencodeRegistry } from './opencode-registry';
import { loadAiSdk, isAiSdkAvailable, createSdkModel, createSdkEmbeddingModel, getStreamText, getGenerateText, getGenerateObject, getStreamObject, getEmbed, getEmbedMany, getJsonSchema } from './ai-sdk-loader';
import { getAdapterForProvider, AdapterCallContext } from './protocol-adapters';
import { directChatStream, DirectToolDefinition } from './direct-chat-stream';

// AI SDK loading state.
let _aiSdkLoaded = false;

async function ensureAiSdk(): Promise<boolean> {
  if (_aiSdkLoaded) return isAiSdkAvailable();
  _aiSdkLoaded = true;
  return loadAiSdk();
}

/**
 * Phase 4.2: Build provider-specific options for thinking effort / reasoning.
 *
 * Maps a UI effort level ('off'|'low'|'medium'|'high'|'max') to the
 * provider-specific options the AI SDK expects:
 *
 *   OpenAI (o1/o3/gpt-4o-reasoning):
 *     { openai: { reasoningEffort: 'low'|'medium'|'high' } }
 *
 *   Anthropic (Claude 3.5+):
 *     { anthropic: { thinking: { budgetTokens: N } } }
 *     Off=0, Low=5000, Medium=16000, High=32000, Max=64000
 *
 *   Google (Gemini 2.0+):
 *     { google: { thinkingConfig: { thinkingBudget: N } } }
 *     Off=0, Low=2048, Medium=8192, High=16384, Max=32768
 *
 *   OpenAI-compatible (DeepSeek, OpenCode Zen, etc.):
 *     { 'openai-compatible': { reasoningEffort: 'low'|'medium'|'high' } }
 *     (the adapter sends this as `reasoning_effort` in the request body)
 *
 * 'off' returns an empty object — no providerOptions are passed, so the
 * model uses its default behavior (which for reasoning models may still
 * include some reasoning).
 */
export function buildThinkingProviderOptions(
  providerId: string,
  effort: string | undefined
): Record<string, unknown> | undefined {
  if (!effort || effort === 'off') return undefined;

  // Map UI levels to OpenAI's 3-level system.
  // Phase 8.4: 'extended' maps to 'high' for OpenAI (they don't have a
  // higher tier), but the caller also bumps maxTokens + maxSteps when
  // effort === 'extended' (see getExtendedThinkingBoost()).
  const openaiEffortMap: Record<string, string> = {
    low: 'low',
    medium: 'medium',
    high: 'high',
    max: 'high',      // OpenAI only has 3 levels; 'max' maps to 'high'
    extended: 'high', // Phase 8.4: 'extended' also maps to 'high' for OpenAI
  };

  // Map UI levels to Anthropic budget tokens.
  // Phase 8.4: 'extended' uses 128K — double the 'max' budget. This is
  // the sweet spot for hard multi-step problems where the model needs
  // to reason through several iterations before committing to an answer.
  const anthropicBudgetMap: Record<string, number> = {
    low: 5000,
    medium: 16000,
    high: 32000,
    max: 64000,
    extended: 128000,
  };

  // Map UI levels to Google thinking budget.
  // Phase 8.4: 'extended' uses 65536 — double the 'max' budget.
  const googleBudgetMap: Record<string, number> = {
    low: 2048,
    medium: 8192,
    high: 16384,
    max: 32768,
    extended: 65536,
  };

  const provider = providerId.toLowerCase();

  // OpenAI native
  if (provider === 'openai' || provider === 'azure') {
    const mapped = openaiEffortMap[effort];
    if (!mapped) return undefined;
    return { openai: { reasoningEffort: mapped } };
  }

  // Anthropic
  if (provider === 'anthropic') {
    const budget = anthropicBudgetMap[effort];
    if (!budget) return undefined;
    return { anthropic: { thinking: { budgetTokens: budget } } };
  }

  // Google / Gemini
  if (provider === 'google' || provider === 'google-vertex' || provider === 'gemini' || provider === 'gemini-oauth') {
    const budget = googleBudgetMap[effort];
    if (!budget) return undefined;
    return { google: { thinkingConfig: { thinkingBudget: budget } } };
  }

  // OpenAI-compatible providers (DeepSeek, OpenCode Zen, OpenRouter, etc.)
  // The @ai-sdk/openai-compatible package doesn't natively support
  // reasoningEffort via providerOptions — it ignores unknown keys.
  // We pass it via the 'openai-compatible' namespace so that IF a future
  // version of the package adds support, it will work. For now, the
  // reasoning effort is handled by the model's default behavior.
  //
  // Phase 4.5: REMOVED the top-level `reasoningEffort: mapped` key — it
  // was a bare string (not an object) at the top level of providerOptions,
  // which caused the AI SDK's streamText() to throw a validation error.
  // This threw the chat into the adapter fallback path, which doesn't have
  // the reasoning-to-content fallback, causing "thinking but no answer".
  const mapped = openaiEffortMap[effort];
  if (!mapped) return undefined;
  return {
    'openai-compatible': { reasoningEffort: mapped },
  };
}

/**
 * Phase 8.4: Extended Thinking Boost
 *
 * When the user picks "Extended" thinking effort, we don't just bump the
 * reasoning budget — we ALSO boost maxTokens (so the model has room to
 * produce a long answer after thinking) and maxSteps (so the agent loop
 * can iterate more times on hard problems).
 *
 * Returns null for non-extended efforts so callers can skip applying
 * the boost.
 */
export function getExtendedThinkingBoost(effort: string | undefined): { maxTokensBoost: number; maxStepsBoost: number } | null {
  if (effort !== 'extended') return null;
  return {
    // +8K tokens of output room — enough for a substantial code change
    // plus an explanation, even after a long thinking trace.
    maxTokensBoost: 8192,
    // +50 steps — doubles the default 50-step budget for hard multi-step
    // tasks (read 10 files, edit 5, run tests, fix failures, repeat).
    maxStepsBoost: 50,
  };
}

/**
 * Phase 9.7: Extract the raw JSON Schema from a tool's parameters field.
 *
 * The AI SDK wraps schemas with jsonSchema() which produces an object like:
 *   { _type: undefined, jsonSchema: { type: 'object', ... }, validate: fn }
 * We need to extract the raw `jsonSchema` field to send it directly to the
 * provider's API (which expects raw JSON Schema, not the SDK wrapper).
 *
 * If the parameters are already a raw JSON Schema (no wrapping), return as-is.
 */
function extractRawSchema(params: any): Record<string, unknown> {
  if (!params) return { type: 'object', properties: {} };
  // Check if it's a jsonSchema() wrapper (has a `jsonSchema` field).
  if (params.jsonSchema && typeof params.jsonSchema === 'object') {
    return params.jsonSchema;
  }
  // Already a raw JSON Schema — return as-is.
  return params;
}

/**
 * Phase 2.5: Convert an AI SDK / undici error into a human-readable message.
 *
 * The AI SDK often surfaces errors as bare `TypeError('terminated')` or
 * `AI_APICallError` with no useful `.message`. This helper extracts the
 * REAL cause and adds provider/model context so the user can act on it.
 *
 * Common cases:
 *   - undici `TypeError('terminated')` → the upstream connection was closed
 *     mid-stream. Usually means the provider rejected the request (auth,
 *     model not found, rate limit) and closed the SSE stream abruptly.
 *     We surface the HTTP status + response body if available on err.cause.
 *   - `AI_APICallError` → has `.statusCode`, `.responseBody`, `.url`.
 *     We extract the provider's error message from the JSON body.
 *   - `TypeError('Invalid URL')` → the provider's baseURL is missing/empty.
 *   - `TypeError('fetch failed')` → network-level failure (DNS, connection
 *     refused, TLS error). The real cause is on `err.cause`.
 */
function describeError(err: any, providerId: string, modelId: string): string {
  if (!err) return `Unknown error calling ${providerId}/${modelId}`;

  const ctx = `${providerId}/${modelId}`;
  const name = err?.name || '';
  const msg = err?.message || String(err);

  // AI_APICallError — has structured fields. This is the BEST case because
  // we can extract the provider's actual error message.
  if (name === 'AI_APICallError' || err?.statusCode !== undefined) {
    const status = err.statusCode;
    const url = err.url || '';
    const body = err.responseBody || err.data?.error?.message || '';

    // Try to parse the response body as JSON for a cleaner message.
    let bodyMsg = '';
    if (typeof body === 'string') {
      try {
        const parsed = JSON.parse(body);
        bodyMsg = parsed?.error?.message || parsed?.message || parsed?.error || body;
      } catch {
        bodyMsg = body;
      }
    } else if (body && typeof body === 'object') {
      bodyMsg = (body as any)?.error?.message || (body as any)?.message || JSON.stringify(body);
    }

    if (status === 401 || status === 403) {
      return `Authentication failed (${status}) for ${ctx}. ${bodyMsg || 'Check your API key in Settings.'}`.trim();
    }
    if (status === 404) {
      return `Model not found (${status}) for ${ctx}. ${bodyMsg || `The model "${modelId}" may not exist on this provider.`}`.trim();
    }
    if (status === 429) {
      return `Rate limited (429) on ${ctx}. ${bodyMsg || 'Too many requests — wait a moment and retry.'}`.trim();
    }
    if (status && status >= 500) {
      return `${ctx} server error (${status}). ${bodyMsg || 'The provider is having issues — retry in a moment.'}`.trim();
    }
    if (bodyMsg) {
      return `${ctx}: ${bodyMsg}`;
    }
    return `${ctx}: API error${status ? ` (${status})` : ''}${url ? ` at ${url}` : ''}`;
  }

  // undici TypeError('terminated') — the connection was closed mid-stream.
  // The real cause is usually on err.cause (an AI_APICallError or another
  // TypeError with the actual reason).
  if (msg === 'terminated' || msg.includes('terminated')) {
    const cause = err?.cause;
    if (cause) {
      // Recurse on the cause — it usually has the real info.
      const causeMsg = describeError(cause, providerId, modelId);
      if (causeMsg && !causeMsg.includes('terminated')) {
        return causeMsg;
      }
    }
    // No useful cause — give the user an actionable hint.
    return `Connection to ${ctx} was terminated. This usually means the provider rejected the request (check your API key, model name, and account quota).`;
  }

  // TypeError('Invalid URL') — baseURL missing.
  if (msg.includes('Invalid URL') || msg.includes('Failed to parse URL')) {
    return `Cannot reach ${ctx}: no API URL is configured for this provider. Open Settings → Providers and set the base URL, or pick a different provider.`;
  }

  // TypeError('fetch failed') — network error. The real cause is on
  // err.cause (e.g. ENOTFOUND, ECONNREFUSED, ECONNRESET, cert error).
  if (msg === 'fetch failed' || msg.includes('fetch failed')) {
    const cause = err?.cause;
    const causeMsg = cause?.message || cause?.code || '';
    if (causeMsg) {
      return `Network error calling ${ctx}: ${causeMsg}. Check your internet connection and that the provider's API URL is reachable.`;
    }
    return `Network error calling ${ctx}. Check your internet connection and the provider's API URL.`;
  }

  // Default: surface the raw message with context.
  return `${ctx}: ${msg}`;
}

export interface ChatEngineOptions {
  authStore: AuthStore;
  config?: OpencodeConfig;
}

export interface AgentSkillDefinition {
  /** Stable skill ID, e.g. "create-component". */
  id: string;
  /** Human-readable name, e.g. "Create Component". */
  name: string;
  /** What the skill does — shown to the model as the tool description. */
  description: string;
  /** JSON Schema for the skill's input parameters. */
  parameters?: Record<string, unknown>;
  /** Whether the skill is currently enabled. Disabled skills are skipped. */
  enabled?: boolean;
  /** Category for grouping in the UI (coding, writing, data, etc.). */
  category?: string;
}

export interface AgentToolDeps {
  sandboxManager: any;
  workingDirectory: string;
  extensionRegistry?: any;
  /** Phase 8.4: loaded skills (from ~/.claude/skills/ + builtin registry). */
  skills?: AgentSkillDefinition[];
  /** Phase 8.4: callback to actually execute a skill by ID. */
  executeSkill?: (id: string, args: Record<string, unknown>, context: { sessionId: string; workingDir: string }) => Promise<{ success: boolean; output: string; error?: string }>;
  /** Phase 8.4: current session ID — passed to skill executions. */
  sessionId?: string;
}

export interface PermissionChecker {
  checkPermission(toolName: string, args: Record<string, unknown>): 'allow' | 'ask' | 'deny';
  requestPermission(toolName: string, args: Record<string, unknown>): Promise<boolean>;
  /**
   * Phase 8.5: Ask the user a question with multiple-choice options.
   * Returns the user's selected answer (the option label), or null if
   * the user dismissed the dialog without answering.
   *
   * Used by the AskUserQuestion tool. Distinct from requestPermission
   * because the response is a free-form string (the selected option),
   * not a boolean allow/deny.
   */
  requestUserAnswer?(toolName: string, args: Record<string, unknown>): Promise<string | null>;
}

export class ChatEngine {
  constructor(private authStore: AuthStore, private config?: OpencodeConfig) {}

  /**
   * Resolve a qualified model id ("openai/gpt-4o") into an AI SDK model instance.
   */
  resolveModel(qualifiedModelId: string): {
    providerId: string;
    modelId: string;
    provider: ProviderDefinition;
    auth: AuthProvider;
    baseUrl: string;
  } {
    const slashIdx = qualifiedModelId.indexOf('/');
    const providerId = slashIdx >= 0 ? qualifiedModelId.slice(0, slashIdx) : qualifiedModelId;
    const modelId = slashIdx >= 0 ? qualifiedModelId.slice(slashIdx + 1) : '';

    const provider = this.config?.getProvider(providerId) || getOpencodeRegistry().get(providerId);
    if (!provider) throw new Error(`Unknown provider: ${providerId}`);

    const auth = this.authStore.get(providerId);
    if (!auth) {
      // Try env var fallback.
      if (provider.env && provider.env.length > 0) {
        for (const envVar of provider.env) {
          const val = process.env[envVar];
          if (val) {
            return {
              providerId, modelId, provider,
              auth: { type: 'api', key: val },
              baseUrl: provider.options?.baseURL || provider.api || '',
            };
          }
        }
      }
      throw new Error(`Provider '${providerId}' is not configured — no credentials found`);
    }

    const baseUrl = provider.options?.baseURL || provider.api || '';
    return { providerId, modelId, provider, auth, baseUrl };
  }

  /**
   * Non-streaming chat via generateText().
   * Used by recipes and chat:send handler.
   *
   * Phase 2.5: Falls back to the hand-rolled adapters if the AI SDK path
   * throws — same resilience as chatStream().
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const { provider, auth, baseUrl, modelId } = this.resolveModel(request.model);

    // Try AI SDK path.
    const available = await ensureAiSdk();
    if (available) {
      const generateText = getGenerateText();
      if (generateText) {
        const model = createSdkModel(provider.id, modelId, auth, { baseURL: baseUrl || undefined });
        if (model) {
          try {
            const result = await generateText({
              model,
              // Phase 4: multi-modal support via toAiSdkMessages
              messages: this.toAiSdkMessages(
                request.messages.map(m => ({ role: m.role, content: m.content, images: (m as any).images }))
              ),
              system: request.systemPrompt,
              temperature: request.temperature,
              maxTokens: request.maxTokens,
            });
            return {
              id: result.response?.id || '',
              content: result.text || '',
              model: modelId,
              usage: result.usage ? {
                promptTokens: result.usage.promptTokens || 0,
                completionTokens: result.usage.completionTokens || 0,
              } : undefined,
            };
          } catch (err: any) {
            console.warn(
              `[ChatEngine] AI SDK generateText threw for ${provider.id}/${modelId}, ` +
              `falling back to protocol adapters:`,
              err?.message || err
            );
            // Fall through to the adapter path below.
          }
        }
      }
    }

    // Fallback to adapters.
    const adapter = getAdapterForProvider(provider);
    return adapter.chat({ ...request, model: modelId }, { auth, baseUrl });
  }

  /**
   * Streaming chat via streamText().
   * Yields StreamChunk objects that the caller forwards to the renderer.
   *
   * This is the ONE method that handles both chat mode and agent mode:
   * - Chat mode: call without tools → single-step streaming
   * - Agent mode: call with tools + maxSteps → multi-step agent loop
   *   The AI SDK handles tool-call accumulation, execution, and looping
   *   automatically.
   *
   * Phase 2.5: If the AI SDK path throws OR yields an `error` part, we fall
   * back to the hand-rolled protocol adapters (which have per-provider URL
   * defaults and more robust SSE parsing). This prevents the user from
   * seeing opaque "terminated" / "Invalid URL" errors when the AI SDK path
   * can't handle a particular provider.
   */
  async *chatStream(
    request: ChatRequest,
    options?: {
      signal?: AbortSignal;
      tools?: Record<string, any>;
      maxSteps?: number;
      onToolCall?: (toolCall: any) => void;
      onToolResult?: (toolResult: any) => void;
      thinkingEffort?: string; // Phase 4.2: 'off'|'low'|'medium'|'high'|'max'
    }
  ): AsyncGenerator<StreamChunk> {
    const { provider, auth, baseUrl, modelId } = this.resolveModel(request.model);

    // Phase 9.7: Try the DIRECT HTTP path FIRST when tools are provided.
    // Bypasses the AI SDK — sends raw OpenAI Chat Completions with tools
    // as raw JSON Schema. This is how opencode does it and works reliably
    // with DeepSeek + other models that don't handle AI SDK wrapping.
    if (options?.tools && baseUrl) {
      console.info(`[ChatEngine] Direct HTTP path for ${provider.id}/${modelId}`);
      try {
        const directTools: DirectToolDefinition[] = Object.entries(options.tools).map(([name, tool]: [string, any]) => ({
          name,
          description: tool.description || '',
          parameters: extractRawSchema(tool.parameters),
          execute: tool.execute,
        }));
        const providerOptions = buildThinkingProviderOptions(provider.id, options?.thinkingEffort);
        yield* this.runDirectAgentLoop({ request, options, provider, auth, baseUrl, modelId, directTools, providerOptions });
        return;
      } catch (err: any) {
        console.warn(`[ChatEngine] Direct HTTP path failed, falling back to AI SDK:`, err?.message || err);
      }
    }

    // Try AI SDK path.
    const available = await ensureAiSdk();
    if (available) {
      const streamText = getStreamText();
      if (streamText) {
        const model = createSdkModel(provider.id, modelId, auth, { baseURL: baseUrl || undefined });
        if (model) {
          console.info(`[ChatEngine] AI SDK path for ${provider.id}/${modelId} (tools: ${!!options?.tools}, maxSteps: ${options?.maxSteps || 'none'}, system: ${!!request.systemPrompt})`);

          try {
            // Phase 4: use toAiSdkMessages for multi-modal (images) support.
            const aiMessages = this.toAiSdkMessages(
              request.messages.map(m => ({ role: m.role, content: m.content, images: (m as any).images }))
            );

            // Phase 4.1: REMOVED smoothStream() — it was breaking text-delta
            // delivery on OpenAI-compatible providers (OpenCode Zen, etc.).
            // The experimental_transform option buffers text chunks but never
            // releases them to the fullStream iterator on some providers,
            // causing "thinking shows but no answer" behaviour.
            //
            // Phase 4.2: build providerOptions for thinking effort.
            const providerOptions = buildThinkingProviderOptions(provider.id, options?.thinkingEffort);

            const result = streamText({
              model,
              messages: aiMessages,
              // Phase 2.7: pass the system prompt to the AI SDK.
              system: request.systemPrompt,
              tools: options?.tools,
              maxSteps: options?.maxSteps,
              temperature: request.temperature,
              maxTokens: request.maxTokens,
              abortSignal: options?.signal,
              // Phase 4.2: pass thinking effort as providerOptions
              providerOptions,
              onStepFinish: (step: any) => {
                // Forward tool calls + results from each step.
                if (step?.toolCalls) {
                  for (const tc of step.toolCalls) {
                    options?.onToolCall?.(tc);
                  }
                }
                if (step?.toolResults) {
                  for (const tr of step.toolResults) {
                    options?.onToolResult?.(tr);
                  }
                }
              },
            });

            // Stream the full stream — includes text deltas, tool calls, reasoning, etc.
            // Phase 2.6: track whether we've yielded any content/tool events.
            // Phase 4.1: also track accumulated reasoning content — if the
            // stream finishes with no text-delta parts (common with reasoning
            // models like DeepSeek that put everything in reasoning_content),
            // we fall back to using the reasoning as the answer.
            let yieldedContent = false;
            let fallbackToAdapter = false;
            let accumulatedReasoning = '';
            let partCount = 0;
            streamLoop:
            for await (const part of result.fullStream) {
              partCount++;
              if (partCount <= 10 || partCount % 50 === 0) {
                console.info(`[ChatEngine] stream part #${partCount}: ${part.type}`);
              }
              switch (part.type) {
                case 'text-delta':
                  if (part.textDelta) {
                    yieldedContent = true;
                    yield { type: 'content', content: part.textDelta };
                  }
                  break;

                case 'reasoning':
                  if (part.textDelta) {
                    accumulatedReasoning += part.textDelta;
                    yield { type: 'thinking', content: part.textDelta };
                  }
                  break;

                case 'tool-call':
                  yieldedContent = true;
                  yield {
                    type: 'tool_call_end',
                    toolCall: {
                      id: part.toolCallId,
                      name: part.toolName,
                      arguments: part.args,
                    },
                  };
                  break;

                case 'tool-call-streaming-start':
                  yieldedContent = true;
                  yield {
                    type: 'tool_call_start',
                    toolCall: { id: part.toolCallId, name: part.toolName },
                  };
                  break;

                case 'tool-call-delta':
                  yield {
                    type: 'tool_call_delta',
                    toolCall: { id: part.toolCallId, arguments: part.argsText },
                  };
                  break;

                case 'tool-result':
                  yield {
                    type: 'tool_result',
                    toolResult: {
                      id: part.toolCallId,
                      content: typeof part.result === 'string' ? part.result : JSON.stringify(part.result),
                    },
                  };
                  break;

                case 'error':
                  // Phase 2.6: If no content was streamed yet, fall back to
                  // the protocol adapters instead of surfacing the error.
                  // The adapters have per-provider URL defaults and give
                  // much better error messages (e.g. "Invalid API key" vs
                  // the AI SDK's bare "terminated").
                  if (!yieldedContent) {
                    console.warn(
                      `[ChatEngine] AI SDK yielded error before any content for ` +
                      `${provider.id}/${modelId}, falling back to protocol adapters:`,
                      part.error?.message || part.error
                    );
                    fallbackToAdapter = true;
                    break streamLoop; // break out of the for-await loop
                  }
                  // Content was already streamed — can't fall back (would
                  // duplicate). Yield a descriptive error and return.
                  yield {
                    type: 'error',
                    error: { message: describeError(part.error, provider.id, modelId) },
                  };
                  return;

                case 'finish':
                  // Phase 4.1: if we got NO text-delta parts but DID get
                  // reasoning content, yield the reasoning as the answer.
                  if (!yieldedContent && accumulatedReasoning.trim()) {
                    yield { type: 'content', content: accumulatedReasoning };
                  }

                  if (result.usage) {
                    yield {
                      type: 'usage',
                      usage: {
                        promptTokens: result.usage.promptTokens || 0,
                        completionTokens: result.usage.completionTokens || 0,
                      },
                    };
                  }
                  yield { type: 'done' };
                  return;

                case 'step-finish':
                  // Step boundary — don't emit, just continue to next step.
                  break;
              }
            }

            // Phase 2.6: if we broke out of the loop to fall back, do it now.
            if (fallbackToAdapter) {
              // Fall through to the adapter path below.
            } else {
              // If we didn't get a 'finish' event and didn't fall back,
              // emit done.
              yield { type: 'done' };
              return;
            }
          } catch (err: any) {
            // Phase 2.5: The streamText() call itself threw (sync or async).
            // Fall back to the hand-rolled adapters instead of surfacing the
            // raw error — the adapters have per-provider URL defaults and
            // give much better error messages.
            console.warn(
              `[ChatEngine] AI SDK streamText threw for ${provider.id}/${modelId}, ` +
              `falling back to protocol adapters:`,
              err?.message || err
            );
            // Fall through to the adapter path below.
          }
        }
      }
    }

    // Fallback: use the hand-rolled adapters.
    // Phase 2.7: inject the systemPrompt as a system message at the start
    // of the messages array, since the adapter doesn't have a `system`
    // parameter like the AI SDK does.
    // Phase 4.5: wrap the adapter output to add reasoning-to-content
    // fallback (same as the AI SDK path) so reasoning models still produce
    // an answer even on the adapter path.
    const adapter = getAdapterForProvider(provider);
    const adapterRequest = { ...request, model: modelId };
    if (request.systemPrompt && adapterRequest.messages[0]?.role !== 'system') {
      adapterRequest.messages = [
        { role: 'system' as any, content: request.systemPrompt },
        ...adapterRequest.messages,
      ];
    }
    console.info(`[ChatEngine] Using protocol adapter for ${provider.id}/${modelId}`);

    // Wrap the adapter stream to add reasoning-to-content fallback
    let adapterYieldedContent = false;
    let adapterReasoning = '';
    for await (const chunk of adapter.chatStream(adapterRequest, { auth, baseUrl, signal: options?.signal })) {
      if (chunk.type === 'content') {
        adapterYieldedContent = true;
      } else if (chunk.type === 'thinking') {
        adapterReasoning += chunk.content || '';
      } else if (chunk.type === 'done') {
        // Phase 4.5: if the adapter produced only reasoning and no text,
        // yield the reasoning as content before done (same as the AI SDK path).
        if (!adapterYieldedContent && adapterReasoning.trim()) {
          console.info(`[ChatEngine] Adapter path: no content, using ${adapterReasoning.length} chars of reasoning`);
          yield { type: 'content', content: adapterReasoning };
        }
      }
      yield chunk;
    }
  }

  /**
   * Build AI SDK tool definitions from the tool executor + permission checker.
   * Each tool's execute() function:
   *   1. Checks permissions (allow/ask/deny)
   *   2. If 'ask', requests user confirmation via the callback
   *   3. If allowed, executes the tool via executeToolCall()
   *   4. Returns the result as a string
   *
   * The AI SDK calls execute() automatically when the LLM requests a tool call.
   */
  buildTools(
    toolDeps: AgentToolDeps,
    permissionChecker: PermissionChecker,
    executeToolFn: (toolCall: any, deps: any) => Promise<{ content: string; isError?: boolean }>
  ): Record<string, any> {
    const tools: Record<string, any> = {};

    // Phase 9: Wrap plain JSON Schema objects with the AI SDK's jsonSchema()
    // helper. In AI SDK v4, ToolParameters must be `z.ZodTypeAny | Schema<any>`
    // — a plain JSON Schema object is NOT valid. When you pass a plain object,
    // the SDK can't validate tool arguments and silently fails to call the
    // execute handler. This was the root cause of AskUserQuestion + TodoWrite
    // not working: the model would emit a tool call, but execute() never ran.
    const jsonSchemaFn = getJsonSchema();
    const wrapParams = (schema: Record<string, unknown>): any => {
      if (!jsonSchemaFn) return schema; // SDK not loaded — fall back to raw
      return jsonSchemaFn(schema);
    };

    // Built-in tools with AI SDK tool() format.
    // Phase 9.4: Descriptions rewritten using opencode's proven tool
    // descriptions (github.com/anomalyco/opencode). These are battle-tested
    // across many models and give clearer guidance on WHEN to use each tool.
    const builtinTools = [
      {
        name: 'bash',
        description: `Executes a shell command in the working directory.

Usage:
- This tool is for terminal operations like git, npm, docker, building, running tests, etc.
- DO NOT use this tool for file operations (reading, writing, editing, searching files) — use the specialized tools (read, write, edit, glob, grep) instead.
- Returns stdout, stderr, exit code, and timing.
- Commands run with the working directory as cwd.
- Avoid \`rm -rf\` and \`sudo\` — they trigger a permission prompt.

# Git and GitHub
- Only commit, amend, push, or create PRs when explicitly requested.
- Before committing, inspect \`git status\`, \`git diff\`, and \`git log --oneline -10\`.
- Write a concise commit message that matches the repo style.
- Do not force-push or create empty commits unless explicitly requested.`,
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'The shell command to execute.' },
            cwd: { type: 'string', description: 'Working directory (defaults to the agent cwd)' },
            timeout: { type: 'number', description: 'Timeout in ms (default 30000, max 300000)' },
          },
          required: ['command'],
        },
      },
      {
        name: 'read',
        description: `Read a file or directory from the local filesystem. If the path does not exist, an error is returned.

Usage:
- The path parameter should be an absolute path or relative to the working directory.
- By default, this tool returns up to 2000 lines from the start of the file.
- The offset parameter is the line number to start from (1-indexed).
- To read later sections, call this tool again with a larger offset.
- Use the grep tool to find specific content in large files or files with long lines.
- If you are unsure of the correct file path, use the glob tool to look up filenames by glob pattern.
- Contents are returned with each line prefixed with its line number: \`<line>: <content>\`.
- For directories, entries are returned one per line with a trailing \`/\` for subdirectories.
- Any line longer than 2000 characters is truncated.
- You MUST call this tool before editing a file — the edit tool requires an exact text match.`,
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File or directory path (relative to cwd or absolute)' },
            offset: { type: 'number', description: 'Starting line number (1-indexed, default 1)' },
            limit: { type: 'number', description: 'Max lines to read (default 2000)' },
          },
          required: ['path'],
        },
      },
      {
        name: 'write',
        description: `Writes a file to the local filesystem.

Usage:
- This tool overwrites the existing file if there is one at the provided path.
- If editing an existing file, you MUST use the Read tool first to read its contents.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- NEVER proactively create documentation files (*.md) or README files.
- Creates parent directories if needed.
- For targeted changes to an existing file, prefer the edit tool.`,
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path (relative to cwd or absolute)' },
            content: { type: 'string', description: 'Full content to write' },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'edit',
        description: `Performs exact string replacements in files.

Usage:
- You must use the Read tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file.
- The oldString MUST match the file exactly (including whitespace and indentation).
- The edit will FAIL if oldString is not found in the file.
- The edit will FAIL if oldString is found multiple times — provide more surrounding context to make the match unique.
- To delete code, set newString to an empty string.
- ALWAYS prefer editing existing files. NEVER write new files unless explicitly required.`,
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path (relative to cwd or absolute)' },
            old_string: { type: 'string', description: 'Exact text to find (must be unique in the file)' },
            new_string: { type: 'string', description: 'Text to replace it with (use "" to delete)' },
          },
          required: ['path', 'old_string', 'new_string'],
        },
      },
      {
        name: 'glob',
        description: `Fast file pattern matching tool that works with any codebase size.

- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths
- Use this tool when you need to find files by name patterns
- You have the capability to call multiple tools in a single response. It is always better to speculatively perform multiple searches as a batch that are potentially useful.
- For searching file CONTENTS, use grep instead.`,
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Glob pattern (e.g. "src/**/*.tsx", "**/*.json")' },
            path: { type: 'string', description: 'Base directory (defaults to cwd)' },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'grep',
        description: `Fast content search tool that works with any codebase size.

- Searches file contents using regular expressions
- Supports full regex syntax (eg. "log.*Error", "function\\s+\\w+", etc.)
- Filter files by pattern with the include parameter (eg. "*.js", "*.{ts,tsx}")
- Returns file paths and line numbers with matching lines
- Use this tool when you need to find files containing specific patterns
- For finding files by NAME, use glob instead.`,
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Regex pattern (e.g. "function foo\\(", "class \\w+Service")' },
            path: { type: 'string', description: 'Base directory (defaults to cwd)' },
            include: { type: 'string', description: 'File glob to include (e.g. "*.ts", "*.{tsx,jsx}")' },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'list_files',
        description: `List the contents of a directory.

- Returns names + types (file/dir) for each entry.
- Subdirectories have a trailing \`/\`.
- Use this to orient yourself when you don't know the project structure.
- For recursive discovery, use glob with a pattern like "**/*".`,
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Directory path (defaults to cwd)' },
          },
          required: [],
        },
      },
      {
        name: 'TodoWrite',
        description: `Create and maintain a structured task list for the current coding session. Tracks progress, organizes multi-step work, and surfaces status to the user.

## When to use
Use proactively when:
- The task requires 3+ distinct steps or actions
- The work is non-trivial and benefits from planning
- The user provides multiple tasks (numbered or comma-separated) or explicitly asks for a todo list
- New instructions arrive — capture them as todos
- You start a task — mark it \`in_progress\` (only one at a time) before working
- You finish a task — mark it \`completed\` and add any follow-ups discovered during the work

## When NOT to use
Skip when:
- The work is a single, straightforward task (or <3 trivial steps)
- The request is purely informational or conversational
- Tracking adds no organizational value

## States
- \`pending\` — not started
- \`in_progress\` — actively working (exactly ONE at a time)
- \`completed\` — finished successfully
- \`cancelled\` — no longer needed

## Rules
- Update status in real time; don't batch completions
- Mark \`completed\` only after the required work is actually done
- Keep exactly one \`in_progress\` while work remains
- Items should be specific and actionable; break large work into smaller steps

When in doubt, use it.`,
        parameters: {
          type: 'object',
          properties: {
            todos: {
              type: 'array',
              description: 'The full todo list (replaces the previous list). Always send ALL todos, not just the changed one.',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Stable ID for this todo (e.g. "1", "2a"). Reuse the same ID when updating.' },
                  content: { type: 'string', description: 'Brief description of the task' },
                  status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'], description: 'Current status of the task' },
                  priority: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Priority level of the task' },
                },
                required: ['id', 'content', 'status'],
              },
            },
          },
          required: ['todos'],
        },
      },
      {
        name: 'AskUserQuestion',
        description: `Use this tool when you need to ask the user questions during execution. This allows you to:
1. Gather user preferences or requirements
2. Clarify ambiguous instructions
3. Get decisions on implementation choices as you work
4. Offer choices to the user about what direction to take.

Usage notes:
- Answers are returned as the selected option labels (comma-separated for multi-select).
- If you recommend a specific option, make that the first option in the list and add "(Recommended)" at the end of the label.
- Set multiple: true on a question to allow the user to select more than one option.
- Questions are rendered INLINE in the chat (not as a popup). The user sees all questions at once.
- You can ask multiple questions in a single call — each will have its own section with a header.`,
        parameters: {
          type: 'object',
          properties: {
            questions: {
              type: 'array',
              description: 'Questions to ask the user',
              items: {
                type: 'object',
                properties: {
                  question: { type: 'string', description: 'The question text' },
                  header: { type: 'string', description: 'Short header label for the question (e.g. "SCOPE", "METHOD")' },
                  multiple: { type: 'boolean', description: 'If true, the user can select multiple options. Default: false (single-select).' },
                  options: {
                    type: 'array',
                    description: 'Multiple-choice options',
                    items: {
                      type: 'object',
                      properties: {
                        label: { type: 'string', description: 'Option label (short title)' },
                        description: { type: 'string', description: 'Optional longer description of the option' },
                      },
                      required: ['label'],
                    },
                  },
                },
                required: ['question', 'options'],
              },
            },
          },
          required: ['questions'],
        },
      },
    ];

    for (const tool of builtinTools) {
      tools[tool.name] = {
        description: tool.description,
        // Phase 9: wrap with jsonSchema() so the AI SDK can validate args
        // and actually call execute(). Without this, the tool call is
        // emitted but execute() never runs.
        parameters: wrapParams(tool.parameters),
        execute: async (args: Record<string, unknown>) => {
          // Phase 7.1 + Phase 8.5: AskUserQuestion uses a dedicated
          // ask-user flow (NOT the permission flow) to get the user's
          // selected answer. The UI shows a question card with the
          // multiple-choice options, the user picks one, and the
          // selected option label is returned as the tool result.
          //
          // Phase 8.5 fix: previously this called requestPermission()
          // which only returns boolean — so the agent never saw the
          // user's actual answer, just "User acknowledged the question."
          // Now we use requestUserAnswer() which returns the selected
          // option string, or null if the user dismissed the dialog.
          if (tool.name === 'AskUserQuestion') {
            if (permissionChecker.requestUserAnswer) {
              const answer = await permissionChecker.requestUserAnswer(tool.name, args);
              if (answer === null) {
                return 'User dismissed the question without answering.';
              }
              // Return the answer in a structured format so the agent
              // can parse it: "Question: <q>\nAnswer: <selected option>"
              const questions = Array.isArray(args.questions) ? args.questions : [];
              const firstQ = questions[0] as any;
              const questionText = firstQ?.question || '(unknown question)';
              return `Question: ${questionText}\nUser's answer: ${answer}`;
            }
            // Fallback for old permission checkers that don't implement
            // requestUserAnswer — degrade to boolean approval.
            const approved = await permissionChecker.requestPermission(tool.name, args);
            if (!approved) {
              return 'User declined to answer.';
            }
            return 'User acknowledged the question. (Note: actual answer not captured — upgrade to requestUserAnswer for full support.)';
          }

          // Phase 8.2: TodoWrite is handled entirely in-process — it never
          // touches the sandbox or the tool executor. We persist the todos
          // to a per-session in-memory store and forward them to the
          // renderer via the onToolCall callback so the UI can render them.
          // The full todo-tracking UI lands in Phase 8.3; for now we just
          // store + acknowledge.
          if (tool.name === 'TodoWrite') {
            const todos = Array.isArray(args.todos) ? args.todos : [];
            // Stash on the toolDeps so the renderer-side bridge can read it.
            (toolDeps as any)._todos = todos;
            const completed = todos.filter((t: any) => t?.status === 'completed').length;
            const inProgress = todos.filter((t: any) => t?.status === 'in_progress').length;
            const pending = todos.filter((t: any) => t?.status === 'pending').length;
            return `Todo list updated (${todos.length} total: ${completed} completed, ${inProgress} in progress, ${pending} pending).`;
          }

          // Permission check.
          const permission = permissionChecker.checkPermission(tool.name, args);
          if (permission === 'deny') {
            return { error: `Permission denied for tool: ${tool.name}` };
          }
          if (permission === 'ask') {
            const approved = await permissionChecker.requestPermission(tool.name, args);
            if (!approved) {
              return { error: `User denied permission for tool: ${tool.name}` };
            }
          }

          // Execute.
          const result = await executeToolFn(
            { id: crypto.randomUUID(), name: tool.name, arguments: args },
            toolDeps
          );
          return result.content;
        },
      };
    }

    // Add MCP/extension tools.
    if (toolDeps.extensionRegistry) {
      try {
        const extTools = toolDeps.extensionRegistry.getAllTools();
        for (const extTool of extTools) {
          if (tools[extTool.name]) continue; // Built-in takes precedence.
          tools[extTool.name] = {
            description: extTool.description,
            // Phase 9: wrap with jsonSchema() for AI SDK v4 compatibility.
            parameters: wrapParams(extTool.parameters || { type: 'object', properties: {} }),
            execute: async (args: Record<string, unknown>) => {
              const permission = permissionChecker.checkPermission(extTool.name, args);
              if (permission === 'deny') return { error: `Permission denied: ${extTool.name}` };
              if (permission === 'ask') {
                const approved = await permissionChecker.requestPermission(extTool.name, args);
                if (!approved) return { error: `User denied: ${extTool.name}` };
              }
              const result = await executeToolFn(
                { id: crypto.randomUUID(), name: extTool.name, arguments: args },
                toolDeps
              );
              return result.content;
            },
          };
        }
      } catch {
        // Extension registry not ready — skip.
      }
    }

    // Phase 8.4: Add skill tools.
    //
    // Each loaded skill becomes a tool the agent can invoke. The tool name
    // is `skill_<id>` (prefixed to avoid clashing with builtin tools like
    // `edit`). The description is the skill's description + a hint that
    // the agent should pass the skill's required parameters as args.
    //
    // We skip disabled skills and skills whose ID would collide with an
    // existing tool. The actual execution is delegated to the
    // `executeSkill` callback on toolDeps (wired up in main.ts to call
    // skillRegistry.execute()).
    if (toolDeps.skills && toolDeps.executeSkill && toolDeps.sessionId) {
      for (const skill of toolDeps.skills) {
        if (skill.enabled === false) continue;
        const toolName = `skill_${skill.id}`;
        if (tools[toolName]) continue; // Don't overwrite

        // Build a description that tells the model when to use this skill.
        const desc = `[Skill] ${skill.description}\n\nInvoke this skill by passing its required parameters as arguments. The skill runs in the main process and returns its output as text.`;

        tools[toolName] = {
          description: desc,
          // Phase 9: wrap with jsonSchema() for AI SDK v4 compatibility.
          parameters: wrapParams(skill.parameters || { type: 'object', properties: {}, description: 'Skill parameters (see skill description)' }),
          execute: async (args: Record<string, unknown>) => {
            // Skills always require user approval (they can run arbitrary
            // code via index.js, so we never auto-approve).
            const approved = await permissionChecker.requestPermission(toolName, args);
            if (!approved) {
              return { error: `User denied skill execution: ${skill.name}` };
            }
            try {
              const result = await toolDeps.executeSkill!(skill.id, args, {
                sessionId: toolDeps.sessionId!,
                workingDir: toolDeps.workingDirectory,
              });
              if (!result.success) {
                return { error: result.error || `Skill '${skill.name}' failed` };
              }
              return result.output;
            } catch (err: any) {
              return { error: `Skill '${skill.name}' threw: ${err?.message || String(err)}` };
            }
          },
        };
      }
    }

    return tools;
  }

  // ─── Phase 9.7: Direct HTTP Agent Loop ─────────────────────────────────────

  /**
   * Run the agentic tool loop using the direct HTTP stream.
   *
   * This bypasses the AI SDK entirely and sends raw OpenAI Chat Completions
   * requests. Tools are sent as raw JSON Schema (not wrapped with
   * jsonSchema()), and native tool_calls are parsed from the SSE stream.
   *
   * The loop:
   *   1. Send the request with tools.
   *   2. Stream the response (text + thinking + tool_calls).
   *   3. When tool_calls are received, execute them via the tool's execute()
   *      handler.
   *   4. Send the tool results back as a new message.
   *   5. Repeat until the model stops calling tools or maxSteps is reached.
   */
  async *runDirectAgentLoop(opts: {
    request: ChatRequest;
    options?: any;
    provider: ProviderDefinition;
    auth: AuthProvider;
    baseUrl: string;
    modelId: string;
    directTools: DirectToolDefinition[];
    providerOptions?: Record<string, unknown>;
  }): AsyncGenerator<StreamChunk> {
    const { request, options, provider, auth, baseUrl, modelId, directTools, providerOptions } = opts;
    const maxSteps = options?.maxSteps || 50;
    let stepCount = 0;
    // Build the conversation messages. We'll append assistant messages
    // (with tool_calls) + tool result messages as we go.
    const conversationMessages: Array<{ role: string; content: string | Array<Record<string, unknown>>; tool_calls?: any[] }> = [];
    for (const m of request.messages) {
      conversationMessages.push({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : String(m.content || ''),
      });
    }

    while (stepCount < maxSteps) {
      stepCount++;

      // Collect tool calls from this step.
      const pendingToolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = [];
      let stepContent = '';
      let stepThinking = '';

      // Stream this step.
      for await (const chunk of directChatStream({
        auth,
        baseUrl,
        model: modelId,
        messages: conversationMessages,
        systemPrompt: request.systemPrompt,
        tools: directTools,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        signal: options?.signal,
        providerOptions,
      })) {
        switch (chunk.type) {
          case 'content':
            if (chunk.content) stepContent += chunk.content;
            yield chunk;
            break;
          case 'thinking':
            if (chunk.content) stepThinking += chunk.content;
            yield chunk;
            break;
          case 'tool_call_start':
          case 'tool_call_delta':
            // Phase 9.9: Don't yield tool_call chunks from the direct loop —
            // the onToolCall callback already sends them to the renderer via
            // main.ts. Yielding them here would create DUPLICATE tool call
            // entries in the renderer (one from onToolCall, one from the
            // yield → main.ts switch → send path).
            break;
          case 'tool_call_end':
            if (chunk.toolCall) {
              pendingToolCalls.push({
                id: chunk.toolCall.id || `call-${Date.now()}`,
                name: chunk.toolCall.name || 'unknown',
                arguments: chunk.toolCall.arguments || {},
              });
              // Notify the caller (main.ts intercepts TodoWrite etc.)
              options?.onToolCall?.({
                id: chunk.toolCall.id,
                name: chunk.toolCall.name,
                arguments: chunk.toolCall.arguments || {},
              });
            }
            // Phase 9.9: Don't yield — onToolCall already sent it.
            break;
          case 'tool_result':
            // Phase 9.9: Don't yield — onToolResult already sent it.
            break;
          case 'usage':
            yield chunk;
            break;
          case 'error':
            yield chunk;
            return;
          case 'done':
            // Don't yield done yet — we may have tool calls to execute.
            break;
        }
      }

      // If no tool calls, we're done — yield done + return.
      if (pendingToolCalls.length === 0) {
        // Phase 4.1: reasoning-to-content fallback.
        if (!stepContent.trim() && stepThinking.trim()) {
          yield { type: 'content', content: stepThinking };
        }
        yield { type: 'done' };
        return;
      }

      // Execute the tool calls + collect results.
      const toolResults: Array<{ id: string; content: string }> = [];
      for (const tc of pendingToolCalls) {
        const tool = directTools.find(t => t.name === tc.name);
        if (!tool || typeof tool.execute !== 'function') {
          console.warn(`[DirectAgentLoop] Tool '${tc.name}' not found`);
          toolResults.push({ id: tc.id, content: `Tool '${tc.name}' not found.` });
          continue;
        }
        try {
          const result = await tool.execute(tc.arguments);
          const content = typeof result === 'string' ? result : JSON.stringify(result);
          toolResults.push({ id: tc.id, content });
          options?.onToolResult?.({ toolCallId: tc.id, toolName: tc.name, args: tc.arguments, result: content });
          yield { type: 'tool_result', toolResult: { id: tc.id, content } };
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          console.warn(`[DirectAgentLoop] Tool '${tc.name}' error:`, errMsg);
          toolResults.push({ id: tc.id, content: `Error: ${errMsg}` });
          yield { type: 'tool_result', toolResult: { id: tc.id, content: `Error: ${errMsg}` } };
        }
      }

      // Add the assistant message (with tool_calls) + tool results to the
      // conversation for the next step.
      conversationMessages.push({
        role: 'assistant',
        content: stepContent || '',
        tool_calls: pendingToolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      });
      for (const tr of toolResults) {
        conversationMessages.push({
          role: 'tool',
          content: tr.content,
          tool_call_id: tr.id,
        } as any);
      }
    }

    // maxSteps reached.
    console.warn(`[DirectAgentLoop] Reached maxSteps (${maxSteps})`);
    yield { type: 'done' };
  }

  // ─── Phase 4: Advanced AI SDK Features ────────────────────────────────────

  /**
   * Convert internal messages to AI SDK multi-modal format.
   *
   * If a message has `images` (array of base64 data URLs or Uint8Array),
   * the content becomes a multi-part array:
   *   [{ type: 'text', text: "..." }, { type: 'image', image: <data> }]
   *
   * Otherwise, content stays as a plain string (the simple path).
   */
  private toAiSdkMessages(messages: Array<{ role: string; content: any; images?: string[] }>): any[] {
    return messages.map(m => {
      if (m.images && m.images.length > 0) {
        // Multi-modal: build a content array with text + image parts.
        const parts: any[] = [];
        if (m.content) {
          parts.push({ type: 'text', text: m.content });
        }
        for (const img of m.images) {
          if (img.startsWith('data:')) {
            // Data URL — extract the base64 portion
            const base64 = img.split(',')[1];
            parts.push({ type: 'image', image: Buffer.from(base64, 'base64') });
          } else {
            // Assume it's a file path — the AI SDK can handle paths
            parts.push({ type: 'image', image: img });
          }
        }
        return { role: m.role, content: parts };
      }
      return { role: m.role, content: m.content };
    });
  }

  /**
   * Phase 4: generateObject() — structured outputs.
   * Returns a typed JSON object matching the given schema.
   *
   * The schema is a plain JSON Schema object. We wrap it with the AI SDK's
   * jsonSchema() helper so the SDK accepts it.
   */
  async generateObject(
    request: ChatRequest & { schema: Record<string, unknown> }
  ): Promise<{ object: any; usage?: { promptTokens: number; completionTokens: number } }> {
    const { provider, auth, baseUrl, modelId } = this.resolveModel(request.model);
    const available = await ensureAiSdk();
    if (!available) throw new Error('AI SDK not available');

    const generateObjectFn = getGenerateObject();
    if (!generateObjectFn) throw new Error('generateObject not available in AI SDK');

    const model = createSdkModel(provider.id, modelId, auth, { baseURL: baseUrl || undefined });
    if (!model) throw new Error(`Failed to create model for ${provider.id}/${modelId}`);

    const jsonSchemaFn = getJsonSchema();
    const schema = jsonSchemaFn ? jsonSchemaFn(request.schema) : request.schema;

    const result = await generateObjectFn({
      model,
      messages: this.toAiSdkMessages(
        request.messages.map(m => ({ role: m.role, content: m.content }))
      ),
      schema,
      system: request.systemPrompt,
      temperature: request.temperature,
    });

    return {
      object: result.object,
      usage: result.usage ? {
        promptTokens: result.usage.promptTokens || 0,
        completionTokens: result.usage.completionTokens || 0,
      } : undefined,
    };
  }

  /**
   * Phase 4: embed() — generate a vector embedding for a single text.
   */
  async embed(
    model: string,
    text: string
  ): Promise<number[]> {
    const { provider, auth, baseUrl, modelId } = this.resolveModel(model);
    const available = await ensureAiSdk();
    if (!available) throw new Error('AI SDK not available');

    const embedFn = getEmbed();
    if (!embedFn) throw new Error('embed not available in AI SDK');

    const embeddingModel = createSdkEmbeddingModel(provider.id, modelId, auth, { baseURL: baseUrl || undefined });
    if (!embeddingModel) throw new Error(`Failed to create embedding model for ${provider.id}/${modelId}`);

    const result = await embedFn({ model: embeddingModel, value: text });
    return result.embedding;
  }

  /**
   * Phase 4: embedMany() — generate embeddings for multiple texts at once.
   */
  async embedMany(
    model: string,
    texts: string[]
  ): Promise<number[][]> {
    const { provider, auth, baseUrl, modelId } = this.resolveModel(model);
    const available = await ensureAiSdk();
    if (!available) throw new Error('AI SDK not available');

    const embedManyFn = getEmbedMany();
    if (!embedManyFn) throw new Error('embedMany not available in AI SDK');

    const embeddingModel = createSdkEmbeddingModel(provider.id, modelId, auth, { baseURL: baseUrl || undefined });
    if (!embeddingModel) throw new Error(`Failed to create embedding model for ${provider.id}/${modelId}`);

    const result = await embedManyFn({ model: embeddingModel, values: texts });
    return result.embeddings;
  }
}
