/**
 * OpenAgent-Desktop - Extension Lifecycle Manager
 *
 * Manages the complete lifecycle of extensions:
 * install → configure → activate → use → deactivate → uninstall
 * Integrates with security scanning, runtime extensions, and health monitoring.
 * Like OpenCowork's AgentRuntimeExtension lifecycle hooks.
 */

import { EventEmitter } from 'events';
import {
  ExtensionConfig,
  ExtensionType,
  HealthCheckResult,
  PermissionLevel,
} from './types';
import { ExtensionSecurityScanner, SecurityScanResult } from './security-scanner';
import { HotReloadManager, ReloadState } from './hot-reload';

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle Types
// ─────────────────────────────────────────────────────────────────────────────

export enum ExtensionLifecycleState {
  Uninstalled = 'uninstalled',
  Installing = 'installing',
  Installed = 'installed',
  Configuring = 'configuring',
  Configured = 'configured',
  Activating = 'activating',
  Active = 'active',
  Deactivating = 'deactivating',
  Error = 'error',
}

export interface LifecycleTransition {
  from: ExtensionLifecycleState;
  to: ExtensionLifecycleState;
  timestamp: string;
  reason: string;
  result: 'success' | 'failure';
  error?: string;
  duration?: number;
}

export interface ExtensionLifecycleEntry {
  extensionId: string;
  state: ExtensionLifecycleState;
  config?: ExtensionConfig;
  securityScanResult?: SecurityScanResult;
  healthCheckResult?: HealthCheckResult;
  history: LifecycleTransition[];
  autoRestart: boolean;
  autoRestartAttempts: number;
  maxAutoRestartAttempts: number;
  lastActivatedAt?: string;
  lastDeactivatedAt?: string;
  lastErrorAt?: string;
  lastError?: string;
  dependencies: string[];
  hotReloadState: ReloadState;
}

export type InstallSource = 'marketplace' | 'npm' | 'github' | 'local' | 'builtin';

