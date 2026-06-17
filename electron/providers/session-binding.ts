/**
 * OpenAgent-Desktop - Session Binding
 *
 * Per-session provider+model selection (opencode-style). Each session has its
 * own binding; switching sessions in the UI changes which provider+model the
 * chat uses without requiring the user to manually re-select.
 *
 * Bindings are persisted in the AuthStore (auth.json) so they survive
 * restarts. The chat UI calls getBinding(sessionId) on load and setBinding
 * when the user changes the dropdown.
 *
 * If a binding references a provider that no longer exists (user removed it),
 * falls back to the first configured provider — and emits a 'binding-invalid'
 * event so the UI can warn the user.
 */

import { EventEmitter } from 'events';
import { AuthStore } from './auth-store';
import { ProviderClient } from './provider-client';
import { SessionProviderBinding } from './v3-types';

export class SessionBinding extends EventEmitter {
  constructor(
    private authStore: AuthStore,
    private client: ProviderClient
  ) {
    super();
  }

  getBinding(sessionId: string): SessionProviderBinding | null {
    const binding = this.authStore.getSessionBinding(sessionId);
    if (binding) {
      // Validate that the provider is still configured.
      if (!this.authStore.isConfigured(binding.providerId)) {
        this.emit('binding-invalid', { sessionId, providerId: binding.providerId });
        return this.resolveFallback(sessionId);
      }
      return binding;
    }
    return this.resolveFallback(sessionId);
  }

  setBinding(sessionId: string, providerId: string, modelId: string, overrides?: { systemPromptOverride?: string; temperatureOverride?: number }): void {
    const binding: SessionProviderBinding = {
      sessionId,
      providerId,
      modelId,
      ...overrides,
    };
    this.authStore.setSessionBinding(binding);
    this.emit('binding-changed', binding);
  }

  clearBinding(sessionId: string): void {
    this.authStore.clearSessionBinding(sessionId);
    this.emit('binding-cleared', { sessionId });
  }

  /**
   * Pick the first configured provider and its first available model as a
   * fallback when no binding exists or the bound provider is gone.
   * Returns null if no providers are configured.
   */
  private resolveFallback(sessionId: string): SessionProviderBinding | null {
    for (const configured of this.authStore.listProviders()) {
      if (!configured.enabled || !this.authStore.isConfigured(configured.providerId)) continue;
      const models = this.client.listAvailableModels(configured.providerId);
      const defaultModel =
        models.find((m) => m.id === configured.defaultModelId) ||
        models[0];
      if (defaultModel) {
        const binding: SessionProviderBinding = {
          sessionId,
          providerId: configured.providerId,
          modelId: defaultModel.id,
        };
        // Persist the fallback so subsequent calls are stable.
        this.authStore.setSessionBinding(binding);
        return binding;
      }
    }
    return null;
  }

  /**
   * List all configured providers — used by the UI to populate the provider
   * dropdown per session without making a separate IPC call.
   */
  listConfiguredProviders() {
    return this.authStore.listProviders();
  }
}
