/**
 * OpenAgent-Desktop - Provider System
 * Barrel export for all provider modules
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export {
  ProviderType,
  ProviderConfig,
  MessageRole,
  ToolCall,
  Message,
  ChatRequest,
  ChatResponse,
  TokenUsage,
  StreamChunkType,
  StreamChunk,
  ToolDefinition,
  ProviderInterface,
  ProviderErrorType,
  ProviderError,
  ProviderMetadata,
  ProviderRegistryEntry,
  HealthStatus,
  HealthCheck,
  MeshRoute,
  FallbackChain,
  AutoDetectResult,
  SSEEvent,
  RateLimitInfo,
  RequestLogEntry,
} from './types';

// ─── Base Provider ─────────────────────────────────────────────────────────────

export {
  BaseProvider,
  RateLimiter,
  RequestLogger,
  DEFAULT_RETRY_CONFIG,
} from './base-provider';

export type { RetryConfig } from './base-provider';

// ─── Anthropic Provider ────────────────────────────────────────────────────────

export { AnthropicProvider, ANTHROPIC_MODELS } from './anthropic-provider';

// ─── OpenAI Provider ───────────────────────────────────────────────────────────

export { OpenAIProvider, OPENAI_MODELS } from './openai-provider';

// ─── Gemini Provider ───────────────────────────────────────────────────────────

export { GeminiProvider, GEMINI_MODELS } from './gemini-provider';

// ─── Azure OpenAI Provider ─────────────────────────────────────────────────────

export { AzureOpenAIProvider, AZURE_OPENAI_MODELS } from './azure-openai-provider';

// ─── Amazon Bedrock Provider ───────────────────────────────────────────────────

export { AmazonBedrockProvider, BEDROCK_MODELS } from './amazon-bedrock-provider';

// ─── GCP Vertex AI Provider ────────────────────────────────────────────────────

export { GcpVertexProvider, VERTEX_MODELS } from './gcp-vertex-provider';

// ─── Groq Provider ─────────────────────────────────────────────────────────────

export { GroqProvider, GROQ_MODELS } from './groq-provider';

// ─── Mistral Provider ──────────────────────────────────────────────────────────

export { MistralProvider, MISTRAL_MODELS } from './mistral-provider';

// ─── Ollama Provider ───────────────────────────────────────────────────────────

export { OllamaProvider, OLLAMA_MODELS } from './ollama-provider';

// ─── OpenRouter Provider ───────────────────────────────────────────────────────

export { OpenRouterProvider, OPENROUTER_MODELS } from './openrouter-provider';

// ─── OpenCode Provider ─────────────────────────────────────────────────────────

export {
  OpenCodeProvider,
  OPENCODE_MODELS,
  OpenCodeSession,
  OpenCodeMessage,
  OpenCodeMessageBody,
  OpenCodeQuestion,
  OpenCodePermission,
  OpenCodeAppInfo,
} from './opencode-provider';

// ─── GitHub Copilot Provider ───────────────────────────────────────────────────

export { GitHubCopilotProvider, COPILOT_MODELS } from './github-copilot-provider';

// ─── Sub-Modules (extracted from manager.ts) ───────────────────────────────────

export { ProviderRegistry } from './provider-registry';
export { ProviderRouter } from './provider-router';
export { ProviderAutoDetector } from './provider-autodetect';

// ─── Provider Manager (Facade) ─────────────────────────────────────────────────

import {
  ProviderType,
  ProviderConfig,
  ProviderInterface,
  ProviderMetadata,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  HealthStatus,
  HealthCheck,
  MeshRoute,
  FallbackChain,
  AutoDetectResult,
} from './types';
import { ProviderRegistry } from './provider-registry';
import { ProviderRouter } from './provider-router';
import { ProviderAutoDetector } from './provider-autodetect';
import { StorageAdapter } from './file-storage';
import { EventEmitter } from 'events';

export type { StorageAdapter } from './file-storage';

export class ProviderManager {
  private registry: ProviderRegistry;
  private router: ProviderRouter;
  private autodetector: ProviderAutoDetector;
  private healthChecks: Map<string, HealthCheck> = new Map();
  private healthMonitorInterval?: ReturnType<typeof setInterval>;
  private healthMonitorIdleInterval?: ReturnType<typeof setInterval>;
  private isInitialized = false;
  private onHealthUpdate?: (providerId: string, check: HealthCheck) => void;

  constructor(storageOrPath?: StorageAdapter | string) {
    this.registry = new ProviderRegistry(storageOrPath);
    this.router = new ProviderRouter(
      this.registry,
      this.healthChecks,
      (providerId, check) => {
        if (this.onHealthUpdate) {
          try { this.onHealthUpdate(providerId, check); } catch { /* intentional */ }
        }
      }
    );
    this.autodetector = new ProviderAutoDetector(this.registry);
  }

  /**
   * Set a callback to be called whenever a health check is updated.
   * Used by main.ts to emit 'provider:health-update' IPC events.
   */
  setHealthUpdateCallback(callback: (providerId: string, check: HealthCheck) => void): void {
    this.onHealthUpdate = callback;
    this.router.setHealthUpdateCallback(callback);
  }

  // ─── Initialization ─────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Load persisted configs
    await this.registry.loadConfigs();

    // Auto-detect from environment
    await this.autodetector.autoDetectProviders();

    // Start health monitoring
    this.startHealthMonitoring();

    this.isInitialized = true;
  }

  async shutdown(): Promise<void> {
    if (this.healthMonitorInterval) {
      clearInterval(this.healthMonitorInterval);
      this.healthMonitorInterval = undefined;
    }
    if (this.healthMonitorIdleInterval) {
      clearInterval(this.healthMonitorIdleInterval);
      this.healthMonitorIdleInterval = undefined;
    }
    this.isInitialized = false;
  }

  // ─── CRUD Operations (delegated to registry) ────────────────────────────────

  async addProvider(config: Omit<ProviderConfig, 'id' | 'createdAt'>): Promise<ProviderInterface> {
    return this.registry.addProvider(config);
  }

  async updateProvider(
    id: string,
    updates: Partial<Omit<ProviderConfig, 'id' | 'createdAt'>>
  ): Promise<ProviderInterface> {
    return this.registry.updateProvider(id, updates);
  }

  async removeProvider(id: string): Promise<void> {
    this.healthChecks.delete(id);
    return this.registry.removeProvider(id);
  }

  getProvider(id: string): ProviderInterface | undefined {
    return this.registry.getProvider(id);
  }

  getProviderConfig(id: string): ProviderConfig | undefined {
    return this.registry.getProviderConfig(id);
  }

  getAllProviders(): ProviderInterface[] {
    return this.registry.getAllProviders();
  }

  getAllConfigs(): ProviderConfig[] {
    return this.registry.getAllConfigs();
  }

  getEnabledProviders(): ProviderInterface[] {
    return this.registry.getEnabledProviders();
  }

  // ─── IPC-Facing Convenience Methods (delegated to router) ────────────────────

  async list(): Promise<ProviderConfig[]> {
    return this.getAllConfigs();
  }

  async add(config: Record<string, unknown>): Promise<ProviderInterface> {
    const providerConfig: Omit<ProviderConfig, 'id' | 'createdAt'> = {
      type: config.type as ProviderType,
      name: (config.name as string) || 'Unnamed Provider',
      apiKey: config.apiKey as string | undefined,
      apiHost: config.apiHost as string | undefined,
      apiBasePath: config.apiBasePath as string | undefined,
      organization: config.organization as string | undefined,
      region: config.region as string | undefined,
      profile: config.profile as string | undefined,
      deploymentName: config.deploymentName as string | undefined,
      projectId: config.projectId as string | undefined,
      customHeaders: config.customHeaders as Record<string, string> | undefined,
      models: config.models as string[] | undefined,
      enabled: config.enabled as boolean ?? true,
      isDefault: config.isDefault as boolean ?? false,
    };

    return this.addProvider(providerConfig);
  }

  async remove(id: string): Promise<void> {
    return this.removeProvider(id);
  }

  async send(
    providerId: string,
    model: string,
    messages: any[],
    message: string,
    options: any
  ): Promise<any> {
    return this.router.send(providerId, model, messages, message, options);
  }

  async stream(
    providerId: string,
    model: string,
    messages: any[],
    message: string,
    options: any
  ): Promise<EventEmitter> {
    return this.router.stream(providerId, model, messages, message, options);
  }

  async cancelStream(sessionId: string): Promise<void> {
    return this.router.cancelStream(sessionId);
  }

  // ─── Default Provider (delegated to registry) ────────────────────────────────

  getDefault(): ProviderInterface | undefined {
    return this.registry.getDefault();
  }

  getDefaultConfig(): ProviderConfig | undefined {
    return this.registry.getDefaultConfig();
  }

  async setDefault(id: string): Promise<void> {
    return this.registry.setDefault(id);
  }

  // ─── Test Connection (delegated to router) ──────────────────────────────────

  async test(id: string): Promise<boolean> {
    return this.router.test(id);
  }

  async testAll(): Promise<Record<string, boolean>> {
    return this.router.testAll();
  }

  // ─── Chat (delegated to router) ─────────────────────────────────────────────

  async chat(providerId: string, request: ChatRequest): Promise<ChatResponse> {
    return this.router.chat(providerId, request);
  }

  // ─── Chat Stream (delegated to router) ──────────────────────────────────────

  async *chatStream(
    providerId: string,
    request: ChatRequest
  ): AsyncGenerator<StreamChunk> {
    yield* this.router.chatStream(providerId, request);
  }

  // ─── List Models (delegated to router) ──────────────────────────────────────

  async listModels(providerId: string): Promise<string[]> {
    return this.router.listModels(providerId);
  }

  // ─── Auto-Detection (delegated to autodetector) ─────────────────────────────

  async autoDetectProviders(): Promise<AutoDetectResult[]> {
    return this.autodetector.autoDetectProviders();
  }

  // ─── Mesh LLM Routing (delegated to router) ─────────────────────────────────

  addMeshRoute(route: MeshRoute): void {
    return this.router.addMeshRoute(route);
  }

  removeMeshRoute(taskType: string, providerId: string): void {
    return this.router.removeMeshRoute(taskType, providerId);
  }

  getMeshRoutes(taskType?: string): MeshRoute[] {
    return this.router.getMeshRoutes(taskType);
  }

  async meshChat(
    taskType: string,
    request: ChatRequest
  ): Promise<ChatResponse> {
    return this.router.meshChat(taskType, request);
  }

  async *meshChatStream(
    taskType: string,
    request: ChatRequest
  ): AsyncGenerator<StreamChunk> {
    yield* this.router.meshChatStream(taskType, request);
  }

  // ─── Fallback Chains (delegated to router) ──────────────────────────────────

  addFallbackChain(chain: FallbackChain): void {
    return this.router.addFallbackChain(chain);
  }

  removeFallbackChain(id: string): void {
    return this.router.removeFallbackChain(id);
  }

  getFallbackChain(id: string): FallbackChain | undefined {
    return this.router.getFallbackChain(id);
  }

  getAllFallbackChains(): FallbackChain[] {
    return this.router.getAllFallbackChains();
  }

  // ─── Health Monitoring ──────────────────────────────────────────────────────

  async performHealthCheck(providerId: string): Promise<HealthCheck> {
    const provider = this.registry.getProvider(providerId);
    const config = this.registry.getProviderConfig(providerId);
    const existing = this.healthChecks.get(providerId);

    if (!provider || !config) {
      const check: HealthCheck = {
        providerId,
        status: HealthStatus.unknown,
        latencyMs: 0,
        lastChecked: Date.now(),
        error: 'Provider not found',
        consecutiveFailures: existing?.consecutiveFailures || 0,
      };
      this.healthChecks.set(providerId, check);
      return check;
    }

    const start = Date.now();
    try {
      // Try listModels first (lighter weight), fall back to test()
      let isHealthy = false;
      try {
        const models = await Promise.race([
          provider.listModels(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 15000)
          ),
        ]);
        isHealthy = Array.isArray(models);
      } catch {
        // listModels failed, try test() as fallback
        isHealthy = await Promise.race([
          provider.test(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 15000)
          ),
        ]);
      }

      const latencyMs = Date.now() - start;
      const consecutiveFailures = isHealthy ? 0 : (existing?.consecutiveFailures || 0) + 1;

      const check: HealthCheck = {
        providerId,
        status: isHealthy
          ? HealthStatus.healthy
          : consecutiveFailures >= 3
            ? HealthStatus.unhealthy
            : HealthStatus.degraded,
        latencyMs,
        lastChecked: Date.now(),
        consecutiveFailures,
      };

      this.healthChecks.set(providerId, check);

      // Notify via callback
      if (this.onHealthUpdate) {
        try { this.onHealthUpdate(providerId, check); } catch { /* intentional */ }
      }

      return check;
    } catch (error) {
      const consecutiveFailures = (existing?.consecutiveFailures || 0) + 1;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Classify error type for more specific status
      let status = HealthStatus.degraded;
      if (consecutiveFailures >= 3) {
        status = HealthStatus.unhealthy;
      }
      if (errorMessage.includes('Timeout') || errorMessage.includes('ETIMEDOUT') || errorMessage.includes('timed out')) {
        status = consecutiveFailures >= 2 ? HealthStatus.unhealthy : HealthStatus.degraded;
      }
      if (errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('auth')) {
        status = HealthStatus.unhealthy; // Auth failures are definitive
      }

      const check: HealthCheck = {
        providerId,
        status,
        latencyMs: Date.now() - start,
        lastChecked: Date.now(),
        error: errorMessage,
        consecutiveFailures,
      };

      this.healthChecks.set(providerId, check);

      // Notify via callback
      if (this.onHealthUpdate) {
        try { this.onHealthUpdate(providerId, check); } catch { /* intentional */ }
      }

      return check;
    }
  }

  private startHealthMonitoring(): void {
    const ACTIVE_INTERVAL = 15 * 60 * 1000;  // 15 minutes
    const IDLE_INTERVAL = 60 * 60 * 1000;     // 60 minutes

    // Check active (enabled) providers every 15 minutes
    this.healthMonitorInterval = setInterval(async () => {
      const enabledConfigs = Array.from(this.registry.getConfigsMap().values()).filter((c) => c.enabled);
      for (const config of enabledConfigs) {
        try {
          await this.performHealthCheck(config.id);
        } catch {
          // performHealthCheck handles errors internally
        }
      }
    }, ACTIVE_INTERVAL);

    // Check idle (disabled) providers every 60 minutes
    this.healthMonitorIdleInterval = setInterval(async () => {
      const disabledConfigs = Array.from(this.registry.getConfigsMap().values()).filter((c) => !c.enabled);
      for (const config of disabledConfigs) {
        try {
          await this.performHealthCheck(config.id);
        } catch {
          // performHealthCheck handles errors internally
        }
      }
    }, IDLE_INTERVAL);

    // Run an initial health check immediately for enabled providers
    (async () => {
      const enabledConfigs = Array.from(this.registry.getConfigsMap().values()).filter((c) => c.enabled);
      for (const config of enabledConfigs) {
        try {
          await this.performHealthCheck(config.id);
        } catch { /* intentional */ }
      }
    })();
  }

  async runHealthChecks(): Promise<Record<string, HealthCheck>> {
    const results: Record<string, HealthCheck> = {};
    const enabled = Array.from(this.registry.getConfigsMap().values()).filter((c) => c.enabled);

    const promises = enabled.map(async (config) => {
      const provider = this.registry.getProvider(config.id);
      if (!provider) return;

      const start = Date.now();
      try {
        const isHealthy = await provider.test();
        const latencyMs = Date.now() - start;

        const existing = this.healthChecks.get(config.id);
        const consecutiveFailures = isHealthy
          ? 0
          : (existing?.consecutiveFailures || 0) + 1;

        const check: HealthCheck = {
          providerId: config.id,
          status: isHealthy
            ? HealthStatus.healthy
            : consecutiveFailures >= 3
              ? HealthStatus.unhealthy
              : HealthStatus.degraded,
          latencyMs,
          lastChecked: Date.now(),
          consecutiveFailures,
        };

        this.healthChecks.set(config.id, check);
        results[config.id] = check;
      } catch (error) {
        const existing = this.healthChecks.get(config.id);
        const consecutiveFailures = (existing?.consecutiveFailures || 0) + 1;

        const check: HealthCheck = {
          providerId: config.id,
          status:
            consecutiveFailures >= 3
              ? HealthStatus.unhealthy
              : HealthStatus.degraded,
          latencyMs: Date.now() - start,
          lastChecked: Date.now(),
          error: error instanceof Error ? error.message : String(error),
          consecutiveFailures,
        };

        this.healthChecks.set(config.id, check);
        results[config.id] = check;
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  getHealthCheck(providerId: string): HealthCheck | undefined {
    return this.healthChecks.get(providerId);
  }

  getAllHealthChecks(): Record<string, HealthCheck> {
    const result: Record<string, HealthCheck> = {};
    for (const [id, check] of this.healthChecks) {
      result[id] = check;
    }
    return result;
  }

  // ─── Metadata (delegated to registry) ───────────────────────────────────────

  getProviderMetadata(type: ProviderType): ProviderMetadata {
    return this.registry.getProviderMetadata(type);
  }

  getAllProviderMetadata(): Record<ProviderType, ProviderMetadata> {
    return this.registry.getAllProviderMetadata();
  }

  getSupportedProviderTypes(): ProviderType[] {
    return this.registry.getSupportedProviderTypes();
  }

  // ─── Export / Import Configs (delegated to registry with extra data) ─────────

  exportConfigs(): string {
    return this.registry.exportConfigs({
      meshRoutes: this.router.getMeshRoutesList(),
      fallbackChains: this.router.getAllFallbackChains(),
    });
  }

  async importConfigs(json: string): Promise<void> {
    return this.registry.importConfigs(json, (data) => {
      if (data.meshRoutes && Array.isArray(data.meshRoutes)) {
        this.router.setMeshRoutes(data.meshRoutes);
      }

      if (data.fallbackChains && Array.isArray(data.fallbackChains)) {
        const chainsMap = this.router.getFallbackChainsMap();
        chainsMap.clear();
        for (const chain of data.fallbackChains) {
          chainsMap.set(chain.id, chain);
        }
      }
    });
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────────

let managerInstance: ProviderManager | undefined;

export function getProviderManager(storageOrPath?: StorageAdapter | string): ProviderManager {
  if (!managerInstance) {
    managerInstance = new ProviderManager(storageOrPath);
  }
  return managerInstance;
}

export function setProviderManager(manager: ProviderManager): void {
  managerInstance = manager;
}

// ─── File Storage ──────────────────────────────────────────────────────────────

export { FileStorageAdapter, StorageAdapter } from './file-storage';

// ─── Config Sets ──────────────────────────────────────────────────────────────

export { ConfigSetManager } from './config-sets';
export type { ProviderConfigSet } from './config-sets';

// ─── Model Variants ──────────────────────────────────────────────────────────

export { ModelVariantManager } from './model-variants';
export type { ModelVariant } from './model-variants';

// ─── Diagnostics ─────────────────────────────────────────────────────────────

export { ProviderDiagnostics } from './diagnostics';
export type {
  DiagnosticStep,
  DiagnosticStatus,
  DiagnosticResult,
  FullDiagnosticReport,
} from './diagnostics';

// ─── OpenAI-Compatible Provider ──────────────────────────────────────────────

export { OpenAICompatibleProvider, OPENAI_COMPATIBLE_PRESETS } from './openai-compatible-provider';
export type { OpenAICompatiblePreset } from './openai-compatible-provider';

// ─── Model ID Resolver ──────────────────────────────────────────────────────

export { ModelIdResolver, getModelIdResolver, setModelIdResolver, resetModelIdResolver } from './model-id-resolver';
export type { ResolvedModelId } from './model-id-resolver';

// ─── Provider Catalog ───────────────────────────────────────────────────────

export { ProviderCatalog, getProviderCatalog, setProviderCatalog, resetProviderCatalog } from './provider-catalog';
export type { ProviderCatalogEntry, ProviderPreset, ProviderCategory, ProviderDifficulty } from './provider-catalog';

// ─── Gateway Router ─────────────────────────────────────────────────────────

export { GatewayRouter, getGatewayRouter, setGatewayRouter, resetGatewayRouter } from './gateway-router';
export type {
  RoutingStrategy,
  CostTier,
  SpeedTier,
  RoutingRule,
  RoutingCondition,
  RouteResult,
  ProviderHealthInfo,
} from './gateway-router';
