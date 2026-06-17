/**
 * OpenAgent-Desktop - Provider System Types (v3)
 *
 * Fresh rewrite modeled on opencode's auth.json + provider-registry approach.
 * Replaces the previous v2-types.ts which conflated several concerns.
 */

// ─── Auth ────────────────────────────────────────────────────────────────────

export type AuthMethod = 'api_key' | 'oauth' | 'azure_ad' | 'env_var';

export interface ApiKeyAuth {
  method: 'api_key';
  /** Encrypted at rest via safeStorage. Plaintext in memory only. */
  apiKey: string;
  /** Optional header override (defaults to 'Authorization: Bearer <key>'). */
  headerName?: string;
  /** Optional prefix (defaults to 'Bearer '). Set to '' for raw key. */
  headerPrefix?: string;
  /** Optional query-param name (e.g. Gemini uses ?key=<key>). */
  queryParam?: string;
}

export interface OAuthAuth {
  method: 'oauth';
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
  scope?: string;
}

export interface AzureAdAuth {
  method: 'azure_ad';
  tenantId: string;
  clientId: string;
  clientSecret?: string;
  accessToken?: string;
  expiresAt?: number;
}

export interface EnvVarAuth {
  method: 'env_var';
  /** Environment variable name to read at call time (e.g. OPENAI_API_KEY). */
  envVarName: string;
}

export type AuthEntry =
  | ApiKeyAuth
  | OAuthAuth
  | AzureAdAuth
  | EnvVarAuth;

// ─── Provider Definition (static catalog) ─────────────────────────────────────

export type ProviderProtocol = 'openai' | 'anthropic' | 'gemini' | 'bedrock' | 'vertex';

export interface ProviderModelPreset {
  id: string;
  displayName: string;
  contextWindow?: number;
  supportsStreaming?: boolean;
  supportsToolUse?: boolean;
  supportsThinking?: boolean;
  maxOutputTokens?: number;
}

export interface ProviderDefinition {
  /** Stable id, e.g. 'openai', 'anthropic', 'custom:my-openai-proxy'. */
  id: string;
  /** Display name shown in the UI. */
  name: string;
  /** Icon name (mapped to lucide-react icon in the UI). */
  icon?: string;
  /** Protocol family — determines which adapter to use. */
  protocol: ProviderProtocol;
  /** Default base URL for API calls. */
  defaultBaseUrl: string;
  /** Auth methods this provider supports (in priority order). */
  supportedAuthMethods: AuthMethod[];
  /** Environment variable name used for env_var auth fallback. */
  envVarName?: string;
  /** Endpoint path for listing models (relative to baseUrl). */
  modelsEndpoint?: string;
  /** Hardcoded model presets. The UI also offers a 'Refresh from provider' button. */
  modelPresets: ProviderModelPreset[];
  /** Documentation URL shown in the UI. */
  docsUrl?: string;
  /** Whether this is a built-in provider (vs user-added custom). */
  isBuiltin: boolean;
  /** For custom providers, the user-defined baseUrl override. */
  customBaseUrl?: string;
}

// ─── Configured Provider (a definition + auth + overrides) ─────────────────────

export interface ConfiguredProvider {
  /** Matches a ProviderDefinition.id. */
  providerId: string;
  /** User-assigned label, defaults to the provider name. */
  label: string;
  /** Authentication credentials. */
  auth: AuthEntry;
  /** Per-provider model overrides (added via the UI). */
  customModels?: ProviderModelPreset[];
  /** Per-provider base URL override (for proxies / Azure deployments). */
  baseUrlOverride?: string;
  /** Per-provider default model id. */
  defaultModelId?: string;
  /** Whether this provider is enabled (can be toggled off without losing config). */
  enabled: boolean;
  /** ISO timestamp of last config change. */
  updatedAt: string;
}

// ─── Models ──────────────────────────────────────────────────────────────────

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
  /** Fully-qualified: <providerId>/<modelId>. */
  qualifiedId: string;
  providerId: string;
  displayName: string;
  contextWindow?: number;
  supportsStreaming: boolean;
  supportsToolUse: boolean;
  supportsThinking: boolean;
  /** Where this model came from. */
  source: 'preset' | 'discovered' | 'custom';
}

// ─── Chat (unified streaming pipeline) ────────────────────────────────────────

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
  /** Fully-qualified model id: <providerId>/<modelId>. */
  model: string;
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
  usage?: TokenUsage;
  toolCalls?: ToolCallInfo[];
  thinking?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens?: number;
}

export type StreamChunkType =
  | 'thinking'
  | 'content'
  | 'tool_call_start'
  | 'tool_call_delta'
  | 'tool_call_end'
  | 'tool_result'
  | 'usage'
  | 'done'
  | 'error';

export interface StreamChunk {
  type: StreamChunkType;
  content?: string;
  toolCall?: Partial<ToolCallInfo> & { index?: number };
  toolCallId?: string;
  toolResult?: { id: string; content: string; isError?: boolean };
  usage?: TokenUsage;
  error?: { message: string; code?: string };
}

// ─── Health ──────────────────────────────────────────────────────────────────

export interface HealthCheckResult {
  providerId: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latencyMs: number;
  lastCheckedAt: string;
  error?: string;
  /** Models count from last successful /models call (-1 = not supported). */
  modelCount?: number;
}

// ─── Session Binding ─────────────────────────────────────────────────────────

export interface SessionProviderBinding {
  sessionId: string;
  providerId: string;
  modelId: string;
  /** Optional per-session system prompt override. */
  systemPromptOverride?: string;
  /** Optional per-session temperature override. */
  temperatureOverride?: number;
}

// ─── auth.json on-disk format ────────────────────────────────────────────────

export interface AuthJsonShape {
  _schemaVersion: 3;
  /** Map of providerId -> ConfiguredProvider. */
  providers: Record<string, ConfiguredProvider>;
  /** Map of providerId -> cached discovered models (with timestamp). */
  discoveredModels?: Record<string, { models: DiscoveredModel[]; fetchedAt: string }>;
  /** Map of sessionId -> SessionProviderBinding. */
  sessionBindings?: Record<string, SessionProviderBinding>;
}

// ─── Legacy compat (kept for the chat UI / recipe executor to keep working) ───

export interface ProviderInfo {
  id: string;
  name: string;
  type: string;
  models: string[];
  isDefault: boolean;
  configured: boolean;
  enabled: boolean;
  authMethod?: AuthMethod;
  status?: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
}

export interface UnifiedModelInfo {
  id: string;
  providerId: string;
  displayName: string;
  contextWindow?: number;
  supportsStreaming: boolean;
  supportsToolUse: boolean;
  supportsThinking: boolean;
}

// Sentinel for "no provider configured" so callers can distinguish
// "no auth yet" from "auth failed" without throwing.
export const NO_AUTH = Symbol('NO_AUTH');
