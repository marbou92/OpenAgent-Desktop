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
          // Convert messages — support multi-modal content arrays.
          const messages = request.messages.map(m => ({
            role: m.role,
            content: m.content,
          }));

          const result = streamText({
            model,
            messages,
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
          for await (const part of result.fullStream) {
            switch (part.type) {
              case 'text-delta':
                if (part.textDelta) {
                  yield { type: 'content', content: part.textDelta };
                }
                break;

              case 'reasoning':
                if (part.textDelta) {
                  yield { type: 'thinking', content: part.textDelta };
                }
                break;

              case 'tool-call':
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
                yield {
                  type: 'error',
                  error: { message: part.error?.message || 'Unknown AI SDK error' },
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

          // If we didn't get a 'finish' event, emit done.
          yield { type: 'done' };
          return;
        }
      }
    }

    // Fallback: use the hand-rolled adapters.
    const adapter = getAdapterForProvider(provider);
    yield* adapter.chatStream({ ...request, model: modelId }, { auth, baseUrl, signal: options?.signal });
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
