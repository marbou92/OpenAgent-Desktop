/**
 * OpenAgent-Desktop - Provider Client
 *
 * The unified entry point for chat / chatStream / discoverModels. Routes each
 * request to the correct protocol adapter based on the model's qualified id.
 *
 * Two execution paths:
 *
 *   1. If @opencode-ai/sdk is installed AND the OpenCode sidecar is running,
 *      delegate to the sidecar via the SDK. This is the "true opencode-desktop"
 *      architecture — the sidecar manages connection pooling, retries, and
 *      observability for us.
 *
 *   2. Otherwise (sidecar not running / @opencode-ai/sdk not installed — common
 *      on Windows 7 where the sidecar may not start), fall back to in-process
 *      execution by calling the protocol adapter directly from the Electron
 *      main process.
 *
 * Both paths return the same StreamChunk shape, so downstream code (chat UI,
 * recipe executor, agent runner) doesn't care which path is active.
 */

import { EventEmitter } from 'events';
import {
  AuthEntry,
  ChatRequest,
  ChatResponse,
  DiscoveredModel,
  ProviderProtocol,
  ResolvedModel,
  StreamChunk,
} from './v3-types';
import { AuthStore } from './auth-store';
import { getProviderRegistry } from './provider-registry';
import { getAdapter } from './protocol-adapters';
import { AdapterCallContext } from './protocol-adapters/adapter';

// Try to dynamically import the SDK. If it's not installed, sidecar path is disabled.
let sdkLoaded = false;
let opencodeClientFactory: ((opts: { baseUrl: string; auth?: string }) => any) | null = null;
try {
  // Using a dynamic require so the import doesn't crash the build if the package is missing.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sdk = require('@opencode-ai/sdk');
  if (sdk && typeof sdk.createClient === 'function') {
    opencodeClientFactory = sdk.createClient;
    sdkLoaded = true;
  }
} catch {
  // SDK not installed — sidecar path disabled, in-process fallback only.
}

