/**
 * OpenAgent-Desktop - Provider Registry
 *
 * Static catalog of the 12 built-in providers, modeled on opencode's
 * provider definitions. Each entry declares:
 *   - protocol family (which adapter to use)
 *   - default base URL
 *   - supported auth methods (in priority order)
 *   - env-var fallback name
 *   - models endpoint (for dynamic discovery)
 *   - hardcoded model presets
 *
 * Custom user-added providers (e.g. "my OpenAI proxy at https://...") get
 * their own ProviderDefinition at runtime, with protocol='openai' and
 * isBuiltin=false.
 */

import { ProviderDefinition, ProviderProtocol } from './v3-types';

// ─── Helper: build an OpenAI-protocol provider ────────────────────────────────

function openaiCompatible(opts: {
  id: string;
  name: string;
  baseUrl: string;
  envVar?: string;
  modelsEndpoint?: string;
  presets: { id: string; displayName: string; contextWindow?: number; supportsStreaming?: boolean; supportsToolUse?: boolean; supportsThinking?: boolean; maxOutputTokens?: number }[];
  docsUrl?: string;
}): ProviderDefinition {
  return {
    id: opts.id,
    name: opts.name,
    protocol: 'openai',
    defaultBaseUrl: opts.baseUrl,
    supportedAuthMethods: ['api_key', 'env_var'],
    envVarName: opts.envVar,
    modelsEndpoint: opts.modelsEndpoint ?? '/v1/models',
    modelPresets: opts.presets,
    docsUrl: opts.docsUrl,
    isBuiltin: true,
  };
}

// ─── The 12 built-in providers ────────────────────────────────────────────────

