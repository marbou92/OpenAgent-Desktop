/**
 * OpenAgent-Desktop - Extension Hot-Reload System
 *
 * Watches extension directories for changes and automatically reloads
 * extensions without restarting the application.
 * Like OpenCowork's skill hot-reload and Goose's extension reloading.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import chokidar, { FSWatcher } from 'chokidar';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ReloadState = 'idle' | 'watching' | 'reloading' | 'error';

export interface HotReloadConfig {
  /** File patterns to watch (glob patterns) */
  watchPatterns: string[];
  /** Debounce time in ms before triggering reload (default: 300) */
  debounceMs: number;
  /** Maximum number of reload retry attempts (default: 3) */
  maxRetries: number;
  /** Whether to enable health check after reload (default: true) */
  healthCheckEnabled: boolean;
  /** Timeout in ms for health check after reload (default: 10000) */
  healthCheckTimeoutMs: number;
  /** Whether to rollback on failed reload (default: true) */
  rollbackOnFailure: boolean;
}

export interface ReloadEvent {
  extensionId: string;
  state: ReloadState;
  timestamp: string;
  error?: string;
  duration?: number;
}

export interface ReloadHistoryEntry {
  extensionId: string;
  timestamp: string;
  result: 'success' | 'error';
  duration: number;
  error?: string;
  filesChanged: string[];
}

export interface WatchedExtension {
  extensionId: string;
  configPath: string;
  state: ReloadState;
  watcher?: FSWatcher;
  debounceTimer?: ReturnType<typeof setTimeout>;
  retryCount: number;
  lastReloadAt?: string;
  lastError?: string;
  filesChanged: string[];
}

