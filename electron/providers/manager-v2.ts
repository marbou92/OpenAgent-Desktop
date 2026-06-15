/**
 * OpenAgent-Desktop Aether - Unified Provider Manager (v2)
 * 
 * Thin facade that unifies OpenCode sidecar + Custom Protocol providers.
 * Routes chat requests to the correct engine based on model ID.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { SidecarManager } from '../sidecar';
import { OpenCodeBridge } from './opencode-bridge';
import { CustomBridge } from './custom-bridge';
import { CUSTOM_PROVIDER_PRESETS } from '../custom-provider/model-presets';
import type { SidecarConfig, SidecarInstance } from '../sidecar/types';
import type { CustomProviderConfig } from '../custom-provider/types';
import type { UnifiedProviderInfo, UnifiedModelInfo, ChatRequest, ChatResponse, StreamChunk, ProviderInfo } from './v2-types';

export class ProviderManager extends EventEmitter {
  private sidecarManager: SidecarManager;
  private opencodeBridge: OpenCodeBridge;
  private customBridge: CustomBridge;
  private customConfigs: Map<string, CustomProviderConfig> = new Map();
  private initialized = false;
  private legacyConfigPath: string;

  constructor(configPath?: string) {
    super();
    this.sidecarManager = new SidecarManager();
    this.opencodeBridge = new OpenCodeBridge();
    this.customBridge = new CustomBridge();
    this.legacyConfigPath = configPath || '';
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // 1. Start OpenCode sidecar
      const instance = await this.sidecarManager.start();
      this.opencodeBridge.setInstance(instance);
      this.emit('sidecar-started', instance);
    } catch (err) {
      this.emit('sidecar-error', err);
      // Continue without sidecar — custom providers still work
    }

    // 2. Load custom provider configs
    this.loadCustomConfigs();

    // 3. Forward sidecar events
    this.sidecarManager.on('status-change', (status) => this.emit('sidecar-status', status));
    this.sidecarManager.on('health', (data) => this.emit('sidecar-health', data));

    this.initialized = true;
    this.emit('initialized');
  }

  async shutdown(): Promise<void> {
    await this.sidecarManager.stop();
    this.initialized = false;
  }

  // ─── Unified Provider List ─────────────────────────────────────────

  async listProviders(): Promise<UnifiedProviderInfo[]> {
    const opencodeProviders = await this.opencodeBridge.listProviders();
    const customProviders = Array.from(this.customConfigs.values()).map(c =>
      this.customBridge.configToProviderInfo(c)
    );
    return [...opencodeProviders, ...customProviders];
  }

  // Legacy-compatible list method — returns ProviderInfo[] for the renderer
  async list(): Promise<ProviderInfo[]> {
    return this.listProvidersLegacy();
  }

  // ─── Chat (routes to correct engine) ────────────────────────────────

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (this.isCustomProvider(request.model)) {
      const config = this.getCustomConfig(request.model);
      return this.customBridge.chat(config, request);
    }
    return this.opencodeBridge.chat(request);
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    if (this.isCustomProvider(request.model)) {
      const config = this.getCustomConfig(request.model);
      yield* this.customBridge.chatStream(config, request);
    } else {
      yield* this.opencodeBridge.chatStream(request);
    }
  }

  // ─── Custom Provider CRUD ──────────────────────────────────────────

  async addCustomProvider(config: Omit<CustomProviderConfig, 'id'>): Promise<CustomProviderConfig> {
    const id = `custom:${config.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9:-]/g, '')}`;
    const fullConfig: CustomProviderConfig = { ...config, id, createdAt: Date.now() };
    this.customConfigs.set(id, fullConfig);
    await this.saveCustomConfigs();
    this.emit('custom-provider-added', fullConfig);
    return fullConfig;
  }

  async removeCustomProvider(id: string): Promise<void> {
    this.customConfigs.delete(id);
    await this.saveCustomConfigs();
    this.emit('custom-provider-removed', id);
  }

  getCustomProviderPresets() {
    return CUSTOM_PROVIDER_PRESETS;
  }

  // ─── Models ────────────────────────────────────────────────────────

  async listModels(providerId?: string): Promise<UnifiedModelInfo[]> {
    if (providerId?.startsWith('custom:')) {
      const config = this.customConfigs.get(providerId);
      return config ? config.models.map(m => ({
        id: `${providerId}/${m.id}`,
        providerId,
        displayName: m.name || m.id,
        contextWindow: m.contextWindow,
        supportsStreaming: m.supportsStreaming ?? true,
        supportsToolUse: m.supportsToolUse ?? false,
        supportsThinking: m.supportsThinking ?? false,
      })) : [];
    }
    return this.opencodeBridge.listModels(providerId);
  }

  async resolveModel(modelId: string): Promise<UnifiedModelInfo | null> {
    const models = await this.listModels();
    return models.find(m => m.id === modelId) || null;
  }

  // ─── Health ────────────────────────────────────────────────────────

  async performHealthCheck(providerId: string): Promise<{ status: string; latencyMs: number }> {
    if (providerId.startsWith('custom:')) {
      const config = this.customConfigs.get(providerId);
      if (!config) return { status: 'unknown', latencyMs: 0 };
      return this.customBridge.healthCheck(config);
    }
    return this.opencodeBridge.healthCheck(providerId);
  }

  async runHealthChecks(): Promise<Record<string, unknown>> {
    return this.opencodeBridge.getHealthDashboard();
  }

  getAllHealthChecks(): Record<string, any> {
    return {};
  }

  // ─── Sidecar ───────────────────────────────────────────────────────

  getSidecarManager(): SidecarManager {
    return this.sidecarManager;
  }

  getSidecarInstance(): SidecarInstance | null {
    return this.sidecarManager.getInstance();
  }

  async restartSidecar(config?: SidecarConfig): Promise<SidecarInstance> {
    const instance = await this.sidecarManager.restart(config);
    this.opencodeBridge.setInstance(instance);
    return instance;
  }

  // ─── Legacy Chat Convenience Methods ──────────────────────────────────

  async send(
    providerId: string,
    model: string,
    sessionMessages: any[],
    message: string,
    options?: { sessionId?: string; extensions?: string[]; sandboxManager?: any; traceCollector?: any }
  ): Promise<ChatResponse> {
    void options;
    const messages = [
      ...sessionMessages.map((m: any) => ({ role: m.role as string, content: m.content as string })),
      { role: 'user' as const, content: message },
    ];
    return this.chat({
      model: model || this.getDefaultModel(providerId),
      messages,
      stream: false,
    });
  }

  async stream(
    providerId: string,
    model: string,
    sessionMessages: any[],
    message: string,
    options?: { sessionId?: string; extensions?: string[]; sandboxManager?: any; traceCollector?: any }
  ): Promise<EventEmitter> {
    void options;
    const emitter = new EventEmitter();
    const messages = [
      ...sessionMessages.map((m: any) => ({ role: m.role as string, content: m.content as string })),
      { role: 'user' as const, content: message },
    ];

    // Start streaming in background
    (async () => {
      try {
        const chatRequest: ChatRequest = {
          model: model || this.getDefaultModel(providerId),
          messages,
          stream: true,
        };
        for await (const chunk of this.chatStream(chatRequest)) {
          if (chunk.type === 'content' && chunk.content) {
            emitter.emit('data', chunk.content);
          } else if (chunk.type === 'tool_call' && chunk.toolCall) {
            emitter.emit('tool_call', chunk.toolCall);
          } else if (chunk.type === 'tool_result' && chunk.content) {
            emitter.emit('tool_result', chunk.content);
          } else if (chunk.type === 'thinking' && chunk.content) {
            emitter.emit('thinking', chunk.content);
          } else if (chunk.type === 'usage' && chunk.usage) {
            // Usage info, can be emitted if needed
          }
        }
        emitter.emit('end', '');
      } catch (err: any) {
        emitter.emit('error', err instanceof Error ? err : new Error(String(err)));
      }
    })();

    return emitter;
  }

  async cancelStream(sessionId: string): Promise<void> {
    // Cancel streaming for a session — currently a no-op placeholder
    this.emit('stream:cancelled', { sessionId });
  }

  private getDefaultModel(_providerId: string): string {
    return 'gpt-4o';
  }

  // ─── Legacy Compatibility ──────────────────────────────────────────

  async add(config: any): Promise<any> {
    if (config.type === 'custom' || config.protocol) {
      return this.addCustomProvider(config);
    }
    // OpenCode providers are configured through the sidecar
    return config;
  }

  async remove(id: string): Promise<void> {
    if (id.startsWith('custom:')) {
      return this.removeCustomProvider(id);
    }
    // OpenCode provider removal goes through the sidecar
  }

  async test(id: string): Promise<{ working: boolean; latency: number; models: string[] }> {
    const result = await this.performHealthCheck(id);
    return { working: result.status === 'healthy', latency: result.latencyMs, models: [] };
  }

  async setDefault(id: string, model: string): Promise<void> {
    // Store default in app settings
    this.emit('default-changed', { id, model });
  }

  setHealthUpdateCallback(callback: (providerId: string, check: any) => void): void {
    this.on('sidecar-health', callback as any);
  }

  getDefault(): any { return undefined; }
  getDefaultConfig(): any { return undefined; }
  getProvider(_id: string): any { return undefined; }
  getProviderConfig(id: string): any {
    if (id.startsWith('custom:')) return this.customConfigs.get(id);
    return undefined;
  }
  getAllProviders(): any[] { return []; }
  getAllConfigs(): any[] { return Array.from(this.customConfigs.values()); }
  getEnabledProviders(): any[] { return []; }
  async autoDetectProviders(): Promise<any[]> { return []; }
  exportConfigs(): string { return JSON.stringify(Array.from(this.customConfigs.values())); }
  async importConfigs(json: string): Promise<void> {
    try {
      const configs = JSON.parse(json) as CustomProviderConfig[];
      for (const config of configs) {
        this.customConfigs.set(config.id, config);
      }
      await this.saveCustomConfigs();
    } catch { /* ignore invalid JSON */ }
  }

  // ─── Private Helpers ───────────────────────────────────────────────

  private isCustomProvider(modelId: string): boolean {
    const providerId = modelId.split('/')[0];
    return providerId.startsWith('custom:') || this.customConfigs.has(providerId);
  }

  private getCustomConfig(modelId: string): CustomProviderConfig {
    const providerId = modelId.split('/')[0];
    const config = this.customConfigs.get(providerId);
    if (!config) throw new Error(`Custom provider not found: ${providerId}`);
    return config;
  }

  private static readonly CONFIG_SCHEMA_VERSION = 2;

  private getConfigsPath(): string {
    const userData = app.getPath('userData');
    return path.join(userData, 'custom-providers.json');
  }

  private loadCustomConfigs(): void {
    try {
      const configsPath = this.getConfigsPath();
      if (fs.existsSync(configsPath)) {
        const raw = fs.readFileSync(configsPath, 'utf-8');
        const parsed = JSON.parse(raw);

        // Schema version check — migrate or bust stale cache
        const storedVersion = parsed._schemaVersion || 1;
        if (storedVersion < ProviderManager.CONFIG_SCHEMA_VERSION) {
          // Backup old file and start fresh
          const backupPath = configsPath + `.v${storedVersion}.bak`;
          try { fs.renameSync(configsPath, backupPath); } catch { /* ignore */ }
          this.emit('custom-configs-migrated', { from: storedVersion, to: ProviderManager.CONFIG_SCHEMA_VERSION });
          return;
        }

        // v2+ format: { _schemaVersion, providers: [...] }
        const configs: CustomProviderConfig[] = parsed.providers || parsed;
        for (const config of configs) {
          if (config.id) {
            this.customConfigs.set(config.id, config);
          }
        }
        this.emit('custom-configs-loaded', configs.length);
      }
    } catch (err) {
      // Corrupted or unreadable config file — start fresh
      this.emit('custom-configs-error', err);
    }
  }

  private async saveCustomConfigs(): Promise<void> {
    try {
      const configsPath = this.getConfigsPath();
      const configs = Array.from(this.customConfigs.values());
      const payload = {
        _schemaVersion: ProviderManager.CONFIG_SCHEMA_VERSION,
        providers: configs,
      };
      const json = JSON.stringify(payload, null, 2);
      // Atomic write: write to .tmp then rename
      const tmpPath = configsPath + '.tmp';
      fs.writeFileSync(tmpPath, json, 'utf-8');
      fs.renameSync(tmpPath, configsPath);
    } catch (err) {
      this.emit('custom-configs-error', err);
    }
  }

  // ─── Convert UnifiedProviderInfo → ProviderInfo for legacy compat ────

  async listProvidersLegacy(): Promise<ProviderInfo[]> {
    const unified = await this.listProviders();
    return unified.map((p): ProviderInfo => ({
      id: p.id,
      name: p.name,
      type: p.source === 'custom' ? 'custom_openai' : (p.id.split(':')[0] as any),
      models: p.models.map(m => m.id),
      isDefault: p.isDefault,
      configured: p.configured,
    }));
  }
}
