/**
 * OpenAgent-Desktop - OpenAI-Compatible Generic Provider
 * 
 * A single provider implementation that works for ALL OpenAI-compatible APIs.
 * This fills the 23+ provider type gaps by configuring different base URLs and presets.
 * Supports: lm_studio, docker_model_runner, litellm, novita, avian, futurmix,
 * routstr, saladcloud, scaleway, venice, cerebras, xai, near_ai, ovhcloud,
 * tetrate, chatgpt_codex, atomic_chat, ramalama, ollama_cloud, amazon_sagemaker,
 * snowflake, vmware_tanzu, custom_openai, perplexity
 */

import { BaseProvider } from './base-provider';
import {
  ProviderConfig,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  ProviderMetadata,
  Message,
  TokenUsage,
} from './types';

export interface OpenAICompatiblePreset {
  providerType: string;
  displayName: string;
  defaultHost: string;
  defaultBasePath: string;
  defaultModels: string[];
  requiresApiKey: boolean;
  envVarApiKey: string;
  envVarHost: string;
  description: string;
  website: string;
}

// All presets for OpenAI-compatible providers
export const OPENAI_COMPATIBLE_PRESETS: OpenAICompatiblePreset[] = [
  {
    providerType: 'lm_studio',
    displayName: 'LM Studio',
    defaultHost: 'http://localhost:1234',
    defaultBasePath: '/v1',
    defaultModels: ['local-model'],
    requiresApiKey: false,
    envVarApiKey: 'LM_STUDIO_API_KEY',
    envVarHost: 'LM_STUDIO_API_HOST',
    description: 'Local LLM inference with LM Studio',
    website: 'https://lmstudio.ai',
  },
  {
    providerType: 'docker_model_runner',
    displayName: 'Docker Model Runner',
    defaultHost: 'http://localhost:12434',
    defaultBasePath: '/engines/llama.cpp/v1',
    defaultModels: ['ai/smollm2'],
    requiresApiKey: false,
    envVarApiKey: 'DOCKER_MODEL_RUNNER_API_KEY',
    envVarHost: 'DOCKER_MODEL_RUNNER_HOST',
    description: 'Docker Desktop Model Runner for local LLM inference',
    website: 'https://docs.docker.com/ai/',
  },
  {
    providerType: 'litellm',
    displayName: 'LiteLLM',
    defaultHost: 'http://localhost:4000',
    defaultBasePath: '/v1',
    defaultModels: ['gpt-4', 'claude-3'],
    requiresApiKey: false,
    envVarApiKey: 'LITELLM_API_KEY',
    envVarHost: 'LITELLM_API_HOST',
    description: 'OpenAI-compatible proxy for 100+ LLM providers',
    website: 'https://litellm.ai',
  },
  {
    providerType: 'novita',
    displayName: 'Novita AI',
    defaultHost: 'https://api.novita.ai',
    defaultBasePath: '/v3/openai',
    defaultModels: ['meta-llama/llama-3-70b-instruct'],
    requiresApiKey: true,
    envVarApiKey: 'NOVITA_API_KEY',
    envVarHost: 'NOVITA_API_HOST',
    description: 'GPU cloud with LLM inference',
    website: 'https://novita.ai',
  },
  {
    providerType: 'avian',
    displayName: 'Avian',
    defaultHost: 'https://api.avian.io',
    defaultBasePath: '/v1',
    defaultModels: ['gpt-4'],
    requiresApiKey: true,
    envVarApiKey: 'AVIAN_API_KEY',
    envVarHost: 'AVIAN_API_HOST',
    description: 'AI infrastructure platform',
    website: 'https://avian.io',
  },
  {
    providerType: 'futurmix',
    displayName: 'FuturMix',
    defaultHost: 'https://api.futurmix.ai',
    defaultBasePath: '/v1',
    defaultModels: ['default'],
    requiresApiKey: true,
    envVarApiKey: 'FUTURMIX_API_KEY',
    envVarHost: 'FUTURMIX_API_HOST',
    description: 'AI model hosting platform',
    website: 'https://futurmix.ai',
  },
  {
    providerType: 'perplexity',
    displayName: 'Perplexity',
    defaultHost: 'https://api.perplexity.ai',
    defaultBasePath: '',
    defaultModels: ['sonar', 'sonar-pro'],
    requiresApiKey: true,
    envVarApiKey: 'PERPLEXITY_API_KEY',
    envVarHost: 'PERPLEXITY_API_HOST',
    description: 'AI-powered search and answers',
    website: 'https://perplexity.ai',
  },
  {
    providerType: 'routstr',
    displayName: 'Routstr',
    defaultHost: 'https://api.routstr.com',
    defaultBasePath: '/v1',
    defaultModels: ['default'],
    requiresApiKey: true,
    envVarApiKey: 'ROUTSTR_API_KEY',
    envVarHost: 'ROUTSTR_API_HOST',
    description: 'AI routing platform',
    website: 'https://routstr.com',
  },
  {
    providerType: 'saladcloud',
    displayName: 'SaladCloud',
    defaultHost: 'https://api.salad.com',
    defaultBasePath: '/v1',
    defaultModels: ['meta-llama/llama-3-70b'],
    requiresApiKey: true,
    envVarApiKey: 'SALADCLOUD_API_KEY',
    envVarHost: 'SALADCLOUD_API_HOST',
    description: 'GPU cloud for AI inference',
    website: 'https://salad.com',
  },
  {
    providerType: 'scaleway',
    displayName: 'Scaleway',
    defaultHost: 'https://api.scaleway.com/llm/v1',
    defaultBasePath: '',
    defaultModels: ['llama-3-70b-instruct'],
    requiresApiKey: true,
    envVarApiKey: 'SCALEWAY_API_KEY',
    envVarHost: 'SCALEWAY_API_HOST',
    description: 'European cloud with LLM inference',
    website: 'https://scaleway.com',
  },
  {
    providerType: 'venice',
    displayName: 'Venice',
    defaultHost: 'https://api.venice.ai',
    defaultBasePath: '/api/v1',
    defaultModels: ['llama-3-70b'],
    requiresApiKey: true,
    envVarApiKey: 'VENICE_API_KEY',
    envVarHost: 'VENICE_API_HOST',
    description: 'Privacy-focused AI inference',
    website: 'https://venice.ai',
  },
  {
    providerType: 'cerebras',
    displayName: 'Cerebras',
    defaultHost: 'https://api.cerebras.ai',
    defaultBasePath: '/v1',
    defaultModels: ['llama-3.3-70b'],
    requiresApiKey: true,
    envVarApiKey: 'CEREBRAS_API_KEY',
    envVarHost: 'CEREBRAS_API_HOST',
    description: 'Ultra-fast AI inference on wafer-scale engine',
    website: 'https://cerebras.ai',
  },
  {
    providerType: 'xai',
    displayName: 'xAI (Grok)',
    defaultHost: 'https://api.x.ai',
    defaultBasePath: '/v1',
    defaultModels: ['grok-3', 'grok-3-mini'],
    requiresApiKey: true,
    envVarApiKey: 'XAI_API_KEY',
    envVarHost: 'XAI_API_HOST',
    description: 'xAI Grok models',
    website: 'https://x.ai',
  },
  {
    providerType: 'near_ai',
    displayName: 'NEAR AI',
    defaultHost: 'https://api.near.ai',
    defaultBasePath: '/v1',
    defaultModels: ['default'],
    requiresApiKey: true,
    envVarApiKey: 'NEAR_AI_API_KEY',
    envVarHost: 'NEAR_AI_API_HOST',
    description: 'Decentralized AI platform',
    website: 'https://near.ai',
  },
  {
    providerType: 'ovhcloud',
    displayName: 'OVHcloud AI',
    defaultHost: 'https://gra.ai.ai.endpoints.cloud.ovh.net',
    defaultBasePath: '/v1',
    defaultModels: ['Mistral-7B-Instruct'],
    requiresApiKey: true,
    envVarApiKey: 'OVHCLOUD_API_KEY',
    envVarHost: 'OVHCLOUD_API_HOST',
    description: 'European cloud AI endpoints',
    website: 'https://ovhcloud.com',
  },
  {
    providerType: 'tetrate',
    displayName: 'Tetrate',
    defaultHost: 'https://api.tetrate.io',
    defaultBasePath: '/v1',
    defaultModels: ['default'],
    requiresApiKey: true,
    envVarApiKey: 'TETRATE_API_KEY',
    envVarHost: 'TETRATE_API_HOST',
    description: 'Enterprise AI gateway',
    website: 'https://tetrate.io',
  },
  {
    providerType: 'chatgpt_codex',
    displayName: 'ChatGPT Codex',
    defaultHost: 'https://api.openai.com',
    defaultBasePath: '/v1',
    defaultModels: ['codex-mini'],
    requiresApiKey: true,
    envVarApiKey: 'OPENAI_API_KEY',
    envVarHost: 'OPENAI_API_HOST',
    description: 'OpenAI Codex for code generation',
    website: 'https://openai.com',
  },
  {
    providerType: 'atomic_chat',
    displayName: 'Atomic Chat',
    defaultHost: 'https://api.atomic.chat',
    defaultBasePath: '/v1',
    defaultModels: ['default'],
    requiresApiKey: true,
    envVarApiKey: 'ATOMIC_CHAT_API_KEY',
    envVarHost: 'ATOMIC_CHAT_API_HOST',
    description: 'AI chat platform',
    website: 'https://atomic.chat',
  },
  {
    providerType: 'ramalama',
    displayName: 'Ramalama',
    defaultHost: 'http://localhost:8080',
    defaultBasePath: '/v1',
    defaultModels: ['local-model'],
    requiresApiKey: false,
    envVarApiKey: 'RAMALAMA_API_KEY',
    envVarHost: 'RAMALAMA_API_HOST',
    description: 'Local AI model management',
    website: 'https://github.com/containers/ramalama',
  },
  {
    providerType: 'ollama_cloud',
    displayName: 'Ollama Cloud',
    defaultHost: 'https://api.ollama.cloud',
    defaultBasePath: '/v1',
    defaultModels: ['llama-3-70b'],
    requiresApiKey: true,
    envVarApiKey: 'OLLAMA_CLOUD_API_KEY',
    envVarHost: 'OLLAMA_CLOUD_API_HOST',
    description: 'Cloud-hosted Ollama inference',
    website: 'https://ollama.com',
  },
  {
    providerType: 'amazon_sagemaker',
    displayName: 'Amazon SageMaker',
    defaultHost: 'https://runtime.sagemaker.us-east-1.amazonaws.com',
    defaultBasePath: '',
    defaultModels: ['custom-endpoint'],
    requiresApiKey: true,
    envVarApiKey: 'AWS_ACCESS_KEY_ID',
    envVarHost: 'AWS_SAGEMAKER_ENDPOINT',
    description: 'AWS SageMaker AI endpoints',
    website: 'https://aws.amazon.com/sagemaker',
  },
  {
    providerType: 'snowflake',
    displayName: 'Snowflake Cortex',
    defaultHost: 'https://api.snowflake.com',
    defaultBasePath: '/v1',
    defaultModels: ['snowflake-arctic'],
    requiresApiKey: true,
    envVarApiKey: 'SNOWFLAKE_API_KEY',
    envVarHost: 'SNOWFLAKE_API_HOST',
    description: 'Snowflake AI data cloud',
    website: 'https://snowflake.com',
  },
  {
    providerType: 'vmware_tanzu',
    displayName: 'VMware Tanzu AI',
    defaultHost: 'https://api.tanzu.vmware.com',
    defaultBasePath: '/v1',
    defaultModels: ['default'],
    requiresApiKey: true,
    envVarApiKey: 'VMWARE_TANZU_API_KEY',
    envVarHost: 'VMWARE_TANZU_API_HOST',
    description: 'VMware Tanzu AI platform',
    website: 'https://tanzu.vmware.com',
  },
  {
    providerType: 'custom_openai',
    displayName: 'Custom OpenAI API',
    defaultHost: 'http://localhost:8000',
    defaultBasePath: '/v1',
    defaultModels: ['custom-model'],
    requiresApiKey: false,
    envVarApiKey: 'CUSTOM_OPENAI_API_KEY',
    envVarHost: 'CUSTOM_OPENAI_API_HOST',
    description: 'Any OpenAI-compatible API endpoint',
    website: '',
  },
];

