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

import { ProviderDefinition } from './opencode-types';
import { MODELS_DEV_PROVIDERS } from './models-dev-catalog';

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
