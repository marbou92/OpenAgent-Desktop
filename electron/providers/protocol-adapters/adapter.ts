/**
 * OpenAgent-Desktop - Protocol Adapter Interface
 *
 * Each adapter knows how to:
 *   - Build the request URL and headers for a given ChatRequest + auth
 *   - Translate the unified ChatRequest into the provider's native format
 *   - Send the request (non-streaming) and parse the response into a ChatResponse
 *   - Send the request (streaming) and yield StreamChunk objects
 *   - Call the provider's /models endpoint and return DiscoveredModel[]
 *
 * Adapters are stateless; they receive a resolved auth + baseUrl per call.
 */

import {
  AuthEntry,
  ChatRequest,
  ChatResponse,
  DiscoveredModel,
  StreamChunk,
} from '../v3-types';

export interface AdapterCallContext {
  auth: AuthEntry;
  baseUrl: string;
  /** Optional AbortSignal for cancellation. */
  signal?: AbortSignal;
  /** Per-request timeout in ms (default: 120000 for non-stream, infinite for stream). */
  timeoutMs?: number;
}

export interface ProtocolAdapter {
  /** Protocol family this adapter handles. */
  protocol: 'openai' | 'anthropic' | 'gemini' | 'bedrock' | 'vertex';

  /** Non-streaming chat completion. */
  chat(request: ChatRequest, ctx: AdapterCallContext): Promise<ChatResponse>;

  /** Streaming chat completion. Returns an async generator of chunks. */
  chatStream(request: ChatRequest, ctx: AdapterCallContext): AsyncGenerator<StreamChunk>;

  /** Discover available models from the provider's /models endpoint. */
  discoverModels(ctx: AdapterCallContext): Promise<DiscoveredModel[]>;

  /** Build the auth headers / query params for a given auth entry.
   *  Returns { headers, query } — either may be empty. */
  buildAuth(auth: AuthEntry, baseUrl: string): { headers: Record<string, string>; query: Record<string, string> };
}
