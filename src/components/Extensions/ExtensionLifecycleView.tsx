/**
 * OpenAgent-Desktop - Extension Lifecycle Dashboard
 *
 * Shows extension lifecycle states with color-coded badges,
 * state transition timelines, actions per state, health & hot-reload
 * indicators, auto-restart toggles, bulk actions, and state filters.
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { ExtensionInfo, Toast } from '../../types';

const api = (window as any).openagent;

// ─── Lifecycle Types ─────────────────────────────────────────────────────────

type LifecycleState =
  | 'uninstalled'
  | 'installing'
  | 'installed'
  | 'configuring'
  | 'configured'
  | 'activating'
  | 'active'
  | 'deactivating'
  | 'error';

interface LifecycleTransition {
  from: LifecycleState;
  to: LifecycleState;
  timestamp: string;
  reason: string;
  result: 'success' | 'failure';
  error?: string;
  duration?: number;
}

interface LifecycleEntry {
  extensionId: string;
  extensionName: string;
  state: LifecycleState;
  autoRestart: boolean;
  autoRestartAttempts: number;
  maxAutoRestartAttempts: number;
  healthStatus: 'healthy' | 'unhealthy' | 'unknown';
  hotReloadState: 'idle' | 'watching' | 'reloading' | 'error';
  lastActivatedAt?: string;
  lastError?: string;
  history: LifecycleTransition[];
  securityScanResult?: {
    isSafe: boolean;
    riskScore: number;
    findings: Array<{ type: string; severity: string; description: string }>;
  };
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface ExtensionLifecycleViewProps {
  extensions: ExtensionInfo[];
  onRefresh: () => Promise<void>;
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

// ─── State Badge Colors ──────────────────────────────────────────────────────

const STATE_COLORS: Record<LifecycleState, { bg: string; text: string; label: string }> = {
  uninstalled: { bg: 'rgba(107,114,128,0.15)', text: '#6b7280', label: 'Uninstalled' },
  installing: { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6', label: 'Installing' },
  installed: { bg: 'rgba(107,114,128,0.15)', text: '#9ca3af', label: 'Installed' },
  configuring: { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6', label: 'Configuring' },
  configured: { bg: 'rgba(139,92,246,0.15)', text: '#8b5cf6', label: 'Configured' },
  activating: { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6', label: 'Activating' },
  active: { bg: 'rgba(34,197,94,0.15)', text: '#22c55e', label: 'Active' },
  deactivating: { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b', label: 'Deactivating' },
  error: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444', label: 'Error' },
};

const HEALTH_COLORS = {
  healthy: { bg: 'rgba(34,197,94,0.15)', text: '#22c55e' },
  unhealthy: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444' },
  unknown: { bg: 'rgba(107,114,128,0.15)', text: '#6b7280' },
};

// ─── State Badge Component ───────────────────────────────────────────────────

const StateBadge: React.FC<{ state: LifecycleState }> = ({ state }) => {
  const colors = STATE_COLORS[state];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: colors.bg, color: colors.text }}
    >
      {(state === 'installing' || state === 'activating' || state === 'configuring' || state === 'deactivating') && (
        <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 019.95 9" />
        </svg>
      )}
      {colors.label}
    </span>
  );
};

// ─── Health Indicator ────────────────────────────────────────────────────────

const HealthIndicator: React.FC<{ status: 'healthy' | 'unhealthy' | 'unknown' }> = ({ status }) => {
  const colors = HEALTH_COLORS[status];
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium"
      style={{ color: colors.text }}
    >
      {status === 'healthy' && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
        </svg>
      )}
      {status === 'unhealthy' && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
        </svg>
      )}
      {status === 'unknown' && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      )}
      {status === 'healthy' ? 'Healthy' : status === 'unhealthy' ? 'Unhealthy' : 'Unknown'}
    </span>
  );
};

// ─── Hot Reload Indicator ────────────────────────────────────────────────────

const HotReloadIndicator: React.FC<{ state: 'idle' | 'watching' | 'reloading' | 'error' }> = ({ state }) => (
  <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: state === 'watching' ? '#22c55e' : state === 'reloading' ? '#3b82f6' : state === 'error' ? '#ef4444' : 'var(--color-text-muted)' }}>
    {state === 'watching' && (
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
      </span>
    )}
    {state === 'reloading' && (
      <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12a9 9 0 11-6.219-8.56" />
      </svg>
    )}
    {state === 'error' && <span className="w-2 h-2 rounded-full bg-red-500" />}
    {state === 'idle' && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--color-text-muted)' }} />}
    {state === 'watching' ? 'Watching' : state === 'reloading' ? 'Reloading' : state === 'error' ? 'Error' : 'Idle'}
  </span>
);

// ─── Main Component ──────────────────────────────────────────────────────────

const ExtensionLifecycleView: React.FC<ExtensionLifecycleViewProps> = ({
  extensions,
  onRefresh,
  addToast,
}) => {
  const [lifecycleEntries, setLifecycleEntries] = useState<LifecycleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState<LifecycleState | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [showHistoryFor, setShowHistoryFor] = useState<string | null>(null);

  // Fetch lifecycle data
  const fetchLifecycle = useCallback(async () => {
    setLoading(true);
    try {
      if (api?.lifecycle?.getAll) {
        const data = await api.lifecycle.getAll();
        if (Array.isArray(data)) {
          setLifecycleEntries(data);
          setLoading(false);
          return;
        }
      }
    } catch {
      // Lifecycle API not available
    }

    // Build from extensions if lifecycle API not available
    const entries: LifecycleEntry[] = extensions.map((ext) => ({
      extensionId: ext.id,
      extensionName: ext.name,
      state: ext.enabled
        ? 'active'
        : ext.installed
          ? 'configured'
          : 'uninstalled',
      autoRestart: false,
      autoRestartAttempts: 0,
      maxAutoRestartAttempts: 3,
      healthStatus: ext.enabled ? 'healthy' : 'unknown',
      hotReloadState: ext.enabled ? 'idle' : 'idle',
      lastActivatedAt: ext.installed ? new Date().toISOString() : undefined,
      history: ext.installed
        ? [
            {
              from: 'uninstalled' as LifecycleState,
              to: 'installed' as LifecycleState,
              timestamp: new Date().toISOString(),
              reason: 'Extension installed',
              result: 'success' as const,
            },
            ext.enabled
              ? {
                  from: 'configured' as LifecycleState,
                  to: 'active' as LifecycleState,
                  timestamp: new Date().toISOString(),
                  reason: 'Extension activated',
                  result: 'success' as const,
                }
              : undefined,
          ].filter(Boolean) as LifecycleTransition[]
        : [],
    }));
    setLifecycleEntries(entries);
    setLoading(false);
  }, [extensions]);

  useEffect(() => {
    fetchLifecycle();
  }, [fetchLifecycle]);

  const filteredEntries = useMemo(() => {
    if (stateFilter === 'all') return lifecycleEntries;
    return lifecycleEntries.filter((e) => e.state === stateFilter);
  }, [lifecycleEntries, stateFilter]);

  const stateCounts = useMemo(() => {
    const counts: Record<string, number> = { all: lifecycleEntries.length };
    for (const entry of lifecycleEntries) {
      counts[entry.state] = (counts[entry.state] || 0) + 1;
    }
    return counts;
  }, [lifecycleEntries]);

  // ─── Actions ─────────────────────────────────────────────────────────────

  const handleAction = async (extensionId: string, action: string) => {
    setActionInProgress(extensionId);
    try {
      switch (action) {
        case 'activate':
          if (api?.lifecycle?.activate) {
            await api.lifecycle.activate(extensionId);
          }
          break;
        case 'deactivate':
          if (api?.lifecycle?.deactivate) {
            await api.lifecycle.deactivate(extensionId);
          }
          break;
        case 'restart':
          if (api?.lifecycle?.restart) {
            await api.lifecycle.restart(extensionId);
          }
          break;
        case 'uninstall':
          if (!confirm('Uninstall this extension?')) {
            setActionInProgress(null);
            return;
          }
          if (api?.lifecycle?.uninstall) {
            await api.lifecycle.uninstall(extensionId);
          }
          break;
      }
      addToast({ type: 'success', title: `Extension ${action}d successfully` });
      await onRefresh();
      await fetchLifecycle();
    } catch (err: any) {
      addToast({ type: 'error', title: `Failed to ${action} extension`, message: err.message });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleToggleAutoRestart = async (extensionId: string, enabled: boolean) => {
    try {
      if (api?.lifecycle?.setAutoRestart) {
        await api.lifecycle.setAutoRestart(extensionId, enabled);
      }
      setLifecycleEntries((prev) =>
        prev.map((e) =>
          e.extensionId === extensionId ? { ...e, autoRestart: enabled } : e,
        ),
      );
      addToast({ type: 'success', title: `Auto-restart ${enabled ? 'enabled' : 'disabled'}` });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to toggle auto-restart', message: err.message });
    }
  };

  const handleBulkAction = async (action: 'activate' | 'deactivate') => {
    try {
      if (api?.lifecycle?.[`${action}All`]) {
        const result = await api.lifecycle[`${action}All`]();
        addToast({
          type: 'success',
          title: `${result.succeeded?.length || 0} extensions ${action}d`,
          message: result.failed?.length > 0 ? `${result.failed.length} failed` : undefined,
        });
      }
      await onRefresh();
      await fetchLifecycle();
    } catch (err: any) {
      addToast({ type: 'error', title: `Bulk ${action} failed`, message: err.message });
    }
  };

  // ─── Get Available Actions for a State ────────────────────────────────────

  const _getActions = (state: LifecycleState): { action: string; label: string; color: string }[] => {
    switch (state) {
      case 'configured':
      case 'error':
        return [{ action: 'activate', label: 'Activate', color: 'var(--color-success)' }];
      case 'active':
        return [
          { action: 'deactivate', label: 'Deactivate', color: 'var(--color-warning)' },
          { action: 'restart', label: 'Restart', color: 'var(--color-accent)' },
        ];
      case 'installed':
        return [{ action: 'activate', label: 'Activate', color: 'var(--color-success)' }];
      default:
        return [];
    }
  };

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--color-bg-primary)' }}>
      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--color-border-secondary)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
              Lifecycle Manager
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
              {lifecycleEntries.filter((e) => e.state === 'active').length} active ·{' '}
              {lifecycleEntries.filter((e) => e.state === 'error').length} errors ·{' '}
              {lifecycleEntries.length} total
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBulkAction('activate')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border"
              style={{ borderColor: 'var(--color-success)', color: 'var(--color-success)', background: 'transparent' }}
            >
              Activate All
            </button>
            <button
              onClick={() => handleBulkAction('deactivate')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border"
              style={{ borderColor: 'var(--color-warning)', color: 'var(--color-warning)', background: 'transparent' }}
            >
              Deactivate All
            </button>
            <button
              onClick={() => { onRefresh(); fetchLifecycle(); }}
              className="p-2 rounded-lg border transition-colors"
              style={{ borderColor: 'var(--color-border-primary)', color: 'var(--color-text-tertiary)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
          </div>
        </div>

        {/* State Filter Bar */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setStateFilter('all')}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors"
            style={{
              background: stateFilter === 'all' ? 'var(--color-accent-soft)' : 'var(--color-bg-secondary)',
              color: stateFilter === 'all' ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
              border: stateFilter === 'all' ? '1px solid var(--color-accent)' : '1px solid var(--color-border-primary)',
            }}
          >
            All
            <span className="px-1 rounded text-[10px]" style={{ background: 'var(--color-bg-tertiary)' }}>
              {stateCounts.all || 0}
            </span>
          </button>
          {Object.entries(STATE_COLORS).map(([state, colors]) => {
            const count = stateCounts[state] || 0;
            if (count === 0) return null;
            return (
              <button
                key={state}
                onClick={() => setStateFilter(state as LifecycleState)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors"
                style={{
                  background: stateFilter === state ? colors.bg : 'var(--color-bg-secondary)',
                  color: stateFilter === state ? colors.text : 'var(--color-text-tertiary)',
                  border: stateFilter === state ? `1px solid ${colors.text}` : '1px solid var(--color-border-primary)',
                }}
              >
                {colors.label}
                <span className="px-1 rounded text-[10px]" style={{ background: 'var(--color-bg-tertiary)' }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Extension List */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div
              className="w-6 h-6 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }}
            />
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="text-center py-12" style={{ color: 'var(--color-text-tertiary)' }}>
            <p className="text-lg">No extensions in this state</p>
            <p className="text-sm mt-1">Try a different filter</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredEntries.map((entry) => (
              <ExtensionLifecycleCard
                key={entry.extensionId}
                entry={entry}
                isExpanded={expandedId === entry.extensionId}
                isActionInProgress={actionInProgress === entry.extensionId}
                showHistory={showHistoryFor === entry.extensionId}
                onToggleExpand={() =>
                  setExpandedId(expandedId === entry.extensionId ? null : entry.extensionId)
                }
                onAction={(action) => handleAction(entry.extensionId, action)}
                onToggleAutoRestart={(enabled) => handleToggleAutoRestart(entry.extensionId, enabled)}
                onToggleHistory={() =>
                  setShowHistoryFor(showHistoryFor === entry.extensionId ? null : entry.extensionId)
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Extension Lifecycle Card ────────────────────────────────────────────────

const ExtensionLifecycleCard: React.FC<{
  entry: LifecycleEntry;
  isExpanded: boolean;
  isActionInProgress: boolean;
  showHistory: boolean;
  onToggleExpand: () => void;
  onAction: (action: string) => void;
  onToggleAutoRestart: (enabled: boolean) => void;
  onToggleHistory: () => void;
}> = ({
  entry,
  isExpanded,
  isActionInProgress,
  showHistory,
  onToggleExpand,
  onAction,
  onToggleAutoRestart,
  onToggleHistory,
}) => {
  const actions = getActions(entry.state);

  return (
    <div
      className="rounded-xl border transition-all"
      style={{
        background: 'var(--color-bg-secondary)',
        borderColor: entry.state === 'error' ? 'rgba(239,68,68,0.3)' : 'var(--color-border-primary)',
      }}
    >
      {/* Main Row */}
      <div className="p-3.5 flex items-center gap-3">
        {/* Expand toggle */}
        <button
          onClick={onToggleExpand}
          className="p-1 rounded hover:bg-white/5"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {/* Extension Name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
              {entry.extensionName}
            </span>
            <StateBadge state={entry.state} />
          </div>
          <div className="flex items-center gap-3 mt-1">
            <HealthIndicator status={entry.healthStatus} />
            <HotReloadIndicator state={entry.hotReloadState} />
          </div>
        </div>

        {/* Auto-restart toggle */}
        {entry.state === 'active' && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              Auto-restart
            </span>
            <button
              onClick={() => onToggleAutoRestart(!entry.autoRestart)}
              className="relative w-8 h-4.5 rounded-full transition-colors"
              style={{
                background: entry.autoRestart ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                padding: '2px',
                minWidth: '32px',
                height: '18px',
              }}
            >
              <span
                className="block w-3.5 h-3.5 rounded-full bg-white transition-transform"
                style={{
                  transform: entry.autoRestart ? 'translateX(14px)' : 'translateX(0)',
                }}
              />
            </button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          {actions.map(({ action, label, color }) => (
            <button
              key={action}
              onClick={() => onAction(action)}
              disabled={isActionInProgress}
              className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              style={{
                background: `${color}15`,
                color,
                border: `1px solid ${color}30`,
              }}
            >
              {isActionInProgress ? (
                <span className="flex items-center gap-1">
                  <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 019.95 9" />
                  </svg>
                  {label}...
                </span>
              ) : (
                label
              )}
            </button>
          ))}

          {/* Uninstall button for installed extensions */}
          {entry.state !== 'uninstalled' && entry.state !== 'installing' && (
            <button
              onClick={() => onAction('uninstall')}
              className="px-2 py-1 rounded-lg text-xs border transition-colors"
              style={{
                borderColor: 'rgba(239,68,68,0.3)',
                color: 'var(--color-destructive)',
                background: 'transparent',
              }}
            >
              Uninstall
            </button>
          )}
        </div>
      </div>

      {/* Expanded: Error Details */}
      {isExpanded && entry.state === 'error' && entry.lastError && (
        <div className="px-3.5 pb-3.5 pt-0">
          <div
            className="p-2.5 rounded-lg text-xs"
            style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-destructive)' }}
          >
            <span className="font-semibold">Error: </span>
            {entry.lastError}
          </div>
        </div>
      )}

      {/* Expanded: Security Scan */}
      {isExpanded && entry.securityScanResult && (
        <div className="px-3.5 pb-3.5 pt-0">
          <div className="p-2.5 rounded-lg" style={{ background: 'var(--color-bg-tertiary)' }}>
            <div className="flex items-center gap-2 mb-2">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke={entry.securityScanResult.isSafe ? '#22c55e' : '#ef4444'}
                strokeWidth="2"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Security Scan
              </span>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Risk: {(entry.securityScanResult.riskScore * 100).toFixed(0)}%
              </span>
            </div>
            {entry.securityScanResult.findings.map((finding, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-xs mt-1.5 p-1.5 rounded"
                style={{ background: 'var(--color-bg-secondary)' }}
              >
                <span
                  className="px-1 rounded text-[10px] font-medium uppercase"
                  style={{
                    background: finding.severity === 'critical' ? 'rgba(239,68,68,0.2)' : finding.severity === 'high' ? 'rgba(245,158,11,0.2)' : 'rgba(107,114,128,0.2)',
                    color: finding.severity === 'critical' ? '#ef4444' : finding.severity === 'high' ? '#f59e0b' : '#6b7280',
                  }}
                >
                  {finding.severity}
                </span>
                <span style={{ color: 'var(--color-text-secondary)' }}>{finding.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History Timeline Toggle */}
      {isExpanded && entry.history.length > 0 && (
        <div className="px-3.5 pb-3.5 pt-0">
          <button
            onClick={onToggleHistory}
            className="text-xs font-medium flex items-center gap-1"
            style={{ color: 'var(--color-accent)' }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ transform: showHistory ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            {showHistory ? 'Hide' : 'Show'} State History ({entry.history.length} transitions)
          </button>

          {showHistory && (
            <div className="mt-2 space-y-1.5">
              {entry.history
                .slice()
                .reverse()
                .map((transition, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs p-2 rounded-lg"
                    style={{ background: 'var(--color-bg-tertiary)' }}
                  >
                    {/* Timeline dot */}
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{
                        background:
                          transition.result === 'success' ? 'var(--color-success)' : 'var(--color-destructive)',
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <span style={{ color: 'var(--color-text-secondary)' }}>
                        {STATE_COLORS[transition.from]?.label || transition.from} → {STATE_COLORS[transition.to]?.label || transition.to}
                      </span>
                      <span className="ml-2" style={{ color: 'var(--color-text-muted)' }}>
                        {transition.reason}
                      </span>
                    </div>
                    <span className="flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                      {new Date(transition.timestamp).toLocaleTimeString()}
                    </span>
                    {transition.duration !== null && (
                      <span className="flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                        {transition.duration}ms
                      </span>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Helper ──────────────────────────────────────────────────────────────────

function getActions(state: LifecycleState): { action: string; label: string; color: string }[] {
  switch (state) {
    case 'configured':
    case 'error':
    case 'installed':
      return [{ action: 'activate', label: 'Activate', color: '#22c55e' }];
    case 'active':
      return [
        { action: 'deactivate', label: 'Deactivate', color: '#f59e0b' },
        { action: 'restart', label: 'Restart', color: '#8b5cf6' },
      ];
    default:
      return [];
  }
}

export default ExtensionLifecycleView;
