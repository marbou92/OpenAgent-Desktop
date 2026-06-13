/**
 * OpenAgent-Desktop - Universal Model ID Resolver
 *
 * Resolves "provider/model" format model IDs to concrete provider + model combos.
 * Like OpenCode's provider_id/model_id format.
 *
 * Examples:
 *   "anthropic/claude-sonnet-4-5" → { providerType: anthropic, model: claude-sonnet-4-5 }
 *   "openai/gpt-5" → { providerType: openai, model: gpt-5 }
 *   "google/gemini-3-pro" → { providerType: gemini, model: gemini-3-pro }
 *   "groq/llama-3-70b" → { providerType: groq, model: llama-3-70b }
 *   "local/llama-3" → { providerType: ollama, model: llama-3 }
 *   "auto/claude-sonnet-4-5" → { providerType: best available, model: claude-sonnet-4-5 }
 */

import { ProviderType } from './types';

// ─── Resolved Model ID ──────────────────────────────────────────────────────────

export interface ResolvedModelId {
  /** The resolved provider type */
  providerType: ProviderType;
  /** The model ID (without the provider prefix) */
  model: string;
  /** Optional specific provider instance ID */
  providerId?: string;
  /** Optional config set ID */
  configSetId?: string;
  /** Optional model variant ID */
  variantId?: string;
  /** The original unresolved ID string */
  originalId: string;
  /** Whether the resolution used an alias */
  fromAlias?: boolean;
  /** The alias name if resolved from one */
  alias?: string;
}

// ─── Provider Prefix Mapping ────────────────────────────────────────────────────

/**
 * Maps prefix strings in "provider/model" format to ProviderType enum values.
 * Multiple aliases can map to the same provider (e.g., "google" and "gemini" → gemini).
 */
const PROVIDER_PREFIX_MAP: Record<string, ProviderType> = {
  // Major providers
  anthropic: ProviderType.anthropic,
  openai: ProviderType.openai,
  google: ProviderType.gemini,
  gemini: ProviderType.gemini,

  // Cloud providers
  azure: ProviderType.azure_openai,
  bedrock: ProviderType.amazon_bedrock,
  aws: ProviderType.amazon_bedrock,
  vertex: ProviderType.gcp_vertex,
  gcp: ProviderType.gcp_vertex,

  // Fast / specialized
  groq: ProviderType.groq,
  mistral: ProviderType.mistral,
  cerebras: ProviderType.cerebras,
  xai: ProviderType.xai,
  grok: ProviderType.xai,

  // Local providers
  ollama: ProviderType.ollama,
  local: ProviderType.ollama,
  lmstudio: ProviderType.lm_studio,
  'lm-studio': ProviderType.lm_studio,
  docker: ProviderType.docker_model_runner,

  // Gateway providers
  openrouter: ProviderType.openrouter,
  litellm: ProviderType.litellm,

  // Other providers
  perplexity: ProviderType.perplexity,
  deepseek: ProviderType.custom_openai,
  novita: ProviderType.novita,
  venice: ProviderType.venice,
  databricks: ProviderType.databricks,
  snowflake: ProviderType.snowflake,
  copilot: ProviderType.github_copilot,
  github: ProviderType.github_copilot,
  opencode: ProviderType.opencode,
  custom: ProviderType.custom_openai,
};

// ─── Built-in Aliases ───────────────────────────────────────────────────────────

const BUILTIN_ALIASES: Record<string, string> = {
  // Model family shortcuts
  claude: 'anthropic/claude-sonnet-4-5',
  'claude-sonnet': 'anthropic/claude-sonnet-4-5',
  'claude-opus': 'anthropic/claude-opus-4',
  'claude-haiku': 'anthropic/claude-3-5-haiku-20241022',
  gpt5: 'openai/gpt-5',
  'gpt-5': 'openai/gpt-5',
  gpt4: 'openai/gpt-4o',
  'gpt-4': 'openai/gpt-4o',
  'gpt-4o': 'openai/gpt-4o',
  gemini: 'google/gemini-3-pro',
  'gemini-pro': 'google/gemini-3-pro',
  'gemini-flash': 'google/gemini-3-flash',
  llama: 'groq/llama-3-70b',
  'llama-3': 'groq/llama-3-70b',
  'llama-70b': 'groq/llama-3-70b',
  mistral: 'mistral/mistral-large-latest',
  'mistral-large': 'mistral/mistral-large-latest',
  deepseek: 'openrouter/deepseek-r1',
  'deepseek-r1': 'openrouter/deepseek-r1',
  'deepseek-v3': 'openrouter/deepseek-chat',
  grok: 'xai/grok-3',
  'grok-3': 'xai/grok-3',
  ollama: 'local/llama-3',
  local: 'local/llama-3',
  perplexity: 'perplexity/sonar',
  sonar: 'perplexity/sonar',
};

