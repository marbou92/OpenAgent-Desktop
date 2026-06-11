/**
 * OpenAgent-Desktop - Provider System Types
 * Complete type definitions for 35+ AI providers
 */

// ─── Provider Type Enum ────────────────────────────────────────────────────────

export enum ProviderType {
  anthropic = 'anthropic',
  openai = 'openai',
  openrouter = 'openrouter',
  azure_openai = 'azure_openai',
  gemini = 'gemini',
  gcp_vertex = 'gcp_vertex',
  amazon_bedrock = 'amazon_bedrock',
  amazon_sagemaker = 'amazon_sagemaker',
  groq = 'groq',
  mistral = 'mistral',
  ollama = 'ollama',
  ollama_cloud = 'ollama_cloud',
  lm_studio = 'lm_studio',
  docker_model_runner = 'docker_model_runner',
  litellm = 'litellm',
  databricks = 'databricks',
  novita = 'novita',
  avian = 'avian',
  futurmix = 'futurmix',
  perplexity = 'perplexity',
  near_ai = 'near_ai',
  ovhcloud = 'ovhcloud',
  ramalama = 'ramalama',
  routstr = 'routstr',
  saladcloud = 'saladcloud',
  scaleway = 'scaleway',
  snowflake = 'snowflake',
  vmware_tanzu = 'vmware_tanzu',
  tetrate = 'tetrate',
  venice = 'venice',
  cerebras = 'cerebras',
  xai = 'xai',
  github_copilot = 'github_copilot',
  chatgpt_codex = 'chatgpt_codex',
  atomic_chat = 'atomic_chat',
  opencode = 'opencode',
  custom_openai = 'custom_openai',
}

// ─── Provider Configuration ────────────────────────────────────────────────────

export interface ProviderConfig {
  id: string;
  type: ProviderType;
  name: string;
  apiKey?: string;
  apiHost?: string;
  apiBasePath?: string;
  organization?: string;
  region?: string;
  profile?: string;
  deploymentName?: string;
  projectId?: string;
  customHeaders?: Record<string, string>;
  models?: string[];
  enabled: boolean;
  isDefault: boolean;
  createdAt: number;
}

// ─── Message Types ─────────────────────────────────────────────────────────────

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface Message {
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  metadata?: Record<string, any>;
}

// ─── Chat Request / Response ───────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface ChatRequest {
  messages: Message[];
  model: string;
  maxTokens?: number;
  temperature?: number;
  tools?: ToolDefinition[];
  stream?: boolean;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatResponse {
  id: string;
  message: Message;
  usage?: TokenUsage;
  thinking?: string;
}

// ─── Streaming ─────────────────────────────────────────────────────────────────

export type StreamChunkType =
  | 'thinking'
  | 'content'
  | 'tool_call'
  | 'tool_result'
  | 'usage'
  | 'done';

export interface StreamChunk {
  type: StreamChunkType;
  content?: string;
  toolCall?: ToolCall;
  usage?: TokenUsage;
}

// ─── Provider Interface ────────────────────────────────────────────────────────

export interface ProviderInterface {
  readonly id: string;
  readonly config: ProviderConfig;

  chat(request: ChatRequest): Promise<ChatResponse>;
  chatStream(request: ChatRequest): AsyncGenerator<StreamChunk>;
  test(): Promise<boolean>;
  listModels(): Promise<string[]>;
}

// ─── Error Types ───────────────────────────────────────────────────────────────

export enum ProviderErrorType {
  AUTHENTICATION = 'authentication',
  RATE_LIMIT = 'rate_limit',
  QUOTA_EXCEEDED = 'quota_exceeded',
  MODEL_NOT_FOUND = 'model_not_found',
  NETWORK = 'network',
  TIMEOUT = 'timeout',
  INVALID_REQUEST = 'invalid_request',
  SERVER_ERROR = 'server_error',
  STREAM_PARSE = 'stream_parse',
  CONFIGURATION = 'configuration',
  UNKNOWN = 'unknown',
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly type: ProviderErrorType,
    public readonly providerId: string,
    public readonly statusCode?: number,
    public readonly retryable = false,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

// ─── Provider Metadata ─────────────────────────────────────────────────────────

export interface ProviderMetadata {
  type: ProviderType;
  displayName: string;
  description: string;
  requiresApiKey: boolean;
  defaultHost: string;
  defaultBasePath: string;
  defaultModels: string[];
  supportsStreaming: boolean;
  supportsToolUse: boolean;
  supportsThinking: boolean;
  supportsPromptCaching: boolean;
  envVarApiKey: string;
  envVarHost: string;
  icon?: string;
  website: string;
}

// ─── Provider Registry Entry ───────────────────────────────────────────────────

export interface ProviderRegistryEntry {
  metadata: ProviderMetadata;
  factory: (config: ProviderConfig) => ProviderInterface;
}

// ─── Health Status ─────────────────────────────────────────────────────────────

export enum HealthStatus {
  healthy = 'healthy',
  degraded = 'degraded',
  unhealthy = 'unhealthy',
  unknown = 'unknown',
}

export interface HealthCheck {
  providerId: string;
  status: HealthStatus;
  latencyMs: number;
  lastChecked: number;
  error?: string;
  consecutiveFailures: number;
}

// ─── Mesh Routing ──────────────────────────────────────────────────────────────

export interface MeshRoute {
  taskType: string;
  providerId: string;
  model: string;
  priority: number;
}

export interface FallbackChain {
  id: string;
  name: string;
  routes: MeshRoute[];
}

// ─── Auto-Detection Result ─────────────────────────────────────────────────────

export interface AutoDetectResult {
  providerType: ProviderType;
  config: Partial<ProviderConfig>;
  source: 'environment' | 'filesystem' | 'runtime';
  confidence: number;
}

// ─── SSE Event ─────────────────────────────────────────────────────────────────

export interface SSEEvent {
  event?: string;
  data: string;
  id?: string;
  retry?: number;
}

// ─── Rate Limit Info ───────────────────────────────────────────────────────────

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: number;
}

// ─── Request Log Entry ─────────────────────────────────────────────────────────

export interface RequestLogEntry {
  id: string;
  providerId: string;
  providerType: ProviderType;
  model: string;
  timestamp: number;
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  success: boolean;
  error?: string;
  streamed: boolean;
}
