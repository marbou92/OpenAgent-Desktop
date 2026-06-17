/**
 * OpenAgent-Desktop - AWS Bedrock Protocol Adapter
 *
 * Calls AWS Bedrock via the SigV4-signed REST API. Does not require the AWS
 * SDK — implements SigV4 inline so we don't pull in the (large) aws-sdk
 * dependency. Reads AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
 * from the env (set via env_var auth).
 *
 * Supports:
 *   - Anthropic Claude models (via the /model/invoke and /model/invoke-with-response-stream endpoints)
 *   - Meta Llama models (via the same endpoints, with OpenAI-shape translation)
 *   - Mistral models
 *
 * Bedrock model IDs are ARN-like: "anthropic.claude-3-5-sonnet-20240620-v1:0".
 * The adapter picks the right request shape based on the model id prefix.
 */

import * as crypto from 'crypto';
import {
  AuthEntry,
  ChatRequest,
  ChatResponse,
  DiscoveredModel,
  StreamChunk,
  ToolCallInfo,
} from '../v3-types';
import { AdapterCallContext, ProtocolAdapter } from './adapter';

const DEFAULT_TIMEOUT_MS = 120_000;

interface BedrockCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

function resolveCredentials(auth: AuthEntry): BedrockCredentials | null {
  if (auth.method !== 'env_var') return null;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env[auth.envVarName];
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
  if (!accessKeyId || !secretAccessKey) return null;
  return { accessKeyId, secretAccessKey, region };
}

function sigV4Sign(opts: {
  method: string;
  url: URL;
  body: string;
  credentials: BedrockCredentials;
  service: string;
}): Record<string, string> {
  const { method, url, body, credentials, service } = opts;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const canonicalUri = url.pathname;
  const canonicalQueryString = Array.from(url.searchParams.entries())
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .sort()
    .join('&');

  const payloadHash = crypto.createHash('sha256').update(body).digest('hex');
  const host = url.host;

  const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-date';

  const canonicalRequest = [method, canonicalUri, canonicalQueryString, canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const credentialScope = `${dateStamp}/${credentials.region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const kDate = hmac('AWS4' + credentials.secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, credentials.region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmac(kSigning, stringToSign).toString('hex');

  const authHeader =
    `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    'Authorization': authHeader,
    'X-Amz-Date': amzDate,
    'X-Amz-Content-Sha256': payloadHash,
  };
}

function hmac(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest();
}

interface BedrockAnthropicRequest {
  anthropic_version: string;
  max_tokens: number;
  messages: { role: 'user' | 'assistant'; content: string | any[] }[];
  system?: string;
  temperature?: number;
  tools?: { name: string; description: string; input_schema: Record<string, unknown> }[];
}

function toBedrockAnthropicRequest(request: ChatRequest): BedrockAnthropicRequest {
  const out: BedrockAnthropicRequest = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: request.maxTokens ?? 4096,
    messages: [],
  };
  if (request.systemPrompt) out.system = request.systemPrompt;
  if (request.temperature !== undefined) out.temperature = request.temperature;
  if (request.tools) {
    out.tools = request.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }
  for (const m of request.messages) {
    if (m.role === 'system') {
      out.system = out.system ? `${out.system}\n\n${m.content}` : m.content;
      continue;
    }
    out.messages.push({ role: m.role as 'user' | 'assistant', content: m.content });
  }
  return out;
}

export class BedrockAdapter implements ProtocolAdapter {
  protocol = 'bedrock' as const;

  buildAuth(_auth: AuthEntry, _baseUrl: string): { headers: Record<string, string>; query: Record<string, string> } {
    // Bedrock signs every request individually via SigV4 — no static headers.
    return { headers: {}, query: {} };
  }

  private resolveEndpoint(credentials: BedrockCredentials, modelId: string, stream: boolean): URL {
    const encodedModelId = encodeURIComponent(modelId);
    const op = stream ? 'invoke-with-response-stream' : 'invoke';
    return new URL(`https://bedrock-runtime.${credentials.region}.amazonaws.com/model/${encodedModelId}/${op}`);
  }