// Sidecar state — set by main.ts when the sidecar starts.
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
  constructor(private authStore: AuthStore) {
    super();
  }

  /**
   * Parse a qualified model id ('openai/gpt-4o' or 'custom:my-proxy/llama-3') into
   * { providerId, modelId, protocol, configuredProvider, definition }.
   * Throws if the provider is not configured.
   */
  resolveModel(qualifiedModelId: string): {
    providerId: string;
    modelId: string;
    protocol: ProviderProtocol;
    baseUrl: string;
    auth: AuthEntry;
  } {
    const slashIdx = qualifiedModelId.indexOf('/');
    if (slashIdx < 0) {
      throw new Error(`Invalid model id '${qualifiedModelId}' — expected '<providerId>/<modelId>'`);
    }
    const providerId = qualifiedModelId.slice(0, slashIdx);
    const modelId = qualifiedModelId.slice(slashIdx + 1);

    const def = getProviderRegistry().get(providerId);
    if (!def) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    const configured = this.authStore.getProvider(providerId);
    if (!configured || !configured.enabled) {
      throw new Error(`Provider '${providerId}' is not configured or is disabled`);
    }
    if (!hasNonEmptyAuth(configured.auth)) {
      throw new Error(`Provider '${providerId}' has no valid credentials — please configure it in Settings`);
    }

    const baseUrl = configured.baseUrlOverride || def.customBaseUrl || def.defaultBaseUrl;
    if (!baseUrl) {
      throw new Error(`Provider '${providerId}' has no base URL — please set one in Settings`);
    }
    return { providerId, modelId, protocol: def.protocol, baseUrl, auth: configured.auth };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const { protocol, baseUrl, auth, modelId } = this.resolveModel(request.model);
    const ctx: AdapterCallContext = { auth, baseUrl };

    // Try sidecar path first if available.
    if (isSidecarAvailable()) {
      try {
        return await this.chatViaSidecar({ ...request, model: modelId }, ctx);
      } catch (err) {
        // Sidecar failed — fall through to in-process.
        this.emit('sidecar-fallback', { reason: err instanceof Error ? err.message : String(err) });
      }
    }

    // In-process path.
    const adapter = getAdapter(protocol);
    return adapter.chat({ ...request, model: modelId }, ctx);
  }

  async *chatStream(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<StreamChunk> {
    const { protocol, baseUrl, auth, modelId } = this.resolveModel(request.model);
    const ctx: AdapterCallContext = { auth, baseUrl, signal };

    if (isSidecarAvailable()) {
      try {
        yield* this.chatStreamViaSidecar({ ...request, model: modelId }, ctx);
        return;
      } catch (err) {
        this.emit('sidecar-fallback', { reason: err instanceof Error ? err.message : String(err) });
      }
    }

    const adapter = getAdapter(protocol);
    yield* adapter.chatStream({ ...request, model: modelId }, ctx);
  }

  async discoverModels(providerId: string): Promise<DiscoveredModel[]> {
    const def = getProviderRegistry().get(providerId);
    if (!def) throw new Error(`Unknown provider: ${providerId}`);
    const configured = this.authStore.getProvider(providerId);
    if (!configured) throw new Error(`Provider '${providerId}' is not configured`);
    if (!def.modelsEndpoint) {
      throw new Error(`Provider '${providerId}' does not support model discovery`);
    }
    const baseUrl = configured.baseUrlOverride || def.customBaseUrl || def.defaultBaseUrl;
    const adapter = getAdapter(def.protocol);
    return adapter.discoverModels({ auth: configured.auth, baseUrl });
  }

  /**
   * Resolve the full list of models available for a provider: presets +
   * user-added custom models + cached discovered models. Used by the UI
   * to populate the model dropdown without making a network call.
   */
  listAvailableModels(providerId: string): ResolvedModel[] {
    const def = getProviderRegistry().get(providerId);
    if (!def) return [];
    const configured = this.authStore.getProvider(providerId);
    const out: ResolvedModel[] = [];
    const seen = new Set<string>();

    for (const preset of def.modelPresets) {
      if (seen.has(preset.id)) continue;
      seen.add(preset.id);
      out.push({
        id: preset.id,
        qualifiedId: `${providerId}/${preset.id}`,
        providerId,
        displayName: preset.displayName,
        contextWindow: preset.contextWindow,
        supportsStreaming: preset.supportsStreaming ?? true,
        supportsToolUse: preset.supportsToolUse ?? false,
        supportsThinking: preset.supportsThinking ?? false,
        source: 'preset',
      });
    }
    if (configured?.customModels) {
      for (const m of configured.customModels) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        out.push({
          id: m.id,
          qualifiedId: `${providerId}/${m.id}`,
          providerId,
          displayName: m.displayName,
          contextWindow: m.contextWindow,
          supportsStreaming: m.supportsStreaming ?? true,
          supportsToolUse: m.supportsToolUse ?? false,
          supportsThinking: m.supportsThinking ?? false,
          source: 'custom',
        });
      }
    }
    const cached = this.authStore.getCachedModels(providerId);
    if (cached) {
      for (const m of cached) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        out.push({
          id: m.id,
          qualifiedId: `${providerId}/${m.id}`,
          providerId,
          displayName: m.displayName || m.id,
          contextWindow: m.contextWindow,
          supportsStreaming: m.supportsStreaming ?? true,
          supportsToolUse: m.supportsToolUse ?? false,
          supportsThinking: m.supportsThinking ?? false,
          source: 'discovered',
        });
      }
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

function hasNonEmptyAuth(auth: AuthEntry): boolean {
  switch (auth.method) {
    case 'api_key':
      return Boolean(auth.apiKey && auth.apiKey.trim());
    case 'oauth':
      return Boolean(auth.accessToken && auth.accessToken.trim());
    case 'azure_ad':
      return Boolean(auth.tenantId && auth.clientId);
    case 'env_var':
      return Boolean(auth.envVarName && process.env[auth.envVarName]);
  }
}
