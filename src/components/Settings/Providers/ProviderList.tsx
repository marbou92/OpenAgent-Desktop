/**
 * OpenAgent-Desktop - Provider List (opencode-style)
 *
 * Shows all providers from the catalog. Configured providers have a
 * status dot. Clicking selects.
 */

import React from 'react';
import { ProviderDefinition, AuthProvider, HealthCheckResult } from './types';
import { ProviderIcon } from './ProviderIcon';
import { ProviderHealthBadge } from './ProviderHealthBadge';

export interface ProviderListProps {
  definitions: ProviderDefinition[];
  configured: Array<{ providerId: string; auth: AuthProvider }>;
  health: Record<string, HealthCheckResult>;
  selectedProviderId: string | null;
  onSelect: (providerId: string) => void;
  onAddProvider: () => void;
}

export const ProviderList: React.FC<ProviderListProps> = ({
  definitions,
  configured,
  health,
  selectedProviderId,
  onSelect,
  onAddProvider,
}) => {
  const configuredMap = new Map(configured.map((c) => [c.providerId, c.auth]));

  // Show configured providers first, then unconfigured builtins, then custom.
  const configuredList = definitions.filter((d) => configuredMap.has(d.id));
  const availableList = definitions.filter((d) => !configuredMap.has(d.id) && d.isBuiltin !== false);
  const customList = definitions.filter((d) => !configuredMap.has(d.id) && d.isBuiltin === false);

  const renderRow = (def: ProviderDefinition) => {
    const isSelected = def.id === selectedProviderId;
    const auth = configuredMap.get(def.id);
    const h = health[def.id];

    return (
      <button
        key={def.id}
        onClick={() => onSelect(def.id)}
        className="w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-center gap-3"
        style={{
          background: isSelected ? 'var(--color-accent-soft, rgba(99,102,241,0.15))' : 'transparent',
          border: isSelected ? '1px solid var(--color-accent, #6366f1)' : '1px solid transparent',
        }}
      >
        <ProviderIcon providerId={def.id} icon={def.icon} size={20} />
        <div className="flex-1 min-w-0">
          <div
            className="text-sm font-medium truncate"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {def.name}
          </div>
          <div
            className="text-xs truncate"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {auth ? `${auth.type} auth` : 'Not configured'}
          </div>
        </div>
        {auth && <ProviderHealthBadge health={h} />}
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 flex items-center justify-between border-b" style={{ borderColor: 'var(--color-border-primary)' }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
          Providers
        </h3>
        <button
          onClick={onAddProvider}
          className="text-xs px-2 py-1 rounded"
          style={{
            background: 'var(--color-accent, #6366f1)',
            color: 'white',
          }}
        >
          + Add
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {configuredList.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wide px-2 py-1" style={{ color: 'var(--color-text-muted)' }}>
              Configured
            </div>
            <div className="space-y-1">{configuredList.map(renderRow)}</div>
          </div>
        )}

        {availableList.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wide px-2 py-1" style={{ color: 'var(--color-text-muted)' }}>
              Available
            </div>
            <div className="space-y-1">{availableList.map(renderRow)}</div>
          </div>
        )}

        {customList.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wide px-2 py-1" style={{ color: 'var(--color-text-muted)' }}>
              Custom
            </div>
            <div className="space-y-1">{customList.map(renderRow)}</div>
          </div>
        )}

        {configuredList.length === 0 && availableList.length === 0 && customList.length === 0 && (
          <div className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>
            No providers available.
          </div>
        )}
      </div>
    </div>
  );
};

export default ProviderList;