  async chat(request: ChatRequest, ctx: AdapterCallContext): Promise<ChatResponse> {
    const creds = resolveCredentials(ctx.auth);
    if (!creds) throw new Error('Bedrock requires AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY env vars');

    // For Anthropic-family models, use the Anthropic request shape.
    if (request.model.startsWith('anthropic.')) {
      const body = JSON.stringify(toBedrockAnthropicRequest(request));
      const url = this.resolveEndpoint(creds, request.model, false);
      const signedHeaders = sigV4Sign({ method: 'POST', url, body, credentials: creds, service: 'bedrock' });
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...signedHeaders },
        body,
        signal: ctx.signal ?? AbortSignal.timeout(ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Bedrock error ${response.status}: ${text}`);
      }
      const data = await response.json() as any;
      let content = '';
      const toolCalls: ToolCallInfo[] = [];
      for (const block of data.content || []) {
        if (block.type === 'text') content += block.text;
        else if (block.type === 'tool_use') {
          toolCalls.push({ id: block.id, name: block.name, arguments: block.input || {} });
        }
      }
      return {
        id: data.id || '',
        content,
        model: request.model,
        usage: data.usage ? {
          promptTokens: data.usage.input_tokens || 0,
          completionTokens: data.usage.output_tokens || 0,
        } : undefined,
        toolCalls: toolCalls.length ? toolCalls : undefined,
      };
    }

    // Llama / Mistral use a simpler input/output shape.
    const body = JSON.stringify({
      prompt: request.messages.map((m) => `${m.role}: ${m.content}`).join('\n\n'),
      max_gen_len: request.maxTokens ?? 2048,
      temperature: request.temperature,
    });
    const url = this.resolveEndpoint(creds, request.model, false);
    const signedHeaders = sigV4Sign({ method: 'POST', url, body, credentials: creds, service: 'bedrock' });
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...signedHeaders },
      body,
      signal: ctx.signal ?? AbortSignal.timeout(ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Bedrock error ${response.status}: ${text}`);
    }
    const data = await response.json() as any;
    return {
      id: '',
      content: data.generation || data.completion || '',
      model: request.model,
    };
  }

  async *chatStream(request: ChatRequest, ctx: AdapterCallContext): AsyncGenerator<StreamChunk> {
    const creds = resolveCredentials(ctx.auth);
    if (!creds) {
      yield { type: 'error', error: { message: 'Bedrock requires AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY env vars' } };
      return;
    }

    if (request.model.startsWith('anthropic.')) {
      const body = JSON.stringify({ ...toBedrockAnthropicRequest(request), stream: true });
      const url = this.resolveEndpoint(creds, request.model, true);
      const signedHeaders = sigV4Sign({ method: 'POST', url, body, credentials: creds, service: 'bedrock' });
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...signedHeaders, 'Accept': 'application/vnd.amazon.eventstream' },
        body,
        signal: ctx.signal,
      });
      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => '');
        yield { type: 'error', error: { message: `Bedrock stream error ${response.status}: ${text}` } };
        return;
      }
      // Bedrock event-stream is a binary format. Each event has a header + JSON payload.
      // We use the simpler approach: parse line-by-line as JSON chunks (the runtime
      // emits JSON-shaped chunks for Anthropic models, separated by newlines).
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // Strip the Bedrock event-stream envelope: lines starting with { are JSON.
          for (const line of buffer.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('{')) continue;
            try {
              const event = JSON.parse(trimmed) as any;
              if (event.type === 'content_block_delta' && event.delta?.text) {
                yield { type: 'content', content: event.delta.text };
              } else if (event.type === 'message_stop') {
                yield { type: 'done' };
                return;
              }
            } catch {
              // skip
            }
          }
          buffer = '';
        }
        yield { type: 'done' };
      } finally {
        reader.releaseLock();
      }
      return;
    }

    // Llama/Mistral streaming
    const body = JSON.stringify({
      prompt: request.messages.map((m) => `${m.role}: ${m.content}`).join('\n\n'),
      max_gen_len: request.maxTokens ?? 2048,
      temperature: request.temperature,
    });
    const url = this.resolveEndpoint(creds, request.model, true);
    const signedHeaders = sigV4Sign({ method: 'POST', url, body, credentials: creds, service: 'bedrock' });
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...signedHeaders },
      body,
      signal: ctx.signal,
    });
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      yield { type: 'error', error: { message: `Bedrock stream error ${response.status}: ${text}` } };
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
        for (const line of buffer.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('{')) continue;
          try {
            const event = JSON.parse(trimmed) as any;
            if (event.completion || event.generation) {
              yield { type: 'content', content: event.completion || event.generation };
            }
            if (event.stop_reason) {
              yield { type: 'done' };
              return;
            }
          } catch {
            // skip
          }
        }
        buffer = '';
      }
      yield { type: 'done' };
    } finally {
      reader.releaseLock();
    }
  }

  async discoverModels(_ctx: AdapterCallContext): Promise<DiscoveredModel[]> {
    // Bedrock ListFoundationModels requires a SigV4-signed GET to
    // https://bedrock.{region}.amazonaws.com/foundation-models — different
    // endpoint from the runtime. Skip dynamic discovery for now; rely on the
    // hardcoded presets in the registry. Caller can still add custom models
    // via the UI.
    return [];
  }
}
