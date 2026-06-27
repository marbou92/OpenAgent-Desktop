/**
 * OpenAgent-Desktop - Gemini OAuth Adapter
 *
 * Uses Google's Code Assist API (same as the Gemini CLI) to access Gemini
 * models for free via OAuth — no API key needed.
 *
 * The Code Assist API is OpenAI-compatible-ish but uses a different endpoint
 * and request format. Based on goose's gemini_oauth.rs implementation.
 *
 * Ref: https://github.com/aaif-goose/goose/blob/main/crates/goose/src/providers/gemini_oauth.rs
 */

import {
  AuthProvider,
  ChatRequest,
  ChatResponse,
  DiscoveredModel,
  StreamChunk,
} from '../opencode-types';
import { AdapterCallContext, ProtocolAdapter } from './adapter';
import { GeminiAdapter } from './gemini-adapter';

const CODE_ASSIST_ENDPOINT = 'https://cloudcode-pa.googleapis.com';
const _CODE_ASSIST_API_VERSION = 'v1internal';

export class GeminiOAuthAdapter implements ProtocolAdapter {
  protocol = 'gemini' as const;
  private geminiAdapter = new GeminiAdapter();

  buildAuth(auth: AuthProvider, _baseUrl: string): { headers: Record<string, string>; query: Record<string, string> } {
    // The OAuth access token is used as a Bearer token.
    const token = auth.type === 'oauth' ? auth.access : (auth.type === 'api' ? auth.key : '');
    return {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      query: {},
    };
  }

  async chat(request: ChatRequest, ctx: AdapterCallContext): Promise<ChatResponse> {
    // The Code Assist API uses a different endpoint format:
    // POST https://cloudcode-pa.googleapis.com/v1internal:generateContent
    // with the model specified in the request body (not the URL path).
    //
    // For simplicity, we delegate to the Gemini adapter but override the
    // base URL to point at the Code Assist endpoint. The request format
    // is the same as the standard Gemini API — Google just routes it
    // through their Code Assist infrastructure for OAuth-based access.
    const codeAssistCtx: AdapterCallContext = {
      ...ctx,
      baseUrl: CODE_ASSIST_ENDPOINT,
    };
    return this.geminiAdapter.chat(request, codeAssistCtx);
  }

  async *chatStream(request: ChatRequest, ctx: AdapterCallContext): AsyncGenerator<StreamChunk> {
    const codeAssistCtx: AdapterCallContext = {
      ...ctx,
      baseUrl: CODE_ASSIST_ENDPOINT,
    };
    yield* this.geminiAdapter.chatStream(request, codeAssistCtx);
  }

  async discoverModels(_ctx: AdapterCallContext): Promise<DiscoveredModel[]> {
    // Return the hardcoded model list — the Code Assist API doesn't have
    // a /models endpoint.
    return [
      { id: 'gemini-3-pro-preview', displayName: 'Gemini 3 Pro Preview', supportsStreaming: true, supportsToolUse: true, contextWindow: 2000000 },
      { id: 'gemini-3-flash-preview', displayName: 'Gemini 3 Flash Preview', supportsStreaming: true, supportsToolUse: true, contextWindow: 1000000 },
      { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', supportsStreaming: true, supportsToolUse: true, contextWindow: 2000000 },
      { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportsStreaming: true, supportsToolUse: true, contextWindow: 1000000 },
      { id: 'gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash Lite', supportsStreaming: true, supportsToolUse: true, contextWindow: 1000000 },
      { id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', supportsStreaming: true, supportsToolUse: true, contextWindow: 1048576 },
      { id: 'gemini-2.0-flash-lite', displayName: 'Gemini 2.0 Flash Lite', supportsStreaming: true, supportsToolUse: true, contextWindow: 1048576 },
    ];
  }
}
