/**
 * OpenAgent-Desktop - Gateway Provider Router
 *
 * Routes model requests through the optimal provider based on cost, speed,
 * availability, and user preferences. Like Goose's Gateway provider routing.
 * Supports fallback chains, cost optimization, and smart routing.
 */

import { EventEmitter } from 'events';
import { ProviderType, HealthStatus } from './types';

// ─── Routing Types ───────────────────────────────────────────────────────────────

export type RoutingStrategy = 'priority' | 'cost' | 'speed' | 'availability' | 'smart';

export type CostTier = 'free' | 'low' | 'medium' | 'high';
export type SpeedTier = 'instant' | 'fast' | 'normal' | 'slow';

export interface RoutingCondition {
  /** Only apply this rule if the provider is healthy */
  requireHealthy?: boolean;
  /** Maximum acceptable latency in milliseconds */
  maxLatencyMs?: number;
  /** Maximum cost tier */
  maxCostTier?: CostTier;
  /** Minimum uptime percentage */
  minUptimePercent?: number;
  /** Time-of-day restriction (hour range) */
  timeWindow?: { startHour: number; endHour: number };
}

export interface RoutingRule {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Model name pattern (regex or glob) to match */
  modelPattern: string;
  /** Preferred providers in priority order */
  preferredProviders: ProviderType[];
  /** Fallback providers if preferred are unavailable */
  fallbackProviders: ProviderType[];
  /** Routing strategy for this rule */
  strategy: RoutingStrategy;
  /** Conditions that must be met for this rule to apply */
  conditions?: RoutingCondition;
  /** Whether this rule is enabled */
  enabled: boolean;
}

export interface RouteResult {
  /** The selected provider type */
  providerType: ProviderType;
  /** The model to use (may differ from requested if mapped) */
  model: string;
  /** The strategy that was used to make the routing decision */
  strategy: RoutingStrategy;
  /** Human-readable reason for the routing decision */
  reason: string;
  /** Alternative providers that could have been chosen */
  alternatives: Array<{
    providerType: ProviderType;
    model: string;
    reason: string;
  }>;
  /** The rule that was applied (if any) */
  ruleId?: string;
  /** Cost tier of the selected route */
  costTier: CostTier;
  /** Expected speed tier */
  speedTier: SpeedTier;
}

export interface ProviderHealthInfo {
  providerType: ProviderType;
  status: HealthStatus;
  latencyMs: number;
  uptimePercent: number;
  lastError?: string;
}

// ─── Cost/Speed Tier Mappings ────────────────────────────────────────────────────

const PROVIDER_COST_TIER: Record<ProviderType, CostTier> = {
  [ProviderType.ollama]: 'free',
  [ProviderType.lm_studio]: 'free',
  [ProviderType.docker_model_runner]: 'free',
  [ProviderType.ramalama]: 'free',
  [ProviderType.custom_openai]: 'free',
  [ProviderType.litellm]: 'free',
  [ProviderType.groq]: 'low',
  [ProviderType.cerebras]: 'low',
  [ProviderType.novita]: 'low',
  [ProviderType.saladcloud]: 'low',
  [ProviderType.scaleway]: 'low',
  [ProviderType.ovhcloud]: 'low',
  [ProviderType.venice]: 'low',
  [ProviderType.perplexity]: 'low',
  [ProviderType.openai]: 'medium',
  [ProviderType.anthropic]: 'medium',
  [ProviderType.gemini]: 'medium',
  [ProviderType.mistral]: 'medium',
  [ProviderType.xai]: 'medium',
  [ProviderType.openrouter]: 'medium',
  [ProviderType.github_copilot]: 'medium',
  [ProviderType.opencode]: 'medium',
  [ProviderType.futurmix]: 'medium',
  [ProviderType.routstr]: 'medium',
  [ProviderType.near_ai]: 'medium',
  [ProviderType.atomic_chat]: 'medium',
  [ProviderType.chatgpt_codex]: 'medium',
  [ProviderType.databricks]: 'medium',
  [ProviderType.snowflake]: 'medium',
  [ProviderType.avian]: 'medium',
  [ProviderType.azure_openai]: 'high',
  [ProviderType.amazon_bedrock]: 'high',
  [ProviderType.amazon_sagemaker]: 'high',
  [ProviderType.gcp_vertex]: 'high',
  [ProviderType.tetrate]: 'high',
  [ProviderType.vmware_tanzu]: 'high',
  [ProviderType.ollama_cloud]: 'low',
};

