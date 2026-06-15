/**
 * OpenAgent-Desktop Aether - Custom Protocol Provider Types
 * 
 * Types for custom provider endpoints that speak Anthropic, OpenAI, or Gemini API formats.
 * Extracted from OpenCowork's provider logic.
 */

export type CustomProtocolType = 'anthropic' | 'openai' | 'gemini';

export interface CustomProviderConfig {
  id: string;
  name: string;
  type: 'custom';
  protocol: CustomProtocolType;
  baseUrl: string;
  apiKey: string;
  models: CustomProviderModel[];
  isDefault?: boolean;
  enabled?: boolean;
  createdAt?: number;
}

export interface CustomProviderModel {
  id: string;
  name: string;
  contextWindow?: number;
  maxTokens?: number;
  supportsStreaming?: boolean;
  supportsToolUse?: boolean;
  supportsThinking?: boolean;
}

export interface CustomProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CustomProviderResponse {
  id: string;
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface CustomProviderStreamChunk {
  type: 'thinking' | 'content' | 'tool_call' | 'tool_result' | 'usage' | 'done';
  content?: string;
  toolCall?: {
    id: string;
    name: string;
    arguments: string;
  };
  toolResult?: {
    id: string;
    result: string;
  };
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface CustomProviderPreset {
  name: string;
  protocol: CustomProtocolType;
  baseUrl: string;
  models: CustomProviderModel[];
}