export class OpenAICompatibleProvider extends BaseProvider {
  private preset: OpenAICompatiblePreset;

  constructor(config: ProviderConfig, preset: OpenAICompatiblePreset) {
    super(config);
    this.preset = preset;
  }

  protected getDefaultHost(): string {
    return this.preset.defaultHost;
  }

  protected getDefaultBasePath(): string {
    return this.preset.defaultBasePath;
  }

  protected getAuthHeaders(): Record<string, string> {
    const apiKey = this.getApiKey();
    if (!apiKey) return {};
    return { Authorization: `Bearer ${apiKey}` };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    return this.openAIChat(request);
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    yield* this.openAIStream(request);
  }

  async test(): Promise<boolean> {
    try {
      const response = await this.openAIChat({
        messages: [{ role: 'user', content: 'hi' }],
        model: this.config.models?.[0] || this.preset.defaultModels[0],
        maxTokens: 1,
      });
      return !!response;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const models = await this.openAIListModels();
      return models;
    } catch {
      return this.config.models || this.preset.defaultModels;
    }
  }

  // ─── API Key ────────────────────────────────────────────────────────────────

  protected getApiKey(): string {
    return this.config.apiKey || this.getEnvVar(this.preset.envVarApiKey) || '';
  }

  // ─── OpenAI-Compatible Chat (Non-Streaming) ──────────────────────────────────

