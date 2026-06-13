/**
 * Provider Status Bar
 *
 * Compact provider status display in the sidebar footer.
 * Shows active provider, model, health status, and quick switch.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ProviderInfo, ProviderHealthSnapshot } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────────

interface ProviderStatusBarProps {
  /** List of configured providers */
  providers: ProviderInfo[];
  /** Active provider ID */
  activeProviderId?: string;
  /** Active model name */
  activeModel?: string;
  /** Health snapshots for providers */
  healthSnapshots?: ProviderHealthSnapshot[];
  /** Active config set name */
  configSetName?: string;
  /** Provider switch handler */
  onSwitchProvider?: (providerId: string, model: string) => void;
}

// ─── Health Status Colors ─────────────────────────────────────────────────────────

function getHealthColor(status?: string): string {
  switch (status) {
    case 'healthy':
      return 'var(--color-success)';
    case 'degraded':
      return 'var(--color-warning)';
    case 'unhealthy':
      return 'var(--color-error)';
    default:
      return 'var(--color-text-muted)';
  }
}

function getHealthDot(status?: string): string {
  switch (status) {
    case 'healthy':
      return '#22c55e';
    case 'degraded':
      return '#f59e0b';
    case 'unhealthy':
      return '#ef4444';
    default:
      return '#6a6a7a';
  }
}

// ─── Provider icon by type ────────────────────────────────────────────────────────

function getProviderIcon(_type: string): React.ReactNode {
  // Simple icon based on provider type
  const iconColor = 'var(--color-text-secondary)';
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────────

const ProviderStatusBar: React.FC<ProviderStatusBarProps> = ({
  providers,
  activeProviderId,
  activeModel,
  healthSnapshots = [],
  configSetName,
  onSwitchProvider,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const configuredProviders = providers.filter((p) => p.configured);
  const activeProvider = providers.find((p) => p.id === activeProviderId);
  const activeHealth = healthSnapshots.find((h) => h.providerId === activeProviderId);

  // ── Close dropdown on outside click ──────────────────────────────────────

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isExpanded]);

  // ── Handle provider switch ───────────────────────────────────────────────

  const handleSwitch = useCallback(
    (provider: ProviderInfo, model: string) => {
      onSwitchProvider?.(provider.id, model);
      setIsExpanded(false);
    },
    [onSwitchProvider],
  );

  // ── Compact view ─────────────────────────────────────────────────────────

  if (!isExpanded) {
    return (
      <div
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors"
        style={{ background: 'var(--color-bg-tertiary)' }}
        onClick={() => setIsExpanded(true)}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}
        title="Click to manage providers"
        role="button"
        aria-label="Provider status - click to expand"
      >
        {/* Provider icon */}
        {getProviderIcon(activeProvider?.type || 'openai')}

        {/* Health dot */}
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: getHealthDot(activeHealth?.status) }}
        />

        {/* Provider name */}
        <span className="text-xs truncate flex-1" style={{ color: 'var(--color-text-primary)' }}>
          {activeProvider?.name || 'No Provider'}
        </span>

        {/* Model name */}
        <span className="text-[10px] truncate max-w-[80px]" style={{ color: 'var(--color-text-tertiary)' }}>
          {activeModel || '—'}
        </span>

        {/* Config set badge */}
        {configSetName && (
          <span
            className="text-[8px] px-1 py-0.5 rounded font-medium shrink-0"
            style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
          >
            {configSetName}
          </span>
        )}

        {/* Expand chevron */}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-text-muted)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    );
  }

  // ── Expanded dropdown ────────────────────────────────────────────────────

  return (
    <div ref={dropdownRef} className="relative">
      {/* Compact bar (always visible) */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors"
        style={{ background: 'var(--color-accent-soft)' }}
        onClick={() => setIsExpanded(false)}
      >
        {getProviderIcon(activeProvider?.type || 'openai')}
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: getHealthDot(activeHealth?.status) }}
        />
        <span className="text-xs truncate flex-1" style={{ color: 'var(--color-accent)' }}>
          {activeProvider?.name || 'No Provider'}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: 'rotate(180deg)' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Dropdown panel */}
      <div
        className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border shadow-xl overflow-hidden z-50"
        style={{
          background: 'var(--color-bg-elevated)',
          borderColor: 'var(--color-border-primary)',
          maxHeight: '280px',
        }}
      >
        {/* Header */}
        <div
          className="px-3 py-2 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--color-border-secondary)' }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
            Providers
          </span>
          <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
            {configuredProviders.length} configured
          </span>
        </div>

        {/* Provider list */}
        <div className="overflow-y-auto max-h-[240px]">
          {configuredProviders.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                No providers configured
              </p>
            </div>
          ) : (
            configuredProviders.map((provider) => {
              const health = healthSnapshots.find((h) => h.providerId === provider.id);
              const isActive = provider.id === activeProviderId;

              return (
                <div key={provider.id}>
                  <button
                    onClick={() => handleSwitch(provider, provider.models[0] || '')}
                    className="w-full text-left px-3 py-2 transition-colors"
                    style={{
                      background: isActive ? 'var(--color-accent-soft)' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'var(--color-bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {/* Health dot */}
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: getHealthDot(health?.status) }}
                      />

                      {/* Provider info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-xs font-medium truncate"
                            style={{
                              color: isActive ? 'var(--color-accent)' : 'var(--color-text-primary)',
                            }}
                          >
                            {provider.name}
                          </span>
                          {isActive && (
                            <span
                              className="text-[8px] px-1 py-0.5 rounded font-medium"
                              style={{ background: 'var(--color-accent)', color: 'white' }}
                            >
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                            {provider.type}
                          </span>
                          {health && (
                            <>
                              <span style={{ color: 'var(--color-text-muted)' }}>·</span>
                              <span
                                className="text-[10px]"
                                style={{ color: getHealthColor(health.status) }}
                              >
                                {health.latencyMs}ms
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Model selector for active provider */}
                  {isActive && provider.models.length > 1 && (
                    <div className="px-3 pb-2">
                      <select
                        value={activeModel}
                        onChange={(e) => handleSwitch(provider, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full px-2 py-1 text-[10px] rounded border outline-none cursor-pointer"
                        style={{
                          background: 'var(--color-bg-secondary)',
                          borderColor: 'var(--color-border-primary)',
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {provider.models.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default ProviderStatusBar;
