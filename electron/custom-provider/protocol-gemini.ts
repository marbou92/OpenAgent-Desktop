/**
 * OpenAgent-Desktop Aether - Gemini Generate Content Protocol Handler
 * 
 * Handles communication with any Gemini API-compatible endpoint.
 */

import * as crypto from 'crypto';
import type { CustomProviderMessage, CustomProviderResponse, CustomProviderStreamChunk } from './types';

export class GeminiProtocolHandler {
  async chat(
    baseUrl: string,
    apiKey: string,
    model: string,
    messages: CustomProviderMessage[],
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<CustomProviderResponse> {
    const url = `${baseUrl.replace(/\/$/, '')}/models/${model}:generateContent?key=${apiKey}`;
    
    const contents = this.messagesToGeminiFormat(messages);
    const body: Record<string, unknown> = { contents };
    if (options?.maxTokens) {
      body.generationConfig = { ...((body.generationConfig as any) || {}), maxOutputTokens: options.maxTokens };
    }
    if (options?.temperature !== undefined) {
      body.generationConfig = { ...((body.generationConfig as any) || {}), temperature: options.temperature };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini protocol error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as any;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return {
      id: crypto.randomUUID(),
      content: text,
      model,
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount || 0,
        completionTokens: data.usageMetadata.candidatesTokenCount || 0,
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
    const url = `${baseUrl.replace(/\/$/, '')}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
    
    const contents = this.messagesToGeminiFormat(messages);
    const body: Record<string, unknown> = { contents };
    if (options?.maxTokens) {
      body.generationConfig = { maxOutputTokens: options.maxTokens };
    }
    if (options?.temperature !== undefined) {
      body.generationConfig = { ...((body.generationConfig as any) || {}), temperature: options.temperature };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              yield { type: 'content', content: text };
            }
            if (parsed.usageMetadata) {
              yield {
                type: 'usage',
                usage: {
                  promptTokens: parsed.usageMetadata.promptTokenCount || 0,
                  completionTokens: parsed.usageMetadata.candidatesTokenCount || 0,
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

  private messagesToGeminiFormat(messages: CustomProviderMessage[]): any[] {
    const contents: any[] = [];
    let systemInstruction: string | undefined;

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = msg.content;
        continue;
      }
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }

    return contents;
  }
}
