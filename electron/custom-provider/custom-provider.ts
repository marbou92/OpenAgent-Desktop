/**
 * OpenAgent-Desktop Aether - Custom Protocol Provider
 * 
 * Routes chat requests to the appropriate protocol handler
 * based on the provider's configured protocol type.
 */

import { EventEmitter } from 'events';
import { OpenAIProtocolHandler } from './protocol-openai';
import { AnthropicProtocolHandler } from './protocol-anthropic';
import { GeminiProtocolHandler } from './protocol-gemini';
import type {
  CustomProviderConfig,
  CustomProviderMessage,
  CustomProviderResponse,
  CustomProviderStreamChunk,
} from './types';

export class CustomProvider extends EventEmitter {
  private openaiHandler = new OpenAIProtocolHandler();
  private anthropicHandler = new AnthropicProtocolHandler();
  private geminiHandler = new GeminiProtocolHandler();

  async chat(
    config: CustomProviderConfig,
    messages: CustomProviderMessage[],
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<CustomProviderResponse> {
    const model = config.models[0]?.id || 'default';
    return this.getHandler(config.protocol).chat(
      config.baseUrl,
      config.apiKey,
      model,
      messages,
      options,
    );
  }

  async *chatStream(
    config: CustomProviderConfig,
    messages: CustomProviderMessage[],
    options?: { maxTokens?: number; temperature?: number }
  ): AsyncGenerator<CustomProviderStreamChunk> {
    const model = config.models[0]?.id || 'default';
    yield* this.getHandler(config.protocol).chatStream(
      config.baseUrl,
      config.apiKey,
      model,
      messages,
      options,
    );
  }

  async healthCheck(config: CustomProviderConfig): Promise<{ status: string; latencyMs: number }> {
    const start = Date.now();
    try {
      const handler = this.getHandler(config.protocol);
      await handler.chat(
        config.baseUrl,
        config.apiKey,
        config.models[0]?.id || 'default',
        [{ role: 'user', content: 'ping' }],
        { maxTokens: 1 },
      );
      return { status: 'healthy', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'unhealthy', latencyMs: Date.now() - start };
    }
  }

  private getHandler(protocol: string) {
    switch (protocol) {
      case 'anthropic': return this.anthropicHandler;
      case 'gemini': return this.geminiHandler;
      case 'openai':
      default: return this.openaiHandler;
    }
  }
}
