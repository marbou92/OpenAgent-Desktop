/**
 * OpenAgent-Desktop - Universal Model ID Input Component
 *
 * Smart input that accepts "provider/model" format with auto-complete,
 * alias resolution, variant selection, and config set switching.
 */

import React, { useState, useRef, useMemo, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────────

interface ModelOption {
  id: string;
  label: string;
  providerType: string;
  model: string;
  isAlias?: boolean;
  aliasFrom?: string;
  description?: string;
}

interface ModelVariant {
  id: string;
  name: string;
  modelId: string;
  description?: string;
  color?: string;
}

interface ConfigSet {
  id: string;
  name: string;
  providerType: string;
  model: string;
  isDefault?: boolean;
}

interface ResolvedInfo {
  providerType: string;
  model: string;
  fromAlias?: boolean;
  alias?: string;
  isValid: boolean;
  error?: string;
}

interface ModelIdInputProps {
  /** Current value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Available config sets */
  configSets?: ConfigSet[];
  /** Available model variants */
  variants?: ModelVariant[];
  /** Recent model IDs for quick switcher */
  recentModels?: string[];
  /** Placeholder text */
  placeholder?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Label for the input */
  label?: string;
  /** Compact mode (no variant/config selectors) */
  compact?: boolean;
}

// ─── Known Models Data ───────────────────────────────────────────────────────────

const KNOWN_MODELS: ModelOption[] = [
  // Anthropic
  { id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5', providerType: 'anthropic', model: 'claude-sonnet-4-20250514', description: 'Best balance of speed and intelligence' },
  { id: 'anthropic/claude-opus-4', label: 'Claude Opus 4', providerType: 'anthropic', model: 'claude-opus-4-20250514', description: 'Maximum intelligence' },
  { id: 'anthropic/claude-3-5-haiku', label: 'Claude Haiku 3.5', providerType: 'anthropic', model: 'claude-3-5-haiku-20241022', description: 'Fastest responses' },

  // OpenAI
  { id: 'openai/gpt-5', label: 'GPT-5', providerType: 'openai', model: 'gpt-5', description: 'Latest OpenAI model' },
  { id: 'openai/gpt-4o', label: 'GPT-4o', providerType: 'openai', model: 'gpt-4o', description: 'Fast multimodal' },
  { id: 'openai/o3', label: 'o3', providerType: 'openai', model: 'o3', description: 'Advanced reasoning' },
  { id: 'openai/o4-mini', label: 'o4-mini', providerType: 'openai', model: 'o4-mini', description: 'Fast reasoning' },

  // Google
  { id: 'gemini/gemini-3-pro', label: 'Gemini 3 Pro', providerType: 'gemini', model: 'gemini-3-pro', description: 'Most capable Gemini' },
  { id: 'gemini/gemini-3-flash', label: 'Gemini 3 Flash', providerType: 'gemini', model: 'gemini-3-flash', description: 'Fast and efficient' },

  // Groq
  { id: 'groq/llama-3-70b', label: 'Llama 3 70B (Groq)', providerType: 'groq', model: 'llama-3-70b', description: 'Ultra-fast inference' },
  { id: 'groq/mixtral-8x7b', label: 'Mixtral 8x7B (Groq)', providerType: 'groq', model: 'mixtral-8x7b-32768', description: 'Mixture of experts' },

  // Mistral
  { id: 'mistral/mistral-large', label: 'Mistral Large', providerType: 'mistral', model: 'mistral-large-latest', description: 'Most capable Mistral' },
  { id: 'mistral/codestral', label: 'Codestral', providerType: 'mistral', model: 'codestral-latest', description: 'Code generation' },

  // xAI
  { id: 'xai/grok-3', label: 'Grok 3', providerType: 'xai', model: 'grok-3', description: 'Latest Grok' },

  // OpenRouter
  { id: 'openrouter/deepseek-r1', label: 'DeepSeek R1', providerType: 'openrouter', model: 'deepseek/deepseek-r1', description: 'Advanced reasoning' },

  // Local
  { id: 'ollama/llama3', label: 'Llama 3 (Local)', providerType: 'ollama', model: 'llama3', description: 'Run locally via Ollama' },
  { id: 'ollama/mistral', label: 'Mistral (Local)', providerType: 'ollama', model: 'mistral', description: 'Run locally via Ollama' },
  { id: 'ollama/phi3', label: 'Phi-3 (Local)', providerType: 'ollama', model: 'phi3', description: 'Run locally via Ollama' },

  // Other
  { id: 'cerebras/llama-3.3-70b', label: 'Llama 3.3 70B (Cerebras)', providerType: 'cerebras', model: 'llama-3.3-70b', description: 'Wafer-scale fast inference' },
  { id: 'perplexity/sonar', label: 'Sonar', providerType: 'perplexity', model: 'sonar', description: 'AI search with citations' },
];

// ─── Aliases ──────────────────────────────────────────────────────────────────────

const ALIASES: Record<string, string> = {
  claude: 'anthropic/claude-sonnet-4-5',
  'claude-sonnet': 'anthropic/claude-sonnet-4-5',
  'claude-opus': 'anthropic/claude-opus-4',
  'claude-haiku': 'anthropic/claude-3-5-haiku',
  gpt5: 'openai/gpt-5',
  'gpt-5': 'openai/gpt-5',
  gpt4: 'openai/gpt-4o',
  'gpt-4': 'openai/gpt-4o',
  'gpt-4o': 'openai/gpt-4o',
  gemini: 'gemini/gemini-3-pro',
  'gemini-pro': 'gemini/gemini-3-pro',
  'gemini-flash': 'gemini/gemini-3-flash',
  llama: 'groq/llama-3-70b',
  'llama-3': 'groq/llama-3-70b',
  mistral: 'mistral/mistral-large',
  deepseek: 'openrouter/deepseek-r1',
  'deepseek-r1': 'openrouter/deepseek-r1',
  grok: 'xai/grok-3',
  'grok-3': 'xai/grok-3',
  ollama: 'ollama/llama3',
  local: 'ollama/llama3',
  sonar: 'perplexity/sonar',
};

// ─── Provider Prefix Colors ──────────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#d97706',
  openai: '#10b981',
  gemini: '#3b82f6',
  groq: '#f97316',
  mistral: '#6366f1',
  xai: 'var(--color-accent)',
  openrouter: '#ec4899',
  ollama: '#64748b',
  cerebras: '#14b8a6',
  perplexity: 'var(--color-accent)',
  azure: '#0078d4',
  bedrock: '#ff9900',
  vertex: '#4285f4',
};

// ─── Resolution Logic ────────────────────────────────────────────────────────────

function resolveModelId(input: string): ResolvedInfo {
  const trimmed = input.trim();
  if (!trimmed) {
    return { providerType: '', model: '', isValid: false, error: 'Empty input' };
  }

  // Check alias
  const aliasLookup = ALIASES[trimmed.toLowerCase()];
  if (aliasLookup) {
    const knownModel = KNOWN_MODELS.find((m) => m.id === aliasLookup);
    if (knownModel) {
      return {
        providerType: knownModel.providerType,
        model: knownModel.model,
        fromAlias: true,
        alias: trimmed,
        isValid: true,
      };
    }
  }

  // Check "provider/model" format
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    const prefix = parts[0].toLowerCase();
    const model = parts.slice(1).join('/');

    // Check if it's a known provider prefix
    const knownPrefixes = ['anthropic', 'openai', 'gemini', 'google', 'groq', 'mistral', 'xai', 'openrouter', 'ollama', 'local', 'cerebras', 'perplexity', 'azure', 'bedrock', 'vertex', 'litellm', 'custom'];
    if (knownPrefixes.includes(prefix)) {
      const resolvedProvider = prefix === 'google' ? 'gemini' : prefix === 'local' ? 'ollama' : prefix;
      return {
        providerType: resolvedProvider,
        model,
        isValid: true,
      };
    }

    // Unknown prefix
    return {
      providerType: prefix,
      model,
      isValid: true,
      error: `Unknown provider prefix "${prefix}"`,
    };
  }

  // Bare model name — try to infer provider
  const modelLower = trimmed.toLowerCase();
  if (modelLower.startsWith('claude')) return { providerType: 'anthropic', model: trimmed, isValid: true };
  if (modelLower.startsWith('gpt') || modelLower.startsWith('o1') || modelLower.startsWith('o3') || modelLower.startsWith('o4')) return { providerType: 'openai', model: trimmed, isValid: true };
  if (modelLower.startsWith('gemini')) return { providerType: 'gemini', model: trimmed, isValid: true };
  if (modelLower.startsWith('llama') || modelLower.startsWith('mixtral')) return { providerType: 'groq', model: trimmed, isValid: true };
  if (modelLower.startsWith('mistral') || modelLower.startsWith('codestral')) return { providerType: 'mistral', model: trimmed, isValid: true };
  if (modelLower.startsWith('grok')) return { providerType: 'xai', model: trimmed, isValid: true };
  if (modelLower.startsWith('deepseek')) return { providerType: 'openrouter', model: trimmed, isValid: true };
  if (modelLower.startsWith('sonar')) return { providerType: 'perplexity', model: trimmed, isValid: true };

  // Can't determine provider
  return {
    providerType: '',
    model: trimmed,
    isValid: false,
    error: 'Cannot determine provider — use "provider/model" format',
  };
}