const PROVIDER_SPEED_TIER: Record<ProviderType, SpeedTier> = {
  [ProviderType.groq]: 'instant',
  [ProviderType.cerebras]: 'instant',
  [ProviderType.ollama]: 'fast',
  [ProviderType.lm_studio]: 'fast',
  [ProviderType.docker_model_runner]: 'fast',
  [ProviderType.ramalama]: 'fast',
  [ProviderType.openai]: 'fast',
  [ProviderType.anthropic]: 'fast',
  [ProviderType.gemini]: 'fast',
  [ProviderType.mistral]: 'fast',
  [ProviderType.xai]: 'fast',
  [ProviderType.openrouter]: 'normal',
  [ProviderType.azure_openai]: 'normal',
  [ProviderType.amazon_bedrock]: 'normal',
  [ProviderType.gcp_vertex]: 'normal',
  [ProviderType.github_copilot]: 'normal',
  [ProviderType.litellm]: 'normal',
  [ProviderType.perplexity]: 'normal',
  [ProviderType.opencode]: 'normal',
  [ProviderType.ollama_cloud]: 'normal',
  [ProviderType.custom_openai]: 'normal',
  [ProviderType.novita]: 'normal',
  [ProviderType.venice]: 'normal',
  [ProviderType.databricks]: 'normal',
  [ProviderType.snowflake]: 'normal',
  [ProviderType.amazon_sagemaker]: 'slow',
  [ProviderType.saladcloud]: 'normal',
  [ProviderType.scaleway]: 'normal',
  [ProviderType.ovhcloud]: 'normal',
  [ProviderType.futurmix]: 'normal',
  [ProviderType.routstr]: 'normal',
  [ProviderType.near_ai]: 'normal',
  [ProviderType.tetrate]: 'normal',
  [ProviderType.vmware_tanzu]: 'slow',
  [ProviderType.avian]: 'normal',
  [ProviderType.atomic_chat]: 'normal',
  [ProviderType.chatgpt_codex]: 'fast',
};

const COST_TIER_PRIORITY: Record<CostTier, number> = {
  free: 0,
  low: 1,
  medium: 2,
  high: 3,
};

const SPEED_TIER_PRIORITY: Record<SpeedTier, number> = {
  instant: 0,
  fast: 1,
  normal: 2,
  slow: 3,
};

// ─── Built-in Routing Rules ──────────────────────────────────────────────────────

