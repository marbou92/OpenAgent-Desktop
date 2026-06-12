/**
 * OpenAgent-Desktop - Provider Health Dashboard
 *
 * Live dashboard showing provider health status, latency history,
 * uptime percentage, and failover chain configuration.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ProviderInfo, Toast } from '../../types';

const api = (window as any).openagent;

interface ProviderHealthSnapshot {
  providerId: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latencyMs: number;
  lastCheckAt: string;
  consecutiveFailures: number;
  totalChecks: number;
  totalFailures: number;
  uptimePercent: number;
  latencyHistory: { timestamp: string; latencyMs: number }[];
  lastError?: string;
}

interface HealthDashboardData {
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

interface ProviderHealthDashboardProps {
  providers: ProviderInfo[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  healthy: { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', label: 'Healthy', icon: '●' },
  degraded: { color: '#eab308', bg: 'rgba(234,179,8,0.1)', label: 'Degraded', icon: '◐' },
  unhealthy: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'Unhealthy', icon: '○' },
  unknown: { color: '#6b7280', bg: 'rgba(107,114,128,0.1)', label: 'Unknown', icon: '◌' },
};

const ProviderHealthDashboard: React.FC<ProviderHealthDashboardProps> = ({ providers, addToast }) => {
  const [dashboardData, setDashboardData] = useState<HealthDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      if (api?.providers?.health?.dashboard) {
        const data = await api.providers.health.dashboard();
        setDashboardData(data);
      }
    } catch (err: any) {
      // Dashboard may not be available yet
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    fetchDashboard();
    let interval: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      interval = setInterval(fetchDashboard, 30000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [fetchDashboard, autoRefresh]);

  // Listen for real-time health updates
  useEffect(() => {
    if (!api?.on?.providerHealthUpdate) return;
    const unsub = api.on.providerHealthUpdate((snapshot: ProviderHealthSnapshot) => {
      setDashboardData((prev) => {
        if (!prev) return prev;
        const providers = prev.providers.map((p) =>
          p.providerId === snapshot.providerId ? snapshot : p
        );
        return { ...prev, providers, lastUpdated: new Date().toISOString() };
      });
    });
    return unsub;
  }, []);

  const handleCheckNow = async (providerId: string) => {
    try {
      if (api?.providers?.health?.check) {
        await api.providers.health.check(providerId);
        addToast({ type: 'success', title: 'Health check triggered' });
        await fetchDashboard();
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Health check failed', message: err.message });
    }
  };

  const handleCheckAll = async () => {
    setLoading(true);
    try {
      for (const provider of providers) {
        if (api?.providers?.health?.check) {
          await api.providers.health.check(provider.id);
        }
      }
      await fetchDashboard();
      addToast({ type: 'success', title: 'All providers checked' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Check failed', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const _getProviderName = (providerId: string): string => {
    return providers.find((p) => p.id === providerId)?.name || providerId;
  };

  const getSnapshot = (providerId: string): ProviderHealthSnapshot | undefined => {
    return dashboardData?.providers.find((p) => p.providerId === providerId);
  };

  const formatUptime = (percent: number): string => {
    return `${percent.toFixed(1)}%`;
  };

  const formatLatency = (ms: number): string => {
    if (ms < 0) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getMaxLatency = (history: { latencyMs: number }[]): number => {
    if (!history.length) return 0;
    return Math.max(...history.map((h) => h.latencyMs));
  };

  // Mini sparkline for latency history
  const Sparkline: React.FC<{ data: { latencyMs: number }[]; width?: number; height?: number }> = ({ data, width = 120, height = 30 }) => {
    if (!data.length) return <span style={{ color: 'var(--color-text-tertiary)', fontSize: '11px' }}>No data</span>;
    const max = getMaxLatency(data) || 1;
    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - (d.latencyMs / max) * height;
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg width={width} height={height} style={{ display: 'block' }}>
        <polyline
          points={points}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  if (loading && !dashboardData) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Loading health dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span style={{ color: '#22c55e', fontSize: '18px' }}>●</span>
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {dashboardData?.summary.healthyCount || 0} Healthy
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: '#eab308', fontSize: '18px' }}>◐</span>
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {dashboardData?.summary.degradedCount || 0} Degraded
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: '#ef4444', fontSize: '18px' }}>○</span>
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {dashboardData?.summary.unhealthyCount || 0} Unhealthy
            </span>
          </div>
          <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Avg latency: {formatLatency(dashboardData?.summary.averageLatencyMs || 0)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh
          </label>
          <button
            onClick={handleCheckAll}
            className="px-3 py-1 rounded-lg text-xs border transition-colors"
            style={{ borderColor: 'var(--color-border-primary)', color: 'var(--color-text-secondary)' }}
          >
            Check All
          </button>
        </div>
      </div>

      {/* Provider Health Cards */}
      <div className="space-y-2">
        {providers.map((provider) => {
          const snapshot = getSnapshot(provider.id);
          const status = snapshot?.status || 'unknown';
          const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.unknown;
          const isSelected = selectedProvider === provider.id;

          return (
            <div key={provider.id} className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border-primary)' }}>
              <div
                className="flex items-center justify-between p-3 cursor-pointer transition-colors"
                style={{ background: isSelected ? 'var(--color-bg-tertiary)' : 'var(--color-bg-secondary)' }}
                onClick={() => setSelectedProvider(isSelected ? null : provider.id)}
              >
                <div className="flex items-center gap-3">
                  <span style={{ color: statusConfig.color, fontSize: '16px' }}>{statusConfig.icon}</span>
                  <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {provider.name}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      {provider.type} | {statusConfig.label}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-sm font-mono" style={{ color: 'var(--color-text-primary)' }}>
                      {formatLatency(snapshot?.latencyMs ?? -1)}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      Uptime: {formatUptime(snapshot?.uptimePercent ?? 100)}
                    </div>
                  </div>
                  {snapshot?.latencyHistory && snapshot.latencyHistory.length > 1 && (
                    <Sparkline data={snapshot.latencyHistory} />
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCheckNow(provider.id); }}
                    className="px-2 py-1 rounded text-xs border transition-colors"
                    style={{ borderColor: 'var(--color-border-primary)', color: 'var(--color-text-secondary)' }}
                  >
                    Check
                  </button>
                </div>
              </div>

              {/* Expanded detail */}
              {isSelected && snapshot && (
                <div className="p-3 border-t" style={{ borderColor: 'var(--color-border-primary)', background: 'var(--color-bg-tertiary)' }}>
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div>
                      <div style={{ color: 'var(--color-text-tertiary)' }}>Last Check</div>
                      <div style={{ color: 'var(--color-text-primary)' }}>{new Date(snapshot.lastCheckAt).toLocaleTimeString()}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--color-text-tertiary)' }}>Total Checks</div>
                      <div style={{ color: 'var(--color-text-primary)' }}>{snapshot.totalChecks}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--color-text-tertiary)' }}>Failures</div>
                      <div style={{ color: snapshot.totalFailures > 0 ? '#ef4444' : 'var(--color-text-primary)' }}>{snapshot.totalFailures}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--color-text-tertiary)' }}>Consecutive Failures</div>
                      <div style={{ color: snapshot.consecutiveFailures > 0 ? '#ef4444' : 'var(--color-text-primary)' }}>{snapshot.consecutiveFailures}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--color-text-tertiary)' }}>Avg Latency</div>
                      <div style={{ color: 'var(--color-text-primary)' }}>
                        {snapshot.latencyHistory.length > 0
                          ? formatLatency(Math.round(snapshot.latencyHistory.reduce((a, b) => a + b.latencyMs, 0) / snapshot.latencyHistory.length))
                          : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--color-text-tertiary)' }}>Last Error</div>
                      <div style={{ color: snapshot.lastError ? '#ef4444' : 'var(--color-text-primary)' }}>
                        {snapshot.lastError || 'None'}
                      </div>
                    </div>
                  </div>
                  {snapshot.latencyHistory.length > 2 && (
                    <div className="mt-3">
                      <div className="text-xs mb-1" style={{ color: 'var(--color-text-tertiary)' }}>Latency Trend</div>
                      <Sparkline data={snapshot.latencyHistory} width={300} height={50} />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Last updated */}
      {dashboardData?.lastUpdated && (
        <div className="text-xs text-center" style={{ color: 'var(--color-text-tertiary)' }}>
          Last updated: {new Date(dashboardData.lastUpdated).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};

export default ProviderHealthDashboard;
