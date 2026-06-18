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

export class ProviderClient extends EventEmitter {
  constructor(
    private authStore: AuthStore,
    private config?: OpencodeConfig,
  ) {
    super();
  }

  /**
   * Parse a qualified model id ('openai/gpt-4o') into provider + model parts,
   * resolve the provider definition, auth, and base URL.
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

    // Get the provider definition (from config or registry).
    const provider = this.config?.getProvider(providerId) || getOpencodeRegistry().get(providerId);
    if (!provider) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    // Get auth from the auth store.
    const auth = this.authStore.get(providerId);
    if (!auth) {
      // Try env var fallback.
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

    // Resolve base URL.
    const baseUrl = provider.options?.baseURL || provider.api || '';

    return { providerId, modelId, provider, auth, baseUrl };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const { provider, auth, baseUrl, modelId } = this.resolveModel(request.model);
    const ctx: AdapterCallContext = { auth, baseUrl };

    // Try sidecar path first if available.
    if (isSidecarAvailable()) {
      try {
        return await this.chatViaSidecar({ ...request, model: modelId }, ctx);
      } catch (err) {
        this.emit('sidecar-fallback', { reason: err instanceof Error ? err.message : String(err) });
      }
    }

    // In-process path.
    const adapter = getAdapterForProvider(provider);
    return adapter.chat({ ...request, model: modelId }, ctx);
  }

  async *chatStream(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<StreamChunk> {
    const { provider, auth, baseUrl, modelId } = this.resolveModel(request.model);
    const ctx: AdapterCallContext = { auth, baseUrl, signal };

    if (isSidecarAvailable()) {
      try {
        yield* this.chatStreamViaSidecar({ ...request, model: modelId }, ctx);
        return;
      } catch (err) {
        this.emit('sidecar-fallback', { reason: err instanceof Error ? err.message : String(err) });
      }
    }

    const adapter = getAdapterForProvider(provider);
    yield* adapter.chatStream({ ...request, model: modelId }, ctx);
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

  /**
   * List all models available for a provider: from the merged provider definition
   * (which includes models.dev entries) + any custom models from config.
   * No network call — uses cached data only.
   */
  listAvailableModels(providerId: string): ResolvedModel[] {
    const modelsDevClient = getModelsDevClient();
    const providers = modelsDevClient.getMergedProviders();
    const provider = providers.find((p) => p.id === providerId);
    if (!provider || !provider.models) return [];

    const out: ResolvedModel[] = [];
    for (const [modelId, model] of Object.entries(provider.models)) {
      // Check whitelist/blacklist.
      if (provider.whitelist && provider.whitelist.length > 0 && !provider.whitelist.includes(modelId)) continue;
      if (provider.blacklist && provider.blacklist.includes(modelId)) continue;

      out.push({
        id: modelId,
        qualifiedId: `${providerId}/${modelId}`,
        providerId,
        displayName: model.name || modelId,
        contextWindow: model.limit?.context,
        maxOutput: model.limit?.output,
        supportsStreaming: true,
        supportsToolUse: model.tool_call ?? true,
        supportsThinking: model.reasoning ?? false,
        supportsAttachment: model.attachment ?? false,
        cost: model.cost,
        status: model.status,
        source: 'models-dev',
      });
    }
    return out;
  }

  // ─── Sidecar paths ──────────────────────────────────────────────────────────

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