const BUILTIN_RULES: RoutingRule[] = [
  {
    id: 'claude-default',
    name: 'Claude Models',
    modelPattern: 'claude*',
    preferredProviders: [ProviderType.anthropic],
    fallbackProviders: [ProviderType.openrouter, ProviderType.amazon_bedrock],
    strategy: 'priority',
    enabled: true,
  },
  {
    id: 'gpt-default',
    name: 'GPT Models',
    modelPattern: 'gpt*',
    preferredProviders: [ProviderType.openai],
    fallbackProviders: [ProviderType.openrouter, ProviderType.azure_openai],
    strategy: 'priority',
    enabled: true,
  },
  {
    id: 'gemini-default',
    name: 'Gemini Models',
    modelPattern: 'gemini*',
    preferredProviders: [ProviderType.gemini],
    fallbackProviders: [ProviderType.gcp_vertex, ProviderType.openrouter],
    strategy: 'priority',
    enabled: true,
  },
  {
    id: 'llama-default',
    name: 'Llama Models (Fast)',
    modelPattern: 'llama*',
    preferredProviders: [ProviderType.groq, ProviderType.cerebras],
    fallbackProviders: [ProviderType.openrouter, ProviderType.ollama],
    strategy: 'speed',
    enabled: true,
  },
  {
    id: 'mistral-default',
    name: 'Mistral Models',
    modelPattern: 'mistral*',
    preferredProviders: [ProviderType.mistral],
    fallbackProviders: [ProviderType.openrouter, ProviderType.groq],
    strategy: 'priority',
    enabled: true,
  },
  {
    id: 'grok-default',
    name: 'Grok Models',
    modelPattern: 'grok*',
    preferredProviders: [ProviderType.xai],
    fallbackProviders: [ProviderType.openrouter],
    strategy: 'priority',
    enabled: true,
  },
  {
    id: 'deepseek-default',
    name: 'DeepSeek Models',
    modelPattern: 'deepseek*',
    preferredProviders: [ProviderType.openrouter],
    fallbackProviders: [ProviderType.custom_openai],
    strategy: 'priority',
    enabled: true,
  },
  {
    id: 'local-default',
    name: 'Local Models',
    modelPattern: 'local*',
    preferredProviders: [ProviderType.ollama],
    fallbackProviders: [ProviderType.lm_studio, ProviderType.docker_model_runner],
    strategy: 'priority',
    enabled: true,
  },
];

// ─── GatewayRouter Class ─────────────────────────────────────────────────────────

export class GatewayRouter extends EventEmitter {
  private rules: Map<string, RoutingRule> = new Map();
  private providerHealth: Map<ProviderType, ProviderHealthInfo> = new Map();
  private defaultStrategy: RoutingStrategy = 'smart';
  private availableProviders: Set<ProviderType> = new Set();

  constructor() {
    super();
    // Register built-in rules
    for (const rule of BUILTIN_RULES) {
      this.rules.set(rule.id, rule);
    }
  }

  // ─── Core Routing ───────────────────────────────────────────────────────────

  /**
   * Route a model request to the best available provider.
   *
   * @param modelId - Model ID (may include "provider/" prefix)
   * @param strategy - Override the default routing strategy
   * @returns RouteResult with the selected provider and alternatives
   */
  route(modelId: string, strategy?: RoutingStrategy): RouteResult {
    const effectiveStrategy = strategy || this.defaultStrategy;

    // Strip provider prefix if present
    const model = modelId.includes('/') ? modelId.split('/').slice(1).join('/') : modelId;

    // 1. Try to find a matching rule
    const matchingRule = this.findMatchingRule(model);
    if (matchingRule) {
      const result = this.routeWithRule(model, matchingRule, effectiveStrategy);
      this.emit('route:decision', {
        modelId,
        result,
        rule: matchingRule,
      });
      return result;
    }

    // 2. No matching rule — use the default strategy
    const result = this.routeWithStrategy(model, effectiveStrategy);
    this.emit('route:decision', {
      modelId,
      result,
      rule: null,
    });
    return result;
  }

  /**
   * Simulate routing without actually selecting a provider.
   * Returns all possible routes ranked by the given strategy.
   */
  simulate(modelId: string, strategy?: RoutingStrategy): RouteResult[] {
    const effectiveStrategy = strategy || this.defaultStrategy;
    const model = modelId.includes('/') ? modelId.split('/').slice(1).join('/') : modelId;

    const candidates = this.getCandidates(model);
    const ranked = this.rankByStrategy(candidates, model, effectiveStrategy);

    return ranked.map(({ providerType }, index) => {
      const costTier = PROVIDER_COST_TIER[providerType] || 'medium';
      const speedTier = PROVIDER_SPEED_TIER[providerType] || 'normal';

      return {
        providerType,
        model,
        strategy: effectiveStrategy,
        reason: index === 0 ? 'Top choice' : `Alternative #${index}`,
        alternatives: [],
        costTier,
        speedTier,
      };
    });
  }

