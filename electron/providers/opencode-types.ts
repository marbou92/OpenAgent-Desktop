/**
 * OpenAgent-Desktop - opencode-compatible Provider Types
 *
 * Mirrors opencode's provider/auth/model schemas exactly so we're 100%
 * compatible with opencode-cli's auth.json and opencode.json config files.
 *
 * Refs:
 *   - https://github.com/anomalyco/opencode/blob/dev/packages/core/src/provider.ts
 *   - https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/auth/index.ts
 *   - https://github.com/anomalyco/opencode/blob/dev/packages/core/src/v1/config/provider.ts
 *   - https://models.dev/models.json
 */

// ─── Auth (matches opencode's auth.json format exactly) ──────────────────────

export interface ApiAuth {
  type: 'api';
  key: string;
  metadata?: Record<string, string>;
}

export interface OauthAuth {
  type: 'oauth';
  refresh: string;
  access: string;
  expires: number; // epoch ms
  accountId?: string;
  enterpriseUrl?: string;
}

export interface WellKnownAuth {
  type: 'wellknown';
  key: string;
  token: string;
}

export type AuthProvider = ApiAuth | OauthAuth | WellKnownAuth;

// auth.json is a flat Record<providerId, AuthProvider>
export type AuthJson = Record<string, AuthProvider>;

// ─── Model config (from opencode.json + models.dev) ──────────────────────────

export type ModelStatus = 'alpha' | 'beta' | 'deprecated' | 'active';

export interface ModelCost {
  input: number;
  output: number;
  cache_read?: number;
  cache_write?: number;
  context_over_200k?: { input: number; output: number; cache_read?: number; cache_write?: number };
}

export interface ModelLimit {
  context: number;
  input?: number;
  output: number;
}

export interface ModelModalities {
  input?: Array<'text' | 'audio' | 'image' | 'video' | 'pdf'>;
  output?: Array<'text' | 'audio' | 'image' | 'video' | 'pdf'>;
}

export interface ModelConfig {
  id: string;
  name?: string;
  family?: string;
  release_date?: string;
  attachment?: boolean;
  reasoning?: boolean;
  temperature?: boolean;
  tool_call?: boolean;
  structured_output?: boolean;
  cost?: ModelCost;
  limit?: ModelLimit;
  modalities?: ModelModalities;
  status?: ModelStatus;
  provider?: { npm?: string; api?: string };
  options?: Record<string, unknown>;
  headers?: Record<string, string>;
}

// ─── Provider definition (from opencode.json provider section) ───────────────

export interface ProviderOptions {
  apiKey?: string;
  baseURL?: string;
  enterpriseUrl?: string;
  setCacheKey?: boolean;
  timeout?: number | false;
  headerTimeout?: number | false;
  chunkTimeout?: number;
}

export interface ProviderDefinition {
  id: string;
  name: string;
  npm?: string;
  api?: string;
  env?: string[];
  disabled?: boolean;
  options?: ProviderOptions;
  models?: Record<string, ModelConfig>;
  whitelist?: string[];
  blacklist?: string[];
  /** Auth methods this provider supports. */
  authMethods?: Array<'api' | 'oauth' | 'wellknown'>;
  /** Whether this is a built-in opencode provider (vs user-added custom). */
  isBuiltin?: boolean;
  /** Icon name for the UI. */
  icon?: string;
  /** Documentation URL. */
  docsUrl?: string;
}

// ─── opencode.json config file ───────────────────────────────────────────────

export interface OpencodeJson {
  $schema?: string;
  provider?: Record<string, ProviderDefinition>;
}

// ─── models.dev entry ─────────────────────────────────────────────────────────

export interface ModelsDevEntry {
  id: string; // e.g. "xai/grok-4.20-0309-non-reasoning"
  name: string;
  family?: string;
  attachment: boolean;
  reasoning: boolean;
  tool_call: boolean;
  structured_output?: boolean;
  temperature: boolean;
  release_date: string;
  last_updated?: string;
  modalities?: ModelModalities;
  open_weights?: boolean;
  limit: ModelLimit;
  cost?: ModelCost;
}

// ─── Unified types for chat (kept compatible with existing chat UI) ──────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCallInfo[];
}

export interface ToolCallInfo {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  model: string; // <providerId>/<modelId>
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
  systemPrompt?: string;
}

export interface ChatResponse {
  id: string;
  content: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens?: number };
  toolCalls?: ToolCallInfo[];
  thinking?: string;
}

export type StreamChunkType =
  | 'thinking' | 'content' | 'tool_call_start' | 'tool_call_delta'
  | 'tool_call_end' | 'tool_result' | 'usage' | 'done' | 'error';

export interface StreamChunk {
  type: StreamChunkType;
  content?: string;
  toolCall?: Partial<ToolCallInfo> & { index?: number };
  toolCallId?: string;
  toolResult?: { id: string; content: string; isError?: boolean };
  usage?: { promptTokens: number; completionTokens: number; totalTokens?: number };
  error?: { message: string; code?: string };
}

// ─── Resolved model (what the UI shows) ───────────────────────────────────────

export interface DiscoveredModel {
  id: string;
  displayName?: string;
  contextWindow?: number;
  supportsStreaming?: boolean;
  supportsToolUse?: boolean;
  supportsThinking?: boolean;
}

export interface ResolvedModel {
  id: string;
  qualifiedId: string; // <providerId>/<modelId>
  providerId: string;
  displayName: string;
  contextWindow?: number;
  maxOutput?: number;
  supportsStreaming: boolean;
  supportsToolUse: boolean;
  supportsThinking: boolean;
  supportsAttachment: boolean;
  cost?: ModelCost;
  status?: ModelStatus;
  source: 'preset' | 'models-dev' | 'custom';
}

// ─── Session binding (kept from v3) ──────────────────────────────────────────

export interface SessionProviderBinding {
  sessionId: string;
  providerId: string;
  modelId: string;
  systemPromptOverride?: string;
  temperatureOverride?: number;
}

// ─── Health check ─────────────────────────────────────────────────────────────

export interface HealthCheckResult {
  providerId: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latencyMs: number;
  lastCheckedAt: string;
  error?: string;
  modelCount?: number;
}
