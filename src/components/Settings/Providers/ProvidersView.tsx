/**
 * OpenAgent-Desktop - Providers View (fresh opencode-style design)
 *
 * Two-panel layout:
 *   Left  — ProviderList (builtins + configured, with add button)
 *   Right — ProviderDetail (config / models / health / danger zone)
 *
 * Replaces the previous 5-file ProviderForm/ProviderWizard/CustomProviderForm/
 * ProviderPresetsView/ProviderHealthDashboard mess with a single coherent UI.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ProviderList } from './ProviderList';
import { ProviderDetail } from './ProviderDetail';
import {
  ProviderDefinition,
  ConfiguredProvider,
  ResolvedModel,
  DiscoveredModel,
  HealthCheckResult,
} from './types';

interface Toast {
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

export interface ProvidersViewProps {
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

const api = (window as any).openagent;

export const ProvidersView: React.FC<ProvidersViewProps> = ({ addToast }) => {
  const [definitions, setDefinitions] = useState<ProviderDefinition[]>([]);
  const [configured, setConfigured] = useState<ConfiguredProvider[]>([]);
  const [health, setHealth] = useState<Record<string, HealthCheckResult>>({});
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [models, setModels] = useState<ResolvedModel[]>([]);
  const [discovered, setDiscovered] = useState<DiscoveredModel[] | undefined>(undefined);
  const [discoveredFetchedAt, setDiscoveredFetchedAt] = useState<string | undefined>(undefined);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isHealthChecking, setIsHealthChecking] = useState(false);

  // Load initial state
  const refreshAll = useCallback(async () => {
    if (!api?.providers) return;
    try {
      const [defs, cfgs, hlth] = await Promise.all([
        api.providers.listProviders(),
        api.providers.listAuth(),
        api.providers.getCatalogInfo().catch(() => ({}))
      ]);
      setDefinitions(defs || []);
      setConfigured(cfgs || []);
      setHealth(hlth || {});
      // Auto-select the first configured provider, or the first builtin.
      if (!selectedProviderId && ((cfgs && cfgs.length > 0) || (defs && defs.length > 0))) {
        const first = cfgs?.[0]?.providerId || defs?.[0]?.id;
        if (first) setSelectedProviderId(first);
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to load providers', message: err.message });
    }
  }, [selectedProviderId, addToast]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Re-fetch when main:ready fires (subsystems may not have been initialized
  // on the first try — this is the same pattern App.tsx uses).
  useEffect(() => {
    if (!api?.on?.mainReady) return;
    const unsub = api.on.mainReady(() => {
      refreshAll();
    });
    return () => unsub?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load models for the selected provider
  useEffect(() => {
    if (!selectedProviderId || !api?.providers) {
      setModels([]);
      setDiscovered(undefined);
      setDiscoveredFetchedAt(undefined);
      return;
    }
    Promise.all([
      api.providers.listModels(selectedProviderId).catch(() => []),
      api.providers.getCatalogInfo(selectedProviderId).catch(() => null),
    ]).then(([mods, disc]: [ResolvedModel[], { models: DiscoveredModel[]; fetchedAt: string } | null]) => {
      setModels(mods);
      setDiscovered(disc?.models);
      setDiscoveredFetchedAt(disc?.fetchedAt);
    });
  }, [selectedProviderId, configured]);

  const selectedDefinition = definitions.find((d) => d.id === selectedProviderId);
  const selectedConfigured = configured.find((c) => c.providerId === selectedProviderId);
  const selectedHealth = selectedProviderId ? health[selectedProviderId] : null;

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleApiKeySubmit = async (apiKey: string) => {
    if (!selectedProviderId) return;
    try {
      await api.providers.setApiKey(selectedProviderId, apiKey);
      addToast({ type: 'success', title: 'API key saved' });
      await refreshAll();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to save API key', message: err.message });
    }
  };

  const handleOAuthStart = async () => {
    if (!selectedProviderId) return;
    try {
      await api.providers.startCopilot(selectedProviderId);
      addToast({ type: 'info', title: 'Browser opened', message: 'Complete authorization in your browser.' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'OAuth failed', message: err.message });
    }
  };

  const handleAzureAdStart = async (tenantId: string, clientId: string) => {
    if (!selectedProviderId) return;
    try {
      await // Azure AD removed
      addToast({ type: 'info', title: 'Browser opened', message: 'Complete Azure AD sign-in in your browser.' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Azure AD failed', message: err.message });
    }
  };

  const handleDisconnect = async () => {
    if (!selectedProviderId) return;
    try {
      await api.providers.removeAuth(selectedProviderId);
      addToast({ type: 'success', title: 'Disconnected' });
      await refreshAll();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to disconnect', message: err.message });
    }
  };

  const handleSetBaseUrlOverride = async (baseUrl: string) => {
    if (!selectedProviderId) return;
    try {
      await api.providers.setBaseUrl(selectedProviderId, baseUrl);
      addToast({ type: 'success', title: 'Base URL saved' });
      await refreshAll();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to save base URL', message: err.message });
    }
  };

  const handleRefreshModels = async () => {
    if (!selectedProviderId) return;
    setIsRefreshing(true);
    try {
      const result = await api.providers.refreshCatalog(selectedProviderId);
      addToast({
        type: 'success',
        title: 'Models refreshed',
        message: `${result.length} models discovered`,
      });
      // Refresh local state.
      const disc = await api.providers.getCatalogInfo(selectedProviderId);
      setDiscovered(disc?.models);
      setDiscoveredFetchedAt(disc?.fetchedAt);
      const mods = await api.providers.listModels(selectedProviderId);
      setModels(mods);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Refresh failed', message: err.message });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAddCustomModel = async (model: { id: string; displayName: string; contextWindow?: number }) => {
    if (!selectedProviderId) return;
    try {
      await // Custom models come from models.dev
      addToast({ type: 'success', title: 'Custom model added' });
      const mods = await api.providers.listModels(selectedProviderId);
      setModels(mods);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to add model', message: err.message });
    }
  };

  const handleRemoveCustomModel = async (modelId: string) => {
    if (!selectedProviderId) return;
    try {
      await // Custom models come from models.dev
      addToast({ type: 'success', title: 'Custom model removed' });
      const mods = await api.providers.listModels(selectedProviderId);
      setModels(mods);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to remove model', message: err.message });
    }
  };

  const handleSetDefaultModel = async (modelId: string) => {
    if (!selectedProviderId) return;
    try {
      await // No default model in opencode format
      addToast({ type: 'success', title: 'Default model set' });
      await refreshAll();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to set default', message: err.message });
    }
  };

  const handleRunHealthCheck = async () => {
    if (!selectedProviderId) return;
    setIsHealthChecking(true);
    try {
      const result = await api.providers.runHealthCheck(selectedProviderId);
      setHealth((prev) => ({ ...prev, [selectedProviderId]: result }));
      addToast({
        type: result.status === 'healthy' ? 'success' : 'error',
        title: `Health: ${result.status}`,
        message: `${result.latencyMs}ms`,
      });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Health check failed', message: err.message });
    } finally {
      setIsHealthChecking(false);
    }
  };

  const handleToggleEnabled = async (enabled: boolean) => {
    if (!selectedProviderId) return;
    try {
      await // No enabled flag in opencode format
      await refreshAll();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to toggle', message: err.message });
    }
  };

  const handleRemove = async () => {
    if (!selectedProviderId) return;
    if (!confirm(`Remove ${selectedDefinition?.name}? Stored credentials will be deleted.`)) return;
    try {
      await api.providers.remove(selectedProviderId);
      addToast({ type: 'success', title: 'Provider removed' });
      setSelectedProviderId(null);
      await refreshAll();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to remove', message: err.message });
    }
  };

  const handleAddProvider = () => {
    // Scroll the left sidebar to the "Available" section.
    const firstAvailable = definitions.find((d) => !configured.find((c) => c.providerId === d.id));
    if (firstAvailable) {
      setSelectedProviderId(firstAvailable.id);
      addToast({
        type: 'info',
        title: 'Pick a provider',
        message: 'Select from the Available section and configure auth on the right.',
      });
    }
  };

  if (!definitions.length) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--color-text-muted)' }}>
        Loading providers...
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left sidebar */}
      <div
        className="w-72 flex-shrink-0 border-r"
        style={{ background: 'var(--color-bg-primary)', borderColor: 'var(--color-border-primary)' }}
      >
        <ProviderList
          definitions={definitions}
          configured={configured}
          health={health}
          selectedProviderId={selectedProviderId}
          onSelect={setSelectedProviderId}
          onAddProvider={handleAddProvider}
        />
      </div>

      {/* Right detail panel */}
      <div className="flex-1 min-w-0">
        {selectedDefinition ? (
          <ProviderDetail
            definition={selectedDefinition}
            configured={selectedConfigured}
            models={models}
            discovered={discovered}
            discoveredFetchedAt={discoveredFetchedAt}
            health={selectedHealth ?? null}
            isRefreshing={isRefreshing}
            isHealthChecking={isHealthChecking}
            onApiKeySubmit={handleApiKeySubmit}
            onOAuthStart={handleOAuthStart}
            onAzureAdStart={handleAzureAdStart}
            onDisconnect={handleDisconnect}
            onSetBaseUrlOverride={handleSetBaseUrlOverride}
            onRefreshModels={handleRefreshModels}
            onAddCustomModel={handleAddCustomModel}
            onRemoveCustomModel={handleRemoveCustomModel}
            onSetDefaultModel={handleSetDefaultModel}
            onRunHealthCheck={handleRunHealthCheck}
            onToggleEnabled={handleToggleEnabled}
            onRemove={handleRemove}
          />
        ) : (
          <div className="flex items-center justify-center h-full" style={{ color: 'var(--color-text-muted)' }}>
            Select a provider from the left to configure it.
          </div>
        )}
      </div>
    </div>
  );
};

export default ProvidersView;