  protected async openAIChat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();
    const apiKey = this.getApiKey();

    try {
      const messages = request.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const body: Record<string, unknown> = {
        model: request.model,
        messages,
        stream: false,
      };

      if (request.maxTokens !== undefined) {
        body.max_tokens = request.maxTokens;
      }
      if (request.temperature !== undefined) {
        body.temperature = request.temperature;
      }

      const url = `${this.getBaseUrl()}/chat/completions`;
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await this.withRetry(async () => {
        return this.makeRequest(url, {
          method: 'POST',
          body: JSON.stringify(body),
          headers,
        });
      });

      const data = await response.json() as Record<string, any>;
      const choice = data.choices?.[0];
      const content = choice?.message?.content || '';

      const message: Message = {
        role: 'assistant',
        content,
      };

      if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
        message.toolCalls = choice.message.tool_calls.map((tc: any) => {
          let args: Record<string, any> = {};
          try {
            args = JSON.parse(tc.function.arguments);
          } catch {
            args = {};
          }
          return {
            id: tc.id || this.generateId(),
            name: tc.function.name,
            arguments: args,
          };
        });
      }

      const usage: TokenUsage | undefined = data.usage
        ? {
            promptTokens: data.usage.prompt_tokens || 0,
            completionTokens: data.usage.completion_tokens || 0,
            totalTokens: data.usage.total_tokens || 0,
          }
        : undefined;

