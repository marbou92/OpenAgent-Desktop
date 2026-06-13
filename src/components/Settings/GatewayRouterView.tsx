/**
 * OpenAgent-Desktop - Gateway Router View Component
 *
 * Configure provider routing rules, default strategy, and test routes.
 * Shows provider health, cost/speed badges, and visual routing flow.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Toast } from '../../types';

const api = (window as any).openagent;

// ─── Types ───────────────────────────────────────────────────────────────────────

type RoutingStrategy = 'priority' | 'cost' | 'speed' | 'availability' | 'smart';
type CostTier = 'free' | 'low' | 'medium' | 'high';
type SpeedTier = 'instant' | 'fast' | 'normal' | 'slow';

interface RoutingRule {
  id: string;
  name: string;
  modelPattern: string;
  preferredProviders: string[];
  fallbackProviders: string[];
  strategy: RoutingStrategy;
  enabled: boolean;
}

interface ProviderHealthInfo {
  providerType: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latencyMs: number;
  uptimePercent: number;
}

interface RouteResult {
  providerType: string;
  model: string;
  strategy: RoutingStrategy;
  reason: string;
  alternatives: Array<{
    providerType: string;
    model: string;
    reason: string;
  }>;
  costTier: CostTier;
  speedTier: SpeedTier;
}

interface GatewayRouterViewProps {
  addToast: (toast: Omit<Toast, 'id'>) => void;
  providerHealth?: Map<string, ProviderHealthInfo>;
}

// ─── Provider Data ───────────────────────────────────────────────────────────────

const ALL_PROVIDERS = [
  'anthropic', 'openai', 'gemini', 'groq', 'mistral', 'xai',
  'openrouter', 'ollama', 'azure_openai', 'amazon_bedrock',
  'gcp_vertex', 'cerebras', 'perplexity', 'litellm',
  'lm_studio', 'novita', 'venice', 'databricks',
  'github_copilot', 'custom_openai',
];

const PROVIDER_COST_TIER: Record<string, CostTier> = {
  ollama: 'free', lm_studio: 'free', custom_openai: 'free', litellm: 'free',
  groq: 'low', cerebras: 'low', novita: 'low',
  openai: 'medium', anthropic: 'medium', gemini: 'medium', mistral: 'medium',
  xai: 'medium', openrouter: 'medium', perplexity: 'medium',
  azure_openai: 'high', amazon_bedrock: 'high', gcp_vertex: 'high',
};

const PROVIDER_SPEED_TIER: Record<string, SpeedTier> = {
  groq: 'instant', cerebras: 'instant',
  ollama: 'fast', lm_studio: 'fast', openai: 'fast', anthropic: 'fast', gemini: 'fast',
  openrouter: 'normal', azure_openai: 'normal', amazon_bedrock: 'normal',
};

const COST_TIER_COLORS: Record<CostTier, { bg: string; color: string }> = {
  free: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e' },
  low: { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6' },
  medium: { bg: 'rgba(234,179,8,0.12)', color: '#eab308' },
  high: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444' },
};

const SPEED_TIER_COLORS: Record<SpeedTier, { bg: string; color: string }> = {
  instant: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e' },
  fast: { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6' },
  normal: { bg: 'rgba(234,179,8,0.12)', color: '#eab308' },
  slow: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444' },
};

const HEALTH_STATUS_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  healthy: { color: '#22c55e', label: 'Healthy', icon: '●' },
  degraded: { color: '#eab308', label: 'Degraded', icon: '◐' },
  unhealthy: { color: '#ef4444', label: 'Unhealthy', icon: '○' },
  unknown: { color: '#6b7280', label: 'Unknown', icon: '◌' },
};

const STRATEGY_LABELS: Record<RoutingStrategy, { label: string; description: string; icon: string }> = {
  priority: { label: 'Priority', description: 'Use providers in configured order', icon: '📋' },
  cost: { label: 'Cost Optimized', description: 'Prefer cheaper providers', icon: '💰' },
  speed: { label: 'Speed Optimized', description: 'Prefer faster providers', icon: '⚡' },
  availability: { label: 'Availability', description: 'Prefer healthiest providers', icon: '🔄' },
  smart: { label: 'Smart', description: 'Balance health, speed, and cost', icon: '🧠' },
};

// ─── Default Rules ───────────────────────────────────────────────────────────────

const DEFAULT_RULES: RoutingRule[] = [
  { id: 'rule-claude', name: 'Claude Models', modelPattern: 'claude*', preferredProviders: ['anthropic'], fallbackProviders: ['openrouter', 'amazon_bedrock'], strategy: 'priority', enabled: true },
  { id: 'rule-gpt', name: 'GPT Models', modelPattern: 'gpt*', preferredProviders: ['openai'], fallbackProviders: ['openrouter', 'azure_openai'], strategy: 'priority', enabled: true },
  { id: 'rule-gemini', name: 'Gemini Models', modelPattern: 'gemini*', preferredProviders: ['gemini'], fallbackProviders: ['gcp_vertex', 'openrouter'], strategy: 'priority', enabled: true },
  { id: 'rule-llama', name: 'Llama Models', modelPattern: 'llama*', preferredProviders: ['groq', 'cerebras'], fallbackProviders: ['openrouter', 'ollama'], strategy: 'speed', enabled: true },
  { id: 'rule-mistral', name: 'Mistral Models', modelPattern: 'mistral*', preferredProviders: ['mistral'], fallbackProviders: ['openrouter', 'groq'], strategy: 'priority', enabled: true },
  { id: 'rule-grok', name: 'Grok Models', modelPattern: 'grok*', preferredProviders: ['xai'], fallbackProviders: ['openrouter'], strategy: 'priority', enabled: true },
  { id: 'rule-deepseek', name: 'DeepSeek Models', modelPattern: 'deepseek*', preferredProviders: ['openrouter'], fallbackProviders: ['custom_openai'], strategy: 'priority', enabled: true },
  { id: 'rule-local', name: 'Local Models', modelPattern: 'local*', preferredProviders: ['ollama'], fallbackProviders: ['lm_studio'], strategy: 'priority', enabled: true },
];

// ─── Badges ──────────────────────────────────────────────────────────────────────

const CostBadge: React.FC<{ tier: CostTier }> = ({ tier }) => {
  const config = COST_TIER_COLORS[tier];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '1px 6px', borderRadius: '4px',
      fontSize: '9px', fontWeight: 600, background: config.bg, color: config.color,
      textTransform: 'capitalize',
    }}>
      {tier === 'free' ? '✓' : '$'}{tier}
    </span>
  );
};

const SpeedBadge: React.FC<{ tier: SpeedTier }> = ({ tier }) => {
  const config = SPEED_TIER_COLORS[tier];
  const icon = tier === 'instant' ? '⚡' : tier === 'fast' ? '🚀' : tier === 'normal' ? '🚶' : '🐢';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '1px 6px', borderRadius: '4px',
      fontSize: '9px', fontWeight: 600, background: config.bg, color: config.color,
      textTransform: 'capitalize', gap: '2px',
    }}>
      {icon} {tier}
    </span>
  );
};

const HealthIndicator: React.FC<{ status: string; latencyMs?: number }> = ({ status, latencyMs }) => {
  const config = HEALTH_STATUS_CONFIG[status] || HEALTH_STATUS_CONFIG.unknown;
  return (
    <span
      style={{ color: config.color, fontSize: '10px', cursor: 'default' }}
      title={`${config.label}${latencyMs !== undefined ? ` (${latencyMs}ms)` : ''}`}
    >
      {config.icon}
    </span>
  );
};

// ─── Rule Form ────────────────────────────────────────────────────────────────────

interface RuleFormProps {
  rule?: RoutingRule;
  onSave: (rule: RoutingRule) => void;
  onCancel: () => void;
}

const RuleForm: React.FC<RuleFormProps> = ({ rule, onSave, onCancel }) => {
  const [name, setName] = useState(rule?.name || '');
  const [modelPattern, setModelPattern] = useState(rule?.modelPattern || '');
  const [preferredProviders, setPreferredProviders] = useState<string[]>(rule?.preferredProviders || []);
  const [fallbackProviders, setFallbackProviders] = useState<string[]>(rule?.fallbackProviders || []);
  const [strategy, setStrategy] = useState<RoutingStrategy>(rule?.strategy || 'priority');

  const handleSave = () => {
    if (!name.trim() || !modelPattern.trim()) return;
    onSave({
      id: rule?.id || `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      modelPattern: modelPattern.trim(),
      preferredProviders,
      fallbackProviders,
      strategy,
      enabled: rule?.enabled ?? true,
    });
  };

  const toggleProvider = (list: string[], setList: (v: string[]) => void, provider: string) => {
    if (list.includes(provider)) {
      setList(list.filter((p) => p !== provider));
    } else {
      setList([...list, provider]);
    }
  };

  return (
    <div style={{ padding: '16px', background: 'var(--color-bg-tertiary)', borderRadius: '8px', border: '1px solid var(--color-border-primary)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Name */}
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>Rule Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Claude Models"
            style={{
              width: '100%', padding: '6px 10px', borderRadius: '6px',
              border: '1px solid var(--color-border-primary)', background: 'var(--color-bg-secondary)',
              color: 'var(--color-text-primary)', fontSize: '13px', outline: 'none',
            }}
          />
        </div>

        {/* Model Pattern */}
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>Model Pattern (glob)</label>
          <input
            type="text"
            value={modelPattern}
            onChange={(e) => setModelPattern(e.target.value)}
            placeholder="e.g., claude* or gpt-4*"
            style={{
              width: '100%', padding: '6px 10px', borderRadius: '6px',
              border: '1px solid var(--color-border-primary)', background: 'var(--color-bg-secondary)',
              color: 'var(--color-text-primary)', fontSize: '13px', fontFamily: 'monospace', outline: 'none',
            }}
          />
        </div>

        {/* Strategy */}
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>Strategy</label>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {(Object.entries(STRATEGY_LABELS) as [RoutingStrategy, typeof STRATEGY_LABELS[RoutingStrategy]][]).map(([key, val]) => (
              <button
                key={key}
                onClick={() => setStrategy(key)}
                style={{
                  padding: '4px 10px', borderRadius: '6px',
                  border: `1px solid ${strategy === key ? 'var(--color-accent)' : 'var(--color-border-primary)'}`,
                  background: strategy === key ? 'rgba(var(--color-accent-rgb, 59,130,246),0.1)' : 'transparent',
                  color: strategy === key ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                  fontSize: '11px', cursor: 'pointer', transition: 'all 0.15s',
                }}
                title={val.description}
              >
                {val.icon} {val.label}
              </button>
            ))}
          </div>
        </div>

        {/* Preferred Providers */}
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>Preferred Providers</label>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {ALL_PROVIDERS.map((provider) => {
              const isSelected = preferredProviders.includes(provider);
              const isAlsoInFallback = fallbackProviders.includes(provider);
              return (
                <button
                  key={provider}
                  onClick={() => toggleProvider(preferredProviders, setPreferredProviders, provider)}
                  disabled={isAlsoInFallback}
                  style={{
                    padding: '2px 8px', borderRadius: '4px',
                    border: `1px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-border-primary)'}`,
                    background: isSelected ? 'rgba(var(--color-accent-rgb, 59,130,246),0.1)' : 'transparent',
                    color: isSelected ? 'var(--color-accent)' : isAlsoInFallback ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                    fontSize: '10px', cursor: isAlsoInFallback ? 'not-allowed' : 'pointer',
                    opacity: isAlsoInFallback ? 0.4 : 1,
                  }}
                >
                  {isSelected ? '✓ ' : ''}{provider}
                </button>
              );
            })}
          </div>
        </div>

        {/* Fallback Providers */}
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>Fallback Providers</label>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {ALL_PROVIDERS.map((provider) => {
              const isSelected = fallbackProviders.includes(provider);
              const isAlsoInPreferred = preferredProviders.includes(provider);
              return (
                <button
                  key={provider}
                  onClick={() => toggleProvider(fallbackProviders, setFallbackProviders, provider)}
                  disabled={isAlsoInPreferred}
                  style={{
                    padding: '2px 8px', borderRadius: '4px',
                    border: `1px solid ${isSelected ? '#eab308' : 'var(--color-border-primary)'}`,
                    background: isSelected ? 'rgba(234,179,8,0.1)' : 'transparent',
                    color: isSelected ? '#eab308' : isAlsoInPreferred ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                    fontSize: '10px', cursor: isAlsoInPreferred ? 'not-allowed' : 'pointer',
                    opacity: isAlsoInPreferred ? 0.4 : 1,
                  }}
                >
                  {isSelected ? '✓ ' : ''}{provider}
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '6px 14px', borderRadius: '6px',
              border: '1px solid var(--color-border-primary)', background: 'var(--color-bg-secondary)',
              color: 'var(--color-text-secondary)', fontSize: '12px', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || !modelPattern.trim()}
            style={{
              padding: '6px 14px', borderRadius: '6px',
              border: 'none', background: 'var(--color-accent)',
              color: 'var(--color-bg-primary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              opacity: (!name.trim() || !modelPattern.trim()) ? 0.5 : 1,
            }}
          >
            {rule ? 'Update Rule' : 'Add Rule'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Visual Routing Flow ─────────────────────────────────────────────────────────

interface RoutingFlowProps {
  result: RouteResult;
}

const RoutingFlow: React.FC<RoutingFlowProps> = ({ result }) => {
  const providerColor = {
    anthropic: '#d97706', openai: '#10b981', gemini: '#3b82f6', groq: '#f97316',
    mistral: '#6366f1', xai: '#8b5cf6', openrouter: '#ec4899', ollama: '#64748b',
    cerebras: '#14b8a6', perplexity: '#8b5cf6', azure_openai: '#0078d4',
    amazon_bedrock: '#ff9900', gcp_vertex: '#4285f4',
  }[result.providerType] || '#6b7280';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0', padding: '8px', overflowX: 'auto' }}>
      {/* Model Input */}
      <div style={{
        padding: '8px 12px', borderRadius: '8px',
        border: '1px solid var(--color-border-primary)', background: 'var(--color-bg-secondary)',
        minWidth: '100px', textAlign: 'center',
      }}>
        <div style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', marginBottom: '2px' }}>Model</div>
        <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>
          {result.model.length > 14 ? result.model.slice(0, 14) + '…' : result.model}
        </div>
      </div>

      {/* Arrow */}
      <div style={{ padding: '0 4px', color: 'var(--color-text-tertiary)', fontSize: '16px' }}>→</div>

      {/* Strategy */}
      <div style={{
        padding: '8px 12px', borderRadius: '8px',
        border: '1px solid var(--color-border-primary)', background: 'var(--color-bg-tertiary)',
        minWidth: '80px', textAlign: 'center',
      }}>
        <div style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', marginBottom: '2px' }}>Strategy</div>
        <div style={{ fontSize: '11px', color: 'var(--color-accent)', fontWeight: 500 }}>
          {STRATEGY_LABELS[result.strategy]?.icon} {STRATEGY_LABELS[result.strategy]?.label}
        </div>
      </div>

      {/* Arrow */}
      <div style={{ padding: '0 4px', color: 'var(--color-text-tertiary)', fontSize: '16px' }}>→</div>

      {/* Selected Provider */}
      <div style={{
        padding: '8px 12px', borderRadius: '8px',
        border: `2px solid ${providerColor}`, background: `${providerColor}18`,
        minWidth: '100px', textAlign: 'center',
      }}>
        <div style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', marginBottom: '2px' }}>Provider</div>
        <div style={{ fontSize: '12px', color: providerColor, fontWeight: 600 }}>
          {result.providerType}
        </div>
        <div style={{ display: 'flex', gap: '3px', justifyContent: 'center', marginTop: '4px' }}>
          <CostBadge tier={result.costTier} />
          <SpeedBadge tier={result.speedTier} />
        </div>
      </div>

      {/* Alternatives */}
      {result.alternatives.length > 0 && (
        <>
          <div style={{ padding: '0 4px', color: 'var(--color-text-tertiary)', fontSize: '16px' }}>|</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>Fallbacks:</div>
            {result.alternatives.map((alt, i) => (
              <div key={i} style={{ fontSize: '11px', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#6b7280' }} />
                {alt.providerType}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────────

const GatewayRouterView: React.FC<GatewayRouterViewProps> = ({ addToast, providerHealth }) => {
  const [rules, setRules] = useState<RoutingRule[]>(DEFAULT_RULES);
  const [defaultStrategy, setDefaultStrategy] = useState<RoutingStrategy>('smart');
  const [editingRule, setEditingRule] = useState<RoutingRule | null>(null);
  const [addingRule, setAddingRule] = useState(false);
  const [testModelId, setTestModelId] = useState('anthropic/claude-sonnet-4-5');
  const [testResult, setTestResult] = useState<RouteResult | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  // Get health info for a provider
  const getHealth = useCallback((providerType: string): ProviderHealthInfo | undefined => {
    return providerHealth?.get(providerType) || undefined;
  }, [providerHealth]);

  // Toggle rule enabled
  const toggleRuleEnabled = useCallback((ruleId: string) => {
    setRules((prev) =>
      prev.map((r) => r.id === ruleId ? { ...r, enabled: !r.enabled } : r)
    );
  }, []);

  // Move rule up/down
  const moveRule = useCallback((ruleId: string, direction: 'up' | 'down') => {
    setRules((prev) => {
      const index = prev.findIndex((r) => r.id === ruleId);
      if (index < 0) return prev;
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      const newRules = [...prev];
      [newRules[index], newRules[newIndex]] = [newRules[newIndex], newRules[index]];
      return newRules;
    });
  }, []);

  // Delete rule
  const deleteRule = useCallback((ruleId: string) => {
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
  }, []);

  // Save rule (add or update)
  const handleSaveRule = useCallback((rule: RoutingRule) => {
    setRules((prev) => {
      const existingIndex = prev.findIndex((r) => r.id === rule.id);
      if (existingIndex >= 0) {
        const newRules = [...prev];
        newRules[existingIndex] = rule;
        return newRules;
      }
      return [...prev, rule];
    });
    setEditingRule(null);
    setAddingRule(false);
  }, []);

  // Test route
  const handleTestRoute = useCallback(() => {
    if (!testModelId.trim()) return;

    setTestLoading(true);
    try {
      // Simple client-side route simulation
      const model = testModelId.includes('/') ? testModelId.split('/').slice(1).join('/') : testModelId;
      let matchedRule: RoutingRule | undefined;
      for (const rule of rules) {
        if (!rule.enabled) continue;
        const regexStr = rule.modelPattern.replace(/\*/g, '.*').replace(/\?/g, '.');
        try {
          if (new RegExp(`^${regexStr}$`, 'i').test(model)) {
            matchedRule = rule;
            break;
          }
        } catch {
          continue;
        }
      }

      if (matchedRule) {
        const selectedProvider = matchedRule.preferredProviders[0] || matchedRule.fallbackProviders[0] || 'openrouter';
        const result: RouteResult = {
          providerType: selectedProvider,
          model,
          strategy: matchedRule.strategy,
          reason: `Matched rule "${matchedRule.name}"`,
          alternatives: [
            ...matchedRule.preferredProviders.slice(1),
            ...matchedRule.fallbackProviders,
          ].slice(0, 3).map((p) => ({
            providerType: p,
            model,
            reason: 'Fallback provider',
          })),
          costTier: PROVIDER_COST_TIER[selectedProvider] || 'medium',
          speedTier: PROVIDER_SPEED_TIER[selectedProvider] || 'normal',
        };
        setTestResult(result);
      } else {
        // No matching rule — use default strategy
        const defaultProvider = 'openrouter';
        const result: RouteResult = {
          providerType: defaultProvider,
          model,
          strategy: defaultStrategy,
          reason: `No matching rule — using default ${defaultStrategy} strategy`,
          alternatives: [],
          costTier: PROVIDER_COST_TIER[defaultProvider] || 'medium',
          speedTier: PROVIDER_SPEED_TIER[defaultProvider] || 'normal',
        };
        setTestResult(result);
      }
      addToast({ type: 'success', title: 'Route test complete' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Route test failed', message: err.message });
    } finally {
      setTestLoading(false);
    }
  }, [testModelId, rules, defaultStrategy, addToast]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Default Strategy */}
      <div style={{
        padding: '14px', borderRadius: '8px',
        border: '1px solid var(--color-border-primary)', background: 'var(--color-bg-secondary)',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
          Default Routing Strategy
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(Object.entries(STRATEGY_LABELS) as [RoutingStrategy, typeof STRATEGY_LABELS[RoutingStrategy]][]).map(([key, val]) => (
            <button
              key={key}
              onClick={() => setDefaultStrategy(key)}
              style={{
                padding: '6px 12px', borderRadius: '8px',
                border: `1px solid ${defaultStrategy === key ? 'var(--color-accent)' : 'var(--color-border-primary)'}`,
                background: defaultStrategy === key ? 'rgba(var(--color-accent-rgb, 59,130,246),0.1)' : 'transparent',
                color: defaultStrategy === key ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              <span>{val.icon}</span>
              <span>{val.label}</span>
            </button>
          ))}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '6px' }}>
          {STRATEGY_LABELS[defaultStrategy].description}. Used when no routing rule matches.
        </div>
      </div>

      {/* Routing Rules */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Routing Rules ({rules.length})
          </div>
          <button
            onClick={() => setAddingRule(true)}
            style={{
              padding: '4px 12px', borderRadius: '6px',
              border: '1px solid var(--color-accent)', background: 'transparent',
              color: 'var(--color-accent)', fontSize: '11px', cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            + Add Rule
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {rules.map((rule, index) => {
            const healthInfos = [...rule.preferredProviders, ...rule.fallbackProviders].map((p) => ({
              provider: p,
              health: getHealth(p),
              isPreferred: rule.preferredProviders.includes(p),
            }));

            return (
              <div
                key={rule.id}
                style={{
                  padding: '10px 14px', borderRadius: '8px',
                  border: '1px solid var(--color-border-primary)',
                  background: rule.enabled ? 'var(--color-bg-secondary)' : 'var(--color-bg-tertiary)',
                  opacity: rule.enabled ? 1 : 0.6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  {/* Drag handle (visual only) */}
                  <span style={{ color: 'var(--color-text-tertiary)', fontSize: '12px', cursor: 'grab' }}>⋮⋮</span>

                  {/* Rule name */}
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)', flex: 1 }}>
                    {rule.name}
                  </span>

                  {/* Model pattern */}
                  <code style={{
                    fontSize: '11px', padding: '1px 6px', borderRadius: '4px',
                    background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)',
                  }}>
                    {rule.modelPattern}
                  </code>

                  {/* Strategy badge */}
                  <span style={{ fontSize: '10px', color: 'var(--color-accent)' }}>
                    {STRATEGY_LABELS[rule.strategy]?.icon}
                  </span>

                  {/* Move buttons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                    <button
                      onClick={() => moveRule(rule.id, 'up')}
                      disabled={index === 0}
                      style={{
                        padding: '0 4px', border: 'none', background: 'transparent',
                        color: index === 0 ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                        cursor: index === 0 ? 'default' : 'pointer', fontSize: '8px', lineHeight: 1,
                      }}
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveRule(rule.id, 'down')}
                      disabled={index === rules.length - 1}
                      style={{
                        padding: '0 4px', border: 'none', background: 'transparent',
                        color: index === rules.length - 1 ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                        cursor: index === rules.length - 1 ? 'default' : 'pointer', fontSize: '8px', lineHeight: 1,
                      }}
                    >
                      ▼
                    </button>
                  </div>

                  {/* Edit */}
                  <button
                    onClick={() => setEditingRule(rule)}
                    style={{
                      padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--color-border-primary)',
                      background: 'transparent', color: 'var(--color-text-tertiary)',
                      fontSize: '10px', cursor: 'pointer',
                    }}
                  >
                    ✏️
                  </button>

                  {/* Toggle */}
                  <button
                    onClick={() => toggleRuleEnabled(rule.id)}
                    style={{
                      padding: '2px 6px', borderRadius: '4px',
                      border: `1px solid ${rule.enabled ? '#22c55e' : 'var(--color-border-primary)'}`,
                      background: rule.enabled ? 'rgba(34,197,94,0.1)' : 'transparent',
                      color: rule.enabled ? '#22c55e' : 'var(--color-text-tertiary)',
                      fontSize: '10px', cursor: 'pointer',
                    }}
                  >
                    {rule.enabled ? '✓' : '✕'}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => deleteRule(rule.id)}
                    style={{
                      padding: '2px 6px', borderRadius: '4px',
                      border: '1px solid var(--color-border-primary)',
                      background: 'transparent', color: '#ef4444',
                      fontSize: '10px', cursor: 'pointer',
                    }}
                  >
                    🗑️
                  </button>
                </div>

                {/* Provider chain */}
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center', marginLeft: '24px' }}>
                  {healthInfos.map(({ provider, health, isPreferred }, i) => (
                    <React.Fragment key={provider}>
                      {i > 0 && <span style={{ color: 'var(--color-text-tertiary)', fontSize: '10px' }}>→</span>}
                      <span
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '3px',
                          padding: '2px 7px', borderRadius: '4px',
                          border: `1px solid ${isPreferred ? 'var(--color-accent)' : '#eab308'}`,
                          background: isPreferred ? 'rgba(var(--color-accent-rgb, 59,130,246),0.06)' : 'rgba(234,179,8,0.06)',
                          fontSize: '10px',
                        }}
                      >
                        <HealthIndicator status={health?.status || 'unknown'} latencyMs={health?.latencyMs} />
                        <span style={{ color: isPreferred ? 'var(--color-accent)' : '#eab308' }}>{provider}</span>
                        <CostBadge tier={PROVIDER_COST_TIER[provider] || 'medium'} />
                        <SpeedBadge tier={PROVIDER_SPEED_TIER[provider] || 'normal'} />
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add/Edit Rule Form */}
      {(addingRule || editingRule) && (
        <RuleForm
          rule={editingRule || undefined}
          onSave={handleSaveRule}
          onCancel={() => { setAddingRule(false); setEditingRule(null); }}
        />
      )}

      {/* Test Route */}
      <div style={{
        padding: '14px', borderRadius: '8px',
        border: '1px solid var(--color-border-primary)', background: 'var(--color-bg-secondary)',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
          Test Route
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            value={testModelId}
            onChange={(e) => setTestModelId(e.target.value)}
            placeholder="e.g., anthropic/claude-sonnet-4-5"
            onKeyDown={(e) => e.key === 'Enter' && handleTestRoute()}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: '8px',
              border: '1px solid var(--color-border-primary)', background: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-primary)', fontSize: '13px', fontFamily: 'monospace',
              outline: 'none',
            }}
          />
          <button
            onClick={handleTestRoute}
            disabled={testLoading || !testModelId.trim()}
            style={{
              padding: '8px 16px', borderRadius: '8px',
              border: 'none', background: 'var(--color-accent)',
              color: 'var(--color-bg-primary)', fontSize: '13px', fontWeight: 600,
              cursor: testLoading ? 'wait' : 'pointer',
              opacity: testLoading || !testModelId.trim() ? 0.5 : 1,
            }}
          >
            {testLoading ? 'Testing...' : 'Test Route'}
          </button>
        </div>

        {/* Test Result */}
        {testResult && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '6px' }}>
              Routing Result:
            </div>
            <RoutingFlow result={testResult} />
            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '6px' }}>
              {testResult.reason}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GatewayRouterView;
