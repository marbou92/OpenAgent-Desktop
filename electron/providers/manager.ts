/**
 * OpenAgent-Desktop Aether - Provider Manager
 *
 * Re-exports from the v2 unified provider manager for backward compatibility.
 */

export { ProviderManager } from './manager-v2';
export type {
  UnifiedProviderInfo,
  UnifiedModelInfo,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  ProviderConfig,
  ProviderInfo,
  HealthStatus,
} from './v2-types';
export { FileStorageAdapter } from './file-storage';
export { ProviderHealthMonitor } from './health-monitor';
export type {
  HealthMonitorOptions,
  HealthSnapshot,
  HealthDashboardData,
} from './health-monitor';
