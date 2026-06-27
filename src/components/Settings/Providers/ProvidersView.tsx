/**
 * OpenAgent-Desktop - Providers View (opencode-style)
 *
 * Two-panel layout:
 *   Left  — ProviderList (builtins + configured + custom)
 *   Right — ProviderDetail (config / models / health / danger zone)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ProviderList } from './ProviderList';
import { ProviderDetail } from './ProviderDetail';
import CatalogSourceSelector from './CatalogSourceSelector';
import {
  ProviderDefinition,
  AuthProvider,
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
  const [configured, setConfigured] = useState<Array<{ providerId: string; auth: AuthProvider }>>([]);
  const [health, setHealth] = useState<Record<string, HealthCheckResult>>({});
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [models, setModels] = useState<ResolvedModel[]>([]);
  const [discovered, _setDiscovered] = useState<DiscoveredModel[] | undefined>(undefined);
  const [discoveredFetchedAt, setDiscoveredFetchedAt] = useState<string | undefined>(undefined);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isHealthChecking, setIsHealthChecking] = useState(false);

  const refreshAll = useCallback(async () => {
    if (!api?.providers) return;
    try {
      const [defs, cfgs, info] = await Promise.all([
        api.providers.listProviders(),
        api.providers.listAuth(),
        api.providers.getCatalogInfo().catch(() => ({})),
      ]);
      setDefinitions(defs || []);
      setConfigured(cfgs || []);
      if (info?.fetchedAt) setDiscoveredFetchedAt(info.fetchedAt);
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

  // Re-fetch when main:ready fires.
  useEffect(() => {
    if (!api?.on?.mainReady) return;
    const unsub = api.on.mainReady(() => {
      refreshAll();
    });
    return () => unsub?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh when models.dev catalog is updated in the background.
  useEffect(() => {
    if (!api?.on?.catalogUpdated) return;
    const unsub = api.on.catalogUpdated((data: { providerCount: number; modelCount: number; previousModelCount: number }) => {
      addToast({
        type: 'info',
        title: 'Catalog updated',
        message: `${data.modelCount} models across ${data.providerCount} providers (was ${data.previousModelCount})`,
      });
      refreshAll();
    });
    return () => unsub?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load models for the selected provider
  useEffect(() => {
    if (!selectedProviderId || !api?.providers) {
      setModels([]);
      return;
    }
    api.providers.listModels(selectedProviderId).then((mods: ResolvedModel[]) => {
      setModels(mods || []);
    }).catch(() => setModels([]));
  }, [selectedProviderId, configured]);

  const selectedDefinition = definitions.find((d) => d.id === selectedProviderId);
  const selectedAuth = configured.find((c) => c.providerId === selectedProviderId)?.auth;
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

  const handleCopilotStart = async () => {
    if (!selectedProviderId) return;
    try {
      const result = await api.providers.startCopilot();
      addToast({
        type: 'info',
        title: 'Browser opened',
        message: `Enter code: ${result.userCode}`,
      });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Copilot auth failed', message: err.message });
    }
  };

  // Phase 8.7: Gemini (Free OAuth) — starts a Google OAuth flow.
  // Opens the system browser; the user signs in with their Google account;
  // tokens are stored automatically. No user code needed (unlike Copilot).
  const handleOAuthStart = async () => {
    if (!selectedProviderId) return;
    addToast({
      type: 'info',
      title: 'Opening browser...',
      message: 'Sign in with your Google account to authorize Gemini access.',
    });
    try {
      const result = await api.providers.startGeminiOAuth();
      if (result?.success === false) {
        addToast({ type: 'error', title: 'Google OAuth failed', message: result?.error || 'Unknown error' });
        return;
      }
      addToast({
        type: 'success',
        title: 'Gemini connected',
        message: result?.data?.accountId ? `Signed in as ${result.data.accountId}` : 'Google OAuth completed successfully.',
      });
      await refreshAll();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Google OAuth failed', message: err.message });
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

  const handleSetBaseUrl = async (baseUrl: string) => {
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
    if (!api?.providers) return;
    setIsRefreshing(true);
    try {
      await api.providers.refreshCatalog();
      addToast({ type: 'success', title: 'Catalog refreshed' });
      await refreshAll();
      if (selectedProviderId) {
        const mods = await api.providers.listModels(selectedProviderId);
        setModels(mods || []);
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Refresh failed', message: err.message });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRunHealthCheck = async () => {
    if (!selectedProviderId || !api?.providers) return;
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

  const handleRemove = async () => {
    if (!selectedProviderId) return;
    if (!confirm(`Remove credentials for ${selectedDefinition?.name}?`)) return;
    try {
      await api.providers.removeAuth(selectedProviderId);
      addToast({ type: 'success', title: 'Credentials removed' });
      await refreshAll();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to remove', message: err.message });
    }
  };

  const handleAddProvider = () => {
    addToast({
      type: 'info',
      title: 'Custom providers',
      message: 'Use opencode.json to add custom OpenAI-compatible providers (Ollama, LM Studio, etc.)',
    });
  };

  if (!definitions.length) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--color-text-muted)' }}>
        Loading providers...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Phase 8.1 — Catalog source selector banner */}
      <CatalogSourceSelector
        onChange={() => {
          // Re-fetch the provider list when the user switches catalogs.
          refreshAll();
        }}
        addToast={addToast}
      />

      <div className="flex flex-1 min-h-0">
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
              configured={selectedAuth}
              models={models}
              discovered={discovered}
              discoveredFetchedAt={discoveredFetchedAt}
              health={selectedHealth ?? null}
              isRefreshing={isRefreshing}
              isHealthChecking={isHealthChecking}
              onApiKeySubmit={handleApiKeySubmit}
              onCopilotStart={handleCopilotStart}
              onOAuthStart={handleOAuthStart}
              onDisconnect={handleDisconnect}
              onSetBaseUrl={handleSetBaseUrl}
              onRefreshModels={handleRefreshModels}
              onRunHealthCheck={handleRunHealthCheck}
              onRemove={handleRemove}
            />
          ) : (
            <div className="flex items-center justify-center h-full" style={{ color: 'var(--color-text-muted)' }}>
              Select a provider from the left to configure it.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProvidersView;
