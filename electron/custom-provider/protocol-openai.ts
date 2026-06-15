/**
 * OpenAgent-Desktop Aether - OpenAI Chat Completions Protocol Handler
 * 
 * Handles communication with any OpenAI Chat API-compatible endpoint.
 */

import * as crypto from 'crypto';
import type { CustomProviderMessage, CustomProviderResponse, CustomProviderStreamChunk } from './types';

export class OpenAIProtocolHandler {
  async chat(
    baseUrl: string,
    apiKey: string,
    model: string,
    messages: CustomProviderMessage[],
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<CustomProviderResponse> {
    const url = baseUrl.replace(/\/$/, '') + '/chat/completions';
    
    const body: Record<string, unknown> = {
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    };
    if (options?.maxTokens) body.max_tokens = options.maxTokens;
    if (options?.temperature !== undefined) body.temperature = options.temperature;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI protocol error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as any;
    return {
      id: data.id || crypto.randomUUID(),
      content: data.choices?.[0]?.message?.content || '',
      model: data.model || model,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens || 0,
        completionTokens: data.usage.completion_tokens || 0,
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
    const url = baseUrl.replace(/\/$/, '') + '/chat/completions';
    
    const body: Record<string, unknown> = {
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
    };
    if (options?.maxTokens) body.max_tokens = options.maxTokens;
    if (options?.temperature !== undefined) body.temperature = options.temperature;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      yield { type: 'done', content: `Error ${response.status}: ${errorText}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: 'done' };
      return;
    }

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
          if (data === '[DONE]') {
            yield { type: 'done' };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            
            if (delta?.content) {
              yield { type: 'content', content: delta.content };
            }
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                yield {
                  type: 'tool_call',
                  toolCall: {
                    id: tc.id || '',
                    name: tc.function?.name || '',
                    arguments: tc.function?.arguments || '',
                  },
                };
              }
            }
            if (parsed.usage) {
              yield {
                type: 'usage',
                usage: {
                  promptTokens: parsed.usage.prompt_tokens || 0,
                  completionTokens: parsed.usage.completion_tokens || 0,
                },
              };
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
