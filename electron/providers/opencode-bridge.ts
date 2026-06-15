/**
 * OpenAgent-Desktop Aether - OpenCode Server HTTP Bridge
 * 
 * HTTP client for communicating with the OpenCode sidecar server.
 */

import type { SidecarInstance } from '../sidecar/types';
import type { UnifiedProviderInfo, UnifiedModelInfo, ChatRequest, ChatResponse, StreamChunk } from './v2-types';

export class OpenCodeBridge {
  private instance: SidecarInstance | null = null;

  setInstance(instance: SidecarInstance): void {
    this.instance = instance;
  }

  getInstance(): SidecarInstance | null {
    return this.instance;
  }

  private getAuthHeader(): string {
    if (!this.instance) throw new Error('OpenCode sidecar not initialized');
    return 'Basic ' + Buffer.from(
      `${this.instance.username}:${this.instance.password}`
    ).toString('base64');
  }

  private getUrl(path: string): string {
    if (!this.instance) throw new Error('OpenCode sidecar not initialized');
    return `${this.instance.url}${path}`;
  }

  async listProviders(): Promise<UnifiedProviderInfo[]> {
    try {
      const response = await fetch(this.getUrl('/providers'), {
        headers: { Authorization: this.getAuthHeader() },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return [];
      const data = await response.json() as any[];
      return data.map(p => this.mapProviderInfo(p));
    } catch {
      return [];
    }
  }

  async listModels(providerId?: string): Promise<UnifiedModelInfo[]> {
    try {
      const url = providerId 
        ? this.getUrl(`/models?providerId=${encodeURIComponent(providerId)}`)
        : this.getUrl('/models');
      const response = await fetch(url, {
        headers: { Authorization: this.getAuthHeader() },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return [];
      const data = await response.json() as any[];
      return data.map(m => this.mapModelInfo(m));
    } catch {
      return [];
    }
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch(this.getUrl('/session/message'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.getAuthHeader(),
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenCode chat error ${response.status}: ${errorText}`);
    }

    return response.json() as Promise<ChatResponse>;
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    const response = await fetch(this.getUrl('/session/message'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.getAuthHeader(),
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        stream: true,
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      yield { type: 'done', content: `Error ${response.status}` };
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
          if (data === '[DONE]') { yield { type: 'done' }; return; }
          try {
            const parsed = JSON.parse(data);
            yield this.mapStreamEvent(parsed);
          } catch {
            // Skip malformed
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    yield { type: 'done' };
  }

  async healthCheck(providerId: string): Promise<{ status: string; latencyMs: number }> {
    const start = Date.now();
    try {
      const response = await fetch(this.getUrl(`/providers/${encodeURIComponent(providerId)}/health`), {
        method: 'POST',
        headers: { Authorization: this.getAuthHeader() },
        signal: AbortSignal.timeout(30000),
      });
      return { status: response.ok ? 'healthy' : 'unhealthy', latencyMs: Date.now() - start };
    } catch {
      return { status: 'unhealthy', latencyMs: Date.now() - start };
    }
  }

  async getHealthDashboard(): Promise<Record<string, unknown>> {
    try {
      const response = await fetch(this.getUrl('/providers/health'), {
        headers: { Authorization: this.getAuthHeader() },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return {};
      return response.json() as Promise<Record<string, unknown>>;
    } catch {
      return {};
    }
  }

  private mapProviderInfo(p: any): UnifiedProviderInfo {
    return {
      id: p.id || p.providerId || '',
      name: p.name || p.id || '',
      source: 'opencode',
      configured: p.configured ?? !!p.apiKey,
      isDefault: p.isDefault ?? false,
      status: p.status || 'unknown',
      models: (p.models || []).map((m: any) => this.mapModelInfo(typeof m === 'string' ? { id: m, providerId: p.id } : m)),
    };
  }

  private mapModelInfo(m: any): UnifiedModelInfo {
    return {
      id: m.id || m.modelId || '',
      providerId: m.providerId || '',
      displayName: m.displayName || m.name || m.id || '',
      contextWindow: m.contextWindow || m.context_window,
      supportsStreaming: m.supportsStreaming ?? m.capabilities?.streaming ?? true,
      supportsToolUse: m.supportsToolUse ?? m.capabilities?.toolUse ?? true,
      supportsThinking: m.supportsThinking ?? m.capabilities?.thinking ?? false,
    };
  }

  private mapStreamEvent(event: any): StreamChunk {
    switch (event.type) {
      case 'content':
      case 'text_delta':
        return { type: 'content', content: event.content || event.delta || event.text || '' };
      case 'thinking':
      case 'thinking_delta':
        return { type: 'thinking', content: event.content || event.delta || '' };
      case 'tool_call':
        return { type: 'tool_call', toolCall: event.toolCall || event };
      case 'tool_result':
        return { type: 'tool_result', content: event.content || '' };
      case 'usage':
        return { type: 'usage', usage: event.usage };
      case 'done':
      case 'message_stop':
        return { type: 'done' };
      default:
        return { type: 'content', content: event.content || event.delta || '' };
    }
  }
}
