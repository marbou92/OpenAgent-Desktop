/**
 * OpenAgent-Desktop - Mistral AI Provider
 * Mistral, Codestral, Pixtral models:
 * - Mistral-specific API format (also OpenAI-compatible)
 * - Function calling support
 * - SSE streaming
 * - Support MISTRAL_API_KEY env var
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

// ─── Mistral Models ────────────────────────────────────────────────────────────

export const MISTRAL_MODELS = [
  'mistral-large-latest',
  'mistral-medium-latest',
  'mistral-small-latest',
  'open-mistral-nemo',
  'open-codestral-mamba',
  'codestral-latest',
  'pixtral-large-latest',
  'mistral-embed',
] as const;

// ─── Mistral Provider ──────────────────────────────────────────────────────────

export class MistralProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) {
    super(config);
  }

  protected getDefaultHost(): string {
    return 'https://api.mistral.ai';
  }

  protected getDefaultBasePath(): string {
    return '/v1';
  }

  protected getApiKey(): string {
    const key =
      this.config.apiKey ||
      this.getEnvVar('MISTRAL_API_KEY') ||
      '';
    if (!key) {
      throw new ProviderError(
        'Mistral API key not configured. Set MISTRAL_API_KEY environment variable.',
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

      const data = await response.json();
      if (data.data && Array.isArray(data.data)) {
        return data.data
          .map((m: any) => m.id)
          .filter((id: string) => typeof id === 'string')
          .sort();
      }
    } catch {
      // Fall back
    }

    return [...MISTRAL_MODELS];
  }
}
