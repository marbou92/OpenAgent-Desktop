/**
 * OpenAgent-Desktop Aether - Provider Health Monitor
 *
 * Periodically checks provider health, tracks latency history,
 * and emits events when health status changes.
 */

import { EventEmitter } from 'events';

export interface HealthMonitorOptions {
  checkIntervalMs?: number;
  maxLatencyHistory?: number;
  degradedLatencyMs?: number;
}

export interface HealthSnapshot {
  providerId: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latencyMs: number;
  consecutiveFailures: number;
  lastError?: string;
  checkedAt: string;
}

export interface HealthDashboardData {
  providers: HealthSnapshot[];
  summary: {
    totalProviders: number;
    healthyCount: number;
    degradedCount: number;
    unhealthyCount: number;
  };
  lastUpdated: string;
}

export class ProviderHealthMonitor extends EventEmitter {
  private providerManager: { list: () => Promise<any[]>; test: (id: string) => Promise<any> };
  private options: Required<HealthMonitorOptions>;
  private snapshots: Map<string, HealthSnapshot> = new Map();
  private latencyHistory: Map<string, number[]> = new Map();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    providerManager: { list: () => Promise<any[]>; test: (id: string) => Promise<any> },
    options: HealthMonitorOptions = {},
  ) {
    super();
    this.providerManager = providerManager;
    this.options = {
      checkIntervalMs: options.checkIntervalMs ?? 60000,
      maxLatencyHistory: options.maxLatencyHistory ?? 10,
      degradedLatencyMs: options.degradedLatencyMs ?? 5000,
    };
  }

  async checkProvider(providerId: string): Promise<HealthSnapshot> {
    const start = Date.now();
    let status: HealthSnapshot['status'] = 'healthy';
    let latencyMs = 0;
    let lastError: string | undefined;
    let consecutiveFailures = 0;

    try {
      const result = await this.providerManager.test(providerId);
      latencyMs = Date.now() - start;

      const isWorking = typeof result === 'object' ? result.working !== false : result === true;
      if (!isWorking) {
        status = 'unhealthy';
      } else if (latencyMs > this.options.degradedLatencyMs) {
        status = 'degraded';
      }
    } catch (err: any) {
      latencyMs = Date.now() - start;
      status = 'unhealthy';
      lastError = err?.message || String(err);
    }

    // Update consecutive failures
    const previous = this.snapshots.get(providerId);
    if (status === 'unhealthy') {
      consecutiveFailures = (previous?.consecutiveFailures ?? 0) + 1;
    } else {
      consecutiveFailures = 0;
    }

    // Track latency history
    const history = this.latencyHistory.get(providerId) || [];
    history.push(latencyMs);
    if (history.length > this.options.maxLatencyHistory) {
      history.shift();
    }
    this.latencyHistory.set(providerId, history);

    const snapshot: HealthSnapshot = {
      providerId,
      status,
      latencyMs,
      consecutiveFailures,
      lastError,
      checkedAt: new Date().toISOString(),
    };

    this.snapshots.set(providerId, snapshot);
    this.emit('provider:health-update', snapshot);

    return snapshot;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.intervalId = setInterval(() => this.runAllChecks(), this.options.checkIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
  }

  private async runAllChecks(): Promise<void> {
    try {
      const providers = await this.providerManager.list();
      for (const provider of providers) {
        await this.checkProvider(provider.id);
      }
    } catch {
      // Provider list may be unavailable
    }
  }

  getDashboardData(): HealthDashboardData {
    const snapshots = Array.from(this.snapshots.values());
    const healthyCount = snapshots.filter(s => s.status === 'healthy').length;
    const degradedCount = snapshots.filter(s => s.status === 'degraded').length;
    const unhealthyCount = snapshots.filter(s => s.status === 'unhealthy').length;

    return {
      providers: snapshots,
      summary: {
        totalProviders: snapshots.length,
        healthyCount,
        degradedCount,
        unhealthyCount,
      },
      lastUpdated: new Date().toISOString(),
    };
  }

  getSnapshot(providerId: string): HealthSnapshot | undefined {
    return this.snapshots.get(providerId);
  }

  getLatencyHistory(providerId: string): number[] {
    return this.latencyHistory.get(providerId) || [];
  }

  isRunning(): boolean {
    return this.running;
  }
}