  // ─── Rule Management ────────────────────────────────────────────────────────

  /**
   * Add a custom routing rule.
   */
  addRule(rule: RoutingRule): void {
    this.rules.set(rule.id, rule);
    this.emit('rule:added', rule);
  }

  /**
   * Update an existing routing rule.
   */
  updateRule(id: string, updates: Partial<RoutingRule>): void {
    const existing = this.rules.get(id);
    if (!existing) throw new Error(`Routing rule not found: ${id}`);

    const updated = { ...existing, ...updates, id };
    this.rules.set(id, updated);
    this.emit('rule:updated', updated);
  }

  /**
   * Remove a routing rule.
   */
  removeRule(id: string): boolean {
    const deleted = this.rules.delete(id);
    if (deleted) {
      this.emit('rule:removed', { id });
    }
    return deleted;
  }

  /**
   * Get all routing rules.
   */
  getRules(): RoutingRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get a specific routing rule.
   */
  getRule(id: string): RoutingRule | undefined {
    return this.rules.get(id);
  }

  // ─── Strategy Management ────────────────────────────────────────────────────

  /**
   * Set the default routing strategy.
   */
  setDefaultStrategy(strategy: RoutingStrategy): void {
    this.defaultStrategy = strategy;
    this.emit('strategy:changed', { strategy });
  }

  /**
   * Get the current default strategy.
   */
  getDefaultStrategy(): RoutingStrategy {
    return this.defaultStrategy;
  }

  // ─── Provider Health ─────────────────────────────────────────────────────────

  /**
   * Update provider health information.
   */
  updateProviderHealth(info: ProviderHealthInfo): void {
    this.providerHealth.set(info.providerType, info);
  }

  /**
   * Get health info for a specific provider.
   */
  getProviderHealth(providerType: ProviderType): ProviderHealthInfo | undefined {
    return this.providerHealth.get(providerType);
  }

  /**
   * Register a provider as available.
   */
  registerAvailableProvider(providerType: ProviderType): void {
    this.availableProviders.add(providerType);
  }

  /**
   * Unregister a provider.
   */
  unregisterAvailableProvider(providerType: ProviderType): void {
    this.availableProviders.delete(providerType);
  }

  /**
   * Set all available providers.
   */
  setAvailableProviders(providers: ProviderType[]): void {
    this.availableProviders.clear();
    for (const p of providers) {
      this.availableProviders.add(p);
    }
  }

  // ─── Cost/Speed Helpers ─────────────────────────────────────────────────────

  /**
   * Get the cost tier for a provider.
   */
  getCostTier(providerType: ProviderType): CostTier {
    return PROVIDER_COST_TIER[providerType] || 'medium';
  }

  /**
   * Get the speed tier for a provider.
   */
  getSpeedTier(providerType: ProviderType): SpeedTier {
    return PROVIDER_SPEED_TIER[providerType] || 'normal';
  }

  /**
   * Get all providers in a specific cost tier.
   */
  getProvidersByCostTier(tier: CostTier): ProviderType[] {
    return Object.entries(PROVIDER_COST_TIER)
      .filter(([, t]) => t === tier)
      .map(([p]) => p as ProviderType);
  }

  /**
   * Get all providers in a specific speed tier.
   */
  getProvidersBySpeedTier(tier: SpeedTier): ProviderType[] {
    return Object.entries(PROVIDER_SPEED_TIER)
      .filter(([, t]) => t === tier)
      .map(([p]) => p as ProviderType);
  }

  // ─── Private Routing Logic ──────────────────────────────────────────────────