// ─── Component ────────────────────────────────────────────────────────────────────

const ModelIdInput: React.FC<ModelIdInputProps> = ({
  value,
  onChange,
  configSets = [],
  variants = [],
  recentModels = [],
  placeholder = 'e.g., anthropic/claude-sonnet-4-5 or just "claude"',
  disabled = false,
  label = 'Model',
  compact = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [activeVariantId, setActiveVariantId] = useState<string | null>(null);
  const [activeConfigSetId, setActiveConfigSetId] = useState<string | null>(null);
  const [showRecentSwitcher, setShowRecentSwitcher] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Resolve the current value
  const resolved = useMemo(() => resolveModelId(value), [value]);

  // Filter models for autocomplete
  const filteredModels = useMemo(() => {
    if (!value.trim() || !isFocused) return [];

    const lower = value.toLowerCase();

    // Check if input matches an alias
    const aliasMatches = Object.entries(ALIASES)
      .filter(([alias]) => alias.includes(lower) && alias !== lower.toLowerCase())
      .map(([alias, resolved]) => {
        const knownModel = KNOWN_MODELS.find((m) => m.id === resolved);
        return {
          id: resolved,
          label: knownModel?.label || resolved,
          providerType: knownModel?.providerType || resolved.split('/')[0],
          model: knownModel?.model || resolved.split('/')[1] || resolved,
          isAlias: true,
          aliasFrom: alias,
          description: knownModel?.description,
        } as ModelOption;
      });

    // Check if input matches known models
    const modelMatches = KNOWN_MODELS.filter(
      (m) =>
        !aliasMatches.some((am) => am.id === m.id) &&
        (m.id.toLowerCase().includes(lower) ||
          m.label.toLowerCase().includes(lower) ||
          m.model.toLowerCase().includes(lower))
    );

    return [...aliasMatches, ...modelMatches].slice(0, 8);
  }, [value, isFocused]);

  // Get variants for current model
  const modelVariants = useMemo(() => {
    if (!value) return [];
    return variants.filter((v) => v.modelId === value);
  }, [value, variants]);

  // Handle input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setShowDropdown(true);
    setSelectedIndex(-1);
  }, [onChange]);

  // Handle selecting a model from dropdown
  const handleSelectModel = useCallback((option: ModelOption) => {
    onChange(option.id);
    setShowDropdown(false);
    setSelectedIndex(-1);
    inputRef.current?.blur();
  }, [onChange]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || filteredModels.length === 0) {
      if (e.key === 'Enter' && value) {
        // If the value is an alias, resolve it
        const aliasLookup = ALIASES[value.toLowerCase()];
        if (aliasLookup) {
          onChange(aliasLookup);
        }
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredModels.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < filteredModels.length) {
          handleSelectModel(filteredModels[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        setSelectedIndex(-1);
        break;
      case 'Tab':
        if (selectedIndex >= 0 && selectedIndex < filteredModels.length) {
          e.preventDefault();
          handleSelectModel(filteredModels[selectedIndex]);
        }
        break;
    }
  }, [showDropdown, filteredModels, selectedIndex, handleSelectModel, value, onChange]);

  // Handle focus
  const handleFocus = useCallback(() => {
    setIsFocused(true);
    if (value.trim()) {
      setShowDropdown(true);
    }
  }, [value]);

  // Handle blur (delayed to allow click on dropdown)
  const handleBlur = useCallback(() => {
    setTimeout(() => {
      setIsFocused(false);
      setShowDropdown(false);
      setSelectedIndex(-1);
    }, 200);
  }, []);

  // Cycle through recent models
  const handleCycleModel = useCallback((direction: 'next' | 'prev') => {
    if (recentModels.length === 0) return;
    const currentIndex = recentModels.indexOf(value);
    let nextIndex: number;
    if (direction === 'next') {
      nextIndex = currentIndex < recentModels.length - 1 ? currentIndex + 1 : 0;
    } else {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : recentModels.length - 1;
    }
    onChange(recentModels[nextIndex]);
  }, [value, recentModels, onChange]);

  // Provider color
  const providerColor = resolved.providerType ? (PROVIDER_COLORS[resolved.providerType] || '#6b7280') : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {/* Label */}
      {label && !compact && (
        <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
          {label}
        </label>
      )}

      {/* Input Row */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'stretch' }}>
        {/* Quick Switcher Button */}
        {recentModels.length > 0 && (
          <button
            onClick={() => setShowRecentSwitcher(!showRecentSwitcher)}
            title="Recent models"
            style={{
              padding: '0 8px',
              borderRadius: '8px',
              border: '1px solid var(--color-border-primary)',
              background: 'var(--color-bg-secondary)',
              color: 'var(--color-text-tertiary)',
              cursor: 'pointer',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            ↕
          </button>
        )}

        {/* Main Input */}
        <div style={{ flex: 1, position: 'relative' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              borderRadius: '8px',
              border: `1px solid ${isFocused ? 'var(--color-accent)' : resolved.isValid ? 'var(--color-border-primary)' : '#ef4444'}`,
              background: 'var(--color-bg-secondary)',
              transition: 'border-color 0.15s',
              overflow: 'hidden',
            }}
          >
            {/* Provider Color Indicator */}
            {providerColor && (
              <div
                style={{
                  width: '4px',
                  height: '100%',
                  minHeight: '34px',
                  background: providerColor,
                  borderRadius: '0',
                }}
              />
            )}

            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={handleInputChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              style={{
                flex: 1,
                padding: '8px 10px',
                border: 'none',
                background: 'transparent',
                color: 'var(--color-text-primary)',
                fontSize: '13px',
                fontFamily: 'monospace',
                outline: 'none',
                minWidth: 0,
              }}
            />

            {/* Alias indicator */}
            {resolved.fromAlias && (
              <span
                style={{
                  padding: '2px 8px',
                  fontSize: '10px',
                  color: 'var(--color-accent)',
                  background: 'rgba(var(--color-accent-rgb, 59,130,246),0.1)',
                  borderRadius: '4px',
                  marginRight: '8px',
                  whiteSpace: 'nowrap',
                }}
              >
                → {resolved.providerType}/{resolved.model.split('-').slice(0, 3).join('-')}
              </span>
            )}

            {/* Cycle buttons */}
            {recentModels.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', marginRight: '4px' }}>
                <button
                  onClick={() => handleCycleModel('prev')}
                  style={{
                    padding: '0 4px',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--color-text-tertiary)',
                    cursor: 'pointer',
                    fontSize: '8px',
                    lineHeight: 1,
                  }}
                >
                  ▲
                </button>
                <button
                  onClick={() => handleCycleModel('next')}
                  style={{
                    padding: '0 4px',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--color-text-tertiary)',
                    cursor: 'pointer',
                    fontSize: '8px',
                    lineHeight: 1,
                  }}
                >
                  ▼
                </button>
              </div>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {showDropdown && filteredModels.length > 0 && (
            <div
              ref={dropdownRef}
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 100,
                marginTop: '4px',
                background: 'var(--color-bg-primary)',
                border: '1px solid var(--color-border-primary)',
                borderRadius: '8px',
                boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
                overflow: 'hidden',
                maxHeight: '300px',
                overflowY: 'auto',
              }}
            >
              {filteredModels.map((option, index) => (
                <div
                  key={option.id}
                  onClick={() => handleSelectModel(option)}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    background: index === selectedIndex ? 'var(--color-bg-tertiary)' : 'transparent',
                    transition: 'background 0.1s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onMouseLeave={() => setSelectedIndex(-1)}
                >
                  {/* Provider color dot */}
                  <div
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: PROVIDER_COLORS[option.providerType] || '#6b7280',
                      flexShrink: 0,
                    }}
                  />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>
                        {option.id}
                      </span>
                      {option.isAlias && (
                        <span
                          style={{
                            fontSize: '9px',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            background: 'rgba(var(--color-accent-rgb, 59,130,246),0.1)',
                            color: 'var(--color-accent)',
                          }}
                        >
                          alias: {option.aliasFrom}
                        </span>
                      )}
                    </div>
                    {option.description && (
                      <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '1px' }}>
                        {option.description}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Resolution Info */}
      {value && !compact && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {resolved.isValid ? (
            <>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '1px 8px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  background: `${providerColor}18`,
                  color: providerColor,
                  fontWeight: 500,
                }}
              >
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: providerColor }} />
                {resolved.providerType}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', fontFamily: 'monospace' }}>
                {resolved.model}
              </span>
              {resolved.fromAlias && (
                <span style={{ fontSize: '10px', color: 'var(--color-accent)' }}>
                  (alias: {resolved.alias})
                </span>
              )}
            </>
          ) : (
            <span style={{ fontSize: '10px', color: '#ef4444' }}>
              ⚠ {resolved.error}
            </span>
          )}
        </div>
      )}

      {/* Variant Selector */}
      {!compact && modelVariants.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center' }}>
            Variant:
          </span>
          {modelVariants.map((variant) => (
            <button
              key={variant.id}
              onClick={() => setActiveVariantId(variant.id === activeVariantId ? null : variant.id)}
              style={{
                padding: '2px 8px',
                borderRadius: '4px',
                border: `1px solid ${activeVariantId === variant.id ? (variant.color || 'var(--color-accent)') : 'var(--color-border-primary)'}`,
                background: activeVariantId === variant.id ? `${variant.color || 'var(--color-accent)'}18` : 'transparent',
                color: activeVariantId === variant.id ? (variant.color || 'var(--color-accent)') : 'var(--color-text-tertiary)',
                fontSize: '11px',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              title={variant.description}
            >
              {variant.name}
            </button>
          ))}
        </div>
      )}

      {/* Config Set Selector */}
      {!compact && configSets.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
            Config:
          </span>
          <select
            value={activeConfigSetId || ''}
            onChange={(e) => setActiveConfigSetId(e.target.value || null)}
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid var(--color-border-primary)',
              background: 'var(--color-bg-secondary)',
              color: 'var(--color-text-primary)',
              fontSize: '11px',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="">None</option>
            {configSets.map((cs) => (
              <option key={cs.id} value={cs.id}>
                {cs.name} ({cs.providerType}/{cs.model})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Recent Models Switcher */}
      {showRecentSwitcher && recentModels.length > 0 && (
        <div
          style={{
            padding: '8px',
            borderRadius: '8px',
            border: '1px solid var(--color-border-primary)',
            background: 'var(--color-bg-secondary)',
            maxHeight: '150px',
            overflowY: 'auto',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '6px' }}>
            Recent Models
          </div>
          {recentModels.map((model, index) => {
            const modelResolved = resolveModelId(model);
            const modelColor = modelResolved.providerType ? (PROVIDER_COLORS[modelResolved.providerType] || '#6b7280') : '#6b7280';
            return (
              <button
                key={`${model}-${index}`}
                onClick={() => {
                  onChange(model);
                  setShowRecentSwitcher(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  width: '100%',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: 'none',
                  background: model === value ? 'var(--color-bg-tertiary)' : 'transparent',
                  color: 'var(--color-text-primary)',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: modelColor, flexShrink: 0 }} />
                {model}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ModelIdInput;