export const BUILTIN_PROVIDERS: ProviderDefinition[] = [
  // ── Big 6 ────────────────────────────────────────────────────────────────
  {
    id: 'openai',
    name: 'OpenAI',
    icon: 'sparkles',
    protocol: 'openai',
    defaultBaseUrl: 'https://api.openai.com/v1',
    supportedAuthMethods: ['api_key', 'env_var', 'oauth'],
    envVarName: 'OPENAI_API_KEY',
    modelsEndpoint: '/models',
    docsUrl: 'https://platform.openai.com/docs',
    isBuiltin: true,
    modelPresets: [
      { id: 'gpt-4o', displayName: 'GPT-4o', contextWindow: 128000, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 16384 },
      { id: 'gpt-4o-mini', displayName: 'GPT-4o mini', contextWindow: 128000, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 16384 },
      { id: 'gpt-4-turbo', displayName: 'GPT-4 Turbo', contextWindow: 128000, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 4096 },
      { id: 'gpt-4', displayName: 'GPT-4', contextWindow: 8192, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 4096 },
      { id: 'gpt-3.5-turbo', displayName: 'GPT-3.5 Turbo', contextWindow: 16385, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 4096 },
      { id: 'o1', displayName: 'o1', contextWindow: 200000, supportsToolUse: false, supportsStreaming: false, supportsThinking: true, maxOutputTokens: 100000 },
      { id: 'o1-mini', displayName: 'o1-mini', contextWindow: 128000, supportsToolUse: false, supportsStreaming: false, supportsThinking: true, maxOutputTokens: 65536 },
      { id: 'o3-mini', displayName: 'o3-mini', contextWindow: 200000, supportsToolUse: true, supportsStreaming: true, supportsThinking: true, maxOutputTokens: 100000 },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    icon: 'brain',
    protocol: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com',
    supportedAuthMethods: ['api_key', 'env_var', 'oauth'],
    envVarName: 'ANTHROPIC_API_KEY',
    modelsEndpoint: '/v1/models',
    docsUrl: 'https://docs.anthropic.com',
    isBuiltin: true,
    modelPresets: [
      { id: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet', contextWindow: 200000, supportsToolUse: true, supportsStreaming: true, supportsThinking: true, maxOutputTokens: 8192 },
      { id: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku', contextWindow: 200000, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 8192 },
      { id: 'claude-3-opus-20240229', displayName: 'Claude 3 Opus', contextWindow: 200000, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 4096 },
      { id: 'claude-3-sonnet-20240229', displayName: 'Claude 3 Sonnet', contextWindow: 200000, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 4096 },
      { id: 'claude-3-haiku-20240307', displayName: 'Claude 3 Haiku', contextWindow: 200000, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 4096 },
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    icon: 'gem',
    protocol: 'gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    supportedAuthMethods: ['api_key', 'env_var'],
    envVarName: 'GOOGLE_API_KEY',
    modelsEndpoint: '/v1beta/models',
    docsUrl: 'https://ai.google.dev/docs',
    isBuiltin: true,
    modelPresets: [
      { id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', contextWindow: 1048576, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 8192 },
      { id: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', contextWindow: 2097152, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 8192 },
      { id: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash', contextWindow: 1048576, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 8192 },
      { id: 'gemini-1.5-flash-8b', displayName: 'Gemini 1.5 Flash 8B', contextWindow: 1048576, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 8192 },
    ],
  },
  {
    id: 'azure-openai',
    name: 'Azure OpenAI',
    icon: 'cloud',
    protocol: 'openai',
    defaultBaseUrl: '', // user provides their deployment URL
    supportedAuthMethods: ['api_key', 'azure_ad'],
    envVarName: 'AZURE_OPENAI_API_KEY',
    modelsEndpoint: '/openai/deployments?api-version=2024-10-21',
    docsUrl: 'https://learn.microsoft.com/azure/ai-services/openai',
    isBuiltin: true,
    modelPresets: [
      // Azure uses deployment names, but the underlying models are the same as OpenAI.
      { id: 'gpt-4o', displayName: 'GPT-4o (Azure)', contextWindow: 128000, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 16384 },
      { id: 'gpt-4o-mini', displayName: 'GPT-4o mini (Azure)', contextWindow: 128000, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 16384 },
      { id: 'gpt-4', displayName: 'GPT-4 (Azure)', contextWindow: 8192, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 4096 },
      { id: 'gpt-35-turbo', displayName: 'GPT-3.5 Turbo (Azure)', contextWindow: 16385, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 4096 },
    ],
  },
  {
    id: 'bedrock',
    name: 'AWS Bedrock',
    icon: 'server',
    protocol: 'bedrock',
    defaultBaseUrl: '', // derived from region at call time
    supportedAuthMethods: ['env_var'],
    envVarName: 'AWS_ACCESS_KEY_ID', // also reads AWS_SECRET_ACCESS_KEY, AWS_REGION
    // Bedrock has no single /models endpoint — model discovery is via ListFoundationModels
    modelsEndpoint: undefined,
    docsUrl: 'https://docs.aws.amazon.com/bedrock',
    isBuiltin: true,
    modelPresets: [
      { id: 'anthropic.claude-3-5-sonnet-20240620-v1:0', displayName: 'Claude 3.5 Sonnet (Bedrock)', contextWindow: 200000, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 4096 },
      { id: 'anthropic.claude-3-haiku-20240307-v1:0', displayName: 'Claude 3 Haiku (Bedrock)', contextWindow: 200000, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 4096 },
      { id: 'meta.llama3-1-70b-instruct-v1:0', displayName: 'Llama 3.1 70B (Bedrock)', contextWindow: 128000, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 2048 },
      { id: 'mistral.mistral-large-2407-v1:0', displayName: 'Mistral Large (Bedrock)', contextWindow: 128000, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 8192 },
    ],
  },
  {
    id: 'vertex',
    name: 'Google Vertex AI',
    icon: 'server',
    protocol: 'vertex',
    defaultBaseUrl: '', // derived from project+region at call time
    supportedAuthMethods: ['env_var', 'azure_ad'],
    envVarName: 'GOOGLE_VERTEX_PROJECT', // also reads GOOGLE_VERTEX_REGION
    modelsEndpoint: undefined,
    docsUrl: 'https://cloud.google.com/vertex-ai',
    isBuiltin: true,
    modelPresets: [
      { id: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro (Vertex)', contextWindow: 2097152, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 8192 },
      { id: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash (Vertex)', contextWindow: 1048576, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 8192 },
      { id: 'claude-3-5-sonnet@20241022', displayName: 'Claude 3.5 Sonnet (Vertex)', contextWindow: 200000, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 8192 },
    ],
  },

  // ── Routers / aggregators ────────────────────────────────────────────────
  openaiCompatible({
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    envVar: 'OPENROUTER_API_KEY',
    modelsEndpoint: '/models',
    docsUrl: 'https://openrouter.ai/docs',
    presets: [
      { id: 'openrouter/auto', displayName: 'Auto (cheapest)', contextWindow: 128000, supportsToolUse: true, supportsStreaming: true },
      { id: 'anthropic/claude-3.5-sonnet', displayName: 'Claude 3.5 Sonnet (via OpenRouter)', contextWindow: 200000, supportsToolUse: true, supportsStreaming: true },
      { id: 'openai/gpt-4o', displayName: 'GPT-4o (via OpenRouter)', contextWindow: 128000, supportsToolUse: true, supportsStreaming: true },
      { id: 'google/gemini-flash-1.5', displayName: 'Gemini 1.5 Flash (via OpenRouter)', contextWindow: 1048576, supportsToolUse: true, supportsStreaming: true },
      { id: 'meta-llama/llama-3.1-70b-instruct', displayName: 'Llama 3.1 70B (via OpenRouter)', contextWindow: 128000, supportsToolUse: true, supportsStreaming: true },
    ],
  }),
  openaiCompatible({
    id: 'mistral',
    name: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    envVar: 'MISTRAL_API_KEY',
    modelsEndpoint: '/models',
    docsUrl: 'https://docs.mistral.ai',
    presets: [
      { id: 'mistral-large-latest', displayName: 'Mistral Large', contextWindow: 128000, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 8191 },
      { id: 'mistral-medium-latest', displayName: 'Mistral Medium', contextWindow: 32000, supportsToolUse: true, supportsStreaming: true },
      { id: 'mistral-small-latest', displayName: 'Mistral Small', contextWindow: 32000, supportsToolUse: true, supportsStreaming: true },
      { id: 'open-mistral-nemo', displayName: 'Mistral Nemo', contextWindow: 128000, supportsToolUse: true, supportsStreaming: true },
      { id: 'codestral-latest', displayName: 'Codestral', contextWindow: 32000, supportsToolUse: true, supportsStreaming: true },
    ],
  }),
  openaiCompatible({
    id: 'cohere',
    name: 'Cohere',
    baseUrl: 'https://api.cohere.com/v2',
    envVar: 'COHERE_API_KEY',
    modelsEndpoint: '/models',
    docsUrl: 'https://docs.cohere.com',
    presets: [
      { id: 'command-r-plus-08-2024', displayName: 'Command R+', contextWindow: 128000, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 4096 },
      { id: 'command-r-08-2024', displayName: 'Command R', contextWindow: 128000, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 4096 },
      { id: 'command-r7b-12-2024', displayName: 'Command R7B', contextWindow: 128000, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 4096 },
    ],
  }),
  openaiCompatible({
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    envVar: 'GROQ_API_KEY',
    modelsEndpoint: '/models',
    docsUrl: 'https://console.groq.com/docs',
    presets: [
      { id: 'llama-3.3-70b-versatile', displayName: 'Llama 3.3 70B', contextWindow: 128000, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 32768 },
      { id: 'llama-3.1-8b-instant', displayName: 'Llama 3.1 8B Instant', contextWindow: 128000, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 8192 },
      { id: 'mixtral-8x7b-32768', displayName: 'Mixtral 8x7B', contextWindow: 32768, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 32768 },
      { id: 'gemma2-9b-it', displayName: 'Gemma 2 9B', contextWindow: 8192, supportsToolUse: false, supportsStreaming: true, maxOutputTokens: 8192 },
    ],
  }),
  openaiCompatible({
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    envVar: 'DEEPSEEK_API_KEY',
    modelsEndpoint: '/models',
    docsUrl: 'https://api-docs.deepseek.com',
    presets: [
      { id: 'deepseek-chat', displayName: 'DeepSeek Chat', contextWindow: 64000, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 8192 },
      { id: 'deepseek-reasoner', displayName: 'DeepSeek Reasoner', contextWindow: 64000, supportsToolUse: false, supportsStreaming: true, supportsThinking: true, maxOutputTokens: 8192 },
    ],
  }),
  openaiCompatible({
    id: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    envVar: 'TOGETHER_API_KEY',
    modelsEndpoint: '/models',
    docsUrl: 'https://docs.together.ai',
    presets: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', displayName: 'Llama 3.3 70B Turbo', contextWindow: 128000, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 4096 },
      { id: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo', displayName: 'Llama 3.1 405B Turbo', contextWindow: 128000, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 4096 },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', displayName: 'Qwen 2.5 72B Turbo', contextWindow: 32768, supportsToolUse: true, supportsStreaming: true, maxOutputTokens: 4096 },
    ],
  }),
];

// ─── Registry class ──────────────────────────────────────────────────────────

export class ProviderRegistry {
  private definitions: Map<string, ProviderDefinition> = new Map();
  private customDefinitions: Map<string, ProviderDefinition> = new Map();

  constructor() {
    for (const def of BUILTIN_PROVIDERS) {
      this.definitions.set(def.id, def);
    }
  }

  listBuiltins(): ProviderDefinition[] {
    return Array.from(this.definitions.values());
  }

  listCustom(): ProviderDefinition[] {
    return Array.from(this.customDefinitions.values());
  }

  listAll(): ProviderDefinition[] {
    return [...this.definitions.values(), ...this.customDefinitions.values()];
  }

  get(id: string): ProviderDefinition | undefined {
    return this.definitions.get(id) || this.customDefinitions.get(id);
  }

  isBuiltin(id: string): boolean {
    return this.definitions.has(id);
  }

  /** Register a user-defined custom provider (OpenAI-compatible proxy etc.). */
  registerCustom(def: ProviderDefinition): void {
    if (this.definitions.has(def.id)) {
      throw new Error(`Cannot register custom provider with id '${def.id}' — id conflicts with a built-in provider`);
    }
    this.customDefinitions.set(def.id, { ...def, isBuiltin: false });
  }

  unregisterCustom(id: string): boolean {
    return this.customDefinitions.delete(id);
  }

  /** Get the protocol family for a provider. Useful for picking the adapter. */
  getProtocol(id: string): ProviderProtocol | undefined {
    return this.get(id)?.protocol;
  }
}

// Singleton registry — there's no reason to have multiple instances.
let _registry: ProviderRegistry | null = null;
export function getProviderRegistry(): ProviderRegistry {
  if (!_registry) _registry = new ProviderRegistry();
  return _registry;
}
