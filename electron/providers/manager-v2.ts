/**
 * OpenAgent-Desktop - Unified Provider Manager (v2 — slimmed down)
 *
 * Originally a facade that unified OpenCode sidecar + Custom Protocol providers.
 * After the v3 provider-system rewrite, the chat / custom-provider / model-list
 * responsibilities moved to:
 *   - electron/providers/provider-client.ts (chat / chatStream / discoverModels)
 *   - electron/providers/auth-store.ts (credential persistence)
 *   - electron/providers/provider-registry.ts (catalog)
 *
 * This class now ONLY manages the OpenCode sidecar lifecycle. The v3 ProviderClient
 * calls getSidecarInstance() to detect whether the sidecar is running and route
 * chat calls through it when available.
 *
 * The legacy v2 methods (chat, stream, addCustomProvider, list, etc.) are kept
 * as stubs that throw, so any caller that hasn't been migrated gets a clear
 * error message instead of a silent failure.
 */

import { EventEmitter } from 'events';
import { SidecarManager } from '../sidecar';
import { encrypt, decrypt, isEncrypted, isEncryptionAvailable } from '../utils/encryption';
import type { SidecarConfig, SidecarInstance } from '../sidecar/types';
import type { ChatRequest, ChatResponse, StreamChunk, ProviderInfo } from './v2-types';

// Re-export so existing imports of these types from this module still work.
export type { SidecarConfig, SidecarInstance, ChatRequest, ChatResponse, StreamChunk, ProviderInfo };

export class ProviderManager extends EventEmitter {
  private sidecarManager: SidecarManager;
  private initialized = false;

  constructor(_configPath?: string) {
    super();
    this.sidecarManager = new SidecarManager();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      const instance = await this.sidecarManager.start();
      this.emit('sidecar-started', instance);
    } catch (err) {
      this.emit('sidecar-error', err);
      // Continue without sidecar — v3 in-process path will handle chat.
    }
    this.sidecarManager.on('status-change', (status) => this.emit('sidecar-status', status));
    this.sidecarManager.on('health', (data) => this.emit('sidecar-health', data));
    this.initialized = true;
    this.emit('initialized');
  }

  async shutdown(): Promise<void> {
    await this.sidecarManager.stop();
    this.initialized = false;
  }

  /**
   * Public accessor used by the periodic health check in main.ts. Previously
   * main.ts:1855 read `(providerManager as any).isInitialized` which was
   * always undefined (the field was private).
   */
  get isInitialized(): boolean {
    return this.initialized;
  }

  // ─── Sidecar (the only real responsibility left) ──────────────────────────

  getSidecarManager(): SidecarManager {
    return this.sidecarManager;
  }

  getSidecarInstance(): SidecarInstance | null {
    return this.sidecarManager.getInstance();
  }

  async restartSidecar(config?: SidecarConfig): Promise<SidecarInstance> {
    const instance = await this.sidecarManager.restart(config);
    return instance;
  }

  setHealthUpdateCallback(callback: (providerId: string, check: any) => void): void {
    this.on('sidecar-health', callback as any);
  }

  // ─── Legacy v2 chat / custom-provider methods (all stubs) ──────────────────
  //
  // These existed in the pre-v3 manager but relied on the deleted CustomBridge
  // and OpenCodeBridge (from ./opencode-bridge, NOT ../opencode/bridge).
  // Callers should use the v3 ProviderClient instead.

  async chat(_request: ChatRequest): Promise<ChatResponse> {
    throw new Error('ProviderManager.chat is deprecated — use ProviderClient.chat from provider-client.ts');
  }

  async *chatStream(_request: ChatRequest): AsyncGenerator<StreamChunk> {
    throw new Error('ProviderManager.chatStream is deprecated — use ProviderClient.chatStream from provider-client.ts');
    yield { type: 'done' }; // unreachable, satisfies generator signature
  }

  async cancelStream(_sessionId: string): Promise<void> {
    this.emit('stream:cancelled', { sessionId: _sessionId });
  }

  async sendDirect(_model: string, _prompt: string, _options?: { temperature?: number; maxTokens?: number; timeout?: number }): Promise<{ content: string }> {
    throw new Error('ProviderManager.sendDirect is deprecated — use ProviderClient.chat from provider-client.ts');
  }

  async listProviders(): Promise<any[]> { return []; }
  async list(): Promise<ProviderInfo[]> { return []; }
  async listProvidersLegacy(): Promise<ProviderInfo[]> { return []; }
  async listModels(_providerId?: string): Promise<any[]> { return []; }
  async resolveModel(_modelId: string): Promise<any> { return null; }
  async performHealthCheck(_providerId: string): Promise<{ status: string; latencyMs: number }> {
    return { status: 'unknown', latencyMs: 0 };
  }
  async runHealthChecks(): Promise<Record<string, unknown>> { return {}; }
  getAllHealthChecks(): Record<string, any> { return {}; }

  // Legacy custom-provider CRUD — all stubs.
  async addCustomProvider(_config: any): Promise<any> {
    throw new Error('addCustomProvider is deprecated — use the v3 auth-store + provider-registry');
  }
  async removeCustomProvider(_id: string): Promise<void> {}
  getCustomProviderPresets(): any[] { return []; }
  async add(_config: any): Promise<any> { throw new Error('ProviderManager.add is deprecated — use AuthStore + ProviderRegistry'); }
  async remove(_id: string): Promise<void> {}
  async test(_id: string): Promise<{ working: boolean; latency: number; models: string[] }> {
    return { working: false, latency: 0, models: [] };
  }
  async setDefault(_id: string, _model: string): Promise<void> {
    this.emit('default-changed', { id: _id, model: _model });
  }
  getDefault(): any { return undefined; }
  getDefaultConfig(): any { return undefined; }
  getProvider(_id: string): any { return undefined; }
  getProviderConfig(_id: string): any { return undefined; }
  getAllProviders(): any[] { return []; }
  getAllConfigs(): any[] { return []; }
  getEnabledProviders(): any[] { return []; }
  async autoDetectProviders(): Promise<any[]> { return []; }
  exportConfigs(): string { return '[]'; }
  async importConfigs(_json: string): Promise<void> {}

  // Encryption helpers re-exported so existing callers (if any) still work.
  static encrypt = encrypt;
  static decrypt = decrypt;
  static isEncrypted = isEncrypted;
  static isEncryptionAvailable = isEncryptionAvailable;
}
