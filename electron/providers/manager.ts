/**
 * OpenAgent-Desktop - Provider Manager (Facade)
 *
 * This file re-exports the ProviderManager from the decomposed index.ts
 * to maintain backward compatibility with existing imports like:
 *   import { ProviderManager } from './manager';
 *
 * The actual implementation is now split across:
 *   - provider-registry.ts   (CRUD, persistence, metadata)
 *   - provider-router.ts     (mesh routing, fallback chains, chat dispatch)
 *   - provider-autodetect.ts (env var scanning, local provider detection)
 *   - index.ts               (facade ProviderManager composing the above)
 */

export {
  ProviderManager,
  getProviderManager,
  setProviderManager,
} from './index';

export type { StorageAdapter } from './index';

// Re-export all types for backward compatibility
export {
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
  ProviderError,
  ProviderErrorType,
  Message,
} from './types';

// Re-export sub-modules for direct access if needed
export { ProviderRegistry } from './provider-registry';
export { ProviderRouter } from './provider-router';
export { ProviderAutoDetector } from './provider-autodetect';
