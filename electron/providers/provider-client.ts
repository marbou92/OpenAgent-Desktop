/**
 * OpenAgent-Desktop - Provider Client (opencode-compatible)
 *
 * The unified entry point for chat / chatStream / discoverModels. Routes each
 * request to the correct protocol adapter based on the provider definition.
 *
 * Uses:
 *   - AuthStore (opencode auth.json format) for credentials
 *   - OpencodeRegistry for provider definitions
 *   - OpencodeConfig for provider config overrides (baseURL, timeout, etc.)
 *   - ModelsDevClient for dynamic model catalog
 *   - Protocol adapters for per-provider request/response translation
 */

import { EventEmitter } from 'events';
import {
  AuthProvider,
  ChatRequest,
  ChatResponse,
  DiscoveredModel,
  ResolvedModel,
  StreamChunk,
  ProviderDefinition,
} from './opencode-types';
import { AuthStore } from './auth-store-v2';
import { getOpencodeRegistry } from './opencode-registry';
import { OpencodeConfig } from './opencode-config';
import { getModelsDevClient } from './models-dev-client';
import { getAdapterForProvider, AdapterCallContext } from './protocol-adapters';
import { loadAiSdk, isAiSdkAvailable, createSdkModel, getStreamText, getGenerateText } from './ai-sdk-loader';

// Try to dynamically import the SDK for sidecar support.
let sdkLoaded = false;
let opencodeClientFactory: ((opts: { baseUrl: string; auth?: string }) => any) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sdk = require('@opencode-ai/sdk');
  if (sdk && typeof sdk.createClient === 'function') {
    opencodeClientFactory = sdk.createClient;
    sdkLoaded = true;
  }
} catch {
  // SDK not installed — in-process only.
}

let sidecarBaseUrl: string | null = null;
let sidecarToken: string | null = null;

export function setSidecarEndpoint(baseUrl: string | null, token: string | null): void {
  sidecarBaseUrl = baseUrl;
  sidecarToken = token;
}

export function isSidecarAvailable(): boolean {
  return sdkLoaded && sidecarBaseUrl !== null;
}

// AI SDK loading state — loaded once on first chat call.
let _aiSdkLoaded = false;

async function ensureAiSdk(): Promise<boolean> {
  if (_aiSdkLoaded) return isAiSdkAvailable();
  _aiSdkLoaded = true;
  return loadAiSdk();
}