  private findMatchingRule(model: string): RoutingRule | null {
    const enabledRules = Array.from(this.rules.values()).filter((r) => r.enabled);

    for (const rule of enabledRules) {
      if (this.matchesPattern(model, rule.modelPattern)) {
        // Check conditions
        if (rule.conditions && !this.checkConditions(rule.conditions)) {
          continue;
        }
        return rule;
      }
    }

    return null;
  }

  private matchesPattern(model: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    try {
      const regex = new RegExp(`^${regexStr}$`, 'i');
      return regex.test(model);
    } catch {
      return model.toLowerCase() === pattern.toLowerCase();
    }
  }

  private checkConditions(conditions: RoutingCondition): boolean {
    // Check time window
    if (conditions.timeWindow) {
      const hour = new Date().getHours();
      const { startHour, endHour } = conditions.timeWindow;
      if (hour < startHour || hour >= endHour) {
        return false;
      }
    }

    return true;
  }

  private routeWithRule(model: string, rule: RoutingRule, strategy: RoutingStrategy): RouteResult {
    const allProviders = [...rule.preferredProviders, ...rule.fallbackProviders];
    const availableProviders = allProviders.filter((p) => this.isProviderAvailable(p));

    if (availableProviders.length === 0) {
      // No available providers — fall back to any available
      const fallback = this.findAnyAvailableProvider(model);
      return {
        providerType: fallback,
        model,
        strategy,
        reason: `Rule "${rule.name}" matched but no preferred/fallback providers available. Using fallback.`,
        alternatives: [],
        ruleId: rule.id,
        costTier: PROVIDER_COST_TIER[fallback] || 'medium',
        speedTier: PROVIDER_SPEED_TIER[fallback] || 'normal',
      };
    }

    // Convert to candidate format with initial scores
    const candidates = availableProviders.map((providerType, index) => ({
      providerType,
      score: 100 - index * 10,
    }));

    // Rank candidates by strategy
    const ranked = this.rankByStrategy(candidates, model, strategy);
    const selected = ranked[0];

    const alternatives = ranked.slice(1, 4).map(({ providerType }) => ({
      providerType,
      model,
      reason: `Alternative from rule "${rule.name}"`,
    }));

    return {
      providerType: selected.providerType,
      model,
      strategy,
      reason: `Routed via rule "${rule.name}" using ${strategy} strategy`,
      alternatives,
      ruleId: rule.id,
      costTier: PROVIDER_COST_TIER[selected.providerType] || 'medium',
      speedTier: PROVIDER_SPEED_TIER[selected.providerType] || 'normal',
    };
  }

  private routeWithStrategy(model: string, strategy: RoutingStrategy): RouteResult {
    const candidates = this.getCandidates(model);

    if (candidates.length === 0) {
      // Use openrouter as universal fallback
      return {
        providerType: ProviderType.openrouter,
        model,
        strategy,
        reason: 'No available providers matched. Using OpenRouter as universal gateway.',
        alternatives: [],
        costTier: 'medium',
        speedTier: 'normal',
      };
    }

    const ranked = this.rankByStrategy(candidates, model, strategy);
    const selected = ranked[0];

    const alternatives = ranked.slice(1, 4).map(({ providerType }) => ({
      providerType,
      model,
      reason: `Alternative via ${strategy} strategy`,
    }));

    return {
      providerType: selected.providerType,
      model,
      strategy,
      reason: `Routed using ${strategy} strategy`,
      alternatives,
      costTier: PROVIDER_COST_TIER[selected.providerType] || 'medium',
      speedTier: PROVIDER_SPEED_TIER[selected.providerType] || 'normal',
    };
  }

  private getCandidates(model: string): Array<{ providerType: ProviderType; score: number }> {
    const candidates: Array<{ providerType: ProviderType; score: number }> = [];

    // From matching rules
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;
      if (!this.matchesPattern(model, rule.modelPattern)) continue;

      for (const providerType of rule.preferredProviders) {
        if (this.isProviderAvailable(providerType)) {
          candidates.push({ providerType, score: 100 });
        }
      }
    }

