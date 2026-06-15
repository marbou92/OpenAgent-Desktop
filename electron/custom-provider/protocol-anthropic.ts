/**
 * OpenAgent-Desktop Aether - Anthropic Messages Protocol Handler
 * 
 * Handles communication with any Anthropic Messages API-compatible endpoint.
 */

import * as crypto from 'crypto';
import type { CustomProviderMessage, CustomProviderResponse, CustomProviderStreamChunk } from './types';

export class AnthropicProtocolHandler {
  async chat(
    baseUrl: string,
    apiKey: string,
    model: string,
    messages: CustomProviderMessage[],
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<CustomProviderResponse> {
    const url = baseUrl.replace(/\/$/, '') + '/messages';
    
    // Anthropic requires system message separate from messages array
    const systemMessage = messages.find(m => m.role === 'system')?.content;
    const chatMessages = messages.filter(m => m.role !== 'system');

    const body: Record<string, unknown> = {
      model,
      messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: options?.maxTokens || 4096,
    };
    if (systemMessage) body.system = systemMessage;
    if (options?.temperature !== undefined) body.temperature = options.temperature;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic protocol error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as any;
    const textBlock = data.content?.find((b: any) => b.type === 'text');
    return {
      id: data.id || crypto.randomUUID(),
      content: textBlock?.text || '',
      model: data.model || model,
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens || 0,
        completionTokens: data.usage.output_tokens || 0,
      } : undefined,
    };
  }

  async *chatStream(
    baseUrl: string,
    apiKey: string,
    model: string,
    messages: CustomProviderMessage[],
    options?: { maxTokens?: number; temperature?: number }
  ): AsyncGenerator<CustomProviderStreamChunk> {
    const url = baseUrl.replace(/\/$/, '') + '/messages';
    
    const systemMessage = messages.find(m => m.role === 'system')?.content;
    const chatMessages = messages.filter(m => m.role !== 'system');

    const body: Record<string, unknown> = {
      model,
      messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: options?.maxTokens || 4096,
      stream: true,
    };
    if (systemMessage) body.system = systemMessage;
    if (options?.temperature !== undefined) body.temperature = options.temperature;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      yield { type: 'done', content: `Error ${response.status}: ${errorText}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) { yield { type: 'done' }; return; }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          
          const data = trimmed.slice(6);
          try {
            const parsed = JSON.parse(data);
            
            if (parsed.type === 'content_block_delta') {
              if (parsed.delta?.type === 'text_delta') {
                yield { type: 'content', content: parsed.delta.text };
              } else if (parsed.delta?.type === 'thinking_delta') {
                yield { type: 'thinking', content: parsed.delta.thinking };
              }
            } else if (parsed.type === 'tool_use') {
              yield {
                type: 'tool_call',
                toolCall: {
                  id: parsed.id || '',
                  name: parsed.name || '',
                  arguments: typeof parsed.input === 'string' ? parsed.input : JSON.stringify(parsed.input),
                },
              };
            } else if (parsed.type === 'message_delta' && parsed.usage) {
              yield {
                type: 'usage',
                usage: {
                  promptTokens: 0,
                  completionTokens: parsed.usage.output_tokens || 0,
                },
              };
            } else if (parsed.type === 'message_stop') {
              yield { type: 'done' };
              return;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: 'done' };
  }
}