export class ProviderClient extends EventEmitter {
  constructor(
    private authStore: AuthStore,
    private config?: OpencodeConfig,
  ) {
    super();
  }

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
    if (!provider) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    const auth = this.authStore.get(providerId);
    if (!auth) {
      if (provider.env && provider.env.length > 0) {
        for (const envVar of provider.env) {
          const val = process.env[envVar];
          if (val) {
            return {
              providerId,
              modelId,
              provider,
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

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const { provider, auth, baseUrl, modelId } = this.resolveModel(request.model);

    // Try sidecar path first if available.
    if (isSidecarAvailable()) {
      try {
        return await this.chatViaSidecar({ ...request, model: modelId }, { auth, baseUrl });
      } catch (err) {
        this.emit('sidecar-fallback', { reason: err instanceof Error ? err.message : String(err) });
      }
    }

    // Try AI SDK path (streamText with no streaming = generateText equivalent).
    const aiSdkAvailable = await ensureAiSdk();
    if (aiSdkAvailable) {
      try {
        return await this.chatViaAiSdk(request, provider, auth, baseUrl, modelId);
      } catch (err) {
        this.emit('ai-sdk-fallback', { reason: err instanceof Error ? err.message : String(err) });
      }
    }

    // Fall back to hand-rolled adapters.
    const adapter = getAdapterForProvider(provider);
    return adapter.chat({ ...request, model: modelId }, { auth, baseUrl });
  }

  async *chatStream(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<StreamChunk> {
    const { provider, auth, baseUrl, modelId } = this.resolveModel(request.model);

    if (isSidecarAvailable()) {
      try {
        yield* this.chatStreamViaSidecar({ ...request, model: modelId }, { auth, baseUrl, signal });
        return;
      } catch (err) {
        this.emit('sidecar-fallback', { reason: err instanceof Error ? err.message : String(err) });
      }
    }

    // Try AI SDK path (streamText).
    const aiSdkAvailable = await ensureAiSdk();
    if (aiSdkAvailable) {
      try {
        yield* this.chatStreamViaAiSdk(request, provider, auth, baseUrl, modelId, signal);
        return;
      } catch (err) {
        this.emit('ai-sdk-fallback', { reason: err instanceof Error ? err.message : String(err) });
      }
    }

    // Fall back to hand-rolled adapters.
    const adapter = getAdapterForProvider(provider);
    yield* adapter.chatStream({ ...request, model: modelId }, { auth, baseUrl, signal });
  }

  /**
   * Chat using the Vercel AI SDK's generateText() — non-streaming.
   * Supports tools, multi-modal, and automatic retries.
   */
  private async chatViaAiSdk(
    request: ChatRequest,
    provider: ProviderDefinition,
    auth: AuthProvider,
    baseUrl: string,
    modelId: string
  ): Promise<ChatResponse> {
    const generateText = getGenerateText();
    if (!generateText) throw new Error('AI SDK generateText not available');

    const model = createSdkModel(provider.id, modelId, auth, { baseURL: baseUrl || undefined });
    if (!model) throw new Error(`AI SDK model creation failed for ${provider.id}/${modelId}`);

    // Convert our messages to AI SDK format.
    const messages = request.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const result = await generateText({
      model,
      messages,
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
      toolCalls: result.toolCalls?.map((tc: any) => ({
        id: tc.toolCallId,
        name: tc.toolName,
        arguments: tc.args,
      })),
    };
  }

  /**
   * Stream using the Vercel AI SDK's streamText().
   * Supports real-time token streaming, tool-call accumulation, and multi-modal.
   */
  private async *chatStreamViaAiSdk(
    request: ChatRequest,
    provider: ProviderDefinition,
    auth: AuthProvider,
    baseUrl: string,
    modelId: string,
    signal?: AbortSignal
  ): AsyncGenerator<StreamChunk> {
    const streamText = getStreamText();
    if (!streamText) throw new Error('AI SDK streamText not available');

    const model = createSdkModel(provider.id, modelId, auth, { baseURL: baseUrl || undefined });
    if (!model) throw new Error(`AI SDK model creation failed for ${provider.id}/${modelId}`);

    // Convert our messages to AI SDK format.
    // Support multi-modal: if content is an array, pass it through.
    const messages = request.messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : m.content,
    }));

    // Convert our tool definitions to AI SDK tool format.
    const tools: Record<string, any> = {};
    if (request.tools) {
      for (const tool of request.tools) {
        tools[tool.name] = {
          description: tool.description,
          parameters: tool.parameters,
        };
      }
    }

    const result = streamText({
      model,
      messages,
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      abortSignal: signal,
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
            toolCall: {
              id: part.toolCallId,
              name: part.toolName,
            },
          };
          break;

        case 'tool-call-delta':
          yield {
            type: 'tool_call_delta',
            toolCall: {
              id: part.toolCallId,
              arguments: part.argsText,
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
          // Step boundary in multi-step agent loops — don't emit, just continue.
          break;
      }
    }

    // If we didn't get a 'finish' event, emit done.
    yield { type: 'done' };
  }

  async discoverModels(providerId: string): Promise<DiscoveredModel[]> {
    const provider = this.config?.getProvider(providerId) || getOpencodeRegistry().get(providerId);
    if (!provider) throw new Error(`Unknown provider: ${providerId}`);
    const auth = this.authStore.get(providerId);
    if (!auth) throw new Error(`Provider '${providerId}' is not configured`);
    const baseUrl = provider.options?.baseURL || provider.api || '';
    const adapter = getAdapterForProvider(provider);
    return adapter.discoverModels({ auth, baseUrl });
  }

  listAvailableModels(providerId: string): ResolvedModel[] {
    const modelsDevClient = getModelsDevClient();
    const providers = modelsDevClient.getMergedProviders();
    const provider = providers.find((p) => p.id === providerId);
    if (!provider || !provider.models) return [];

    const out: ResolvedModel[] = [];
    for (const [modelId, model] of Object.entries(provider.models)) {
      if (provider.whitelist && provider.whitelist.length > 0 && !provider.whitelist.includes(modelId)) continue;
      if (provider.blacklist && provider.blacklist.includes(modelId)) continue;

      out.push({
        id: modelId,
        qualifiedId: `${providerId}/${modelId}`,
        providerId,
        displayName: model.name || modelId,
        contextWindow: model.limit?.context as number | undefined,
        maxOutput: model.limit?.output as number | undefined,
        supportsStreaming: true,
        supportsToolUse: model.tool_call ?? true,
        supportsThinking: model.reasoning ?? false,
        supportsAttachment: model.attachment ?? false,
        cost: model.cost as any,
        status: model.status as any,
        source: (model.source as any) || 'toml',
      });
    }
    return out;
  }

  // ─── Sidecar paths (unchanged) ──────────────────────────────────────────────

  private async chatViaSidecar(request: ChatRequest, _ctx: AdapterCallContext): Promise<ChatResponse> {
    if (!opencodeClientFactory || !sidecarBaseUrl) {
      throw new Error('Sidecar not available');
    }
    const client = opencodeClientFactory({ baseUrl: sidecarBaseUrl, auth: sidecarToken || undefined });
    const result = await client.chat.completions.create({
      model: request.model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stream: false,
    });
    return {
      id: result.id || '',
      content: result.choices?.[0]?.message?.content || '',
      model: result.model || request.model,
      usage: result.usage ? {
        promptTokens: result.usage.prompt_tokens || 0,
        completionTokens: result.usage.completion_tokens || 0,
      } : undefined,
    };
  }

  private async *chatStreamViaSidecar(request: ChatRequest, _ctx: AdapterCallContext): AsyncGenerator<StreamChunk> {
    if (!opencodeClientFactory || !sidecarBaseUrl) {
      throw new Error('Sidecar not available');
    }
    const client = opencodeClientFactory({ baseUrl: sidecarBaseUrl, auth: sidecarToken || undefined });
    const stream = await client.chat.completions.create({
      model: request.model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stream: true,
    });
    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) yield { type: 'content', content };
      if (chunk.choices?.[0]?.finish_reason === 'stop') {
        yield { type: 'done' };
        return;
      }
    }
    yield { type: 'done' };
  }
}
