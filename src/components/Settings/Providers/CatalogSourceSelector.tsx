/**
 * OpenAgent-Desktop — Catalog Source Selector (Phase 8.1)
 *
 * A small banner above the Providers two-panel layout that lets the user
 * pick which catalog provides the provider/model list:
 *   - models.dev  — live-fetched, 145 providers / 2357+ models (default)
 *   - pi.dev      — static/bundled (from @mariozechner/pi-ai), 31 providers / 969 models
 *   - merged      — both catalogs combined (models.dev entries win on conflicts)
 *
 * The choice is persisted to userData/catalog-source.json by main.ts and
 * survives restarts. The renderer just calls setCatalogSource() and
 * re-fetches provider:list-providers when the catalog-source-changed
 * IPC event fires.
 */

import React, { useEffect, useState } from 'react';

type CatalogSource = 'models.dev' | 'pi.dev' | 'merged';

interface CatalogSummary {
  current: CatalogSource;
  modelsDev: { providers: number; models: number; fetchedAt: string | null };
  piDev: { providers: number; models: number; fetchedAt: string | null };
}

interface CatalogSourceSelectorProps {
  /** Called when the user picks a new source. Parent re-fetches providers. */
  onChange?: (source: CatalogSource) => void;
  addToast?: (toast: { type: 'success' | 'error' | 'info'; title: string; message?: string }) => void;
}

const api = (window as any).openagent;

const OPTIONS: { id: CatalogSource; label: string; description: string }[] = [
  { id: 'models.dev', label: 'models.dev', description: 'Live catalog (default)' },
  { id: 'pi.dev', label: 'pi.dev', description: 'Bundled static catalog' },
  { id: 'merged', label: 'Merged', description: 'Both catalogs combined' },
];

export const CatalogSourceSelector: React.FC<CatalogSourceSelectorProps> = ({ onChange, addToast }) => {
  const [summary, setSummary] = useState<CatalogSummary | null>(null);
  const [switching, setSwitching] = useState(false);

  // Load the current source + per-source summary on mount.
  useEffect(() => {
    if (!api?.providers?.getCatalogSummary) return;
    api.providers.getCatalogSummary().then((s: CatalogSummary) => setSummary(s)).catch(() => {});
  }, []);

  // Listen for source-changed events from main (e.g. if another window changes it).
  useEffect(() => {
    if (!api?.on?.catalogSourceChanged) return;
    const unsub = api.on.catalogSourceChanged((data: { source: CatalogSource }) => {
      setSummary((prev) => prev ? { ...prev, current: data.source } : prev);
      onChange?.(data.source);
    });
    return () => unsub?.();
  }, [onChange]);

  const handlePick = async (source: CatalogSource) => {
    if (!api?.providers?.setCatalogSource) return;
    if (summary?.current === source) return;
    setSwitching(true);
    try {
      await api.providers.setCatalogSource(source);
      // Re-fetch the summary so counts update.
      const s: CatalogSummary = await api.providers.getCatalogSummary();
      setSummary(s);
      addToast?.({
        type: 'success',
        title: 'Catalog switched',
        message: `Now using ${source}`,
      });
      onChange?.(source);
    } catch (err: any) {
      addToast?.({ type: 'error', title: 'Failed to switch catalog', message: err?.message });
    } finally {
      setSwitching(false);
    }
  };

  if (!summary) {
    // Still loading — render an empty stub so the layout doesn't jump.
    return <div style={{ height: 0 }} />;
  }

  return (
    <div
      className="flex items-center justify-between gap-4 px-4 py-2.5 border-b"
      style={{
        background: 'var(--color-bg-secondary)',
        borderColor: 'var(--color-border-primary)',
      }}
    >
      {/* Source selector — segmented control */}
      <div className="flex items-center gap-3">
        <span
          className="text-xs font-medium"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Catalog
        </span>
        <div
          className="flex rounded-lg p-0.5"
          style={{ background: 'var(--color-bg-tertiary)' }}
        >
          {OPTIONS.map((opt) => {
            const active = summary.current === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => handlePick(opt.id)}
                disabled={switching}
                title={opt.description}
                className="px-3 py-1 text-xs font-medium rounded-md transition-all disabled:opacity-50"
                style={{
                  background: active ? 'var(--color-accent)' : 'transparent',
                  color: active ? 'white' : 'var(--color-text-secondary)',
                  cursor: switching ? 'wait' : 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.color = 'var(--color-text-primary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                  }
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Per-source counts — show both so the user can compare */}
      <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        <span title="models.dev catalog (live)">
          <strong style={{ color: 'var(--color-text-secondary)' }}>models.dev</strong>:{' '}
          {summary.modelsDev.providers} providers / {summary.modelsDev.models.toLocaleString()} models
        </span>
        <span style={{ color: 'var(--color-border-primary)' }}>·</span>
        <span title="pi.dev catalog (bundled, static)">
          <strong style={{ color: 'var(--color-text-secondary)' }}>pi.dev</strong>:{' '}
          {summary.piDev.providers} providers / {summary.piDev.models.toLocaleString()} models
        </span>
      </div>
    </div>
  );
};

export default CatalogSourceSelector;
