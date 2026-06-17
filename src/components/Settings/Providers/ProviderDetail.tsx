/**
 * OpenAgent-Desktop - Provider Detail (right panel)
 *
 * Shows everything about the selected provider:
 *   - Header (icon, name, protocol, docs link)
 *   - Connect section (auth — api key / oauth / azure ad / env var)
 *   - Base URL override (for proxies / Azure deployments)
 *   - Model list with refresh / add custom / set default
 *   - Health check (Run + last result)
 *   - Danger zone (disable / remove provider)
 */

import React, { useState, useEffect } from 'react';
import { ExternalLink, Trash2, Power, Activity } from 'lucide-react';
import {
  ProviderDefinition,
  ConfiguredProvider,
  ResolvedModel,
  DiscoveredModel,
  HealthCheckResult,
} from './types';
import { ProviderIcon } from './ProviderIcon';
import { ProviderHealthBadge } from './ProviderHealthBadge';
import { ProviderConnect } from './ProviderConnect';
import { ModelList } from './ModelList';

export interface ProviderDetailProps {
  definition: ProviderDefinition;
  configured: ConfiguredProvider | undefined;
  models: ResolvedModel[];
  discovered: DiscoveredModel[] | undefined;
  discoveredFetchedAt: string | undefined;
  health: HealthCheckResult | null;
  isRefreshing: boolean;
  isHealthChecking: boolean;
  onApiKeySubmit: (apiKey: string) => void;
  onOAuthStart: () => void;
  onAzureAdStart: (tenantId: string, clientId: string) => void;
  onDisconnect: () => void;
  onSetBaseUrlOverride: (baseUrl: string) => void;
  onRefreshModels: () => void;
  onAddCustomModel: (model: { id: string; displayName: string; contextWindow?: number }) => void;
  onRemoveCustomModel: (modelId: string) => void;
  onSetDefaultModel: (modelId: string) => void;
  onRunHealthCheck: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onRemove: () => void;
}

