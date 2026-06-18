/**
 * OpenAgent-Desktop - opencode Provider Registry
 *
 * The 11 well-known opencode provider IDs, hardcoded as an offline fallback.
 * When models.dev is reachable, dynamic providers + models are merged in.
 *
 * Provider IDs match opencode exactly:
 *   anthropic, openai, google, google-vertex, github-copilot, amazon-bedrock,
 *   azure, openrouter, mistral, gitlab, opencode
 *
 * Ref: https://github.com/anomalyco/opencode/blob/dev/packages/core/src/provider.ts
 */

import { ProviderDefinition } from './opencode-types';

export const OPENCODE_PROVIDERS: ProviderDefinition[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    npm: '@ai-sdk/anthropic',
    api: 'https://api.anthropic.com',
    env: ['ANTHROPIC_API_KEY'],
    authMethods: ['api', 'oauth'],
    isBuiltin: true,
    icon: 'brain',
    docsUrl: 'https://docs.anthropic.com',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    npm: '@ai-sdk/openai',
    api: 'https://api.openai.com/v1',
    env: ['OPENAI_API_KEY'],
    authMethods: ['api', 'oauth'],
    isBuiltin: true,
    icon: 'sparkles',
    docsUrl: 'https://platform.openai.com/docs',
  },
  {
    id: 'google',
    name: 'Google Gemini',
    npm: '@ai-sdk/google',
    api: 'https://generativelanguage.googleapis.com',
    env: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_API_KEY'],
    authMethods: ['api'],
    isBuiltin: true,
    icon: 'gem',
    docsUrl: 'https://ai.google.dev/docs',
  },
  {
    id: 'google-vertex',
    name: 'Google Vertex AI',
    npm: '@ai-sdk/google-vertex',
    env: ['GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_VERTEX_PROJECT', 'GOOGLE_VERTEX_LOCATION'],
    authMethods: ['api'],
    isBuiltin: true,
    icon: 'server',
    docsUrl: 'https://cloud.google.com/vertex-ai',
  },
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    npm: 'opencode-github-copilot',
    api: 'https://api.githubcopilot.com',
    env: ['GITHUB_TOKEN'],
    authMethods: ['wellknown'],
    isBuiltin: true,
    icon: 'github',
    docsUrl: 'https://docs.github.com/copilot',
  },
  {
    id: 'amazon-bedrock',
    name: 'Amazon Bedrock',
    npm: '@ai-sdk/amazon-bedrock',
    env: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'],
    authMethods: ['api'],
    isBuiltin: true,
    icon: 'server',
    docsUrl: 'https://docs.aws.amazon.com/bedrock',
  },
  {
    id: 'azure',
    name: 'Azure OpenAI',
    npm: '@ai-sdk/azure',
    env: ['AZURE_API_KEY', 'AZURE_API_BASE', 'AZURE_API_VERSION'],
    authMethods: ['api'],
    isBuiltin: true,
    icon: 'cloud',
    docsUrl: 'https://learn.microsoft.com/azure/ai-services/openai',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    npm: '@ai-sdk/openai-compatible',
    api: 'https://openrouter.ai/api/v1',
    env: ['OPENROUTER_API_KEY'],
    authMethods: ['api'],
    isBuiltin: true,
    icon: 'router',
    docsUrl: 'https://openrouter.ai/docs',
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    npm: '@ai-sdk/mistral',
    api: 'https://api.mistral.ai/v1',
    env: ['MISTRAL_API_KEY'],
    authMethods: ['api'],
    isBuiltin: true,
    icon: 'wind',
    docsUrl: 'https://docs.mistral.ai',
  },
  {
    id: 'gitlab',
    name: 'GitLab Duo',
    npm: 'opencode-gitlab',
    api: 'https://cloud.gitlab.com/api/v1',
    env: ['GITLAB_TOKEN'],
    authMethods: ['api'],
    isBuiltin: true,
    icon: 'gitlab',
    docsUrl: 'https://docs.gitlab.com/ee/user/duo_chat',
  },
  {
    id: 'opencode',
    name: 'OpenCode Zen',
    npm: '@opencode-ai/zen',
    api: 'https://api.opencode.ai',
    env: ['OPENCODE_API_KEY'],
    authMethods: ['api'],
    isBuiltin: true,
    icon: 'zen',
    docsUrl: 'https://opencode.ai/docs',
  },
];

// ─── Custom provider presets (local runtimes) ────────────────────────────────

export const CUSTOM_PROVIDER_PRESETS: Array<{
  id: string;
  name: string;
  api: string;
  apiKey: string;
  icon: string;
}> = [
  {
    id: 'ollama',
    name: 'Ollama (local)',
    api: 'http://localhost:11434/v1',
    apiKey: 'ollama',
    icon: 'server',
  },
  {
    id: 'lm-studio',
    name: 'LM Studio (local)',
    api: 'http://localhost:1234/v1',
    apiKey: 'lm-studio',
    icon: 'server',
  },
  {
    id: 'vllm',
    name: 'vLLM (local)',
    api: 'http://localhost:8000/v1',
    apiKey: 'vllm',
    icon: 'server',
  },
  {
    id: 'litellm',
    name: 'LiteLLM (local proxy)',
    api: 'http://localhost:4000/v1',
    apiKey: 'litellm',
    icon: 'server',
  },
];

// ─── Registry class ──────────────────────────────────────────────────────────

export class OpencodeRegistry {
  private builtins: Map<string, ProviderDefinition> = new Map();
  private custom: Map<string, ProviderDefinition> = new Map();

  constructor() {
    for (const p of OPENCODE_PROVIDERS) {
      this.builtins.set(p.id, p);
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
