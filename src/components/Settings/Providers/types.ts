/**
 * OpenAgent-Desktop - Provider Definition (renderer-side types)
 *
 * Mirrors the main-process ProviderDefinition so the UI can render the
 * catalog without making an IPC call per item.
 */

export type AuthMethod = 'api_key' | 'oauth' | 'azure_ad' | 'env_var';
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
  id: string;
  name: string;
  icon?: string;
  protocol: ProviderProtocol;
  defaultBaseUrl: string;
  supportedAuthMethods: AuthMethod[];
  envVarName?: string;
  modelsEndpoint?: string;
  modelPresets: ProviderModelPreset[];
  docsUrl?: string;
  isBuiltin: boolean;
  customBaseUrl?: string;
}

export interface ConfiguredProvider {
  providerId: string;
  label: string;
  auth: {
    method: AuthMethod;
    apiKey?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    scope?: string;
    tenantId?: string;
    clientId?: string;
    clientSecret?: string;
    envVarName?: string;
  };
  customModels?: ProviderModelPreset[];
  baseUrlOverride?: string;
  defaultModelId?: string;
  enabled: boolean;
  updatedAt: string;
}

export interface DiscoveredModel {
  id: string;
  displayName?: string;
  contextWindow?: number;
  supportsStreaming?: boolean;
  supportsToolUse?: boolean;
  supportsThinking?: boolean;
  fetchedAt?: string;
}

export interface ResolvedModel {
  id: string;
  qualifiedId: string;
  providerId: string;
  displayName: string;
  contextWindow?: number;
  supportsStreaming: boolean;
  supportsToolUse: boolean;
  supportsThinking: boolean;
  source: 'preset' | 'discovered' | 'custom';
}

export interface HealthCheckResult {
  providerId: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latencyMs: number;
  lastCheckedAt: string;
  error?: string;
  modelCount?: number;
}

export interface SessionProviderBinding {
  sessionId: string;
  providerId: string;
  modelId: string;
  systemPromptOverride?: string;
  temperatureOverride?: number;
}
