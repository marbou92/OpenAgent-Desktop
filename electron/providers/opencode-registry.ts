/**
 * OpenAgent-Desktop - opencode Provider Registry
 *
 * Uses the auto-generated models.dev catalog (145 providers) as the source
 * of truth for provider definitions. Each provider has: id, name, npm package,
 * API URL, env vars, docs URL, and auth methods — all sourced from the
 * provider.toml files in the models.dev GitHub repo.
 *
 * The 11 opencode well-known providers get extra config (hardcoded models,
 * modelSource mapping, GitHub Copilot device flow) layered on top.
 *
 * Ref: https://github.com/anomalyco/models.dev/tree/dev/providers
 */

import { ProviderDefinition } from './opencode-types';
import { MODELS_DEV_PROVIDERS } from './models-dev-catalog';

// ─── Extra config for specific providers (layered on top of the catalog) ─────

const PROVIDER_EXTRAS: Record<string, Partial<ProviderDefinition>> = {
  'google-vertex': {
    modelSource: 'google',
    models: {
      'gemini-2.0-flash': { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Vertex)', tool_call: true, limit: { context: 1048576, output: 8192 }, status: 'active' },
      'gemini-1.5-pro': { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Vertex)', tool_call: true, limit: { context: 2097152, output: 8192 }, status: 'active' },
      'gemini-1.5-flash': { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Vertex)', tool_call: true, limit: { context: 1048576, output: 8192 }, status: 'active' },
    },
  },
  'azure': {
    modelSource: 'openai',
  },
  'openrouter': {
    modelSource: '*',
  },
  'github-copilot': {
    authMethods: ['wellknown'],
    models: {
      'gpt-4o': { id: 'gpt-4o', name: 'GPT-4o (Copilot)', tool_call: true, limit: { context: 128000, output: 16384 }, status: 'active' },
      'gpt-4o-mini': { id: 'gpt-4o-mini', name: 'GPT-4o mini (Copilot)', tool_call: true, limit: { context: 128000, output: 16384 }, status: 'active' },
      'gpt-4-turbo': { id: 'gpt-4-turbo', name: 'GPT-4 Turbo (Copilot)', tool_call: true, limit: { context: 128000, output: 4096 }, status: 'active' },
      'claude-3.5-sonnet': { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (Copilot)', tool_call: true, limit: { context: 200000, output: 8192 }, status: 'active' },
      'claude-3.5-haiku': { id: 'claude-3.5-haiku', name: 'Claude 3.5 Haiku (Copilot)', tool_call: true, limit: { context: 200000, output: 8192 }, status: 'active' },
      'o3-mini': { id: 'o3-mini', name: 'o3-mini (Copilot)', tool_call: true, reasoning: true, limit: { context: 200000, output: 100000 }, status: 'active' },
      'gemini-2.0-flash': { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Copilot)', tool_call: true, limit: { context: 1048576, output: 8192 }, status: 'active' },
    },
  },
  'amazon-bedrock': {
    models: {
      'anthropic.claude-3-5-sonnet-20240620-v1:0': { id: 'anthropic.claude-3-5-sonnet-20240620-v1:0', name: 'Claude 3.5 Sonnet (Bedrock)', tool_call: true, limit: { context: 200000, output: 4096 }, status: 'active' },
      'anthropic.claude-3-5-haiku-20241022-v1:0': { id: 'anthropic.claude-3-5-haiku-20241022-v1:0', name: 'Claude 3.5 Haiku (Bedrock)', tool_call: true, limit: { context: 200000, output: 8192 }, status: 'active' },
      'anthropic.claude-3-opus-20240229-v1:0': { id: 'anthropic.claude-3-opus-20240229-v1:0', name: 'Claude 3 Opus (Bedrock)', tool_call: true, limit: { context: 200000, output: 4096 }, status: 'active' },
      'anthropic.claude-3-haiku-20240307-v1:0': { id: 'anthropic.claude-3-haiku-20240307-v1:0', name: 'Claude 3 Haiku (Bedrock)', tool_call: true, limit: { context: 200000, output: 4096 }, status: 'active' },
      'meta.llama3-1-70b-instruct-v1:0': { id: 'meta.llama3-1-70b-instruct-v1:0', name: 'Llama 3.1 70B (Bedrock)', tool_call: true, limit: { context: 128000, output: 2048 }, status: 'active' },
      'meta.llama3-1-8b-instruct-v1:0': { id: 'meta.llama3-1-8b-instruct-v1:0', name: 'Llama 3.1 8B (Bedrock)', tool_call: true, limit: { context: 128000, output: 2048 }, status: 'active' },
      'mistral.mistral-large-2407-v1:0': { id: 'mistral.mistral-large-2407-v1:0', name: 'Mistral Large (Bedrock)', tool_call: true, limit: { context: 128000, output: 8192 }, status: 'active' },
      'amazon.nova-pro-v1:0': { id: 'amazon.nova-pro-v1:0', name: 'Amazon Nova Pro (Bedrock)', tool_call: true, limit: { context: 300000, output: 4096 }, status: 'active' },
      'amazon.nova-lite-v1:0': { id: 'amazon.nova-lite-v1:0', name: 'Amazon Nova Lite (Bedrock)', tool_call: true, limit: { context: 300000, output: 4096 }, status: 'active' },
      'amazon.nova-micro-v1:0': { id: 'amazon.nova-micro-v1:0', name: 'Amazon Nova Micro (Bedrock)', tool_call: true, limit: { context: 128000, output: 4096 }, status: 'active' },
    },
  },
  'gitlab': {
    models: {
      'claude-3.5-sonnet': { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (Duo)', tool_call: true, limit: { context: 200000, output: 8192 }, status: 'active' },
      'gpt-4o': { id: 'gpt-4o', name: 'GPT-4o (Duo)', tool_call: true, limit: { context: 128000, output: 16384 }, status: 'active' },
      'gpt-4o-mini': { id: 'gpt-4o-mini', name: 'GPT-4o mini (Duo)', tool_call: true, limit: { context: 128000, output: 16384 }, status: 'active' },
      'mistral-large': { id: 'mistral-large', name: 'Mistral Large (Duo)', tool_call: true, limit: { context: 128000, output: 8192 }, status: 'active' },
    },
  },
  'opencode': {
    models: {
      'zen-1': { id: 'zen-1', name: 'Zen 1', tool_call: true, reasoning: true, limit: { context: 200000, output: 32768 }, status: 'active' },
      'zen-1-mini': { id: 'zen-1-mini', name: 'Zen 1 Mini', tool_call: true, limit: { context: 128000, output: 16384 }, status: 'active' },
      'zen-1-flash': { id: 'zen-1-flash', name: 'Zen 1 Flash', tool_call: true, limit: { context: 128000, output: 8192 }, status: 'active' },
    },
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
    // Start with the 145 providers from models.dev, then apply extras.
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
