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
import { loadAiSdk, isAiSdkAvailable, createSdkModel, getStreamText, getGenerateText } from './ai-sdk-loader';
import { getAdapterForProvider, AdapterCallContext } from './protocol-adapters';

// AI SDK loading state.
let _aiSdkLoaded = false;

async function ensureAiSdk(): Promise<boolean> {
  if (_aiSdkLoaded) return isAiSdkAvailable();
  _aiSdkLoaded = true;
  return loadAiSdk();
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

export interface AgentToolDeps {
  sandboxManager: any;
  workingDirectory: string;
  extensionRegistry?: any;
}

export interface PermissionChecker {
  checkPermission(toolName: string, args: Record<string, unknown>): 'allow' | 'ask' | 'deny';
  requestPermission(toolName: string, args: Record<string, unknown>): Promise<boolean>;
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
              messages: request.messages.map(m => ({ role: m.role, content: m.content })),
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
    }
  ): AsyncGenerator<StreamChunk> {
    const { provider, auth, baseUrl, modelId } = this.resolveModel(request.model);

    // Try AI SDK path.
    const available = await ensureAiSdk();
    if (available) {
      const streamText = getStreamText();
      if (streamText) {
        const model = createSdkModel(provider.id, modelId, auth, { baseURL: baseUrl || undefined });
        if (model) {
          console.info(`[ChatEngine] AI SDK path for ${provider.id}/${modelId} (tools: ${!!options?.tools}, maxSteps: ${options?.maxSteps || 'none'}, system: ${!!request.systemPrompt})`);
          // Convert messages — support multi-modal content arrays.
          const messages = request.messages.map(m => ({
            role: m.role,
            content: m.content,
          }));

          try {
            const result = streamText({
              model,
              messages,
              // Phase 2.7: pass the system prompt to the AI SDK. Previously
              // this was silently dropped — the LLM never saw the Build/Plan
              // agent instructions.
              system: request.systemPrompt,
              tools: options?.tools,
              maxSteps: options?.maxSteps,
              temperature: request.temperature,
              maxTokens: request.maxTokens,
              abortSignal: options?.signal,
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
            // If an error occurs BEFORE any content was streamed, we break out
            // of the loop and fall back to the protocol adapters (which give
            // better error messages). If content was already streamed, we
            // yield the error and return (can't fall back — would duplicate).
            let yieldedContent = false;
            let fallbackToAdapter = false;
            streamLoop:
            for await (const part of result.fullStream) {
              switch (part.type) {
                case 'text-delta':
                  if (part.textDelta) {
                    yieldedContent = true;
                    yield { type: 'content', content: part.textDelta };
                  }
                  break;

                case 'reasoning':
                  if (part.textDelta) {
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
    const adapter = getAdapterForProvider(provider);
    const adapterRequest = { ...request, model: modelId };
    if (request.systemPrompt && adapterRequest.messages[0]?.role !== 'system') {
      adapterRequest.messages = [
        { role: 'system' as any, content: request.systemPrompt },
        ...adapterRequest.messages,
      ];
    }
    console.info(`[ChatEngine] Using protocol adapter for ${provider.id}/${modelId}`);
    yield* adapter.chatStream(adapterRequest, { auth, baseUrl, signal: options?.signal });
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

    // Built-in tools with AI SDK tool() format.
    // Using plain JSON schemas (not zod) for compatibility.
    const builtinTools = [
      {
        name: 'bash',
        description: 'Execute a shell command. Returns stdout, stderr, and exit code.',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'The shell command to execute' },
            cwd: { type: 'string', description: 'Working directory' },
            timeout: { type: 'number', description: 'Timeout in ms (default 30000)' },
          },
          required: ['command'],
        },
      },
      {
        name: 'read',
        description: 'Read the contents of a file.',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string', description: 'File path' } },
          required: ['path'],
        },
      },
      {
        name: 'write',
        description: 'Write content to a file.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path' },
            content: { type: 'string', description: 'Content to write' },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'edit',
        description: 'Edit a file by replacing old_string with new_string.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path' },
            old_string: { type: 'string', description: 'String to find' },
            new_string: { type: 'string', description: 'Replacement string' },
          },
          required: ['path', 'old_string', 'new_string'],
        },
      },
      {
        name: 'glob',
        description: 'Find files matching a glob pattern.',
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Glob pattern (e.g. "**/*.ts")' },
            path: { type: 'string', description: 'Base directory' },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'grep',
        description: 'Search file contents with a regex.',
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Regex pattern' },
            path: { type: 'string', description: 'Base directory' },
            include: { type: 'string', description: 'File glob to include' },
          },
          required: ['pattern'],
        },
      },
    ];

    for (const tool of builtinTools) {
      tools[tool.name] = {
        description: tool.description,
        parameters: tool.parameters,
        execute: async (args: Record<string, unknown>) => {
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
            parameters: extTool.parameters || { type: 'object', properties: {} },
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

    return tools;
  }
}
