/**
 * OpenAgent-Desktop - API Diagnostics Panel
 * 
 * Step-by-step visualization of provider connectivity diagnostics.
 * Like OpenCowork's diagnostic pipeline: DNS → TCP → TLS → Auth → Model
 */

import React, { useState } from 'react';

export interface DiagnosticStepResult {
  step: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'warning' | 'skipped';
  latencyMs?: number;
  message: string;
  advisoryCode?: string;
}

interface ApiDiagnosticsPanelProps {
  providerId: string;
  providerName: string;
  results: DiagnosticStepResult[];
  isRunning: boolean;
  onRunDiagnostic: (quick: boolean) => void;
  overallStatus?: 'healthy' | 'degraded' | 'unhealthy';
}

const STATUS_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  pending: { color: 'var(--color-text-tertiary)', icon: '○', label: 'Pending' },
  running: { color: '#3b82f6', icon: '◉', label: 'Running' },
  passed: { color: '#22c55e', icon: '●', label: 'Passed' },
  failed: { color: '#ef4444', icon: '✕', label: 'Failed' },
  warning: { color: '#eab308', icon: '◐', label: 'Warning' },
  skipped: { color: 'var(--color-text-tertiary)', icon: '—', label: 'Skipped' },
};

const ApiDiagnosticsPanel: React.FC<ApiDiagnosticsPanelProps> = ({
  providerId,
  providerName,
  results,
  isRunning,
  onRunDiagnostic,
  overallStatus,
}) => {
  const [showDetails, setShowDetails] = useState<string | null>(null);

  const overallColor = overallStatus === 'healthy' ? '#22c55e' : overallStatus === 'degraded' ? '#eab308' : overallStatus === 'unhealthy' ? '#ef4444' : 'var(--color-text-tertiary)';

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border-primary)' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-3" style={{ background: 'var(--color-bg-secondary)' }}>
        <div className="flex items-center gap-2">
          <span style={{ color: overallColor, fontSize: '14px' }}>●</span>
          <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
            {providerName} Diagnostics
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onRunDiagnostic(true)}
            disabled={isRunning}
            className="px-2 py-1 rounded text-xs border transition-colors disabled:opacity-50"
            style={{ borderColor: 'var(--color-border-primary)', color: 'var(--color-text-secondary)' }}
          >
            Quick
          </button>
          <button
            onClick={() => onRunDiagnostic(false)}
            disabled={isRunning}
            className="px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50"
            style={{ background: 'var(--color-accent)', color: 'white' }}
          >
            Full Diagnostic
          </button>
        </div>
      </div>

      {/* Steps */}
      <div className="p-3 space-y-2">
        {results.length === 0 && !isRunning && (
          <div className="text-center py-4">
            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Click "Quick" or "Full Diagnostic" to test connectivity
            </div>
          </div>
        )}

        {['dns', 'tcp', 'tls', 'auth', 'model'].map((stepName) => {
          const result = results.find((r) => r.step === stepName);
          const config = STATUS_CONFIG[result?.status || 'pending'];
          const isExpanded = showDetails === stepName;

          return (
            <div
              key={stepName}
              className="flex items-center gap-3 px-3 py-2 rounded cursor-pointer hover:bg-[var(--color-bg-tertiary)] transition-colors"
              onClick={() => result && setShowDetails(isExpanded ? null : stepName)}
            >
              <span style={{ color: config.color, fontSize: '16px' }}>{config.icon}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium uppercase" style={{ color: 'var(--color-text-primary)' }}>
                    {stepName}
                  </span>
                  <span className="text-[10px] px-1 rounded" style={{ color: config.color, background: `${config.color}15` }}>
                    {config.label}
                  </span>
                </div>
                {result && (
                  <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                    {result.message}
                  </div>
                )}
              </div>
              {result?.latencyMs !== undefined && (
                <span className="text-xs font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
                  {result.latencyMs}ms
                </span>
              )}
            </div>
          );
        })}

        {isRunning && (
          <div className="flex items-center justify-center py-2">
            <div className="flex items-center gap-2">
              <span className="animate-spin text-xs" style={{ color: 'var(--color-accent)' }}>⟳</span>
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Running diagnostics...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApiDiagnosticsPanel;
