/**
 * OpenAgent-Desktop Aether - Gateway Router
 *
 * Routes chat requests to the appropriate provider engine
 * (OpenCode sidecar or Custom Protocol) based on model ID.
 */

import { EventEmitter } from 'events';

export type GatewayDestination = 'opencode' | 'custom';

export interface RouteResult {
  destination: GatewayDestination;
  providerId: string;
  modelId: string;
}

export class GatewayRouter extends EventEmitter {
  private customProviderIds: Set<string> = new Set();

  registerCustomProvider(providerId: string): void {
    this.customProviderIds.add(providerId);
  }

  unregisterCustomProvider(providerId: string): void {
    this.customProviderIds.delete(providerId);
  }

  route(modelId: string, strategy?: string): RouteResult {
    const providerId = modelId.split('/')[0];

    if (this.customProviderIds.has(providerId) || providerId.startsWith('custom:')) {
      return {
        destination: 'custom',
        providerId,
        modelId: modelId.slice(providerId.length + 1),
      };
    }

    return {
      destination: 'opencode',
      providerId,
      modelId,
    };
  }

  isCustomRoute(modelId: string): boolean {
    return this.route(modelId).destination === 'custom';
  }

  listCustomProviders(): string[] {
    return Array.from(this.customProviderIds);
  }
}
