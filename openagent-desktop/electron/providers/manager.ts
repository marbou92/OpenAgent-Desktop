/**
 * OpenAgent-Desktop - Provider Manager
 * Central registry and management for all AI providers:
 * - Registry of all provider instances
 * - CRUD for provider configurations (persisted in electron-store)
 * - getDefault() / setDefault()
 * - test(id) - test connection to a provider
 * - chat(providerId, request) - route to correct provider
 * - chatStream(providerId, request) - streaming route
 * - listModels(providerId) - list available models
 * - Auto-detect providers from environment variables
 * - Mesh LLM: route different tasks to different providers
 * - Provider health monitoring
 * - Fallback chain: if primary fails, try backup providers
 */

import {
  ProviderType,
  ProviderConfig,
  ProviderInterface,
  ProviderMetadata,
  ProviderRegistryEntry,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  HealthStatus,
  HealthCheck,
  MeshRoute,
  FallbackChain,
  AutoDetectResult,
  ProviderError,
  ProviderErrorType,
} from './types';
import { AnthropicProvider } from './anthropic-provider';
import { OpenAIProvider } from './openai-provider';
import { GeminiProvider } from './gemini-provider';
import { AzureOpenAIProvider } from './azure-openai-provider';
import { AmazonBedrockProvider } from './amazon-bedrock-provider';
import { GcpVertexProvider } from './gcp-vertex-provider';
import { GroqProvider } from './groq-provider';
import { MistralProvider } from './mistral-provider';
import { OllamaProvider } from './ollama-provider';
import { OpenRouterProvider } from './openrouter-provider';
import { OpenCodeProvider } from './opencode-provider';
import { GitHubCopilotProvider } from './github-copilot-provider';

// ─── OpenAI-Compatible Thin Wrappers ───────────────────────────────────────────

class LmStudioProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) { super(config); }
  protected getDefaultHost(): string { return this.config.apiHost || 'http://localhost:1234'; }
  protected getDefaultBasePath(): string { return '/v1'; }
  protected getApiKey(): string { return this.config.apiKey || ''; }
}

class DockerModelRunnerProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) { super(config); }
  protected getDefaultHost(): string { return this.config.apiHost || 'http://localhost:12434'; }
  protected getDefaultBasePath(): string { return '/engines/llama.cpp/v1'; }
  protected getApiKey(): string { return this.config.apiKey || ''; }
}

class LiteLLMProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) { super(config); }
  protected getDefaultHost(): string { return this.config.apiHost || 'http://localhost:4000'; }
  protected getDefaultBasePath(): string { return '/v1'; }
  protected getApiKey(): string {
    return this.config.apiKey || this.getEnvVar('LITELLM_API_KEY') || '';
  }
}

class DatabricksProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) { super(config); }
  protected getDefaultHost(): string {
    return this.config.apiHost || this.getEnvVar('DATABRICKS_HOST') || '';
  }
  protected getDefaultBasePath(): string { return '/serving-endpoints'; }
  protected getApiKey(): string {
    return this.config.apiKey || this.getEnvVar('DATABRICKS_TOKEN') || '';
  }
}

class NovitaProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) { super(config); }
  protected getDefaultHost(): string { return 'https://api.novita.ai'; }
  protected getDefaultBasePath(): string { return '/v3/openai'; }
  protected getApiKey(): string {
    return this.config.apiKey || this.getEnvVar('NOVITA_API_KEY') || '';
  }
}

class AvianProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) { super(config); }
  protected getDefaultHost(): string { return 'https://api.avian.io'; }
  protected getDefaultBasePath(): string { return '/v1'; }
  protected getApiKey(): string {
    return this.config.apiKey || this.getEnvVar('AVIAN_API_KEY') || '';
  }
}

class FuturMixProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) { super(config); }
  protected getDefaultHost(): string { return 'https://api.futurmix.ai'; }
  protected getDefaultBasePath(): string { return '/v1'; }
  protected getApiKey(): string {
    return this.config.apiKey || this.getEnvVar('FUTURMIX_API_KEY') || '';
  }
}

class PerplexityProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) { super(config); }
  protected getDefaultHost(): string { return 'https://api.perplexity.ai'; }
  protected getDefaultBasePath(): string { return ''; }
  protected getApiKey(): string {
    return this.config.apiKey || this.getEnvVar('PERPLEXITY_API_KEY') || '';
  }
}

class NearAIProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) { super(config); }
  protected getDefaultHost(): string { return 'https://api.near.ai'; }
  protected getDefaultBasePath(): string { return '/v1'; }
  protected getApiKey(): string {
    return this.config.apiKey || this.getEnvVar('NEAR_AI_API_KEY') || '';
  }
}

class OvhcloudProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) { super(config); }
  protected getDefaultHost(): string {
    return this.config.apiHost || `https://gra.ai.cloud.ovh.net`;
  }
  protected getDefaultBasePath(): string { return '/v1'; }
  protected getApiKey(): string {
    return this.config.apiKey || this.getEnvVar('OVHCLOUD_API_KEY') || '';
  }
}

class RamalamaProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) { super(config); }
  protected getDefaultHost(): string {
    return this.config.apiHost || 'http://localhost:8080';
  }
  protected getDefaultBasePath(): string { return '/v1'; }
  protected getApiKey(): string { return this.config.apiKey || ''; }
}

class RoutstrProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) { super(config); }
  protected getDefaultHost(): string { return 'https://api.routstr.com'; }
  protected getDefaultBasePath(): string { return '/v1'; }
  protected getApiKey(): string {
    return this.config.apiKey || this.getEnvVar('ROUTSTR_API_KEY') || '';
  }
}

class SaladCloudProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) { super(config); }
  protected getDefaultHost(): string { return 'https://api.salad.com'; }
  protected getDefaultBasePath(): string { return '/v1'; }
  protected getApiKey(): string {
    return this.config.apiKey || this.getEnvVar('SALADCLOUD_API_KEY') || '';
  }
}

class ScalewayProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) { super(config); }
  protected getDefaultHost(): string { return 'https://api.scaleway.com/llm/v1'; }
  protected getDefaultBasePath(): string { return ''; }
  protected getApiKey(): string {
    return this.config.apiKey || this.getEnvVar('SCALEWAY_API_KEY') || '';
  }
}

class SnowflakeProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) { super(config); }
  protected getDefaultHost(): string {
    return this.config.apiHost || 'https://api.snowflakecomputing.com';
  }
  protected getDefaultBasePath(): string { return '/v1'; }
  protected getApiKey(): string {
    return this.config.apiKey || this.getEnvVar('SNOWFLAKE_API_KEY') || '';
  }
}

class VMwareTanzuProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) { super(config); }
  protected getDefaultHost(): string {
    return this.config.apiHost || 'http://localhost:8080';
  }
  protected getDefaultBasePath(): string { return '/v1'; }
  protected getApiKey(): string {
    return this.config.apiKey || this.getEnvVar('VMWARE_TANZU_API_KEY') || '';
  }
}

class TetrateProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) { super(config); }
  protected getDefaultHost(): string { return 'https://api.tetrate.io'; }
  protected getDefaultBasePath(): string { return '/v1'; }
  protected getApiKey(): string {
    return this.config.apiKey || this.getEnvVar('TETRATE_API_KEY') || '';
  }
}

class VeniceProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) { super(config); }
  protected getDefaultHost(): string { return 'https://api.venice.ai'; }
  protected getDefaultBasePath(): string { return '/api/v1'; }
  protected getApiKey(): string {
    return this.config.apiKey || this.getEnvVar('VENICE_API_KEY') || '';
  }
}

class CerebrasProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) { super(config); }
  protected getDefaultHost(): string { return 'https://api.cerebras.ai'; }
  protected getDefaultBasePath(): string { return '/v1'; }
  protected getApiKey(): string {
    return this.config.apiKey || this.getEnvVar('CEREBRAS_API_KEY') || '';
  }
}

class XAIProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) { super(config); }
  protected getDefaultHost(): string { return 'https://api.x.ai'; }
  protected getDefaultBasePath(): string { return '/v1'; }
  protected getApiKey(): string {
    return this.config.apiKey || this.getEnvVar('XAI_API_KEY') || '';
  }
}

class ChatGPTCodexProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) { super(config); }
  protected getDefaultHost(): string { return 'https://api.openai.com'; }
  protected getDefaultBasePath(): string { return '/v1'; }
  protected getApiKey(): string {
    return this.config.apiKey || this.getEnvVar('OPENAI_API_KEY') || '';
  }
}

class AtomicChatProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) { super(config); }
  protected getDefaultHost(): string { return 'https://api.atomic.chat'; }
  protected getDefaultBasePath(): string { return '/v1'; }
  protected getApiKey(): string {
    return this.config.apiKey || this.getEnvVar('ATOMIC_CHAT_API_KEY') || '';
  }
}

class CustomOpenAIProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) { super(config); }
  protected getDefaultHost(): string {
    return this.config.apiHost || 'http://localhost:8000';
  }
  protected getDefaultBasePath(): string {
    return this.config.apiBasePath || '/v1';
  }
  protected getApiKey(): string { return this.config.apiKey || ''; }
}

class OllamaCloudProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) { super(config); }
  protected getDefaultHost(): string {
    return this.config.apiHost || 'https://api.ollama.cloud';
  }
  protected getDefaultBasePath(): string { return '/v1'; }
  protected getApiKey(): string {
    return this.config.apiKey || this.getEnvVar('OLLAMA_CLOUD_API_KEY') || '';
  }
}

class AmazonSagemakerProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) { super(config); }
  protected getDefaultHost(): string {
    return this.config.apiHost || '';
  }
  protected getDefaultBasePath(): string {
    return this.config.apiBasePath || '';
  }
  protected getApiKey(): string {
    return this.config.apiKey || this.getEnvVar('AWS_ACCESS_KEY_ID') || '';
  }
}

// ─── Provider Metadata Registry ────────────────────────────────────────────────

