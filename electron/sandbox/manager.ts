/**
 * OpenAgent-Desktop - Sandbox Manager (Facade)
 *
 * This file re-exports the SandboxManager from the decomposed index.ts
 * to maintain backward compatibility with existing imports like:
 *   import { SandboxManager } from './manager';
 *
 * The actual implementation is now split across:
 *   - sandbox-strategies.ts (WSL2, Lima, Docker, Basic sandbox implementations)
 *   - sandbox-resources.ts  (CPU, memory, disk limit management)
 *   - sandbox-io.ts         (file I/O within the sandbox)
 *   - index.ts              (facade SandboxManager composing the above)
 */

export {
  SandboxManager,
  SandboxStrategies,
  SandboxResources,
  SandboxIO,
} from './index';

export type {
  SandboxConfig,
  ExecuteOptions,
  ExecuteResult,
  FileInfo,
  SandboxStatus,
  ResourceUsage,
  SandboxType,
  SandboxInterface,
  SandboxManagerOptions,
} from './index';