const DEFAULT_CONFIG: HotReloadConfig = {
  watchPatterns: ['**/*.json', '**/*.yaml', '**/*.yml', '**/*.toml', '**/*.js', '**/*.ts'],
  debounceMs: 300,
  maxRetries: 3,
  healthCheckEnabled: true,
  healthCheckTimeoutMs: 10000,
  rollbackOnFailure: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Hot Reload Manager
// ─────────────────────────────────────────────────────────────────────────────

export class HotReloadManager extends EventEmitter {
  private watched: Map<string, WatchedExtension> = new Map();
  private history: ReloadHistoryEntry[] = [];
  private config: HotReloadConfig;
  private reloadHandlers: Map<string, {
    shutdown: () => Promise<void>;
    initialize: () => Promise<void>;
    healthCheck?: () => Promise<boolean>;
  }> = new Map();

  constructor(config?: Partial<HotReloadConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── Register reload handler ─────────────────────────────────────────────

  /**
   * Register a handler for an extension's reload lifecycle.
   * The handler provides shutdown/initialize/healthCheck functions.
   */
  registerHandler(
    extensionId: string,
    handler: {
      shutdown: () => Promise<void>;
      initialize: () => Promise<void>;
      healthCheck?: () => Promise<boolean>;
    },
  ): void {
    this.reloadHandlers.set(extensionId, handler);
  }

  unregisterHandler(extensionId: string): void {
    this.reloadHandlers.delete(extensionId);
  }

  // ─── Watch ────────────────────────────────────────────────────────────────

  /**
   * Start watching an extension's config directory for changes.
   */
  watch(extensionId: string, configPath: string): void {
    if (this.watched.has(extensionId)) {
      // Already watching — unwatch first
      this.unwatch(extensionId);
    }

    const entry: WatchedExtension = {
      extensionId,
      configPath,
      state: 'watching',
      retryCount: 0,
      filesChanged: [],
    };

    // Resolve the directory to watch
    const watchDir = fs.existsSync(configPath) && fs.statSync(configPath).isFile()
      ? path.dirname(configPath)
      : configPath;

    // Build glob patterns from the config
    const patterns = this.config.watchPatterns.map((p) => path.join(watchDir, p));

    try {
      const watcher = chokidar.watch(patterns, {
        ignored: /(^|[/\\])\../, // ignore dotfiles
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 200,
          pollInterval: 100,
        },
      });

      watcher.on('change', (filePath: string) => {
        this.handleFileChange(extensionId, filePath);
      });

      watcher.on('add', (filePath: string) => {
        this.handleFileChange(extensionId, filePath);
      });

      watcher.on('unlink', (filePath: string) => {
        this.handleFileChange(extensionId, filePath);
      });

      watcher.on('error', (error: unknown) => {
        console.error(`[HotReload] Watcher error for ${extensionId}:`, error);
        entry.state = 'error';
        entry.lastError = error instanceof Error ? error.message : String(error);
        this.emit('extension:reload-error', {
          extensionId,
          state: 'error',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        } as ReloadEvent);
      });

      entry.watcher = watcher;
      this.watched.set(extensionId, entry);

      this.emit('extension:watching', { extensionId, configPath });
    } catch (err) {
      console.error(`[HotReload] Failed to start watcher for ${extensionId}:`, err);
      entry.state = 'error';
      entry.lastError = err instanceof Error ? err.message : String(err);
      this.watched.set(extensionId, entry);
    }
  }

  // ─── Unwatch ──────────────────────────────────────────────────────────────

  /**
   * Stop watching an extension.
   */
  unwatch(extensionId: string): void {
    const entry = this.watched.get(extensionId);
    if (!entry) return;

    // Clear debounce timer
    if (entry.debounceTimer) {
      clearTimeout(entry.debounceTimer);
    }

    // Close watcher
    if (entry.watcher) {
      entry.watcher.close().catch(() => {});
    }

    entry.state = 'idle';
    this.watched.delete(extensionId);

    this.emit('extension:unwatched', { extensionId });
  }

  // ─── Watch All ────────────────────────────────────────────────────────────

  /**
   * Watch all installed extensions. Call this with a list of extension IDs
   * and their config paths.
   */
  watchAll(extensions: Array<{ id: string; configPath: string }>): void {
    for (const ext of extensions) {
      this.watch(ext.id, ext.configPath);
    }
  }

  // ─── Stop All ─────────────────────────────────────────────────────────────

  /**
   * Stop all watchers.
   */
  stopAll(): void {
    for (const [extensionId] of this.watched) {
      this.unwatch(extensionId);
    }
  }

  // ─── Manual Reload ────────────────────────────────────────────────────────

  /**
   * Manually trigger a reload for an extension.
   */
  async reload(extensionId: string): Promise<void> {
    await this.performReload(extensionId, []);
  }

  // ─── Reload All ───────────────────────────────────────────────────────────

  /**
   * Reload all watched extensions.
   */
  async reloadAll(): Promise<void> {
    const extensionIds = Array.from(this.watched.keys());
    for (const extensionId of extensionIds) {
      await this.performReload(extensionId, []);
    }
  }

  // ─── State Accessors ──────────────────────────────────────────────────────

  getState(extensionId: string): ReloadState {
    return this.watched.get(extensionId)?.state || 'idle';
  }

  getWatchedExtensions(): WatchedExtension[] {
    return Array.from(this.watched.values());
  }

  getHistory(extensionId?: string): ReloadHistoryEntry[] {
    if (extensionId) {
      return this.history.filter((h) => h.extensionId === extensionId);
    }
    return [...this.history];
  }

  isWatching(extensionId: string): boolean {
    return this.watched.has(extensionId) && this.watched.get(extensionId)!.state !== 'idle';
  }

  // ─── File Change Handler ──────────────────────────────────────────────────

  private handleFileChange(extensionId: string, filePath: string): void {
    const entry = this.watched.get(extensionId);
    if (!entry) return;

    // Track changed files
    if (!entry.filesChanged.includes(filePath)) {
      entry.filesChanged.push(filePath);
    }

    // Debounce the reload
    if (entry.debounceTimer) {
      clearTimeout(entry.debounceTimer);
    }

    entry.debounceTimer = setTimeout(() => {
      const changedFiles = [...entry.filesChanged];
      entry.filesChanged = [];
      this.performReload(extensionId, changedFiles);
    }, this.config.debounceMs);
  }

  // ─── Perform Reload ───────────────────────────────────────────────────────

  private async performReload(extensionId: string, filesChanged: string[]): Promise<void> {
    const entry = this.watched.get(extensionId);
    const handler = this.reloadHandlers.get(extensionId);

    if (!handler) {
      console.warn(`[HotReload] No reload handler registered for ${extensionId}`);
      return;
    }

    if (entry) {
      entry.state = 'reloading';
    }

    this.emit('extension:reloading', {
      extensionId,
      state: 'reloading',
      timestamp: new Date().toISOString(),
    } as ReloadEvent);

    const startTime = Date.now();

    try {
      // Step 1: Graceful shutdown
      await handler.shutdown();

      // Step 2: Reinitialize
      await handler.initialize();

      // Step 3: Health check (if enabled)
      if (this.config.healthCheckEnabled && handler.healthCheck) {
        const healthCheckPromise = handler.healthCheck();
        const healthy = await Promise.race([
          healthCheckPromise,
          new Promise<boolean>((_resolve, reject) =>
            setTimeout(() => reject(new Error('Health check timeout')), this.config.healthCheckTimeoutMs),
          ),
        ]).catch(() => false);

        if (!healthy) {
          throw new Error('Health check failed after reload');
        }
      }

      // Success
      const duration = Date.now() - startTime;

      if (entry) {
        entry.state = 'watching';
        entry.lastReloadAt = new Date().toISOString();
        entry.lastError = undefined;
        entry.retryCount = 0;
      }

      this.history.push({
        extensionId,
        timestamp: new Date().toISOString(),
        result: 'success',
        duration,
        filesChanged,
      });

      this.emit('extension:reloaded', {
        extensionId,
        state: 'watching',
        timestamp: new Date().toISOString(),
        duration,
      } as ReloadEvent);
    } catch (err) {
      const duration = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Attempt rollback if enabled
      if (this.config.rollbackOnFailure) {
        try {
          await handler.initialize();
        } catch (rollbackErr) {
          console.error(`[HotReload] Rollback failed for ${extensionId}:`, rollbackErr);
        }
      }

      // Retry logic
      const currentRetry = entry?.retryCount || 0;
      if (currentRetry < this.config.maxRetries) {
        if (entry) {
          entry.retryCount = currentRetry + 1;
          entry.state = 'watching';
        }

        this.history.push({
          extensionId,
          timestamp: new Date().toISOString(),
          result: 'error',
          duration,
          error: errorMessage,
          filesChanged,
        });

        this.emit('extension:reload-error', {
          extensionId,
          state: 'watching',
          timestamp: new Date().toISOString(),
          error: `Reload failed (attempt ${currentRetry + 1}/${this.config.maxRetries}): ${errorMessage}`,
        } as ReloadEvent);

        // Schedule retry
        setTimeout(() => {
          this.performReload(extensionId, []);
        }, 1000 * (currentRetry + 1)); // Exponential-ish backoff
      } else {
        // Max retries reached
        if (entry) {
          entry.state = 'error';
          entry.lastError = errorMessage;
          entry.retryCount = 0;
        }

        this.history.push({
          extensionId,
          timestamp: new Date().toISOString(),
          result: 'error',
          duration,
          error: errorMessage,
          filesChanged,
        });

        this.emit('extension:reload-error', {
          extensionId,
          state: 'error',
          timestamp: new Date().toISOString(),
          error: `Max retries reached: ${errorMessage}`,
        } as ReloadEvent);
      }
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  destroy(): void {
    this.stopAll();
    this.reloadHandlers.clear();
    this.history = [];
    this.removeAllListeners();
  }
}
