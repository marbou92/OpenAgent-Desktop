/**
 * OpenAgent-Desktop - Provider Router
 *
 * Handles mesh LLM routing, fallback chains, and request dispatching.
 * Routes different tasks to different providers based on configured
 * mesh routes and fallback chains.
 */

import {
  ChatRequest,
  ChatResponse,
  StreamChunk,
  MeshRoute,
  FallbackChain,
  HealthStatus,
  HealthCheck,
  ProviderError,
  ProviderErrorType,
  Message,
} from './types';
import { ProviderRegistry } from './provider-registry';
import { EventEmitter } from 'events';

export class ProviderRouter {
  private registry: ProviderRegistry;
  private fallbackChains: Map<string, FallbackChain> = new Map();
  private meshRoutes: MeshRoute[] = [];
  private healthChecks: Map<string, HealthCheck> = new Map();
  private activeStreams: Map<string, AbortController> = new Map();
  private onHealthUpdate?: (providerId: string, check: HealthCheck) => void;

  constructor(
    registry: ProviderRegistry,
    healthChecks: Map<string, HealthCheck>,
    onHealthUpdate?: (providerId: string, check: HealthCheck) => void
  ) {
    this.registry = registry;
    this.healthChecks = healthChecks;
    this.onHealthUpdate = onHealthUpdate;
  }

  setHealthUpdateCallback(callback: (providerId: string, check: HealthCheck) => void): void {
    this.onHealthUpdate = callback;
  }

  // ─── Chat Dispatching ───────────────────────────────────────────────────────

