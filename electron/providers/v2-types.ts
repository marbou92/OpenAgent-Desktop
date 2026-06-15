/**
 * OpenAgent-Desktop Aether - Unified Provider Types (v2)
 * 
 * Simplified types for the dual-engine provider system:
 * OpenCode sidecar (primary) + Custom Protocol providers (fallback).
 */

export type ProviderSource = 'opencode' | 'custom';

export interface UnifiedProviderInfo {
  id: string;
  name: string;
  source: ProviderSource;
  configured: boolean;
  isDefault: boolean;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  models: UnifiedModelInfo[];
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

export interface ChatRequest {
  model: string;
  messages: { role: string; content: string }[];
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
}

export interface ChatResponse {
  id: string;
  content: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface StreamChunk {
  type: 'thinking' | 'content' | 'tool_call' | 'tool_result' | 'usage' | 'done';
  content?: string;
  toolCall?: any;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// Keep HealthStatus enum for compatibility
export enum HealthStatus {
  healthy = 'healthy',
  degraded = 'degraded',
  unhealthy = 'unhealthy',
  unknown = 'unknown',
}

// Legacy compatibility types
export interface ProviderConfig {
  id: string;
  type: string;
  name: string;
  apiKey?: string;
  baseUrl?: string;
  models?: string[];
  enabled?: boolean;
  isDefault?: boolean;
}

export interface ProviderInfo {
  id: string;
  name: string;
  type: string;
  models: string[];
  isDefault: boolean;
  configured: boolean;
}
