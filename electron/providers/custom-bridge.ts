/**
 * OpenAgent-Desktop Aether - Custom Provider Bridge
 * 
 * Delegates chat requests to the CustomProtocolProvider
 * for non-OpenCode endpoints.
 */

import { CustomProvider } from '../custom-provider';
import type { CustomProviderConfig, CustomProviderMessage } from '../custom-provider/types';
import type { ChatRequest, ChatResponse, StreamChunk, UnifiedProviderInfo, UnifiedModelInfo } from './v2-types';

export class CustomBridge {
  private customProvider: CustomProvider;

  constructor() {
    this.customProvider = new CustomProvider();
  }

  async chat(config: CustomProviderConfig, request: ChatRequest): Promise<ChatResponse> {
    const messages: CustomProviderMessage[] = request.messages.map(m => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));

    const response = await this.customProvider.chat(config, messages, {
      maxTokens: request.maxTokens,
      temperature: request.temperature,
    });

    return {
      id: response.id,
      content: response.content,
      model: response.model,
      usage: response.usage,
    };
  }

  async *chatStream(config: CustomProviderConfig, request: ChatRequest): AsyncGenerator<StreamChunk> {
    const messages: CustomProviderMessage[] = request.messages.map(m => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));

    yield* this.customProvider.chatStream(config, messages, {
      maxTokens: request.maxTokens,
      temperature: request.temperature,
    });
  }

  async healthCheck(config: CustomProviderConfig): Promise<{ status: string; latencyMs: number }> {
    return this.customProvider.healthCheck(config);
  }

  configToProviderInfo(config: CustomProviderConfig): UnifiedProviderInfo {
    return {
      id: config.id,
      name: config.name,
      source: 'custom',
      configured: !!config.apiKey,
      isDefault: config.isDefault ?? false,
      status: 'unknown',
      models: config.models.map(m => this.modelToInfo(config.id, m)),
    };
  }

  private modelToInfo(providerId: string, model: any): UnifiedModelInfo {
    return {
      id: `${providerId}/${model.id}`,
      providerId,
      displayName: model.name || model.id,
      contextWindow: model.contextWindow,
      supportsStreaming: model.supportsStreaming ?? true,
      supportsToolUse: model.supportsToolUse ?? false,
      supportsThinking: model.supportsThinking ?? false,
    };
  }
}