      this.logRequest(request.model, Date.now() - startTime, false, usage);

      return {
        id: data.id || this.generateId(),
        message,
        usage,
      };
    } catch (error) {
      this.logRequest(
        request.model,
        Date.now() - startTime,
        false,
        undefined,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  // ─── OpenAI-Compatible Streaming ─────────────────────────────────────────────

  protected async *openAIStream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    const startTime = Date.now();
    const apiKey = this.getApiKey();

    const messages = request.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const body: Record<string, unknown> = {
      model: request.model,
      messages,
      stream: true,
    };

    if (request.maxTokens !== undefined) {
      body.max_tokens = request.maxTokens;
    }
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    const url = `${this.getBaseUrl()}/chat/completions`;
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    let usage: TokenUsage | undefined;
    const pendingToolCalls: Map<
      number,
      { id: string; name: string; arguments: string }
    > = new Map();

    try {
      const response = await this.withRetry(async () => {
        return this.makeRequest(url, {
          method: 'POST',
          body: JSON.stringify(body),
          headers,
        });
      });

      for await (const event of this.parseSSEStream(response)) {
        if (event.data === '[DONE]') break;

        let parsed: any;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          continue;
        }

        if (parsed.error) {
          yield { type: 'done' };
          return;
        }

        const choice = parsed.choices?.[0];
        if (!choice) {
          if (parsed.usage) {
            usage = {
              promptTokens: parsed.usage.prompt_tokens || 0,
              completionTokens: parsed.usage.completion_tokens || 0,
              totalTokens: parsed.usage.total_tokens || 0,
            };
            yield { type: 'usage', usage };
          }
          continue;
        }

        const delta = choice.delta;
        if (delta?.content) {
          yield { type: 'content', content: delta.content };
        }

        if (delta?.reasoning_content || delta?.reasoning) {
          yield {
            type: 'thinking',
            content: delta.reasoning_content || delta.reasoning,
          };
        }

        if (delta?.tool_calls) {
          for (const tcDelta of delta.tool_calls) {
            const index = tcDelta.index ?? 0;
            if (!pendingToolCalls.has(index)) {
              pendingToolCalls.set(index, {
                id: tcDelta.id || '',
                name: tcDelta.function?.name || '',
                arguments: '',
              });
            }
            const pending = pendingToolCalls.get(index)!;
            if (tcDelta.id) pending.id = tcDelta.id;
            if (tcDelta.function?.name) pending.name = tcDelta.function.name;
            if (tcDelta.function?.arguments) {
              pending.arguments += tcDelta.function.arguments;
            }
          }
        }

        if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
          if (pendingToolCalls.size > 0) {
            for (const [, tc] of pendingToolCalls) {
              let args: Record<string, any> = {};
              try {
                args = JSON.parse(tc.arguments);
              } catch {
                args = {};
              }
              yield {
                type: 'tool_call',
                toolCall: { id: tc.id || this.generateId(), name: tc.name, arguments: args },
              };
            }
            pendingToolCalls.clear();
          }
        }

        if (parsed.usage) {
          usage = {
            promptTokens: parsed.usage.prompt_tokens || 0,
            completionTokens: parsed.usage.completion_tokens || 0,
            totalTokens: parsed.usage.total_tokens || 0,
          };
          yield { type: 'usage', usage };
        }
      }

      yield { type: 'done' };
      this.logRequest(request.model, Date.now() - startTime, true, usage);
    } catch (error) {
      this.logRequest(
        request.model,
        Date.now() - startTime,
        true,
        undefined,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  // ─── OpenAI-Compatible List Models ───────────────────────────────────────────

  protected async openAIListModels(): Promise<string[]> {
    const apiKey = this.getApiKey();
    const url = `${this.getBaseUrl()}/models`;

    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await this.makeRequest(url, {
      method: 'GET',
      headers,
    });

    const data = (await response.json()) as Record<string, any>;
    if (data.data && Array.isArray(data.data)) {
      return data.data
        .map((m: any) => m.id)
        .filter((id: string) => typeof id === 'string')
        .sort();
    }

    return this.config.models || this.preset.defaultModels;
  }

  // ─── Static Metadata Helper ─────────────────────────────────────────────────

  static getMetadata(preset: OpenAICompatiblePreset): ProviderMetadata {
    return {
      type: preset.providerType as any,
      displayName: preset.displayName,
      description: preset.description,
      requiresApiKey: preset.requiresApiKey,
      defaultHost: preset.defaultHost,
      defaultBasePath: preset.defaultBasePath,
      defaultModels: preset.defaultModels,
      supportsStreaming: true,
      supportsToolUse: true,
      supportsThinking: false,
      supportsPromptCaching: false,
      envVarApiKey: preset.envVarApiKey,
      envVarHost: preset.envVarHost,
      website: preset.website,
    };
  }
}