// ─── Model-to-Provider Inference ─────────────────────────────────────────────────

/**
 * Patterns that indicate a model belongs to a specific provider.
 * Used when the "auto/" prefix is given or no prefix is provided.
 */
const MODEL_PATTERN_MAP: Array<{ pattern: RegExp; providerType: ProviderType }> = [
  // Anthropic patterns
  { pattern: /^claude/i, providerType: ProviderType.anthropic },

  // OpenAI patterns
  { pattern: /^gpt-/i, providerType: ProviderType.openai },
  { pattern: /^gpt4/i, providerType: ProviderType.openai },
  { pattern: /^o[1-4]-/i, providerType: ProviderType.openai },
  { pattern: /^dall-e/i, providerType: ProviderType.openai },
  { pattern: /^chatgpt/i, providerType: ProviderType.openai },
  { pattern: /^codex/i, providerType: ProviderType.openai },

  // Google/Gemini patterns
  { pattern: /^gemini/i, providerType: ProviderType.gemini },
  { pattern: /^palm/i, providerType: ProviderType.gemini },

  // Groq patterns
  { pattern: /^llama-?3/i, providerType: ProviderType.groq },
  { pattern: /^mixtral/i, providerType: ProviderType.groq },

  // Mistral patterns
  { pattern: /^mistral/i, providerType: ProviderType.mistral },
  { pattern: /^codestral/i, providerType: ProviderType.mistral },

  // xAI patterns
  { pattern: /^grok/i, providerType: ProviderType.xai },

  // DeepSeek patterns
  { pattern: /^deepseek/i, providerType: ProviderType.custom_openai },

  // Perplexity patterns
  { pattern: /^sonar/i, providerType: ProviderType.perplexity },

  // Cerebras patterns
  { pattern: /^cerebras/i, providerType: ProviderType.cerebras },
];

// ─── Auto-Resolution Priority ───────────────────────────────────────────────────

/**
 * When using "auto/" prefix, providers are tried in this priority order
 * based on model availability and reliability.
 */
const AUTO_RESOLUTION_PRIORITY: ProviderType[] = [
  ProviderType.anthropic,
  ProviderType.openai,
  ProviderType.gemini,
  ProviderType.groq,
  ProviderType.mistral,
  ProviderType.xai,
  ProviderType.openrouter,
  ProviderType.perplexity,
  ProviderType.cerebras,
  ProviderType.ollama,
];

// ─── ModelIdResolver Class ───────────────────────────────────────────────────────

export class ModelIdResolver {
  private aliases: Map<string, string> = new Map();
  private customPrefixes: Map<string, ProviderType> = new Map();
  private availableProviders: Set<ProviderType> = new Set();

  constructor() {
    // Register built-in aliases
    for (const [alias, resolved] of Object.entries(BUILTIN_ALIASES)) {
      this.aliases.set(alias.toLowerCase(), resolved);
    }
  }

  // ─── Core Resolution ─────────────────────────────────────────────────────────

