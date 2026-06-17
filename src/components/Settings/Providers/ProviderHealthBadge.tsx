/**
 * OpenAgent-Desktop - Provider Health Badge
 *
 * Small colored dot + label showing the latest health-check result for a
 * provider. 'unknown' is the default before any check runs.
 */

import React from 'react';
import { HealthCheckResult } from './types';

const STATUS_COLOR: Record<HealthCheckResult['status'], string> = {
  healthy: '#22c55e',
  degraded: '#f59e0b',
  unhealthy: '#ef4444',
  unknown: '#6b7280',
};

const STATUS_LABEL: Record<HealthCheckResult['status'], string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  unhealthy: 'Unhealthy',
  unknown: 'Unknown',
};

export interface ProviderHealthBadgeProps {
  health?: HealthCheckResult | null;
}

export const ProviderHealthBadge: React.FC<ProviderHealthBadgeProps> = ({ health }) => {
  const status = health?.status ?? 'unknown';
  const color = STATUS_COLOR[status];
  const label = STATUS_LABEL[status];
  const latency = health?.latencyMs !== undefined ? `${health.latencyMs}ms` : null;

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs"
      style={{
        background: `${color}20`,
        color,
        border: `1px solid ${color}40`,
      }}
      title={health?.error ? `Last error: ${health.error}` : `Status: ${label}`}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {label}
      {latency && <span style={{ opacity: 0.7 }}>· {latency}</span>}
    </span>
  );
};

export default ProviderHealthBadge;