    // Add any available provider not yet included
    for (const providerType of this.availableProviders) {
      if (!candidates.some((c) => c.providerType === providerType)) {
        candidates.push({ providerType, score: 50 });
      }
    }

    // If no available providers are set, include common ones
    if (this.availableProviders.size === 0) {
      const commonProviders = [
        ProviderType.anthropic,
        ProviderType.openai,
        ProviderType.gemini,
        ProviderType.groq,
        ProviderType.openrouter,
        ProviderType.ollama,
      ];
      for (const providerType of commonProviders) {
        if (!candidates.some((c) => c.providerType === providerType)) {
          candidates.push({ providerType, score: 25 });
        }
      }
    }

    return candidates;
  }

  private rankByStrategy(
    candidates: Array<{ providerType: ProviderType; score: number }>,
    _model: string,
    strategy: RoutingStrategy
  ): Array<{ providerType: ProviderType; score: number }> {
    const scored = candidates.map((c) => {
      let score = c.score;
      const health = this.providerHealth.get(c.providerType);
      const costTier = PROVIDER_COST_TIER[c.providerType] || 'medium';
      const speedTier = PROVIDER_SPEED_TIER[c.providerType] || 'normal';

      switch (strategy) {
        case 'priority':
          // Keep original score (rule ordering matters)
          break;

        case 'cost':
          // Lower cost = higher score
          score += (3 - COST_TIER_PRIORITY[costTier]) * 30;
          break;

        case 'speed':
          // Faster = higher score
          score += (3 - SPEED_TIER_PRIORITY[speedTier]) * 30;
          break;

        case 'availability':
          // Healthier = higher score
          if (health) {
            if (health.status === HealthStatus.healthy) score += 100;
            else if (health.status === HealthStatus.degraded) score += 50;
            else if (health.status === HealthStatus.unhealthy) score -= 100;
          }
          break;

        case 'smart':
          // Balanced scoring: health + speed + cost
          if (health) {
            if (health.status === HealthStatus.healthy) score += 40;
            else if (health.status === HealthStatus.degraded) score += 10;
            else if (health.status === HealthStatus.unhealthy) score -= 50;
          }
          score += (3 - SPEED_TIER_PRIORITY[speedTier]) * 15;
          score += (3 - COST_TIER_PRIORITY[costTier]) * 10;

          // Prefer lower latency
          if (health && health.latencyMs > 0) {
            if (health.latencyMs < 1000) score += 20;
            else if (health.latencyMs < 3000) score += 10;
            else if (health.latencyMs > 10000) score -= 15;
          }
          break;
      }

      return { ...c, score };
    });

    return scored.sort((a, b) => b.score - a.score);
  }

  private isProviderAvailable(providerType: ProviderType): boolean {
    if (this.availableProviders.size === 0) return true;

    const health = this.providerHealth.get(providerType);
    if (health && health.status === HealthStatus.unhealthy) return false;

    return this.availableProviders.has(providerType);
  }

  private findAnyAvailableProvider(model: string): ProviderType {
    // Try to find a provider that supports this model
    const modelLower = model.toLowerCase();

    if (modelLower.includes('claude')) return ProviderType.anthropic;
    if (modelLower.includes('gpt')) return ProviderType.openai;
    if (modelLower.includes('gemini')) return ProviderType.gemini;
    if (modelLower.includes('llama')) return ProviderType.groq;
    if (modelLower.includes('mistral')) return ProviderType.mistral;
    if (modelLower.includes('grok')) return ProviderType.xai;

    // Universal fallback
    return ProviderType.openrouter;
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────────

let instance: GatewayRouter | null = null;

export function getGatewayRouter(): GatewayRouter {
  if (!instance) {
    instance = new GatewayRouter();
  }
  return instance;
}

export function setGatewayRouter(router: GatewayRouter): void {
  instance = router;
}

export function resetGatewayRouter(): void {
  instance = null;
}