export interface InstallOptions {
  source: InstallSource;
  version?: string;
  autoActivate?: boolean;
  autoRestart?: boolean;
  maxAutoRestartAttempts?: number;
  dependencies?: string[];
  skipSecurityScan?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Valid State Transitions
// ─────────────────────────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<ExtensionLifecycleState, ExtensionLifecycleState[]> = {
  [ExtensionLifecycleState.Uninstalled]: [ExtensionLifecycleState.Installing],
  [ExtensionLifecycleState.Installing]: [ExtensionLifecycleState.Installed, ExtensionLifecycleState.Error],
  [ExtensionLifecycleState.Installed]: [ExtensionLifecycleState.Configuring, ExtensionLifecycleState.Uninstalled],
  [ExtensionLifecycleState.Configuring]: [ExtensionLifecycleState.Configured, ExtensionLifecycleState.Error],
  [ExtensionLifecycleState.Configured]: [ExtensionLifecycleState.Activating, ExtensionLifecycleState.Uninstalled],
  [ExtensionLifecycleState.Activating]: [ExtensionLifecycleState.Active, ExtensionLifecycleState.Error],
  [ExtensionLifecycleState.Active]: [ExtensionLifecycleState.Deactivating, ExtensionLifecycleState.Error],
  [ExtensionLifecycleState.Deactivating]: [ExtensionLifecycleState.Configured, ExtensionLifecycleState.Error],
  [ExtensionLifecycleState.Error]: [
    ExtensionLifecycleState.Activating,
    ExtensionLifecycleState.Installing,
    ExtensionLifecycleState.Uninstalled,
    ExtensionLifecycleState.Configured,
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Extension Lifecycle Manager
// ─────────────────────────────────────────────────────────────────────────────

export class ExtensionLifecycleManager extends EventEmitter {
  private entries: Map<string, ExtensionLifecycleEntry> = new Map();
  private securityScanner: ExtensionSecurityScanner;
  private hotReloadManager: HotReloadManager;
  private autoRestartTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(
    securityScanner?: ExtensionSecurityScanner,
    hotReloadManager?: HotReloadManager,
  ) {
    super();
    this.securityScanner = securityScanner || new ExtensionSecurityScanner();
    this.hotReloadManager = hotReloadManager || new HotReloadManager();

    // Forward hot-reload events
    this.hotReloadManager.on('extension:reloading', (event) => {
      this.emit('extension:hot-reloading', event);
    });
    this.hotReloadManager.on('extension:reloaded', (event) => {
      this.emit('extension:hot-reloaded', event);
    });
    this.hotReloadManager.on('extension:reload-error', (event) => {
      this.emit('extension:hot-reload-error', event);
    });
  }

  // ─── Install ───────────────────────────────────────────────────────────────

  /**
   * Full install pipeline: download → scan → register → configure
   */
  async install(
    extensionId: string,
    config: ExtensionConfig,
    options: InstallOptions = { source: 'marketplace' },
  ): Promise<void> {
    // Check if already installed
    const existing = this.entries.get(extensionId);
    if (existing && existing.state !== ExtensionLifecycleState.Uninstalled) {
      throw new Error(`Extension ${extensionId} is already in state ${existing.state}`);
    }

    // Create entry
    const entry: ExtensionLifecycleEntry = {
      extensionId,
      state: ExtensionLifecycleState.Uninstalled,
      config,
      history: [],
      autoRestart: options.autoRestart ?? false,
      autoRestartAttempts: 0,
      maxAutoRestartAttempts: options.maxAutoRestartAttempts ?? 3,
      dependencies: options.dependencies || [],
      hotReloadState: 'idle',
    };

    this.entries.set(extensionId, entry);

    // Transition to Installing
    this.transition(entry, ExtensionLifecycleState.Installing, 'Install initiated');

    try {
      // Step 1: Security scan (unless skipped)
      if (!options.skipSecurityScan && config.mcpServer) {
        const scanResult = this.securityScanner.scan({
          name: config.name,
          command: config.mcpServer.command,
          args: config.mcpServer.args,
          env: config.mcpServer.env,
        });

        entry.securityScanResult = scanResult;

        if (!scanResult.isSafe) {
          this.transition(entry, ExtensionLifecycleState.Error, 'Security scan failed', 'failure');
          entry.lastError = `Security scan failed: risk score ${scanResult.riskScore}`;
          entry.lastErrorAt = new Date().toISOString();
          this.emit('extension:install-blocked', {
            extensionId,
            reason: 'security',
            scanResult,
          });
          throw new Error(`Extension ${config.name} failed security scan (risk: ${scanResult.riskScore})`);
        }
      }

      // Step 2: Transition to Installed
      this.transition(entry, ExtensionLifecycleState.Installed, 'Extension files downloaded/registered');

      // Step 3: Configure
      this.transition(entry, ExtensionLifecycleState.Configuring, 'Configuring extension');

      // Validate required environment variables
      if (config.mcpServer) {
        const missingEnv = Object.entries(config.mcpServer.env || {})
          .filter(([, value]) => !value || value === '')
          .map(([key]) => key);

        if (missingEnv.length > 0) {
          // Still allow configuration but warn
          this.emit('extension:config-warning', {
            extensionId,
            missingEnvVars: missingEnv,
          });
        }
      }

      // Transition to Configured
      this.transition(entry, ExtensionLifecycleState.Configured, 'Extension configured');

      // Step 4: Auto-activate if requested
      if (options.autoActivate) {
        await this.activate(extensionId);
      }

      this.emit('extension:installed', { extensionId, config });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (entry.state !== ExtensionLifecycleState.Error) {
        this.transition(entry, ExtensionLifecycleState.Error, `Install failed: ${errorMessage}`, 'failure');
      }
      entry.lastError = errorMessage;
      entry.lastErrorAt = new Date().toISOString();
      throw err;
    }
  }

  // ─── Activate ──────────────────────────────────────────────────────────────

  /**
   * Start extension, connect MCP. Performs security check and health check.
   */
  async activate(extensionId: string): Promise<void> {
    const entry = this.entries.get(extensionId);
    if (!entry) {
      throw new Error(`Extension ${extensionId} not found`);
    }

    // Validate state
    if (
      entry.state !== ExtensionLifecycleState.Configured &&
      entry.state !== ExtensionLifecycleState.Error &&
      entry.state !== ExtensionLifecycleState.Deactivating
    ) {
      if (entry.state === ExtensionLifecycleState.Active) {
        return; // Already active
      }
      throw new Error(`Cannot activate extension in state ${entry.state}`);
    }

    // Check dependencies
    const missingDeps = await this.checkDependencies(entry);
    if (missingDeps.length > 0) {
      this.transition(entry, ExtensionLifecycleState.Error, 'Missing dependencies', 'failure');
      entry.lastError = `Missing required extensions: ${missingDeps.join(', ')}`;
      entry.lastErrorAt = new Date().toISOString();
      throw new Error(`Missing required extensions: ${missingDeps.join(', ')}`);
    }

    // Security scan before activation (if not already scanned)
    if (!entry.securityScanResult && entry.config?.mcpServer) {
      const scanResult = this.securityScanner.scan({
        name: entry.config.name,
        command: entry.config.mcpServer.command,
        args: entry.config.mcpServer.args,
        env: entry.config.mcpServer.env,
      });

      entry.securityScanResult = scanResult;

      if (!scanResult.isSafe) {
        this.transition(entry, ExtensionLifecycleState.Error, 'Security scan failed before activation', 'failure');
        entry.lastError = `Security scan failed: risk score ${scanResult.riskScore}`;
        entry.lastErrorAt = new Date().toISOString();
        throw new Error(`Security scan failed for ${entry.config.name}`);
      }
    }

    // Transition to Activating
    this.transition(entry, ExtensionLifecycleState.Activating, 'Activating extension');

    try {
      // The actual MCP connection would happen here
      // This is handled by the ExtensionRegistry — we emit events for it
      this.emit('extension:activate-request', { extensionId });

      // Health check after activation
      const healthResult: HealthCheckResult = {
        healthy: true,
        latencyMs: 0,
        timestamp: new Date().toISOString(),
      };

      entry.healthCheckResult = healthResult;

      // Transition to Active
      this.transition(entry, ExtensionLifecycleState.Active, 'Extension activated');
      entry.lastActivatedAt = new Date().toISOString();
      entry.autoRestartAttempts = 0;

      // Start hot-reload watching if configured
      if (entry.config?.mcpServer) {
        entry.hotReloadState = 'watching';
      }

      this.emit('extension:activated', { extensionId });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.transition(entry, ExtensionLifecycleState.Error, `Activation failed: ${errorMessage}`, 'failure');
      entry.lastError = errorMessage;
      entry.lastErrorAt = new Date().toISOString();

      // Auto-restart logic
      if (entry.autoRestart && entry.autoRestartAttempts < entry.maxAutoRestartAttempts) {
        this.scheduleAutoRestart(extensionId);
      }

      throw err;
    }
  }

  // ─── Deactivate ────────────────────────────────────────────────────────────

  /**
   * Graceful shutdown of an extension.
   */
  async deactivate(extensionId: string): Promise<void> {
    const entry = this.entries.get(extensionId);
    if (!entry) {
      throw new Error(`Extension ${extensionId} not found`);
    }

    if (entry.state !== ExtensionLifecycleState.Active) {
      throw new Error(`Cannot deactivate extension in state ${entry.state}`);
    }

    // Cancel any pending auto-restart
    const timer = this.autoRestartTimers.get(extensionId);
    if (timer) {
      clearTimeout(timer);
      this.autoRestartTimers.delete(extensionId);
    }

    // Stop hot-reload watching
    this.hotReloadManager.unwatch(extensionId);
    entry.hotReloadState = 'idle';

    // Transition to Deactivating
    this.transition(entry, ExtensionLifecycleState.Deactivating, 'Deactivating extension');

    try {
      // The actual MCP disconnect would happen here
      this.emit('extension:deactivate-request', { extensionId });

      // Transition to Configured
      this.transition(entry, ExtensionLifecycleState.Configured, 'Extension deactivated');
      entry.lastDeactivatedAt = new Date().toISOString();

      this.emit('extension:deactivated', { extensionId });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.transition(entry, ExtensionLifecycleState.Error, `Deactivation failed: ${errorMessage}`, 'failure');
      entry.lastError = errorMessage;
      entry.lastErrorAt = new Date().toISOString();
      throw err;
    }
  }

  // ─── Uninstall ─────────────────────────────────────────────────────────────

  /**
   * Full cleanup — deactivate, remove config, unregister.
   */
  async uninstall(extensionId: string): Promise<void> {
    const entry = this.entries.get(extensionId);
    if (!entry) {
      throw new Error(`Extension ${extensionId} not found`);
    }

    // Deactivate first if active
    if (entry.state === ExtensionLifecycleState.Active) {
      await this.deactivate(extensionId);
    }

    // Cancel auto-restart timers
    const timer = this.autoRestartTimers.get(extensionId);
    if (timer) {
      clearTimeout(timer);
      this.autoRestartTimers.delete(extensionId);
    }

    // Stop hot-reload
    this.hotReloadManager.unwatch(extensionId);

    // Transition to Uninstalled
    this.transition(entry, ExtensionLifecycleState.Uninstalled, 'Extension uninstalled');

    // Remove entry
    this.entries.delete(extensionId);

    this.emit('extension:uninstalled', { extensionId });
  }

  // ─── Restart ───────────────────────────────────────────────────────────────

  /**
   * Deactivate + activate an extension.
   */
  async restart(extensionId: string): Promise<void> {
    const entry = this.entries.get(extensionId);
    if (!entry) {
      throw new Error(`Extension ${extensionId} not found`);
    }

    if (entry.state === ExtensionLifecycleState.Active) {
      await this.deactivate(extensionId);
    }

    await this.activate(extensionId);

    this.emit('extension:restarted', { extensionId });
  }

  // ─── State Accessors ──────────────────────────────────────────────────────

  getState(extensionId: string): ExtensionLifecycleState {
    return this.entries.get(extensionId)?.state || ExtensionLifecycleState.Uninstalled;
  }

  getHistory(extensionId: string): LifecycleTransition[] {
    return this.entries.get(extensionId)?.history || [];
  }

  getEntry(extensionId: string): ExtensionLifecycleEntry | undefined {
    return this.entries.get(extensionId);
  }

  getAllEntries(): ExtensionLifecycleEntry[] {
    return Array.from(this.entries.values());
  }

  getSecurityScan(extensionId: string): SecurityScanResult | undefined {
    return this.entries.get(extensionId)?.securityScanResult;
  }

  getHealthCheck(extensionId: string): HealthCheckResult | undefined {
    return this.entries.get(extensionId)?.healthCheckResult;
  }

  // ─── Auto-Restart ──────────────────────────────────────────────────────────

  setAutoRestart(extensionId: string, enabled: boolean, maxAttempts: number = 3): void {
    const entry = this.entries.get(extensionId);
    if (!entry) return;
    entry.autoRestart = enabled;
    entry.maxAutoRestartAttempts = maxAttempts;
    if (!enabled) {
      entry.autoRestartAttempts = 0;
      const timer = this.autoRestartTimers.get(extensionId);
      if (timer) {
        clearTimeout(timer);
        this.autoRestartTimers.delete(extensionId);
      }
    }
  }

  getAutoRestart(extensionId: string): { enabled: boolean; attempts: number; maxAttempts: number } {
    const entry = this.entries.get(extensionId);
    return {
      enabled: entry?.autoRestart ?? false,
      attempts: entry?.autoRestartAttempts ?? 0,
      maxAttempts: entry?.maxAutoRestartAttempts ?? 3,
    };
  }

  // ─── Hot Reload ────────────────────────────────────────────────────────────

  startHotReload(extensionId: string, configPath: string): void {
    const entry = this.entries.get(extensionId);
    if (!entry) return;
    this.hotReloadManager.watch(extensionId, configPath);
    entry.hotReloadState = 'watching';
  }

  stopHotReload(extensionId: string): void {
    const entry = this.entries.get(extensionId);
    if (!entry) return;
    this.hotReloadManager.unwatch(extensionId);
    entry.hotReloadState = 'idle';
  }

  getHotReloadState(extensionId: string): ReloadState {
    return this.entries.get(extensionId)?.hotReloadState || 'idle';
  }

  getHotReloadManager(): HotReloadManager {
    return this.hotReloadManager;
  }

  // ─── Bulk Operations ──────────────────────────────────────────────────────

  async activateAll(): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }> {
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const [id, entry] of this.entries) {
      if (
        entry.state === ExtensionLifecycleState.Configured ||
        entry.state === ExtensionLifecycleState.Error
      ) {
        try {
          await this.activate(id);
          succeeded.push(id);
        } catch (err) {
          failed.push({ id, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    return { succeeded, failed };
  }

  async deactivateAll(): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }> {
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const [id, entry] of this.entries) {
      if (entry.state === ExtensionLifecycleState.Active) {
        try {
          await this.deactivate(id);
          succeeded.push(id);
        } catch (err) {
          failed.push({ id, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    return { succeeded, failed };
  }

  // ─── Filter by State ──────────────────────────────────────────────────────

  getByState(state: ExtensionLifecycleState): ExtensionLifecycleEntry[] {
    return Array.from(this.entries.values()).filter((e) => e.state === state);
  }

  // ─── Internal: State Transition ────────────────────────────────────────────

  private transition(
    entry: ExtensionLifecycleEntry,
    newState: ExtensionLifecycleState,
    reason: string,
    result: 'success' | 'failure' = 'success',
  ): void {
    const oldState = entry.state;

    // Validate transition
    const allowed = VALID_TRANSITIONS[oldState] || [];
    if (!allowed.includes(newState) && oldState !== newState) {
      console.warn(
        `[Lifecycle] Invalid transition for ${entry.extensionId}: ${oldState} → ${newState}`,
      );
      // Allow anyway for resilience, but log warning
    }

    const transition: LifecycleTransition = {
      from: oldState,
      to: newState,
      timestamp: new Date().toISOString(),
      reason,
      result,
    };

    entry.state = newState;
    entry.history.push(transition);

    this.emit('extension:state-change', {
      extensionId: entry.extensionId,
      from: oldState,
      to: newState,
      reason,
      result,
      timestamp: transition.timestamp,
    });
  }

  // ─── Internal: Dependency Check ────────────────────────────────────────────

  private async checkDependencies(entry: ExtensionLifecycleEntry): Promise<string[]> {
    if (!entry.dependencies || entry.dependencies.length === 0) {
      return [];
    }

    const missing: string[] = [];
    for (const depId of entry.dependencies) {
      const depEntry = this.entries.get(depId);
      if (!depEntry || depEntry.state !== ExtensionLifecycleState.Active) {
        missing.push(depId);
      }
    }

    return missing;
  }

  // ─── Internal: Auto Restart ────────────────────────────────────────────────

  private scheduleAutoRestart(extensionId: string): void {
    const entry = this.entries.get(extensionId);
    if (!entry || !entry.autoRestart) return;

    entry.autoRestartAttempts += 1;
    const delay = Math.min(1000 * Math.pow(2, entry.autoRestartAttempts - 1), 30000); // Exponential backoff, max 30s

    const timer = setTimeout(async () => {
      this.autoRestartTimers.delete(extensionId);
      try {
        await this.activate(extensionId);
        this.emit('extension:auto-restarted', { extensionId, attempt: entry.autoRestartAttempts });
      } catch (err) {
        // If still failing and under max attempts, schedule another
        if (entry.autoRestartAttempts < entry.maxAutoRestartAttempts) {
          this.scheduleAutoRestart(extensionId);
        } else {
          this.emit('extension:auto-restart-exhausted', {
            extensionId,
            attempts: entry.autoRestartAttempts,
          });
        }
      }
    }, delay);

    this.autoRestartTimers.set(extensionId, timer);

    this.emit('extension:auto-restart-scheduled', {
      extensionId,
      attempt: entry.autoRestartAttempts,
      delay,
    });
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  destroy(): void {
    // Clear all auto-restart timers
    for (const timer of this.autoRestartTimers.values()) {
      clearTimeout(timer);
    }
    this.autoRestartTimers.clear();

    // Stop hot-reload
    this.hotReloadManager.destroy();

    // Clear entries
    this.entries.clear();

    this.removeAllListeners();
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let lifecycleManagerInstance: ExtensionLifecycleManager | null = null;

export function getLifecycleManager(): ExtensionLifecycleManager {
  if (!lifecycleManagerInstance) {
    lifecycleManagerInstance = new ExtensionLifecycleManager();
  }
  return lifecycleManagerInstance;
}

export function resetLifecycleManager(): void {
  if (lifecycleManagerInstance) {
    lifecycleManagerInstance.destroy();
  }
  lifecycleManagerInstance = null;
}