export const ProviderDetail: React.FC<ProviderDetailProps> = ({
  definition,
  configured,
  models,
  discovered,
  discoveredFetchedAt,
  health,
  isRefreshing,
  isHealthChecking,
  onApiKeySubmit,
  onOAuthStart,
  onAzureAdStart,
  onDisconnect,
  onSetBaseUrlOverride,
  onRefreshModels,
  onAddCustomModel,
  onRemoveCustomModel,
  onSetDefaultModel,
  onRunHealthCheck,
  onToggleEnabled,
  onRemove,
}) => {
  const [baseUrlOverride, setBaseUrlOverride] = useState(configured?.baseUrlOverride || '');

  useEffect(() => {
    setBaseUrlOverride(configured?.baseUrlOverride || '');
  }, [configured?.providerId, configured?.baseUrlOverride]);

  const isConfigured = Boolean(configured);
  const isEnabled = configured?.enabled ?? false;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--color-accent-soft)', border: '1px solid var(--color-border-primary)' }}
        >
          <ProviderIcon providerId={definition.id} icon={definition.icon} size={24} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {definition.name}
            </h2>
            {isConfigured && <ProviderHealthBadge health={health} />}
          </div>
          <div className="text-xs flex items-center gap-2 mt-1" style={{ color: 'var(--color-text-muted)' }}>
            <span className="font-mono uppercase">{definition.protocol}</span>
            <span>·</span>
            <span>{definition.modelPresets.length} preset models</span>
            {definition.docsUrl && (
              <>
                <span>·</span>
                <a
                  href={definition.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:underline"
                  style={{ color: 'var(--color-accent)' }}
                >
                  Docs <ExternalLink size={10} />
                </a>
              </>
            )}
          </div>
        </div>
        {isConfigured && (
          <button
            onClick={() => onToggleEnabled(!isEnabled)}
            className="text-xs px-2 py-1 rounded flex items-center gap-1"
            style={{
              background: isEnabled ? 'rgba(34,197,94,0.10)' : 'var(--color-bg-tertiary)',
              color: isEnabled ? '#22c55e' : 'var(--color-text-muted)',
              border: `1px solid ${isEnabled ? 'rgba(34,197,94,0.30)' : 'var(--color-border-primary)'}`,
            }}
          >
            <Power size={12} /> {isEnabled ? 'Enabled' : 'Disabled'}
          </button>
        )}
      </div>

      {/* Connect section */}
      <section>
        <h3 className="text-sm font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
          Authentication
        </h3>
        <ProviderConnect
          definition={definition}
          configured={configured}
          onApiKeySubmit={onApiKeySubmit}
          onOAuthStart={onOAuthStart}
          onAzureAdStart={onAzureAdStart}
          onDisconnect={onDisconnect}
          isConnecting={false}
        />
      </section>

      {/* Base URL override */}
      <section>
        <h3 className="text-sm font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
          Base URL
        </h3>
        <div
          className="p-3 rounded-lg space-y-2"
          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-primary)' }}
        >
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Default: <code>{definition.defaultBaseUrl || '(none — set per call)'}</code>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Override base URL (e.g. for proxies or Azure deployments)"
              value={baseUrlOverride}
              onChange={(e) => setBaseUrlOverride(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded text-sm"
              style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-secondary)' }}
            />
            <button
              onClick={() => onSetBaseUrlOverride(baseUrlOverride.trim())}
              className="text-xs px-3 py-1.5 rounded"
              style={{ background: 'var(--color-accent)', color: 'white' }}
            >
              Save
            </button>
          </div>
        </div>
      </section>

      {/* Models */}
      <section>
        <h3 className="text-sm font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
          Models
        </h3>
        <ModelList
          definition={definition}
          models={models}
          discovered={discovered}
          discoveredFetchedAt={discoveredFetchedAt}
          defaultModelId={configured?.defaultModelId}
          isRefreshing={isRefreshing}
          onRefresh={onRefreshModels}
          onAddCustomModel={onAddCustomModel}
          onRemoveCustomModel={onRemoveCustomModel}
          onSetDefault={onSetDefaultModel}
        />
      </section>

      {/* Health check */}
      <section>
        <h3 className="text-sm font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
          Health Check
        </h3>
        <div
          className="p-3 rounded-lg space-y-2"
          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-primary)' }}
        >
          <div className="flex items-center justify-between">
            <div>
              {health ? (
                <>
                  <div className="flex items-center gap-2">
                    <ProviderHealthBadge health={health} />
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    Last checked: {new Date(health.lastCheckedAt).toLocaleString()}
                  </div>
                  {health.error && (
                    <div className="text-xs mt-1" style={{ color: '#ef4444' }}>
                      {health.error}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  No health check has been run yet.
                </div>
              )}
            </div>
            <button
              onClick={onRunHealthCheck}
              disabled={!isConfigured || isHealthChecking}
              className="text-xs px-3 py-1.5 rounded flex items-center gap-1 disabled:opacity-50"
              style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-primary)' }}
            >
              <Activity size={12} className={isHealthChecking ? 'animate-pulse' : ''} />
              Run check
            </button>
          </div>
        </div>
      </section>

      {/* Danger zone */}
      {isConfigured && (
        <section>
          <h3 className="text-sm font-semibold mb-2 uppercase tracking-wide" style={{ color: '#ef4444' }}>
            Danger Zone
          </h3>
          <div
            className="p-3 rounded-lg flex items-center justify-between"
            style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.20)' }}
          >
            <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Remove this provider's configuration and stored credentials.
            </div>
            <button
              onClick={onRemove}
              className="text-xs px-3 py-1.5 rounded flex items-center gap-1"
              style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.30)' }}
            >
              <Trash2 size={12} /> Remove
            </button>
          </div>
        </section>
      )}
    </div>
  );
};

export default ProviderDetail;
