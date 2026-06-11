/**
 * OpenAgent-Desktop - Provider System
 * Barrel export for all provider modules
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export {
  ProviderType,
  ProviderConfig,
  MessageRole,
  ToolCall,
  Message,
  ChatRequest,
  ChatResponse,
  TokenUsage,
  StreamChunkType,
  StreamChunk,
  ToolDefinition,
  ProviderInterface,
  ProviderErrorType,
  ProviderError,
  ProviderMetadata,
  ProviderRegistryEntry,
  HealthStatus,
  HealthCheck,
  MeshRoute,
  FallbackChain,
  AutoDetectResult,
  SSEEvent,
  RateLimitInfo,
  RequestLogEntry,
} from './types';

// ─── Base Provider ─────────────────────────────────────────────────────────────

export {
  BaseProvider,
  RateLimiter,
  RequestLogger,
  DEFAULT_RETRY_CONFIG,
} from './base-provider';

export type { RetryConfig } from './base-provider';

// ─── Anthropic Provider ────────────────────────────────────────────────────────

export { AnthropicProvider, ANTHROPIC_MODELS } from './anthropic-provider';

// ─── OpenAI Provider ───────────────────────────────────────────────────────────

export { OpenAIProvider, OPENAI_MODELS } from './openai-provider';

// ─── Gemini Provider ───────────────────────────────────────────────────────────

export { GeminiProvider, GEMINI_MODELS } from './gemini-provider';

// ─── Azure OpenAI Provider ─────────────────────────────────────────────────────

export { AzureOpenAIProvider, AZURE_OPENAI_MODELS } from './azure-openai-provider';

// ─── Amazon Bedrock Provider ───────────────────────────────────────────────────

export { AmazonBedrockProvider, BEDROCK_MODELS } from './amazon-bedrock-provider';

// ─── GCP Vertex AI Provider ────────────────────────────────────────────────────

export { GcpVertexProvider, VERTEX_MODELS } from './gcp-vertex-provider';

// ─── Groq Provider ─────────────────────────────────────────────────────────────

export { GroqProvider, GROQ_MODELS } from './groq-provider';

// ─── Mistral Provider ──────────────────────────────────────────────────────────

export { MistralProvider, MISTRAL_MODELS } from './mistral-provider';

// ─── Ollama Provider ───────────────────────────────────────────────────────────

export { OllamaProvider, OLLAMA_MODELS } from './ollama-provider';

// ─── OpenRouter Provider ───────────────────────────────────────────────────────

export { OpenRouterProvider, OPENROUTER_MODELS } from './openrouter-provider';

// ─── OpenCode Provider ─────────────────────────────────────────────────────────

export {
  OpenCodeProvider,
  OPENCODE_MODELS,
  OpenCodeSession,
  OpenCodeMessage,
  OpenCodeMessageBody,
  OpenCodeQuestion,
  OpenCodePermission,
  OpenCodeAppInfo,
} from './opencode-provider';

// ─── GitHub Copilot Provider ───────────────────────────────────────────────────

export { GitHubCopilotProvider, COPILOT_MODELS } from './github-copilot-provider';

// ─── Provider Manager ──────────────────────────────────────────────────────────

export {
  ProviderManager,
  getProviderManager,
  setProviderManager,
} from './manager';

// ─── File Storage ──────────────────────────────────────────────────────────────

export { FileStorageAdapter, StorageAdapter } from './file-storage';