  /**
   * Resolve a model ID string to a concrete provider + model combo.
   *
   * Accepts:
   *   - "provider/model" format: e.g., "anthropic/claude-sonnet-4-5"
   *   - Alias: e.g., "claude" → "anthropic/claude-sonnet-4-5"
   *   - Bare model: e.g., "gpt-5" (auto-detects provider)
   *   - "auto/model": e.g., "auto/claude-sonnet-4-5" (finds best available)
   */
  resolve(modelId: string): ResolvedModelId {
    const normalized = modelId.trim();

    // 1. Check if it's an alias
    const aliasLookup = this.aliases.get(normalized.toLowerCase());
    if (aliasLookup) {
      const resolved = this.parseProviderModelFormat(aliasLookup);
      if (resolved) {
        return {
          ...resolved,
          originalId: modelId,
          fromAlias: true,
          alias: normalized,
        };
      }
    }

    // 2. Check if it's "provider/model" format
    if (normalized.includes('/')) {
      const parts = normalized.split('/');
      const prefix = parts[0].toLowerCase();
      const model = parts.slice(1).join('/');

      // Handle "auto/" prefix
      if (prefix === 'auto') {
        return this.resolveAuto(model, modelId);
      }

      // Resolve prefix to provider type
      const providerType = this.resolvePrefix(prefix);
      if (providerType) {
        return {
          providerType,
          model,
          originalId: modelId,
        };
      }

      // Unknown prefix — treat the whole thing as a model name
      return this.resolveByModelPattern(normalized, modelId);
    }

    // 3. Try to infer from model name patterns
    return this.resolveByModelPattern(normalized, modelId);
  }

  /**
   * Resolve "auto/model" to the best available provider for that model.
   * Considers provider availability, health, and priority.
   */
  resolveAuto(modelId: string, originalId?: string): ResolvedModelId {
    // First, try to determine which provider(s) support this model
    const inferredProvider = this.inferProviderFromModel(modelId);

    if (inferredProvider) {
      // Check if the inferred provider is available
      if (this.availableProviders.size === 0 || this.availableProviders.has(inferredProvider)) {
        return {
          providerType: inferredProvider,
          model: modelId,
          originalId: originalId || `auto/${modelId}`,
        };
      }
    }

    // Fall back to trying providers in priority order
    for (const providerType of AUTO_RESOLUTION_PRIORITY) {
      if (this.availableProviders.size === 0 || this.availableProviders.has(providerType)) {
        return {
          providerType,
          model: modelId,
          originalId: originalId || `auto/${modelId}`,
        };
      }
    }

    // Last resort: return with anthropic as default
    return {
      providerType: ProviderType.anthropic,
      model: modelId,
      originalId: originalId || `auto/${modelId}`,
    };
  }

  // ─── Alias Management ────────────────────────────────────────────────────────

  /**
   * Register an alias that maps to a "provider/model" string.
   * e.g., registerAlias("claude", "anthropic/claude-sonnet-4-5")
   */
  registerAlias(alias: string, resolved: string): void {
    this.aliases.set(alias.toLowerCase(), resolved);
  }

  /**
   * Remove a registered alias.
   */
  removeAlias(alias: string): boolean {
    // Prevent removing built-in aliases
    if (BUILTIN_ALIASES[alias.toLowerCase()]) {
      return false;
    }
    return this.aliases.delete(alias.toLowerCase());
  }

  /**
   * List all registered aliases.
   */
  listAliases(): Array<{ alias: string; resolved: string; isBuiltIn: boolean }> {
    const result: Array<{ alias: string; resolved: string; isBuiltIn: boolean }> = [];
    for (const [alias, resolved] of this.aliases) {
      result.push({
        alias,
        resolved,
        isBuiltIn: alias in BUILTIN_ALIASES,
      });
    }
    return result.sort((a, b) => a.alias.localeCompare(b.alias));
  }

  // ─── Provider Availability ────────────────────────────────────────────────────

  /**
   * Register a provider as available for auto-resolution.
   */
  registerAvailableProvider(providerType: ProviderType): void {
    this.availableProviders.add(providerType);
  }

  /**
   * Unregister a provider from auto-resolution.
   */
  unregisterAvailableProvider(providerType: ProviderType): void {
    this.availableProviders.delete(providerType);
  }

  /**
   * Set all available providers at once.
   */
  setAvailableProviders(providers: ProviderType[]): void {
    this.availableProviders.clear();
    for (const p of providers) {
      this.availableProviders.add(p);
    }
  }

  // ─── Custom Prefix Management ─────────────────────────────────────────────────

