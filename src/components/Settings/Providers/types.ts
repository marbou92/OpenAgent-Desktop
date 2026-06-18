/**
 * OpenAgent-Desktop - Provider Definition (renderer-side types)
 *
 * Mirrors the main-process opencode-types so the UI can render the
 * catalog without making an IPC call per item.
 */

export type AuthMethod = 'api' | 'oauth' | 'wellknown';
export type ProviderProtocol = 'openai' | 'anthropic' | 'gemini' | 'bedrock' | 'vertex' | 'github-copilot' | 'openai-compatible';

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
  cost?: { input: number; output: number; cache_read?: number; cache_write?: number };
  limit?: { context: number; input?: number; output: number };
  modalities?: { input?: string[]; output?: string[] };
  status?: string;
}

export interface ProviderOptions {
  apiKey?: string;
  baseURL?: string;
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
  authMethods?: AuthMethod[];
  isBuiltin?: boolean;
  icon?: string;
  docsUrl?: string;
  protocol?: string;
}

export interface AuthProvider {
  type: AuthMethod;
  key?: string;
  access?: string;
  refresh?: string;
  expires?: number;
  token?: string;
  accountId?: string;
  metadata?: Record<string, string>;
}

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
  qualifiedId: string;
  providerId: string;
  displayName: string;
  contextWindow?: number;
  maxOutput?: number;
  supportsStreaming: boolean;
  supportsToolUse: boolean;
  supportsThinking: boolean;
  supportsAttachment?: boolean;
  cost?: { input: number; output: number };
  status?: string;
  source: 'models-dev' | 'preset' | 'custom';
}

export interface HealthCheckResult {
  providerId: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latencyMs: number;
  lastCheckedAt: string;
  error?: string;
  modelCount?: number;
}