  async chat(providerId: string, request: ChatRequest): Promise<ChatResponse> {
    const provider = this.registry.getProvider(providerId);
    if (!provider) {
      throw new ProviderError(
        `Provider not found: ${providerId}`,
        ProviderErrorType.CONFIGURATION,
        providerId
      );
    }

    try {
      const result = await provider.chat(request);
      this.updateHealthCheck(providerId, HealthStatus.healthy);
      return result;
    } catch (error) {
      // Try fallback chain
      const fallback = await this.tryFallback(providerId, request);
      if (fallback) return fallback;

      this.updateHealthCheck(
        providerId,
        HealthStatus.degraded,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  async *chatStream(
    providerId: string,
    request: ChatRequest
  ): AsyncGenerator<StreamChunk> {
    const provider = this.registry.getProvider(providerId);
    if (!provider) {
      throw new ProviderError(
        `Provider not found: ${providerId}`,
        ProviderErrorType.CONFIGURATION,
        providerId
      );
    }

    try {
      yield* provider.chatStream(request);
      this.updateHealthCheck(providerId, HealthStatus.healthy);
    } catch (error) {
      // Try fallback chain (non-streaming)
      const fallback = await this.tryFallback(providerId, request);
      if (fallback && fallback.message) {
        yield { type: 'content', content: fallback.message.content };
        if (fallback.usage) yield { type: 'usage', usage: fallback.usage };
        yield { type: 'done' };
        return;
      }

      this.updateHealthCheck(
        providerId,
        HealthStatus.degraded,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  // ─── IPC-Facing Convenience Methods ─────────────────────────────────────────

  async send(
    providerId: string,
    model: string,
    messages: any[],
    message: string,
    options: any
  ): Promise<any> {
    const provider = this.registry.getProvider(providerId);
    if (!provider) {
      throw new ProviderError(
        `Provider not found: ${providerId}`,
        ProviderErrorType.CONFIGURATION,
        providerId
      );
    }

    const chatMessages: Message[] = [
      ...(messages || []).map((m: any) => ({
        role: m.role || 'user',
        content: m.content || '',
        toolCalls: m.toolCalls,
        toolCallId: m.toolCallId,
        metadata: m.metadata,
      })),
      { role: 'user' as const, content: message },
    ];

    const request: ChatRequest = {
      messages: chatMessages,
      model,
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
      tools: options?.tools,
      stream: false,
    };

    const response = await provider.chat(request);
    return {
      content: response.message.content,
      usage: response.usage,
      thinking: response.thinking,
      id: response.id,
    };
  }

  async stream(
    providerId: string,
    model: string,
    messages: any[],
    message: string,
    options: any
  ): Promise<EventEmitter> {
    const provider = this.registry.getProvider(providerId);
    if (!provider) {
      throw new ProviderError(
        `Provider not found: ${providerId}`,
        ProviderErrorType.CONFIGURATION,
        providerId
      );
    }

    const sessionId: string = options?.sessionId || `stream_${Date.now()}`;
    const abortController = new AbortController();
    this.activeStreams.set(sessionId, abortController);

    const emitter = new EventEmitter();

    const chatMessages: Message[] = [
      ...(messages || []).map((m: any) => ({
        role: m.role || 'user',
        content: m.content || '',
        toolCalls: m.toolCalls,
        toolCallId: m.toolCallId,
        metadata: m.metadata,
      })),
      { role: 'user' as const, content: message },
    ];

    const request: ChatRequest = {
      messages: chatMessages,
      model,
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
      tools: options?.tools,
      stream: true,
    };

    // Process the async generator in the background, forwarding events
    (async () => {
      let fullContent = '';
      try {
        for await (const chunk of provider.chatStream(request)) {
          // Check if stream was cancelled
          if (abortController.signal.aborted) {
            return;
          }

          switch (chunk.type) {
            case 'content':
              fullContent += chunk.content || '';
              emitter.emit('data', chunk.content || '');
              break;
            case 'thinking':
              emitter.emit('thinking', chunk.content || '');
              break;
            case 'tool_call':
              emitter.emit('tool_call', chunk.toolCall);
              break;
            case 'tool_result':
              emitter.emit('tool_result', chunk.toolCall);
              break;
            case 'usage':
              // Usage info — no separate event, will be included in end
              break;
            case 'done':
              break;
          }
        }

        if (!abortController.signal.aborted) {
          emitter.emit('end', fullContent);
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          emitter.emit('error', error instanceof Error ? error : new Error(String(error)));
        }
      } finally {
        this.activeStreams.delete(sessionId);
      }
    })();

    return emitter;
  }

  async cancelStream(sessionId: string): Promise<void> {
    const controller = this.activeStreams.get(sessionId);
    if (controller) {
      controller.abort();
      this.activeStreams.delete(sessionId);
    }
  }

  // ─── List Models ────────────────────────────────────────────────────────────

  async listModels(providerId: string): Promise<string[]> {
    const provider = this.registry.getProvider(providerId);
    if (!provider) {
      throw new ProviderError(
        `Provider not found: ${providerId}`,
        ProviderErrorType.CONFIGURATION,
        providerId
      );
    }
    return provider.listModels();
  }

  // ─── Test Connection ────────────────────────────────────────────────────────

  async test(id: string): Promise<boolean> {
    const provider = this.registry.getProvider(id);
    if (!provider) {
      throw new ProviderError(
        `Provider not found: ${id}`,
        ProviderErrorType.CONFIGURATION,
        id
      );
    }

    try {
      const result = await provider.test();
      this.updateHealthCheck(id, result ? HealthStatus.healthy : HealthStatus.unhealthy);
      return result;
    } catch (error) {
      this.updateHealthCheck(
        id,
        HealthStatus.unhealthy,
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  }

  async testAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    const promises = Array.from(this.registry.getProvidersMap().keys()).map(async (id) => {
      results[id] = await this.test(id);
    });
    await Promise.allSettled(promises);
    return results;
  }

  // ─── Mesh LLM Routing ──────────────────────────────────────────────────────

  addMeshRoute(route: MeshRoute): void {
    // Remove existing route for same task type and provider
    this.meshRoutes = this.meshRoutes.filter(
      (r) => !(r.taskType === route.taskType && r.providerId === route.providerId)
    );
    this.meshRoutes.push(route);
    this.meshRoutes.sort((a, b) => b.priority - a.priority);
  }

  removeMeshRoute(taskType: string, providerId: string): void {
    this.meshRoutes = this.meshRoutes.filter(
      (r) => !(r.taskType === taskType && r.providerId === providerId)
    );
  }

  getMeshRoutes(taskType?: string): MeshRoute[] {
    if (taskType) {
      return this.meshRoutes.filter((r) => r.taskType === taskType);
    }
    return [...this.meshRoutes];
  }

  async meshChat(
    taskType: string,
    request: ChatRequest
  ): Promise<ChatResponse> {
    const routes = this.getMeshRoutes(taskType);
    if (routes.length === 0) {
      // Fall back to default provider
      const defaultProvider = this.registry.getDefault();
      if (!defaultProvider) {
        throw new ProviderError(
          'No provider available for mesh routing',
          ProviderErrorType.CONFIGURATION,
          'mesh'
        );
      }
      return defaultProvider.chat(request);
    }

    // Try routes in priority order
    for (const route of routes) {
      const provider = this.registry.getProvider(route.providerId);
      if (!provider || !this.registry.getProviderConfig(route.providerId)?.enabled) {
        continue;
      }

      try {
        const routedRequest = { ...request, model: route.model || request.model };
        return await provider.chat(routedRequest);
      } catch {
        continue;
      }
    }

    // All mesh routes failed, fall back
    const defaultProvider = this.registry.getDefault();
    if (defaultProvider) {
      return defaultProvider.chat(request);
    }

    throw new ProviderError(
      `All mesh routes failed for task type: ${taskType}`,
      ProviderErrorType.SERVER_ERROR,
      'mesh'
    );
  }

  async *meshChatStream(
    taskType: string,
    request: ChatRequest
  ): AsyncGenerator<StreamChunk> {
    const routes = this.getMeshRoutes(taskType);
    if (routes.length === 0) {
      const defaultProvider = this.registry.getDefault();
      if (!defaultProvider) {
        throw new ProviderError(
          'No provider available for mesh routing',
          ProviderErrorType.CONFIGURATION,
          'mesh'
        );
      }
      yield* defaultProvider.chatStream(request);
      return;
    }

    for (const route of routes) {
      const provider = this.registry.getProvider(route.providerId);
      if (!provider || !this.registry.getProviderConfig(route.providerId)?.enabled) {
        continue;
      }

      try {
        const routedRequest = { ...request, model: route.model || request.model };
        yield* provider.chatStream(routedRequest);
        return;
      } catch {
        continue;
      }
    }

    // All mesh routes failed
    const defaultProvider = this.registry.getDefault();
    if (defaultProvider) {
      yield* defaultProvider.chatStream(request);
      return;
    }

    throw new ProviderError(
      `All mesh routes failed for task type: ${taskType}`,
      ProviderErrorType.SERVER_ERROR,
      'mesh'
    );
  }

  // ─── Fallback Chains ────────────────────────────────────────────────────────

  addFallbackChain(chain: FallbackChain): void {
    this.fallbackChains.set(chain.id, chain);
  }

  removeFallbackChain(id: string): void {
    this.fallbackChains.delete(id);
  }

  getFallbackChain(id: string): FallbackChain | undefined {
    return this.fallbackChains.get(id);
  }

  getAllFallbackChains(): FallbackChain[] {
    return Array.from(this.fallbackChains.values());
  }

  private async tryFallback(
    failedProviderId: string,
    request: ChatRequest
  ): Promise<ChatResponse | null> {
    // Find chains that include the failed provider
    for (const chain of this.fallbackChains.values()) {
      const failedIndex = chain.routes.findIndex(
        (r) => r.providerId === failedProviderId
      );
      if (failedIndex === -1) continue;

      // Try subsequent providers in the chain
      for (let i = failedIndex + 1; i < chain.routes.length; i++) {
        const route = chain.routes[i];
        const provider = this.registry.getProvider(route.providerId);
        if (!provider || !this.registry.getProviderConfig(route.providerId)?.enabled) {
          continue;
        }

        try {
          const routedRequest = {
            ...request,
            model: route.model || request.model,
          };
          return await provider.chat(routedRequest);
        } catch {
          continue;
        }
      }
    }

    // If no chain, try all enabled providers
    const enabledProviders = this.registry.getEnabledProviders().filter(
      (p) => p.id !== failedProviderId
    );

    for (const provider of enabledProviders) {
      try {
        return await provider.chat(request);
      } catch {
        continue;
      }
    }

    return null;
  }

  // ─── Health Check Helpers ───────────────────────────────────────────────────

  private updateHealthCheck(
    providerId: string,
    status: HealthStatus,
    error?: string
  ): void {
    const existing = this.healthChecks.get(providerId);
    const consecutiveFailures =
      status === HealthStatus.healthy
        ? 0
        : (existing?.consecutiveFailures || 0) + 1;

    const check: HealthCheck = {
      providerId,
      status,
      latencyMs: existing?.latencyMs || 0,
      lastChecked: Date.now(),
      error,
      consecutiveFailures,
    };

    this.healthChecks.set(providerId, check);

    // Notify via callback
    if (this.onHealthUpdate) {
      try { this.onHealthUpdate(providerId, check); } catch { /* intentional */ }
    }
  }

  // ─── Accessors for facade ───────────────────────────────────────────────────

  getMeshRoutesList(): MeshRoute[] {
    return this.meshRoutes;
  }

  setMeshRoutes(routes: MeshRoute[]): void {
    this.meshRoutes = routes;
  }

  getFallbackChainsMap(): Map<string, FallbackChain> {
    return this.fallbackChains;
  }

  getActiveStreamsMap(): Map<string, AbortController> {
    return this.activeStreams;
  }
}