  /**
   * Register a custom prefix mapping.
   * e.g., registerCustomPrefix("my-provider", ProviderType.custom_openai)
   */
  registerCustomPrefix(prefix: string, providerType: ProviderType): void {
    this.customPrefixes.set(prefix.toLowerCase(), providerType);
  }

  // ─── List Helpers ────────────────────────────────────────────────────────────

  /**
   * List all known provider prefixes and their mappings.
   */
  listProviders(): Array<{ prefix: string; providerType: ProviderType; isCustom: boolean }> {
    const result: Array<{ prefix: string; providerType: ProviderType; isCustom: boolean }> = [];

    for (const [prefix, providerType] of Object.entries(PROVIDER_PREFIX_MAP)) {
      result.push({ prefix, providerType, isCustom: false });
    }

    for (const [prefix, providerType] of this.customPrefixes) {
      result.push({ prefix, providerType, isCustom: true });
    }

    return result.sort((a, b) => a.prefix.localeCompare(b.prefix));
  }

  /**
   * Get all known model IDs (from aliases + common models).
   */
  listKnownModels(): Array<{ id: string; providerType: ProviderType; model: string; isAlias: boolean }> {
    const result: Array<{ id: string; providerType: ProviderType; model: string; isAlias: boolean }> = [];

    // From aliases
    for (const [alias, resolved] of this.aliases) {
      const parsed = this.parseProviderModelFormat(resolved);
      if (parsed) {
        result.push({
          id: alias,
          providerType: parsed.providerType,
          model: parsed.model,
          isAlias: true,
        });
      }
    }

    return result;
  }

  // ─── Format Helpers ──────────────────────────────────────────────────────────

  /**
   * Format a provider + model into "provider/model" format.
   */
  format(providerType: ProviderType, model: string): string {
    const prefix = this.getProviderPrefix(providerType);
    return `${prefix}/${model}`;
  }

  /**
   * Check if a string is in "provider/model" format.
   */
  isProviderModelFormat(id: string): boolean {
    if (!id.includes('/')) return false;
    const prefix = id.split('/')[0].toLowerCase();
    return prefix in PROVIDER_PREFIX_MAP || this.customPrefixes.has(prefix);
  }

  /**
   * Check if a string is a known alias.
   */
  isAlias(id: string): boolean {
    return this.aliases.has(id.toLowerCase());
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private resolvePrefix(prefix: string): ProviderType | null {
    // Check custom prefixes first
    const custom = this.customPrefixes.get(prefix);
    if (custom) return custom;

    // Then check built-in prefix map
    return PROVIDER_PREFIX_MAP[prefix] || null;
  }

  private parseProviderModelFormat(id: string): ResolvedModelId | null {
    if (!id.includes('/')) return null;

    const parts = id.split('/');
    const prefix = parts[0].toLowerCase();
    const model = parts.slice(1).join('/');

    const providerType = this.resolvePrefix(prefix);
    if (providerType) {
      return {
        providerType,
        model,
        originalId: id,
      };
    }

    return null;
  }

  private resolveByModelPattern(model: string, originalId: string): ResolvedModelId {
    const inferredProvider = this.inferProviderFromModel(model);

    if (inferredProvider) {
      return {
        providerType: inferredProvider,
        model,
        originalId,
      };
    }

    // Default to openrouter as it supports many models
    return {
      providerType: ProviderType.openrouter,
      model,
      originalId,
    };
  }

  private inferProviderFromModel(model: string): ProviderType | null {
    for (const { pattern, providerType } of MODEL_PATTERN_MAP) {
      if (pattern.test(model)) {
        return providerType;
      }
    }
    return null;
  }

  private getProviderPrefix(providerType: ProviderType): string {
    // Find the shortest/most common prefix for a provider type
    for (const [prefix, type] of Object.entries(PROVIDER_PREFIX_MAP)) {
      if (type === providerType) {
        return prefix;
      }
    }
    return providerType;
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────────

let instance: ModelIdResolver | null = null;

export function getModelIdResolver(): ModelIdResolver {
  if (!instance) {
    instance = new ModelIdResolver();
  }
  return instance;
}

export function setModelIdResolver(resolver: ModelIdResolver): void {
  instance = resolver;
}

export function resetModelIdResolver(): void {
  instance = null;
}
