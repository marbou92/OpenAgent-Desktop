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
    modelSource: 'google', // Vertex hosts the same models as Google Gemini
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
  {
    id: 'amazon-bedrock',
    name: 'Amazon Bedrock',
    npm: '@ai-sdk/amazon-bedrock',
    env: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'],
    authMethods: ['api'],
    isBuiltin: true,
    icon: 'server',
    docsUrl: 'https://docs.aws.amazon.com/bedrock',
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
  {
    id: 'azure',
    name: 'Azure OpenAI',
    npm: '@ai-sdk/azure',
    env: ['AZURE_API_KEY', 'AZURE_API_BASE', 'AZURE_API_VERSION'],
    authMethods: ['api'],
    isBuiltin: true,
    icon: 'cloud',
    docsUrl: 'https://learn.microsoft.com/azure/ai-services/openai',
    modelSource: 'openai', // Azure hosts the same models as OpenAI
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
    modelSource: '*', // OpenRouter routes to ALL providers — show all models.dev entries
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
    models: {
      'claude-3.5-sonnet': { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (Duo)', tool_call: true, limit: { context: 200000, output: 8192 }, status: 'active' },
      'gpt-4o': { id: 'gpt-4o', name: 'GPT-4o (Duo)', tool_call: true, limit: { context: 128000, output: 16384 }, status: 'active' },
      'gpt-4o-mini': { id: 'gpt-4o-mini', name: 'GPT-4o mini (Duo)', tool_call: true, limit: { context: 128000, output: 16384 }, status: 'active' },
      'mistral-large': { id: 'mistral-large', name: 'Mistral Large (Duo)', tool_call: true, limit: { context: 128000, output: 8192 }, status: 'active' },
    },
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
    models: {
      'zen-1': { id: 'zen-1', name: 'Zen 1', tool_call: true, reasoning: true, limit: { context: 200000, output: 32768 }, status: 'active' },
      'zen-1-mini': { id: 'zen-1-mini', name: 'Zen 1 Mini', tool_call: true, limit: { context: 128000, output: 16384 }, status: 'active' },
      'zen-1-flash': { id: 'zen-1-flash', name: 'Zen 1 Flash', tool_call: true, limit: { context: 128000, output: 8192 }, status: 'active' },
    },
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
