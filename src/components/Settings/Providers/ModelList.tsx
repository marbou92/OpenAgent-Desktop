/**
 * OpenAgent-Desktop - Model List (opencode-style)
 *
 * Shows all models available for a provider from the merged provider
 * definition (which includes models.dev entries).
 */

import React, { useState } from 'react';
import { RefreshCw, Check } from 'lucide-react';
import { ProviderDefinition, ResolvedModel, DiscoveredModel } from './types';

export interface ModelListProps {
  definition: ProviderDefinition;
  models: ResolvedModel[];
  discovered: DiscoveredModel[] | undefined;
  discoveredFetchedAt: string | undefined;
  isRefreshing: boolean;
  onRefresh: () => void;
  onSetDefault: (modelId: string) => void;
}

export const ModelList: React.FC<ModelListProps> = ({
  definition,
  models,
  discovered,
  discoveredFetchedAt,
  isRefreshing,
  onRefresh,
  onSetDefault,
}) => {
  const [showAll, setShowAll] = useState(false);

  // Show top 8 by default; toggle reveals all.
  const displayedModels = showAll ? models : models.slice(0, 8);

  const formatFetchedAt = (iso?: string) => {
    if (!iso) return null;
    try {
      return `Catalog refreshed ${new Date(iso).toLocaleString()}`;
    } catch {
      return null;
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Models ({models.length})
        </h4>
        <div className="flex items-center gap-2">
          {models.length > 8 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-xs px-2 py-1 rounded"
              style={{
                background: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border-primary)',
              }}
            >
              {showAll ? 'Show less' : `Show all (${models.length})`}
            </button>
          )}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="text-xs px-2 py-1 rounded flex items-center gap-1 disabled:opacity-50"
            style={{
              background: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border-primary)',
            }}
            title="Refresh model catalog from models.dev"
          >
            <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {formatFetchedAt(discoveredFetchedAt) && (
        <div className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
          {formatFetchedAt(discoveredFetchedAt)}
        </div>
      )}

      <div className="space-y-1 max-h-80 overflow-y-auto">
        {models.length === 0 && (
          <div className="text-center py-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            No models available. The catalog may still be loading.
          </div>
        )}
        {displayedModels.map((m) => (
          <div
            key={m.qualifiedId}
            className="flex items-center gap-2 px-3 py-2 rounded text-sm"
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border-secondary)',
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span style={{ color: 'var(--color-text-primary)' }}>{m.displayName}</span>
                {m.supportsThinking && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--color-accent)' }}
                  >
                    REASONING
                  </span>
                )}
                {m.supportsToolUse && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
                  >
                    TOOLS
                  </span>
                )}
              </div>
              <div className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                {m.id}
                {m.contextWindow && ` · ${Math.round(m.contextWindow / 1000)}K ctx`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ModelList;
