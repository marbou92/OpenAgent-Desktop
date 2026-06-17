/**
 * OpenAgent-Desktop - Model List
 *
 * Shows all models available for a provider: presets (from the registry) +
 * user-added custom models + cached discovered models. Includes a "Refresh
 * from provider" button that calls the discoverer.
 */

import React, { useState } from 'react';
import { RefreshCw, Plus, Trash2, Check } from 'lucide-react';
import { ProviderDefinition, ResolvedModel, DiscoveredModel } from './types';

export interface ModelListProps {
  definition: ProviderDefinition;
  models: ResolvedModel[];
  discovered: DiscoveredModel[] | undefined;
  discoveredFetchedAt: string | undefined;
  defaultModelId?: string;
  isRefreshing: boolean;
  onRefresh: () => void;
  onAddCustomModel: (model: { id: string; displayName: string; contextWindow?: number }) => void;
  onRemoveCustomModel: (modelId: string) => void;
  onSetDefault: (modelId: string) => void;
}

export const ModelList: React.FC<ModelListProps> = ({
  definition,
  models,
  discovered,
  discoveredFetchedAt,
  defaultModelId,
  isRefreshing,
  onRefresh,
  onAddCustomModel,
  onRemoveCustomModel,
  onSetDefault,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newModelId, setNewModelId] = useState('');
  const [newModelName, setNewModelName] = useState('');

  const canRefresh = Boolean(definition.modelsEndpoint);

  const handleAdd = () => {
    if (!newModelId.trim()) return;
    onAddCustomModel({
      id: newModelId.trim(),
      displayName: newModelName.trim() || newModelId.trim(),
    });
    setNewModelId('');
    setNewModelName('');
    setShowAddForm(false);
  };

  const formatFetchedAt = (iso?: string) => {
    if (!iso) return null;
    try {
      return `Refreshed ${new Date(iso).toLocaleString()}`;
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
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="text-xs px-2 py-1 rounded flex items-center gap-1"
            style={{
              background: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border-primary)',
            }}
          >
            <Plus size={12} /> Custom
          </button>
          <button
            onClick={onRefresh}
            disabled={!canRefresh || isRefreshing}
            className="text-xs px-2 py-1 rounded flex items-center gap-1 disabled:opacity-50"
            style={{
              background: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border-primary)',
            }}
            title={canRefresh ? 'Fetch latest models from provider' : 'This provider does not support model discovery'}
          >
            <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {formatFetchedAt(discoveredFetchedAt) && (
        <div className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
          {formatFetchedAt(discoveredFetchedAt)} · {discovered?.length ?? 0} models discovered
        </div>
      )}

      {showAddForm && (
        <div
          className="mb-3 p-3 rounded-lg space-y-2"
          style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-primary)' }}
        >
          <input
            type="text"
            placeholder="Model id (e.g. gpt-4o-2024-08-06)"
            value={newModelId}
            onChange={(e) => setNewModelId(e.target.value)}
            className="w-full px-2 py-1.5 rounded text-sm"
            style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-secondary)' }}
          />
          <input
            type="text"
            placeholder="Display name (optional)"
            value={newModelName}
            onChange={(e) => setNewModelName(e.target.value)}
            className="w-full px-2 py-1.5 rounded text-sm"
            style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-secondary)' }}
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowAddForm(false)}
              className="text-xs px-2 py-1 rounded"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              className="text-xs px-2 py-1 rounded"
              style={{ background: 'var(--color-accent)', color: 'white' }}
            >
              Add
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1 max-h-80 overflow-y-auto">
        {models.length === 0 && (
          <div className="text-center py-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            No models available. Add a custom model or refresh from the provider.
          </div>
        )}
        {models.map((m) => {
          const isCustom = m.source === 'custom';
          const isDefault = m.id === defaultModelId;
          const isDiscovered = m.source === 'discovered';
          return (
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
                  {isDefault && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
                    >
                      DEFAULT
                    </span>
                  )}
                  {isCustom && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}
                    >
                      CUSTOM
                    </span>
                  )}
                  {isDiscovered && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
                    >
                      DISCOVERED
                    </span>
                  )}
                </div>
                <div className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                  {m.id}
                  {m.contextWindow && ` · ${Math.round(m.contextWindow / 1000)}K ctx`}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!isDefault && (
                  <button
                    onClick={() => onSetDefault(m.id)}
                    className="p-1 rounded hover:bg-black/10"
                    title="Set as default"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    <Check size={14} />
                  </button>
                )}
                {isCustom && (
                  <button
                    onClick={() => onRemoveCustomModel(m.id)}
                    className="p-1 rounded hover:bg-black/10"
                    title="Remove custom model"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ModelList;
