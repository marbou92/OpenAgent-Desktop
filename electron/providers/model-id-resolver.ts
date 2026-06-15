/**
 * OpenAgent-Desktop Aether - Model ID Resolver
 *
 * Resolves model identifiers to provider + model pairs.
 * Handles the unified model ID format: "providerId/modelId"
 */

export interface ResolvedModel {
  providerId: string;
  modelId: string;
  displayName: string;
  source: 'opencode' | 'custom';
}

export class ModelIdResolver {
  private customPrefixes: string[] = ['custom:'];

  resolve(modelId: string): ResolvedModel {
    const parts = modelId.split('/');
    if (parts.length >= 2) {
      const providerId = parts[0];
      const id = parts.slice(1).join('/');
      return {
        providerId,
        modelId: id,
        displayName: id,
        source: this.isCustomProvider(providerId) ? 'custom' : 'opencode',
      };
    }
    return {
      providerId: 'unknown',
      modelId,
      displayName: modelId,
      source: 'opencode',
    };
  }

  isCustomProvider(providerId: string): boolean {
    return this.customPrefixes.some(prefix => providerId.startsWith(prefix));
  }

  addCustomPrefix(prefix: string): void {
    if (!this.customPrefixes.includes(prefix)) {
      this.customPrefixes.push(prefix);
    }
  }

  listAliases(): { alias: string; resolved: ResolvedModel }[] {
    // Return an empty list by default; aliases can be registered externally
    return [];
  }
}

// Singleton
let resolverInstance: ModelIdResolver | null = null;

export function getModelIdResolver(): ModelIdResolver {
  if (!resolverInstance) {
    resolverInstance = new ModelIdResolver();
  }
  return resolverInstance;
}

export function setModelIdResolver(resolver: ModelIdResolver): void {
  resolverInstance = resolver;
}
