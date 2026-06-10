/**
 * OpenAgent-Desktop - Groq Provider
 * High-performance inference provider:
 * - Ultra-fast LLM inference using LPU technology
 * - Support for Llama, Mixtral, Gemma models
 * - OpenAI-compatible API
 * - Function calling support
 * - SSE streaming
 */

import {
  ProviderConfig,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  ProviderError,
  ProviderErrorType,
  ProviderType,
} from './types';
import { OpenAIProvider } from './openai-provider';

// ─── Groq Models ───────────────────────────────────────────────────────────────

export const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'llama3-70b-8192',
  'llama3-8b-8192',
  'mixtral-8x7b-32768',
  'gemma2-9b-it',
  'whisper-large-v3',
  'distil-whisper-large-v3-en',
] as const;

// ─── Groq Provider ─────────────────────────────────────────────────────────────

export class GroqProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) {
    super(config);
  }

  protected getDefaultHost(): string {
    return 'https://api.groq.com';
  }

  protected getDefaultBasePath(): string {
    return '/openai/v1';
  }

  protected getApiKey(): string {
    const key =
      this.config.apiKey ||
      this.getEnvVar('GROQ_API_KEY') ||
      '';
    if (!key) {
      throw new ProviderError(
        'Groq API key not configured. Set GROQ_API_KEY environment variable.',
        ProviderErrorType.AUTHENTICATION,
        this.id
      );
    }
    return key;
  }

  async listModels(): Promise<string[]> {
    if (this.config.models && this.config.models.length > 0) {
      return this.config.models;
    }

    try {
      const apiKey = this.getApiKey();
      const url = `${this.getBaseUrl()}/models`;

      const response = await this.makeRequest(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      const data = await response.json() as Record<string, any>;
      if (data.data && Array.isArray(data.data)) {
        return data.data
          .map((m: any) => m.id)
          .filter((id: string) => typeof id === 'string')
          .sort();
      }
    } catch {
      // Fall back
    }

    return [...GROQ_MODELS];
  }
}