const PROVIDER_METADATA: Record<ProviderType, ProviderMetadata> = {
  [ProviderType.anthropic]: {
    type: ProviderType.anthropic,
    displayName: 'Anthropic',
    description: 'Claude AI models by Anthropic',
    requiresApiKey: true,
    defaultHost: 'https://api.anthropic.com',
    defaultBasePath: '/v1',
    defaultModels: ['claude-4-20250514', 'claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: true,
    supportsPromptCaching: true,
    envVarApiKey: 'ANTHROPIC_API_KEY',
    envVarHost: 'ANTHROPIC_HOST',
    website: 'https://anthropic.com',
  },
  [ProviderType.openai]: {
    type: ProviderType.openai,
    displayName: 'OpenAI',
    description: 'GPT-4, o1, o3, and GPT-5 models by OpenAI',
    requiresApiKey: true,
    defaultHost: 'https://api.openai.com',
    defaultBasePath: '/v1',
    defaultModels: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: true,
    supportsPromptCaching: true,
    envVarApiKey: 'OPENAI_API_KEY',
    envVarHost: 'OPENAI_HOST',
    website: 'https://openai.com',
  },
  [ProviderType.openrouter]: {
    type: ProviderType.openrouter,
    displayName: 'OpenRouter',
    description: 'API gateway for 200+ AI models',
    requiresApiKey: true,
    defaultHost: 'https://openrouter.ai',
    defaultBasePath: '/api/v1',
    defaultModels: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o'],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'OPENROUTER_API_KEY',
    envVarHost: '',
    website: 'https://openrouter.ai',
  },
  [ProviderType.azure_openai]: {
    type: ProviderType.azure_openai,
    displayName: 'Azure OpenAI',
    description: 'OpenAI models via Azure cloud',
    requiresApiKey: true,
    defaultHost: '',
    defaultBasePath: '',
    defaultModels: ['gpt-4o', 'gpt-35-turbo'],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'AZURE_OPENAI_API_KEY',
    envVarHost: 'AZURE_OPENAI_ENDPOINT',
    website: 'https://azure.microsoft.com/en-us/products/ai-services/openai-service',
  },
  [ProviderType.gemini]: {
    type: ProviderType.gemini,
    displayName: 'Google Gemini',
    description: 'Gemini models by Google DeepMind',
    requiresApiKey: true,
    defaultHost: 'https://generativelanguage.googleapis.com',
    defaultBasePath: '/v1beta',
    defaultModels: ['gemini-2.5-pro-preview-05-06', 'gemini-2.0-flash'],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: true,
    supportsPromptCaching: true,
    envVarApiKey: 'GOOGLE_API_KEY',
    envVarHost: '',
    website: 'https://ai.google.dev',
  },
  [ProviderType.gcp_vertex]: {
    type: ProviderType.gcp_vertex,
    displayName: 'GCP Vertex AI',
    description: 'Gemini + Claude via Google Cloud Vertex AI',
    requiresApiKey: true,
    defaultHost: 'https://us-central1-aiplatform.googleapis.com',
    defaultBasePath: '',
    defaultModels: ['gemini-2.5-pro-preview-05-06', 'claude-3-5-sonnet-v2@20241022'],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: true,
    supportsPromptCaching: false,
    envVarApiKey: 'GOOGLE_APPLICATION_CREDENTIALS',
    envVarHost: 'GCP_LOCATION',
    website: 'https://cloud.google.com/vertex-ai',
  },
  [ProviderType.amazon_bedrock]: {
    type: ProviderType.amazon_bedrock,
    displayName: 'Amazon Bedrock',
    description: 'Foundation models via AWS Bedrock',
    requiresApiKey: true,
    defaultHost: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    defaultBasePath: '',
    defaultModels: ['anthropic.claude-3-5-sonnet-20241022-v2:0', 'amazon.nova-pro-v1:0'],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'AWS_ACCESS_KEY_ID',
    envVarHost: 'AWS_REGION',
    website: 'https://aws.amazon.com/bedrock',
  },
  [ProviderType.amazon_sagemaker]: {
    type: ProviderType.amazon_sagemaker,
    displayName: 'Amazon SageMaker',
    description: 'Custom model endpoints via SageMaker',
    requiresApiKey: true,
    defaultHost: '',
    defaultBasePath: '',
    defaultModels: [],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'AWS_ACCESS_KEY_ID',
    envVarHost: 'AWS_REGION',
    website: 'https://aws.amazon.com/sagemaker',
  },
  [ProviderType.groq]: {
    type: ProviderType.groq,
    displayName: 'Groq',
    description: 'Ultra-fast LLM inference with LPU technology',
    requiresApiKey: true,
    defaultHost: 'https://api.groq.com',
    defaultBasePath: '/openai/v1',
    defaultModels: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'GROQ_API_KEY',
    envVarHost: '',
    website: 'https://groq.com',
  },
  [ProviderType.mistral]: {
    type: ProviderType.mistral,
    displayName: 'Mistral AI',
    description: 'Mistral, Codestral, and Pixtral models',
    requiresApiKey: true,
    defaultHost: 'https://api.mistral.ai',
    defaultBasePath: '/v1',
    defaultModels: ['mistral-large-latest', 'codestral-latest'],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'MISTRAL_API_KEY',
    envVarHost: '',
    website: 'https://mistral.ai',
  },
  [ProviderType.ollama]: {
    type: ProviderType.ollama,
    displayName: 'Ollama',
    description: 'Run LLMs locally with Ollama',
    requiresApiKey: false,
    defaultHost: 'http://localhost:11434',
    defaultBasePath: '',
    defaultModels: ['llama3.1', 'mistral', 'codellama'],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: '',
    envVarHost: 'OLLAMA_HOST',
    website: 'https://ollama.com',
  },
  [ProviderType.ollama_cloud]: {
    type: ProviderType.ollama_cloud,
    displayName: 'Ollama Cloud',
    description: 'Ollama managed cloud service',
    requiresApiKey: true,
    defaultHost: 'https://api.ollama.cloud',
    defaultBasePath: '/v1',
    defaultModels: ['llama3.1', 'mistral'],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'OLLAMA_CLOUD_API_KEY',
    envVarHost: '',
    website: 'https://ollama.com',
  },
  [ProviderType.lm_studio]: {
    type: ProviderType.lm_studio,
    displayName: 'LM Studio',
    description: 'Run local models with LM Studio',
    requiresApiKey: false,
    defaultHost: 'http://localhost:1234',
    defaultBasePath: '/v1',
    defaultModels: [],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: '',
    envVarHost: '',
    website: 'https://lmstudio.ai',
  },
  [ProviderType.docker_model_runner]: {
    type: ProviderType.docker_model_runner,
    displayName: 'Docker Model Runner',
    description: 'Run AI models in Docker containers',
    requiresApiKey: false,
    defaultHost: 'http://localhost:12434',
    defaultBasePath: '/engines/llama.cpp/v1',
    defaultModels: [],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: '',
    envVarHost: '',
    website: 'https://docs.docker.com/ai/',
  },
  [ProviderType.litellm]: {
    type: ProviderType.litellm,
    displayName: 'LiteLLM',
    description: 'Unified API proxy for 100+ LLM providers',
    requiresApiKey: false,
    defaultHost: 'http://localhost:4000',
    defaultBasePath: '/v1',
    defaultModels: [],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'LITELLM_API_KEY',
    envVarHost: 'LITELLM_HOST',
    website: 'https://litellm.ai',
  },
  [ProviderType.databricks]: {
    type: ProviderType.databricks,
    displayName: 'Databricks',
    description: 'Databricks Model Serving endpoints',
    requiresApiKey: true,
    defaultHost: '',
    defaultBasePath: '/serving-endpoints',
    defaultModels: ['databricks-dbrx-instruct', 'databricks-mixtral-8x7b-instruct'],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'DATABRICKS_TOKEN',
    envVarHost: 'DATABRICKS_HOST',
    website: 'https://databricks.com',
  },
  [ProviderType.novita]: {
    type: ProviderType.novita,
    displayName: 'Novita AI',
    description: 'Affordable LLM API by Novita',
    requiresApiKey: true,
    defaultHost: 'https://api.novita.ai',
    defaultBasePath: '/v3/openai',
    defaultModels: ['meta-llama/llama-3.1-70b-instruct'],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'NOVITA_API_KEY',
    envVarHost: '',
    website: 'https://novita.ai',
  },
  [ProviderType.avian]: {
    type: ProviderType.avian,
    displayName: 'Avian',
    description: 'Avian AI API',
    requiresApiKey: true,
    defaultHost: 'https://api.avian.io',
    defaultBasePath: '/v1',
    defaultModels: [],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'AVIAN_API_KEY',
    envVarHost: '',
    website: 'https://avian.io',
  },
  [ProviderType.futurmix]: {
    type: ProviderType.futurmix,
    displayName: 'FuturMix',
    description: 'FuturMix AI API',
    requiresApiKey: true,
    defaultHost: 'https://api.futurmix.ai',
    defaultBasePath: '/v1',
    defaultModels: [],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'FUTURMIX_API_KEY',
    envVarHost: '',
    website: 'https://futurmix.ai',
  },
  [ProviderType.perplexity]: {
    type: ProviderType.perplexity,
    displayName: 'Perplexity',
    description: 'Perplexity AI search and chat',
    requiresApiKey: true,
    defaultHost: 'https://api.perplexity.ai',
    defaultBasePath: '',
    defaultModels: ['sonar-pro', 'sonar'],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'PERPLEXITY_API_KEY',
    envVarHost: '',
    website: 'https://perplexity.ai',
  },
  [ProviderType.near_ai]: {
    type: ProviderType.near_ai,
    displayName: 'NEAR AI',
    description: 'NEAR AI models and agents',
    requiresApiKey: true,
    defaultHost: 'https://api.near.ai',
    defaultBasePath: '/v1',
    defaultModels: [],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'NEAR_AI_API_KEY',
    envVarHost: '',
    website: 'https://near.ai',
  },
  [ProviderType.ovhcloud]: {
    type: ProviderType.ovhcloud,
    displayName: 'OVHcloud',
    description: 'OVHcloud AI Endpoints',
    requiresApiKey: true,
    defaultHost: 'https://gra.ai.cloud.ovh.net',
    defaultBasePath: '/v1',
    defaultModels: [],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'OVHCLOUD_API_KEY',
    envVarHost: '',
    website: 'https://ovhcloud.com',
  },
  [ProviderType.ramalama]: {
    type: ProviderType.ramalama,
    displayName: 'Ramalama',
    description: 'Ramalama local model runner',
    requiresApiKey: false,
    defaultHost: 'http://localhost:8080',
    defaultBasePath: '/v1',
    defaultModels: [],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: '',
    envVarHost: '',
    website: 'https://github.com/containers/ramalama',
  },
  [ProviderType.routstr]: {
    type: ProviderType.routstr,
    displayName: 'Routstr',
    description: 'Routstr AI API gateway',
    requiresApiKey: true,
    defaultHost: 'https://api.routstr.com',
    defaultBasePath: '/v1',
    defaultModels: [],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'ROUTSTR_API_KEY',
    envVarHost: '',
    website: 'https://routstr.com',
  },
  [ProviderType.saladcloud]: {
    type: ProviderType.saladcloud,
    displayName: 'SaladCloud',
    description: 'SaladCloud GPU inference',
    requiresApiKey: true,
    defaultHost: 'https://api.salad.com',
    defaultBasePath: '/v1',
    defaultModels: [],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'SALADCLOUD_API_KEY',
    envVarHost: '',
    website: 'https://salad.com',
  },
  [ProviderType.scaleway]: {
    type: ProviderType.scaleway,
    displayName: 'Scaleway',
    description: 'Scaleway AI inference',
    requiresApiKey: true,
    defaultHost: 'https://api.scaleway.com/llm/v1',
    defaultBasePath: '',
    defaultModels: [],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'SCALEWAY_API_KEY',
    envVarHost: '',
    website: 'https://scaleway.com',
  },
  [ProviderType.snowflake]: {
    type: ProviderType.snowflake,
    displayName: 'Snowflake',
    description: 'Snowflake Cortex AI',
    requiresApiKey: true,
    defaultHost: 'https://api.snowflakecomputing.com',
    defaultBasePath: '/v1',
    defaultModels: ['snowflake-arctic', 'mistral-large'],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'SNOWFLAKE_API_KEY',
    envVarHost: '',
    website: 'https://snowflake.com',
  },
  [ProviderType.vmware_tanzu]: {
    type: ProviderType.vmware_tanzu,
    displayName: 'VMware Tanzu',
    description: 'VMware Tanzu AI platform',
    requiresApiKey: true,
    defaultHost: 'http://localhost:8080',
    defaultBasePath: '/v1',
    defaultModels: [],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'VMWARE_TANZU_API_KEY',
    envVarHost: '',
    website: 'https://tanzu.vmware.com',
  },
  [ProviderType.tetrate]: {
    type: ProviderType.tetrate,
    displayName: 'Tetrate',
    description: 'Tetrate AI gateway',
    requiresApiKey: true,
    defaultHost: 'https://api.tetrate.io',
    defaultBasePath: '/v1',
    defaultModels: [],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'TETRATE_API_KEY',
    envVarHost: '',
    website: 'https://tetrate.io',
  },
  [ProviderType.venice]: {
    type: ProviderType.venice,
    displayName: 'Venice',
    description: 'Venice.ai privacy-focused AI',
    requiresApiKey: true,
    defaultHost: 'https://api.venice.ai',
    defaultBasePath: '/api/v1',
    defaultModels: [],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'VENICE_API_KEY',
    envVarHost: '',
    website: 'https://venice.ai',
  },
  [ProviderType.cerebras]: {
    type: ProviderType.cerebras,
    displayName: 'Cerebras',
    description: 'Cerebras ultra-fast AI inference',
    requiresApiKey: true,
    defaultHost: 'https://api.cerebras.ai',
    defaultBasePath: '/v1',
    defaultModels: ['llama-3.3-70b'],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'CEREBRAS_API_KEY',
    envVarHost: '',
    website: 'https://cerebras.ai',
  },
  [ProviderType.xai]: {
    type: ProviderType.xai,
    displayName: 'xAI',
    description: 'Grok models by xAI',
    requiresApiKey: true,
    defaultHost: 'https://api.x.ai',
    defaultBasePath: '/v1',
    defaultModels: ['grok-3', 'grok-3-mini'],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'XAI_API_KEY',
    envVarHost: '',
    website: 'https://x.ai',
  },
  [ProviderType.github_copilot]: {
    type: ProviderType.github_copilot,
    displayName: 'GitHub Copilot',
    description: 'Copilot models via GitHub OAuth',
    requiresApiKey: false,
    defaultHost: 'https://api.githubcopilot.com',
    defaultBasePath: '',
    defaultModels: ['gpt-4o', 'claude-3.5-sonnet'],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'GITHUB_COPILOT_TOKEN',
    envVarHost: '',
    website: 'https://github.com/features/copilot',
  },
  [ProviderType.chatgpt_codex]: {
    type: ProviderType.chatgpt_codex,
    displayName: 'ChatGPT Codex',
    description: 'OpenAI Codex for code generation',
    requiresApiKey: true,
    defaultHost: 'https://api.openai.com',
    defaultBasePath: '/v1',
    defaultModels: ['codex-mini-latest'],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'OPENAI_API_KEY',
    envVarHost: '',
    website: 'https://openai.com',
  },
  [ProviderType.atomic_chat]: {
    type: ProviderType.atomic_chat,
    displayName: 'Atomic Chat',
    description: 'Atomic Chat AI API',
    requiresApiKey: true,
    defaultHost: 'https://api.atomic.chat',
    defaultBasePath: '/v1',
    defaultModels: [],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'ATOMIC_CHAT_API_KEY',
    envVarHost: '',
    website: 'https://atomic.chat',
  },
  [ProviderType.opencode]: {
    type: ProviderType.opencode,
    displayName: 'OpenCode',
    description: 'OpenCode AI coding assistant',
    requiresApiKey: false,
    defaultHost: 'http://localhost:13284',
    defaultBasePath: '/api/v1',
    defaultModels: ['opencode-default', 'opencode-coder'],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: 'OPENCODE_API_KEY',
    envVarHost: 'OPENCODE_HOST',
    website: 'https://github.com/anomalyco/opencode',
  },
  [ProviderType.custom_openai]: {
    type: ProviderType.custom_openai,
    displayName: 'Custom OpenAI',
    description: 'Any OpenAI-compatible API endpoint',
    requiresApiKey: false,
    defaultHost: 'http://localhost:8000',
    defaultBasePath: '/v1',
    defaultModels: [],
    supportsStreaming: true,
    supportsToolUse: true,
    supportsThinking: false,
    supportsPromptCaching: false,
    envVarApiKey: '',
    envVarHost: '',
    website: '',
  },
};

// ─── Provider Factory Map ──────────────────────────────────────────────────────

const PROVIDER_FACTORIES: Record<ProviderType, (config: ProviderConfig) => ProviderInterface> = {
  [ProviderType.anthropic]: (c) => new AnthropicProvider(c),
  [ProviderType.openai]: (c) => new OpenAIProvider(c),
  [ProviderType.openrouter]: (c) => new OpenRouterProvider(c),
  [ProviderType.azure_openai]: (c) => new AzureOpenAIProvider(c),
  [ProviderType.gemini]: (c) => new GeminiProvider(c),
  [ProviderType.gcp_vertex]: (c) => new GcpVertexProvider(c),
  [ProviderType.amazon_bedrock]: (c) => new AmazonBedrockProvider(c),
  [ProviderType.amazon_sagemaker]: (c) => new AmazonSagemakerProvider(c),
  [ProviderType.groq]: (c) => new GroqProvider(c),
  [ProviderType.mistral]: (c) => new MistralProvider(c),
  [ProviderType.ollama]: (c) => new OllamaProvider(c),
  [ProviderType.ollama_cloud]: (c) => new OllamaCloudProvider(c),
  [ProviderType.lm_studio]: (c) => new LmStudioProvider(c),
  [ProviderType.docker_model_runner]: (c) => new DockerModelRunnerProvider(c),
  [ProviderType.litellm]: (c) => new LiteLLMProvider(c),
  [ProviderType.databricks]: (c) => new DatabricksProvider(c),
  [ProviderType.novita]: (c) => new NovitaProvider(c),
  [ProviderType.avian]: (c) => new AvianProvider(c),
  [ProviderType.futurmix]: (c) => new FuturMixProvider(c),
  [ProviderType.perplexity]: (c) => new PerplexityProvider(c),
  [ProviderType.near_ai]: (c) => new NearAIProvider(c),
  [ProviderType.ovhcloud]: (c) => new OvhcloudProvider(c),
  [ProviderType.ramalama]: (c) => new RamalamaProvider(c),
  [ProviderType.routstr]: (c) => new RoutstrProvider(c),
  [ProviderType.saladcloud]: (c) => new SaladCloudProvider(c),
  [ProviderType.scaleway]: (c) => new ScalewayProvider(c),
  [ProviderType.snowflake]: (c) => new SnowflakeProvider(c),
  [ProviderType.vmware_tanzu]: (c) => new VMwareTanzuProvider(c),
  [ProviderType.tetrate]: (c) => new TetrateProvider(c),
  [ProviderType.venice]: (c) => new VeniceProvider(c),
  [ProviderType.cerebras]: (c) => new CerebrasProvider(c),
  [ProviderType.xai]: (c) => new XAIProvider(c),
  [ProviderType.github_copilot]: (c) => new GitHubCopilotProvider(c),
  [ProviderType.chatgpt_codex]: (c) => new ChatGPTCodexProvider(c),
  [ProviderType.atomic_chat]: (c) => new AtomicChatProvider(c),
  [ProviderType.opencode]: (c) => new OpenCodeProvider(c),
  [ProviderType.custom_openai]: (c) => new CustomOpenAIProvider(c),
};

// ─── Storage Interface ─────────────────────────────────────────────────────────

interface StorageAdapter {
  get<T>(key: string, defaultValue?: T): T | undefined;
  set(key: string, value: any): void;
  delete(key: string): void;
  clear(): void;
}

// ─── In-Memory Storage (fallback) ──────────────────────────────────────────────

class MemoryStorageAdapter implements StorageAdapter {
  private store: Map<string, any> = new Map();

  get<T>(key: string, defaultValue?: T): T | undefined {
    if (this.store.has(key)) {
      return this.store.get(key) as T;
    }
    return defaultValue;
  }

  set(key: string, value: any): void {
    this.store.set(key, value);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

// ─── Provider Manager ──────────────────────────────────────────────────────────

export class ProviderManager {
  private providers: Map<string, ProviderInterface> = new Map();
  private configs: Map<string, ProviderConfig> = new Map();
  private healthChecks: Map<string, HealthCheck> = new Map();
  private fallbackChains: Map<string, FallbackChain> = new Map();
  private meshRoutes: MeshRoute[] = [];
  private defaultProviderId?: string;
  private storage: StorageAdapter;
  private healthMonitorInterval?: ReturnType<typeof setInterval>;
  private isInitialized: boolean = false;

  constructor(storage?: StorageAdapter) {
    this.storage = storage || new MemoryStorageAdapter();
  }

  // ─── Initialization ─────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Load persisted configs
    await this.loadConfigs();

    // Auto-detect from environment
    await this.autoDetectProviders();

    // Start health monitoring
    this.startHealthMonitoring();

    this.isInitialized = true;
  }

  async shutdown(): Promise<void> {
    if (this.healthMonitorInterval) {
      clearInterval(this.healthMonitorInterval);
      this.healthMonitorInterval = undefined;
    }
    this.isInitialized = false;
  }

  // ─── Config Persistence ─────────────────────────────────────────────────────

  private async loadConfigs(): Promise<void> {
    const savedConfigs = this.storage.get<ProviderConfig[]>('provider_configs');
    if (savedConfigs && Array.isArray(savedConfigs)) {
      for (const config of savedConfigs) {
        this.configs.set(config.id, config);
        this.instantiateProvider(config);
      }
    }

    this.defaultProviderId = this.storage.get<string>('default_provider_id');
  }

  private async saveConfigs(): Promise<void> {
    const configs = Array.from(this.configs.values());
    this.storage.set('provider_configs', configs);
    if (this.defaultProviderId) {
      this.storage.set('default_provider_id', this.defaultProviderId);
    }
  }

  // ─── Provider Instantiation ─────────────────────────────────────────────────

  private instantiateProvider(config: ProviderConfig): ProviderInterface {
    const factory = PROVIDER_FACTORIES[config.type];
    if (!factory) {
      throw new ProviderError(
        `Unknown provider type: ${config.type}`,
        ProviderErrorType.CONFIGURATION,
        config.id
      );
    }

    const provider = factory(config);
    this.providers.set(config.id, provider);
    return provider;
  }

  // ─── CRUD Operations ────────────────────────────────────────────────────────

  async addProvider(config: Omit<ProviderConfig, 'id' | 'createdAt'>): Promise<ProviderInterface> {
    const id = `provider_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fullConfig: ProviderConfig = {
      ...config,
      id,
      createdAt: Date.now(),
    };

    this.configs.set(id, fullConfig);
    const provider = this.instantiateProvider(fullConfig);
    await this.saveConfigs();

    return provider;
  }

  async updateProvider(
    id: string,
    updates: Partial<Omit<ProviderConfig, 'id' | 'createdAt'>>
  ): Promise<ProviderInterface> {
    const existing = this.configs.get(id);
    if (!existing) {
      throw new ProviderError(
        `Provider not found: ${id}`,
        ProviderErrorType.CONFIGURATION,
        id
      );
    }

    const updated: ProviderConfig = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
    };

    this.configs.set(id, updated);
    const provider = this.instantiateProvider(updated);
    await this.saveConfigs();

    return provider;
  }

  async removeProvider(id: string): Promise<void> {
    this.configs.delete(id);
    this.providers.delete(id);
    this.healthChecks.delete(id);

    if (this.defaultProviderId === id) {
      this.defaultProviderId = undefined;
      this.storage.delete('default_provider_id');
    }

    await this.saveConfigs();
  }

  getProvider(id: string): ProviderInterface | undefined {
    return this.providers.get(id);
  }

  getProviderConfig(id: string): ProviderConfig | undefined {
    return this.configs.get(id);
  }

  getAllProviders(): ProviderInterface[] {
    return Array.from(this.providers.values());
  }

  getAllConfigs(): ProviderConfig[] {
    return Array.from(this.configs.values());
  }

  getEnabledProviders(): ProviderInterface[] {
    return Array.from(this.configs.values())
      .filter((c) => c.enabled)
      .map((c) => this.providers.get(c.id))
      .filter((p): p is ProviderInterface => p !== undefined);
  }

  // ─── Default Provider ───────────────────────────────────────────────────────

  getDefault(): ProviderInterface | undefined {
    if (this.defaultProviderId) {
      return this.providers.get(this.defaultProviderId);
    }
    // Fall back to first enabled provider
    return this.getEnabledProviders()[0];
  }

  getDefaultConfig(): ProviderConfig | undefined {
    if (this.defaultProviderId) {
      return this.configs.get(this.defaultProviderId);
    }
    const enabled = Array.from(this.configs.values()).filter((c) => c.enabled);
    return enabled[0];
  }

  async setDefault(id: string): Promise<void> {
    if (!this.configs.has(id)) {
      throw new ProviderError(
        `Provider not found: ${id}`,
        ProviderErrorType.CONFIGURATION,
        id
      );
    }
    this.defaultProviderId = id;
    this.storage.set('default_provider_id', id);
  }

  // ─── Test Connection ────────────────────────────────────────────────────────

  async test(id: string): Promise<boolean> {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new ProviderError(
        `Provider not found: ${id}`,
        ProviderErrorType.CONFIGURATION,
        id
      );
    }

    try {
      const result = await provider.test();
      this.updateHealthCheck(id, result ? HealthStatus.healthy : HealthStatus.unhealthy);
      return result;
    } catch (error) {
      this.updateHealthCheck(
        id,
        HealthStatus.unhealthy,
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  }

  async testAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    const promises = Array.from(this.providers.keys()).map(async (id) => {
      results[id] = await this.test(id);
    });
    await Promise.allSettled(promises);
    return results;
  }

  // ─── Chat ───────────────────────────────────────────────────────────────────

  async chat(providerId: string, request: ChatRequest): Promise<ChatResponse> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new ProviderError(
        `Provider not found: ${providerId}`,
        ProviderErrorType.CONFIGURATION,
        providerId
      );
    }

    try {
      const result = await provider.chat(request);
      this.updateHealthCheck(providerId, HealthStatus.healthy);
      return result;
    } catch (error) {
      // Try fallback chain
      const fallback = await this.tryFallback(providerId, request);
      if (fallback) return fallback;

      this.updateHealthCheck(
        providerId,
        HealthStatus.degraded,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  // ─── Chat Stream ────────────────────────────────────────────────────────────

  async *chatStream(
    providerId: string,
    request: ChatRequest
  ): AsyncGenerator<StreamChunk> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new ProviderError(
        `Provider not found: ${providerId}`,
        ProviderErrorType.CONFIGURATION,
        providerId
      );
    }

    try {
      yield* provider.chatStream(request);
      this.updateHealthCheck(providerId, HealthStatus.healthy);
    } catch (error) {
      // Try fallback chain (non-streaming)
      const fallback = await this.tryFallback(providerId, request);
      if (fallback && fallback.message) {
        yield { type: 'content', content: fallback.message.content };
        if (fallback.usage) yield { type: 'usage', usage: fallback.usage };
        yield { type: 'done' };
        return;
      }

      this.updateHealthCheck(
        providerId,
        HealthStatus.degraded,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  // ─── List Models ────────────────────────────────────────────────────────────

  async listModels(providerId: string): Promise<string[]> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new ProviderError(
        `Provider not found: ${providerId}`,
        ProviderErrorType.CONFIGURATION,
        providerId
      );
    }
    return provider.listModels();
  }

  // ─── Auto-Detection ─────────────────────────────────────────────────────────

  async autoDetectProviders(): Promise<AutoDetectResult[]> {
    const results: AutoDetectResult[] = [];

    const envMappings: Array<{
      type: ProviderType;
      keyEnvVar: string;
      hostEnvVar?: string;
      confidence: number;
    }> = [
      { type: ProviderType.anthropic, keyEnvVar: 'ANTHROPIC_API_KEY', hostEnvVar: 'ANTHROPIC_HOST', confidence: 1.0 },
      { type: ProviderType.openai, keyEnvVar: 'OPENAI_API_KEY', hostEnvVar: 'OPENAI_HOST', confidence: 1.0 },
      { type: ProviderType.openrouter, keyEnvVar: 'OPENROUTER_API_KEY', confidence: 1.0 },
      { type: ProviderType.azure_openai, keyEnvVar: 'AZURE_OPENAI_API_KEY', hostEnvVar: 'AZURE_OPENAI_ENDPOINT', confidence: 1.0 },
      { type: ProviderType.gemini, keyEnvVar: 'GOOGLE_API_KEY', confidence: 1.0 },
      { type: ProviderType.groq, keyEnvVar: 'GROQ_API_KEY', confidence: 1.0 },
      { type: ProviderType.mistral, keyEnvVar: 'MISTRAL_API_KEY', confidence: 1.0 },
      { type: ProviderType.perplexity, keyEnvVar: 'PERPLEXITY_API_KEY', confidence: 1.0 },
      { type: ProviderType.cerebras, keyEnvVar: 'CEREBRAS_API_KEY', confidence: 1.0 },
      { type: ProviderType.xai, keyEnvVar: 'XAI_API_KEY', confidence: 1.0 },
      { type: ProviderType.venice, keyEnvVar: 'VENICE_API_KEY', confidence: 1.0 },
      { type: ProviderType.novita, keyEnvVar: 'NOVITA_API_KEY', confidence: 0.9 },
      { type: ProviderType.databricks, keyEnvVar: 'DATABRICKS_TOKEN', hostEnvVar: 'DATABRICKS_HOST', confidence: 0.9 },
      { type: ProviderType.litellm, keyEnvVar: 'LITELLM_API_KEY', confidence: 0.8 },
      { type: ProviderType.github_copilot, keyEnvVar: 'GITHUB_COPILOT_TOKEN', confidence: 0.9 },
    ];

    for (const mapping of envMappings) {
      const apiKey = this.getEnvVar(mapping.keyEnvVar);
      if (!apiKey) continue;

      // Don't add if already configured
      const existing = Array.from(this.configs.values()).find(
        (c) => c.type === mapping.type
      );
      if (existing) continue;

      const config: Partial<ProviderConfig> = {
        type: mapping.type,
        name: PROVIDER_METADATA[mapping.type].displayName,
        apiKey,
        enabled: true,
        isDefault: false,
      };

      if (mapping.hostEnvVar) {
        const host = this.getEnvVar(mapping.hostEnvVar);
        if (host) config.apiHost = host;
      }

      results.push({
        providerType: mapping.type,
        config,
        source: 'environment',
        confidence: mapping.confidence,
      });

      // Auto-register detected provider
      await this.addProvider({
        type: mapping.type,
        name: PROVIDER_METADATA[mapping.type].displayName,
        apiKey,
        apiHost: config.apiHost,
        enabled: true,
        isDefault: results.length === 0, // First detected is default
      });
    }

    // Detect local providers (no API key needed)
    const localProviders: Array<{ type: ProviderType; host: string; checkPath: string }> = [
      { type: ProviderType.ollama, host: 'http://localhost:11434', checkPath: '/api/tags' },
      { type: ProviderType.lm_studio, host: 'http://localhost:1234', checkPath: '/v1/models' },
      { type: ProviderType.docker_model_runner, host: 'http://localhost:12434', checkPath: '/engines/llama.cpp/v1/models' },
      { type: ProviderType.opencode, host: 'http://localhost:13284', checkPath: '/api/v1/health' },
    ];

    for (const local of localProviders) {
      const existing = Array.from(this.configs.values()).find(
        (c) => c.type === local.type
      );
      if (existing) continue;

      try {
        const response = await fetch(`${local.host}${local.checkPath}`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000),
        });
        if (response.ok) {
          results.push({
            providerType: local.type,
            config: {
              type: local.type,
              name: PROVIDER_METADATA[local.type].displayName,
              apiHost: local.host,
              enabled: true,
              isDefault: false,
            },
            source: 'runtime',
            confidence: 0.9,
          });

          await this.addProvider({
            type: local.type,
            name: PROVIDER_METADATA[local.type].displayName,
            apiHost: local.host,
            enabled: true,
            isDefault: false,
          });
        }
      } catch {
        // Not running, skip
      }
    }

    // AWS credentials detection
    const awsAccessKey = this.getEnvVar('AWS_ACCESS_KEY_ID');
    const awsSecretKey = this.getEnvVar('AWS_SECRET_ACCESS_KEY');
    if (awsAccessKey && awsSecretKey) {
      const existingBedrock = Array.from(this.configs.values()).find(
        (c) => c.type === ProviderType.amazon_bedrock
      );
      if (!existingBedrock) {
        results.push({
          providerType: ProviderType.amazon_bedrock,
          config: {
            type: ProviderType.amazon_bedrock,
            name: 'Amazon Bedrock',
            apiKey: awsAccessKey,
            customHeaders: { aws_secret_access_key: awsSecretKey },
            region: this.getEnvVar('AWS_REGION') || 'us-east-1',
            enabled: true,
            isDefault: false,
          },
          source: 'environment',
          confidence: 0.9,
        });

        await this.addProvider({
          type: ProviderType.amazon_bedrock,
          name: 'Amazon Bedrock',
          apiKey: awsAccessKey,
          customHeaders: { aws_secret_access_key: awsSecretKey },
          region: this.getEnvVar('AWS_REGION') || 'us-east-1',
          enabled: true,
          isDefault: false,
        });
      }
    }

    // GCP detection
    const gcpProject = this.getEnvVar('GCP_PROJECT_ID') || this.getEnvVar('GOOGLE_CLOUD_PROJECT');
    if (gcpProject) {
      const existingVertex = Array.from(this.configs.values()).find(
        (c) => c.type === ProviderType.gcp_vertex
      );
      if (!existingVertex) {
        results.push({
          providerType: ProviderType.gcp_vertex,
          config: {
            type: ProviderType.gcp_vertex,
            name: 'GCP Vertex AI',
            projectId: gcpProject,
            region: this.getEnvVar('GCP_LOCATION') || 'us-central1',
            enabled: true,
            isDefault: false,
          },
          source: 'environment',
          confidence: 0.8,
        });

        await this.addProvider({
          type: ProviderType.gcp_vertex,
          name: 'GCP Vertex AI',
          projectId: gcpProject,
          region: this.getEnvVar('GCP_LOCATION') || 'us-central1',
          enabled: true,
          isDefault: false,
        });
      }
    }

    return results;
  }

  private getEnvVar(name: string): string | undefined {
    if (typeof process !== 'undefined' && process.env) {
      return process.env[name];
    }
    return undefined;
  }

  // ─── Mesh LLM Routing ──────────────────────────────────────────────────────

  addMeshRoute(route: MeshRoute): void {
    // Remove existing route for same task type and provider
    this.meshRoutes = this.meshRoutes.filter(
      (r) => !(r.taskType === route.taskType && r.providerId === route.providerId)
    );
    this.meshRoutes.push(route);
    this.meshRoutes.sort((a, b) => b.priority - a.priority);
  }

  removeMeshRoute(taskType: string, providerId: string): void {
    this.meshRoutes = this.meshRoutes.filter(
      (r) => !(r.taskType === taskType && r.providerId === providerId)
    );
  }

  getMeshRoutes(taskType?: string): MeshRoute[] {
    if (taskType) {
      return this.meshRoutes.filter((r) => r.taskType === taskType);
    }
    return [...this.meshRoutes];
  }

  async meshChat(
    taskType: string,
    request: ChatRequest
  ): Promise<ChatResponse> {
    const routes = this.getMeshRoutes(taskType);
    if (routes.length === 0) {
      // Fall back to default provider
      const defaultProvider = this.getDefault();
      if (!defaultProvider) {
        throw new ProviderError(
          'No provider available for mesh routing',
          ProviderErrorType.CONFIGURATION,
          'mesh'
        );
      }
      return defaultProvider.chat(request);
    }

    // Try routes in priority order
    for (const route of routes) {
      const provider = this.providers.get(route.providerId);
      if (!provider || !this.configs.get(route.providerId)?.enabled) {
        continue;
      }

      try {
        const routedRequest = { ...request, model: route.model || request.model };
        return await provider.chat(routedRequest);
      } catch {
        continue;
      }
    }

    // All mesh routes failed, fall back
    const defaultProvider = this.getDefault();
    if (defaultProvider) {
      return defaultProvider.chat(request);
    }

    throw new ProviderError(
      `All mesh routes failed for task type: ${taskType}`,
      ProviderErrorType.SERVER_ERROR,
      'mesh'
    );
  }

  async *meshChatStream(
    taskType: string,
    request: ChatRequest
  ): AsyncGenerator<StreamChunk> {
    const routes = this.getMeshRoutes(taskType);
    if (routes.length === 0) {
      const defaultProvider = this.getDefault();
      if (!defaultProvider) {
        throw new ProviderError(
          'No provider available for mesh routing',
          ProviderErrorType.CONFIGURATION,
          'mesh'
        );
      }
      yield* defaultProvider.chatStream(request);
      return;
    }

    for (const route of routes) {
      const provider = this.providers.get(route.providerId);
      if (!provider || !this.configs.get(route.providerId)?.enabled) {
        continue;
      }

      try {
        const routedRequest = { ...request, model: route.model || request.model };
        yield* provider.chatStream(routedRequest);
        return;
      } catch {
        continue;
      }
    }

    // All mesh routes failed
    const defaultProvider = this.getDefault();
    if (defaultProvider) {
      yield* defaultProvider.chatStream(request);
      return;
    }

    throw new ProviderError(
      `All mesh routes failed for task type: ${taskType}`,
      ProviderErrorType.SERVER_ERROR,
      'mesh'
    );
  }

  // ─── Fallback Chains ────────────────────────────────────────────────────────

  addFallbackChain(chain: FallbackChain): void {
    this.fallbackChains.set(chain.id, chain);
  }

  removeFallbackChain(id: string): void {
    this.fallbackChains.delete(id);
  }

  getFallbackChain(id: string): FallbackChain | undefined {
    return this.fallbackChains.get(id);
  }

  getAllFallbackChains(): FallbackChain[] {
    return Array.from(this.fallbackChains.values());
  }

  private async tryFallback(
    failedProviderId: string,
    request: ChatRequest
  ): Promise<ChatResponse | null> {
    // Find chains that include the failed provider
    for (const chain of this.fallbackChains.values()) {
      const failedIndex = chain.routes.findIndex(
        (r) => r.providerId === failedProviderId
      );
      if (failedIndex === -1) continue;

      // Try subsequent providers in the chain
      for (let i = failedIndex + 1; i < chain.routes.length; i++) {
        const route = chain.routes[i];
        const provider = this.providers.get(route.providerId);
        if (!provider || !this.configs.get(route.providerId)?.enabled) {
          continue;
        }

        try {
          const routedRequest = {
            ...request,
            model: route.model || request.model,
          };
          return await provider.chat(routedRequest);
        } catch {
          continue;
        }
      }
    }

    // If no chain, try all enabled providers
    const enabledProviders = this.getEnabledProviders().filter(
      (p) => p.id !== failedProviderId
    );

    for (const provider of enabledProviders) {
      try {
        return await provider.chat(request);
      } catch {
        continue;
      }
    }

    return null;
  }

  // ─── Health Monitoring ──────────────────────────────────────────────────────

  private startHealthMonitoring(intervalMs: number = 60000): void {
    this.healthMonitorInterval = setInterval(async () => {
      await this.runHealthChecks();
    }, intervalMs);
  }

  async runHealthChecks(): Promise<Record<string, HealthCheck>> {
    const results: Record<string, HealthCheck> = {};
    const enabled = Array.from(this.configs.values()).filter((c) => c.enabled);

    const promises = enabled.map(async (config) => {
      const provider = this.providers.get(config.id);
      if (!provider) return;

      const start = Date.now();
      try {
        const isHealthy = await provider.test();
        const latencyMs = Date.now() - start;

        const existing = this.healthChecks.get(config.id);
        const consecutiveFailures = isHealthy
          ? 0
          : (existing?.consecutiveFailures || 0) + 1;

        const check: HealthCheck = {
          providerId: config.id,
          status: isHealthy
            ? HealthStatus.healthy
            : consecutiveFailures >= 3
              ? HealthStatus.unhealthy
              : HealthStatus.degraded,
          latencyMs,
          lastChecked: Date.now(),
          consecutiveFailures,
        };

        this.healthChecks.set(config.id, check);
        results[config.id] = check;
      } catch (error) {
        const existing = this.healthChecks.get(config.id);
        const consecutiveFailures = (existing?.consecutiveFailures || 0) + 1;

        const check: HealthCheck = {
          providerId: config.id,
          status:
            consecutiveFailures >= 3
              ? HealthStatus.unhealthy
              : HealthStatus.degraded,
          latencyMs: Date.now() - start,
          lastChecked: Date.now(),
          error: error instanceof Error ? error.message : String(error),
          consecutiveFailures,
        };

        this.healthChecks.set(config.id, check);
        results[config.id] = check;
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  private updateHealthCheck(
    providerId: string,
    status: HealthStatus,
    error?: string
  ): void {
    const existing = this.healthChecks.get(providerId);
    const consecutiveFailures =
      status === HealthStatus.healthy
        ? 0
        : (existing?.consecutiveFailures || 0) + 1;

    this.healthChecks.set(providerId, {
      providerId,
      status,
      latencyMs: existing?.latencyMs || 0,
      lastChecked: Date.now(),
      error,
      consecutiveFailures,
    });
  }

  getHealthCheck(providerId: string): HealthCheck | undefined {
    return this.healthChecks.get(providerId);
  }

  getAllHealthChecks(): Record<string, HealthCheck> {
    const result: Record<string, HealthCheck> = {};
    for (const [id, check] of this.healthChecks) {
      result[id] = check;
    }
    return result;
  }

  // ─── Metadata ───────────────────────────────────────────────────────────────

  getProviderMetadata(type: ProviderType): ProviderMetadata {
    return PROVIDER_METADATA[type];
  }

  getAllProviderMetadata(): Record<ProviderType, ProviderMetadata> {
    return PROVIDER_METADATA;
  }

  getSupportedProviderTypes(): ProviderType[] {
    return Object.values(ProviderType);
  }

  // ─── Export / Import Configs ────────────────────────────────────────────────

  exportConfigs(): string {
    const data = {
      version: 1,
      configs: Array.from(this.configs.values()),
      defaultProviderId: this.defaultProviderId,
      meshRoutes: this.meshRoutes,
      fallbackChains: Array.from(this.fallbackChains.values()),
    };
    return JSON.stringify(data, null, 2);
  }

  async importConfigs(json: string): Promise<void> {
    try {
      const data = JSON.parse(json);
      if (data.version !== 1) {
        throw new ProviderError(
          'Unsupported config version',
          ProviderErrorType.CONFIGURATION,
          'import'
        );
      }

      // Clear existing
      this.configs.clear();
      this.providers.clear();
      this.healthChecks.clear();
      this.fallbackChains.clear();
      this.meshRoutes = [];

      // Import configs
      if (data.configs && Array.isArray(data.configs)) {
        for (const config of data.configs) {
          this.configs.set(config.id, config);
          this.instantiateProvider(config);
        }
      }

      if (data.defaultProviderId) {
        this.defaultProviderId = data.defaultProviderId;
      }

      if (data.meshRoutes && Array.isArray(data.meshRoutes)) {
        this.meshRoutes = data.meshRoutes;
      }

      if (data.fallbackChains && Array.isArray(data.fallbackChains)) {
        for (const chain of data.fallbackChains) {
          this.fallbackChains.set(chain.id, chain);
        }
      }

      await this.saveConfigs();
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        `Failed to import configs: ${error instanceof Error ? error.message : String(error)}`,
        ProviderErrorType.CONFIGURATION,
        'import'
      );
    }
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────────

let managerInstance: ProviderManager | undefined;

export function getProviderManager(): ProviderManager {
  if (!managerInstance) {
    managerInstance = new ProviderManager();
  }
  return managerInstance;
}

export function setProviderManager(manager: ProviderManager): void {
  managerInstance = manager;
}
