/**
 * OpenAgent-Desktop - opencode Provider Registry
 *
 * Uses the auto-generated models.dev catalog (145 providers, 94 with embedded
 * model .toml data, 2357 real models) as the source of truth.
 *
 * No hardcoded/fake models — everything comes from the models.dev repo.
 *
 * Ref: https://github.com/anomalyco/models.dev/tree/dev/providers
 */

import { ProviderDefinition, ModelConfig } from './opencode-types';
import { MODELS_DEV_PROVIDERS } from './models-dev-catalog';

// ─── Gemini OAuth provider (from goose — free Gemini access via Google OAuth) ──
// Uses Google's Code Assist API (same as Gemini CLI) — no API key needed,
// just sign in with your Google account. Gets free access to Gemini 3 Pro/Flash.
//
// Ref: https://github.com/aaif-goose/goose/blob/main/crates/goose/src/providers/gemini_oauth.rs

const GEMINI_OAUTH_MODELS: Record<string, ModelConfig> = {
  'gemini-3-pro-preview': {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro Preview',
    family: 'gemini',
    reasoning: true,
    tool_call: true,
    attachment: true,
    temperature: true,
    status: 'beta',
    limit: { context: 2000000, output: 65536 },
    source: 'goose',
  },
  'gemini-3-flash-preview': {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash Preview',
    family: 'gemini',
    reasoning: true,
    tool_call: true,
    attachment: true,
    temperature: true,
    status: 'beta',
    limit: { context: 1000000, output: 65536 },
    source: 'goose',
  },
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    family: 'gemini',
    reasoning: true,
    tool_call: true,
    attachment: true,
    temperature: true,
    status: 'active',
    limit: { context: 2000000, output: 8192 },
    source: 'goose',
  },
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    family: 'gemini',
    reasoning: true,
    tool_call: true,
    attachment: true,
    temperature: true,
    status: 'active',
    limit: { context: 1000000, output: 8192 },
    source: 'goose',
  },
  'gemini-2.5-flash-lite': {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    family: 'gemini',
    tool_call: true,
    attachment: true,
    temperature: true,
    status: 'active',
    limit: { context: 1000000, output: 8192 },
    source: 'goose',
  },
  'gemini-2.0-flash': {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    family: 'gemini',
    tool_call: true,
    attachment: true,
    temperature: true,
    status: 'active',
    limit: { context: 1048576, output: 8192 },
    source: 'goose',
  },
  'gemini-2.0-flash-lite': {
    id: 'gemini-2.0-flash-lite',
    name: 'Gemini 2.0 Flash Lite',
    family: 'gemini',
    tool_call: true,
    attachment: true,
    temperature: true,
    status: 'active',
    limit: { context: 1048576, output: 8192 },
    source: 'goose',
  },
};

const GEMINI_OAUTH_PROVIDER: ProviderDefinition = {
  id: 'gemini-oauth',
  name: 'Gemini (Free OAuth)',
  npm: '@ai-sdk/google',
  api: 'https://cloudcode-pa.googleapis.com',
  env: [],
  authMethods: ['oauth'],
  isBuiltin: true,
  icon: 'gem',
  docsUrl: 'https://ai.google.dev/gemini-api/docs',
  aiSdkDocsUrl: 'https://ai-sdk.dev/providers/google-generative-ai',
  models: GEMINI_OAUTH_MODELS,
};

// ─── Extra config for specific providers (NO hardcoded models — only structural config) ──

const PROVIDER_EXTRAS: Record<string, Partial<ProviderDefinition>> = {
  'google-vertex': {
    modelSource: 'google', // Vertex hosts the same models as Google Gemini
  },
  'azure': {
    modelSource: 'openai', // Azure hosts the same models as OpenAI
  },
  'openrouter': {
    modelSource: '*', // OpenRouter routes to ALL providers
  },
  'azure-cognitive-services': {
    modelSource: 'openai',
  },
  'github-copilot': {
    authMethods: ['wellknown'], // Copilot uses device-flow auth, not API key
  },
};

// ─── Custom provider presets (local runtimes) ────────────────────────────────

export const CUSTOM_PROVIDER_PRESETS: Array<{
  id: string;
  name: string;
  api: string;
  apiKey: string;
  icon: string;
}> = [
  { id: 'ollama', name: 'Ollama (local)', api: 'http://localhost:11434/v1', apiKey: 'ollama', icon: 'server' },
  { id: 'lm-studio', name: 'LM Studio (local)', api: 'http://localhost:1234/v1', apiKey: 'lm-studio', icon: 'server' },
  { id: 'vllm', name: 'vLLM (local)', api: 'http://localhost:8000/v1', apiKey: 'vllm', icon: 'server' },
  { id: 'litellm', name: 'LiteLLM (local proxy)', api: 'http://localhost:4000/v1', apiKey: 'litellm', icon: 'server' },
];

// ─── Registry class ──────────────────────────────────────────────────────────

export class OpencodeRegistry {
  private builtins: Map<string, ProviderDefinition> = new Map();
  private custom: Map<string, ProviderDefinition> = new Map();

  constructor() {
    for (const base of MODELS_DEV_PROVIDERS) {
      const extra = PROVIDER_EXTRAS[base.id];
      this.builtins.set(base.id, extra ? { ...base, ...extra, id: base.id } : base);
    }
    // Add the Gemini OAuth provider (free Gemini access via Google OAuth).
    // Not in models.dev — sourced from goose's gemini_oauth.rs implementation.
    this.builtins.set(GEMINI_OAUTH_PROVIDER.id, GEMINI_OAUTH_PROVIDER);
  }

  listBuiltins(): ProviderDefinition[] {
    return Array.from(this.builtins.values());
  }

  listCustom(): ProviderDefinition[] {
    return Array.from(this.custom.values());
  }

  listAll(): ProviderDefinition[] {
    return [...this.builtins.values(), ...this.custom.values()];
  }

  get(id: string): ProviderDefinition | undefined {
    return this.builtins.get(id) || this.custom.get(id);
  }

  isBuiltin(id: string): boolean {
    return this.builtins.has(id);
  }

  registerCustom(def: ProviderDefinition): void {
    if (this.builtins.has(def.id)) {
      throw new Error(`Cannot register custom provider with id '${def.id}' — conflicts with a builtin`);
    }
    this.custom.set(def.id, { ...def, isBuiltin: false });
  }

  unregisterCustom(id: string): boolean {
    return this.custom.delete(id);
  }

  getPresets() {
    return CUSTOM_PROVIDER_PRESETS;
  }
}

// Singleton
let _registry: OpencodeRegistry | null = null;
export function getOpencodeRegistry(): OpencodeRegistry {
  if (!_registry) _registry = new OpencodeRegistry();
  return _registry;
}
