/**
 * OpenAgent-Desktop - Provider Health Monitor
 * 
 * Periodically checks provider health, tracks latency history,
 * detects failures, and manages fallback chains.
 * Emits events for the UI health dashboard.
 */

import { EventEmitter } from 'events';
import { ProviderManager } from './manager';
import { HealthStatus } from './types';

export interface ProviderHealthSnapshot {
  providerId: string;
  status: HealthStatus;
  latencyMs: number;
  lastCheckAt: string;
  consecutiveFailures: number;
  totalChecks: number;
  totalFailures: number;
  uptimePercent: number;
  latencyHistory: LatencyRecord[];
  lastError?: string;
}

export interface LatencyRecord {
  timestamp: string;
  latencyMs: number;
}

export interface HealthDashboardData {
  providers: ProviderHealthSnapshot[];
  summary: {
    totalProviders: number;
    healthyCount: number;
    degradedCount: number;
    unhealthyCount: number;
    unknownCount: number;
    averageLatencyMs: number;
  };
  lastUpdated: string;
}

export class ProviderHealthMonitor extends EventEmitter {
  private providerManager: ProviderManager;
  private snapshots: Map<string, ProviderHealthSnapshot> = new Map();
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();
  private defaultCheckIntervalMs: number;
  private maxLatencyHistory: number;
  private running = false;

  constructor(providerManager: ProviderManager, options?: { checkIntervalMs?: number; maxLatencyHistory?: number }) {
    super();
    this.providerManager = providerManager;
    this.defaultCheckIntervalMs = options?.checkIntervalMs || 60000; // 1 minute
    this.maxLatencyHistory = options?.maxLatencyHistory || 100;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Initial check for all providers
    const providers = await this.providerManager.list();
    for (const provider of providers) {
      await this.checkProvider(provider.id);
      this.schedulePeriodicCheck(provider.id);
    }

    this.emit('monitor:started');
  }

  stop(): void {
    this.running = false;
    for (const [, timeout] of this.checkIntervals) {
      clearInterval(timeout);
    }
    this.checkIntervals.clear();
    this.emit('monitor:stopped');
  }

  private schedulePeriodicCheck(providerId: string): void {
    // Clear existing interval
    const existing = this.checkIntervals.get(providerId);
    if (existing) clearInterval(existing);

    const interval = setInterval(async () => {
      if (this.running) {
        await this.checkProvider(providerId);
      }
    }, this.defaultCheckIntervalMs);

    this.checkIntervals.set(providerId, interval);
  }

  async checkProvider(providerId: string): Promise<ProviderHealthSnapshot> {
    const startTime = Date.now();
    let status: HealthStatus = HealthStatus.unknown;
    let latencyMs = -1;
    let lastError: string | undefined;

    try {
      const working = await this.providerManager.test(providerId);
      latencyMs = Date.now() - startTime;
      status = working ? HealthStatus.healthy : HealthStatus.unhealthy;
      if (!working) {
        lastError = 'Connection test failed';
      }
    } catch (err) {
      latencyMs = Date.now() - startTime;
      status = HealthStatus.unhealthy;
      lastError = err instanceof Error ? err.message : String(err);
    }

    // Update or create snapshot
    const existing = this.snapshots.get(providerId);
    const consecutiveFailures = status === HealthStatus.unhealthy
      ? (existing?.consecutiveFailures || 0) + 1
      : 0;
    const totalChecks = (existing?.totalChecks || 0) + 1;
    const totalFailures = (existing?.totalFailures || 0) + (status === HealthStatus.unhealthy ? 1 : 0);
    const uptimePercent = totalChecks > 0 ? ((totalChecks - totalFailures) / totalChecks) * 100 : 100;

    const latencyHistory = [...(existing?.latencyHistory || [])];
    if (latencyMs >= 0) {
      latencyHistory.push({ timestamp: new Date().toISOString(), latencyMs });
      if (latencyHistory.length > this.maxLatencyHistory) {
        latencyHistory.shift();
      }
    }

    // Determine effective status (degraded if slow but working)
    const effectiveStatus: HealthStatus =
      (status === HealthStatus.healthy && latencyMs > 5000)
        ? HealthStatus.degraded
        : status;

    const snapshot: ProviderHealthSnapshot = {
      providerId,
      status: effectiveStatus,
      latencyMs,
      lastCheckAt: new Date().toISOString(),
      consecutiveFailures,
      totalChecks,
      totalFailures,
      uptimePercent,
      latencyHistory,
      lastError,
    };

    this.snapshots.set(providerId, snapshot);
    this.emit('provider:health-update', snapshot);

    // If status changed, emit change event
    if (existing && existing.status !== effectiveStatus) {
      this.emit('provider:status-changed', {
        providerId,
        oldStatus: existing.status,
        newStatus: effectiveStatus,
      });
    }

    return snapshot;
  }

  getSnapshot(providerId: string): ProviderHealthSnapshot | undefined {
    return this.snapshots.get(providerId);
  }

  getAllSnapshots(): ProviderHealthSnapshot[] {
    return Array.from(this.snapshots.values());
  }

  getDashboardData(): HealthDashboardData {
    const providers = this.getAllSnapshots();
    const healthyCount = providers.filter((p) => p.status === HealthStatus.healthy).length;
    const degradedCount = providers.filter((p) => p.status === HealthStatus.degraded).length;
    const unhealthyCount = providers.filter((p) => p.status === HealthStatus.unhealthy).length;
    const unknownCount = providers.filter((p) => p.status === HealthStatus.unknown).length;

    const latencies = providers
      .filter((p) => p.latencyMs >= 0)
      .map((p) => p.latencyMs);
    const averageLatencyMs = latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0;

    return {
      providers,
      summary: {
        totalProviders: providers.length,
        healthyCount,
        degradedCount,
        unhealthyCount,
        unknownCount,
        averageLatencyMs,
      },
      lastUpdated: new Date().toISOString(),
    };
  }

  addProvider(providerId: string): void {
    if (this.running) {
      this.schedulePeriodicCheck(providerId);
      this.checkProvider(providerId);
    }
  }

  removeProvider(providerId: string): void {
    const interval = this.checkIntervals.get(providerId);
    if (interval) {
      clearInterval(interval);
      this.checkIntervals.delete(providerId);
    }
    this.snapshots.delete(providerId);
  }
}
