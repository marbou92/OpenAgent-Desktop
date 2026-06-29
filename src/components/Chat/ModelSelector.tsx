/**
 * OpenAgent-Desktop - Model Selector (Phase 2 Redesign)
 *
 * Clean, compact dropdown for choosing provider + model inline in the
 * composer bar. Inspired by opencode-desktop's model picker:
 *
 *   [OpenAI  ▾]  →  opens a panel with:
 *                    - Provider list (configured only)
 *                    - Model list for the selected provider (with search)
 *
 * Designed to fit inside a single line of the composer — no modals, no
 * multi-step navigation. Just two clicks to switch.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ProviderInfo } from '../../types';
import { getAPI } from '../../utils/api';

interface ModelOption {
  id: string;
  displayName: string;
}

interface ModelSelectorProps {
  providers: ProviderInfo[];
  selectedProviderId: string;
  selectedModel: string;
  onProviderChange: (providerId: string) => void;
  onModelChange: (model: string) => void;
  disabled?: boolean;
  /** When true, the selector renders a flat compact form (no panel). */
  compact?: boolean;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({
  providers,
  selectedProviderId,
  selectedModel,
  onProviderChange,
  onModelChange,
  disabled = false,
  compact = false,
}) => {
  const [panelOpen, setPanelOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [modelSearch, setModelSearch] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const api = getAPI();

  // Load models for the selected provider.
  useEffect(() => {
    if (!selectedProviderId || !api?.providers?.listModels) {
      setAvailableModels([]);
      return;
    }
    setLoadingModels(true);
    api.providers
      .listModels(selectedProviderId)
      .then((models: any[]) => {
        setAvailableModels(
          (models || []).map((m: any) => ({
            id: m.id,
            displayName: m.displayName || m.id,
          })),
        );
      })
      .catch(() => setAvailableModels([]))
      .finally(() => setLoadingModels(false));
  }, [selectedProviderId, api]);

  // Close panel on outside click.
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
        setModelSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [panelOpen]);

  // Focus search input when panel opens with a provider already selected.
  useEffect(() => {
    if (panelOpen && selectedProviderId && searchInputRef.current) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [panelOpen, selectedProviderId]);

  const configuredProviders = providers.filter((p) => p.configured);

  const selectedProvider = configuredProviders.find((p) => p.id === selectedProviderId);
  const selectedModelLabel =
    availableModels.find((m) => m.id === selectedModel)?.displayName || selectedModel || '';

  const filteredModels = modelSearch.trim()
    ? availableModels.filter((m) => {
        const q = modelSearch.toLowerCase();
        return m.id.toLowerCase().includes(q) || m.displayName.toLowerCase().includes(q);
      })
    : availableModels;

  const handleProviderPick = useCallback(
    (providerId: string) => {
      onProviderChange(providerId);
      // Focus the search input so the user can immediately pick a model.
      setTimeout(() => searchInputRef.current?.focus(), 30);
    },
    [onProviderChange],
  );

  const handleModelPick = useCallback(
    (modelId: string) => {
      onModelChange(modelId);
      setPanelOpen(false);
      setModelSearch('');
    },
    [onModelChange],
  );

  // Compact mode: just two small native <select> elements side-by-side.
  // Used when the composer doesn't have room for the panel UI.
  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <select
          value={selectedProviderId}
          onChange={(e) => onProviderChange(e.target.value)}
          disabled={disabled}
          className="text-[11px] px-2 py-1 rounded-md border outline-none cursor-pointer max-w-[120px]"
          style={{
            background: 'var(--color-bg-tertiary)',
            borderColor: 'var(--color-border-primary)',
            color: 'var(--color-text-primary)',
          }}
        >
          <option value="">Provider</option>
          {configuredProviders.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={disabled || !selectedProviderId}
          className="text-[11px] px-2 py-1 rounded-md border outline-none cursor-pointer max-w-[150px]"
          style={{
            background: 'var(--color-bg-tertiary)',
            borderColor: 'var(--color-border-primary)',
            color: 'var(--color-text-primary)',
          }}
        >
          <option value="">Model</option>
          {availableModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Full panel mode: a single button that opens a combined picker.
  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => !disabled && setPanelOpen((v) => !v)}
        disabled={disabled}
        className="flex items-center gap-1 px-2 py-1.5 rounded-md text-[13px] transition-colors disabled:opacity-50 max-w-[260px]"
        style={{
          // Phase 1.9.5: ghost/transparent trigger (matching Agent + Thinking selectors).
          background: panelOpen ? 'var(--v2-overlay-simple-overlay-hover, var(--color-bg-hover))' : 'transparent',
          color: selectedProviderId ? 'var(--v2-text-text-muted, var(--color-text-secondary))' : 'var(--v2-text-text-faint, var(--color-text-tertiary))',
          border: '1px solid transparent',
          fontFamily: 'var(--v2-font-family-text)',
        }}
        onMouseEnter={(e) => {
          if (!panelOpen) e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover, var(--color-bg-hover))';
        }}
        onMouseLeave={(e) => {
          if (!panelOpen) e.currentTarget.style.background = 'transparent';
        }}
        title={selectedProviderId ? `${selectedProvider?.name || selectedProviderId} / ${selectedModelLabel}` : 'Choose a provider'}
      >
        {selectedProviderId ? (
          <>
            <span className="truncate max-w-[110px]">{selectedProvider?.name || selectedProviderId}</span>
            {selectedModelLabel && (
              <>
                <span style={{ color: 'var(--v2-text-text-faint, var(--color-text-muted))' }}>/</span>
                <span className="truncate max-w-[110px]">
                  {selectedModelLabel}
                </span>
              </>
            )}
          </>
        ) : (
          <span>Select model</span>
        )}
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          style={{
            transform: panelOpen ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 0.15s ease',
            color: 'var(--v2-icon-icon-muted, var(--color-text-tertiary))',
          }}
        >
          <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {panelOpen && (
        <div
          className="absolute bottom-full left-0 mb-2 rounded-[10px] overflow-hidden animate-fade-in"
          style={{
            // Phase 1.9.5: V2-styled dropdown.
            background: 'var(--v2-background-bg-base, var(--color-bg-elevated))',
            boxShadow: 'var(--v2-elevation-floating, var(--shadow-popover))',
            minWidth: '300px',
            maxWidth: '380px',
            maxHeight: '420px',
            zIndex: 50,
            padding: '4px',
          }}
        >
          {/* Two-column layout: providers | models */}
          <div className="flex" style={{ height: '380px' }}>
            {/* Providers column */}
            <div
              className="overflow-y-auto"
              style={{
                width: '130px',
                borderRight: '1px solid var(--v2-border-border-muted, var(--color-border-secondary))',
                background: 'var(--v2-background-bg-layer-01, var(--color-bg-secondary))',
              }}
            >
              <div
                className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider sticky top-0"
                style={{
                  color: 'var(--v2-text-text-faint, var(--color-text-muted))',
                  background: 'var(--v2-background-bg-layer-01, var(--color-bg-secondary))',
                  borderBottom: '1px solid var(--v2-border-border-muted, var(--color-border-secondary))',
                }}
              >
                Providers
              </div>
              {configuredProviders.length === 0 ? (
                <div className="px-3 py-4 text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
                  No providers configured.
                  <br />
                  Open Settings to add one.
                </div>
              ) : (
                configuredProviders.map((p) => {
                  const isActive = p.id === selectedProviderId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleProviderPick(p.id)}
                      className="w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 rounded-[6px]"
                      style={{
                        background: isActive ? 'var(--v2-overlay-simple-overlay-hover, var(--color-accent-soft))' : 'transparent',
                        color: isActive ? 'var(--color-accent)' : 'var(--v2-text-text-muted, var(--color-text-secondary))',
                        borderLeft: isActive ? '2px solid var(--color-accent)' : '2px solid transparent',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover, var(--color-bg-hover))';
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <span className="truncate">{p.name}</span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Models column */}
            <div className="flex-1 flex flex-col min-w-0">
              {selectedProviderId ? (
                <>
                  <div
                    className="p-2 border-b"
                    style={{ borderColor: 'var(--v2-border-border-muted, var(--color-border-secondary))' }}
                  >
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      placeholder="Search models..."
                      className="w-full px-2 py-1.5 text-xs rounded-md outline-none"
                      style={{
                        background: 'var(--v2-background-bg-layer-02, var(--color-bg-tertiary))',
                        color: 'var(--v2-text-text-base, var(--color-text-primary))',
                        border: '1px solid var(--v2-border-border-base, var(--color-border-primary))',
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          if (modelSearch) {
                            setModelSearch('');
                          } else {
                            setPanelOpen(false);
                          }
                        }
                        if (e.key === 'Enter' && filteredModels.length > 0) {
                          handleModelPick(filteredModels[0].id);
                        }
                      }}
                    />
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {loadingModels ? (
                      <div className="px-3 py-6 text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
                        Loading models...
                      </div>
                    ) : filteredModels.length === 0 ? (
                      <div className="px-3 py-6 text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
                        {availableModels.length === 0 ? 'No models available.' : 'No matches.'}
                      </div>
                    ) : (
                      filteredModels.map((m) => {
                        const isActive = m.id === selectedModel;
                        return (
                          <button
                            key={m.id}
                            onClick={() => handleModelPick(m.id)}
                            className="w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 rounded-[6px]"
                            style={{
                              background: isActive ? 'var(--v2-overlay-simple-overlay-hover, var(--color-accent-soft))' : 'transparent',
                              color: isActive ? 'var(--color-accent)' : 'var(--v2-text-text-base, var(--color-text-primary))',
                            }}
                            onMouseEnter={(e) => {
                              if (!isActive) e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover, var(--color-bg-hover))';
                            }}
                            onMouseLeave={(e) => {
                              if (!isActive) e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium">{m.displayName}</div>
                              <div className="truncate text-[10px]" style={{ color: 'var(--v2-text-text-muted, var(--color-text-muted))' }}>
                                {m.id}
                              </div>
                            </div>
                            {isActive && (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center px-4 text-center">
                  <div>
                    <div
                      className="w-10 h-10 mx-auto mb-2 rounded-full flex items-center justify-center"
                      style={{ background: 'var(--color-accent-soft)' }}
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--color-accent)"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                        <line x1="12" y1="22.08" x2="12" y2="12" />
                      </svg>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      Pick a provider on the left
                      <br />
                      to see available models.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelSelector;
