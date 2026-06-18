/**
 * OpenAgent-Desktop - Google Vertex AI Protocol Adapter
 *
 * Calls Vertex AI's Gemini and Claude endpoints via OAuth2 access tokens
 * ( GOOGLE_APPLICATION_CREDENTIALS / GOOGLE_VERTEX_PROJECT / GOOGLE_VERTEX_REGION ).
 * For Gemini models, uses the Vertex-native generateContent endpoint.
 * For Claude models, delegates to the Anthropic adapter against Vertex's
 * /v1/messages/raw endpoint.
 */

import {
  AuthProvider,
  ChatRequest,
  ChatResponse,
  DiscoveredModel,
  StreamChunk,
} from '../opencode-types';
import { AdapterCallContext, ProtocolAdapter } from './adapter';
import { AnthropicAdapter } from './anthropic-adapter';

const DEFAULT_TIMEOUT_MS = 120_000;

interface VertexContext {
  projectId: string;
  region: string;
  accessToken: string;
}

function resolveVertexContext(auth: AuthProvider): VertexContext | null {
  if (auth.type !== 'api') return null;
  const projectId = process.env.GOOGLE_VERTEX_PROJECT || process.env.GOOGLE_VERTEX_PROJECT;
  const region = process.env.GOOGLE_VERTEX_REGION || 'us-central1';
  // Vertex typically uses gcloud's application-default credentials, which set
  // GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON file. We can't
  // easily exchange that for an access token without the google-auth-library
  // — so we require the user to set GOOGLE_VERTEX_ACCESS_TOKEN directly OR
  // run `gcloud auth print-access-token` and paste it into the env var.
  // For now we support the simpler GOOGLE_VERTEX_ACCESS_TOKEN path; full
  // service-account exchange can be added later.
  const accessToken = process.env.GOOGLE_VERTEX_ACCESS_TOKEN;
  if (!projectId || !accessToken) return null;
  return { projectId, region, accessToken };
}

export class VertexAdapter implements ProtocolAdapter {
  protocol = 'vertex' as const;
  private anthropicAdapter = new AnthropicAdapter();

  buildAuth(auth: AuthProvider, _baseUrl: string): { headers: Record<string, string>; query: Record<string, string> } {
    const ctx = resolveVertexContext(auth);
    if (!ctx) return { headers: {}, query: {} };
    return { headers: { 'Authorization': `Bearer ${ctx.accessToken}` }, query: {} };
  }

  private resolveBaseUrl(model: string, ctx: VertexContext): string {
    // Claude models hosted on Vertex use a different endpoint family.
    if (model.startsWith('claude')) {
      return `https://${ctx.region}-aiplatform.googleapis.com/v1/projects/${ctx.projectId}/locations/${ctx.region}/publishers/anthropic`;
    }
    return `https://${ctx.region}-aiplatform.googleapis.com/v1/projects/${ctx.projectId}/locations/${ctx.region}`;
  }

  async chat(request: ChatRequest, callCtx: AdapterCallContext): Promise<ChatResponse> {
    const vctx = resolveVertexContext(callCtx.auth);
    if (!vctx) throw new Error('Vertex requires GOOGLE_VERTEX_PROJECT and GOOGLE_VERTEX_ACCESS_TOKEN env vars');

    if (request.model.startsWith('claude')) {
      // Delegate to the Anthropic adapter, pointing at the Vertex endpoint.
      return this.anthropicAdapter.chat(request, {
        ...callCtx,
        baseUrl: this.resolveBaseUrl(request.model, vctx) + '/models/' + request.model,
      });
    }

    // Gemini on Vertex
    const url = `${this.resolveBaseUrl(request.model, vctx)}/publishers/google/models/${request.model}:generateContent`;
    const body = this.buildGeminiBody(request);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vctx.accessToken}` },
      body: JSON.stringify(body),
      signal: callCtx.signal ?? AbortSignal.timeout(callCtx.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Vertex error ${response.status}: ${text}`);
    }
    const data = await response.json() as any;
    const parts = data.candidates?.[0]?.content?.parts || [];
    let content = '';
    for (const part of parts) if (part.text) content += part.text;
    return {
      id: data.responseId || '',
      content,
      model: request.model,
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount || 0,
        completionTokens: data.usageMetadata.candidatesTokenCount || 0,
      } : undefined,
    };
  }

  async *chatStream(request: ChatRequest, callCtx: AdapterCallContext): AsyncGenerator<StreamChunk> {
    const vctx = resolveVertexContext(callCtx.auth);
    if (!vctx) {
      yield { type: 'error', error: { message: 'Vertex requires GOOGLE_VERTEX_PROJECT and GOOGLE_VERTEX_ACCESS_TOKEN env vars' } };
      return;
    }
    if (request.model.startsWith('claude')) {
      yield* this.anthropicAdapter.chatStream(request, {
        ...callCtx,
        baseUrl: this.resolveBaseUrl(request.model, vctx) + '/models/' + request.model,
      });
      return;
    }
    const url = `${this.resolveBaseUrl(request.model, vctx)}/publishers/google/models/${request.model}:streamGenerateContent?alt=sse`;
    const body = this.buildGeminiBody(request);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vctx.accessToken}`, 'Accept': 'text/event-stream' },
      body: JSON.stringify(body),
      signal: callCtx.signal,
    });
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      yield { type: 'error', error: { message: `Vertex stream error ${response.status}: ${text}` } };
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            const event = JSON.parse(payload) as any;
            const parts = event.candidates?.[0]?.content?.parts || [];
            for (const part of parts) {
              if (part.text) yield { type: 'content', content: part.text };
            }
          } catch {
            // skip
          }
        }
      }
      yield { type: 'done' };
    } finally {
      reader.releaseLock();
    }
  }

  async discoverModels(_ctx: AdapterCallContext): Promise<DiscoveredModel[]> {
    // Vertex model discovery requires a list call to
    // https://{region}-aiplatform.googleapis.com/v1/projects/{project}/locations/{region}/models
    // — gated by a heavy permission scope. Skip for now; rely on presets.
    return [];
  }

  private buildGeminiBody(request: ChatRequest): Record<string, unknown> {
    const contents = request.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const body: Record<string, unknown> = { contents };
    if (request.systemPrompt) body.systemInstruction = { parts: [{ text: request.systemPrompt }] };
    if (request.maxTokens || request.temperature !== undefined) {
      body.generationConfig = {
        ...(request.maxTokens ? { maxOutputTokens: request.maxTokens } : {}),
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      };
    }
    return body;
  }
}
