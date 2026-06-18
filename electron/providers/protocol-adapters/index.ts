/**
 * OpenAgent-Desktop - Protocol Adapter Index
 *
 * Maps a provider protocol to its adapter implementation. The ProviderClient
 * looks up the adapter here per chat call.
 */

import { ProviderDefinition, AuthProvider, ChatRequest, ChatResponse, DiscoveredModel, StreamChunk } from '../opencode-types';
import { ProtocolAdapter, AdapterCallContext } from './adapter';
import { OpenAIAdapter } from './openai-adapter';
import { AnthropicAdapter } from './anthropic-adapter';
import { GeminiAdapter } from './gemini-adapter';
import { BedrockAdapter } from './bedrock-adapter';
import { VertexAdapter } from './vertex-adapter';
import { GithubCopilotAdapter } from './github-copilot-adapter';
import { GeminiOAuthAdapter } from './gemini-oauth-adapter';

// OpenAI-compatible adapter — delegates to OpenAIAdapter but declares a
// different protocol label. Used for custom providers (Ollama, LM Studio, etc.).
class OpenAICompatibleAdapter implements ProtocolAdapter {
  protocol = 'openai-compatible' as const;
  private inner = new OpenAIAdapter();

  buildAuth(auth: AuthProvider, baseUrl: string) { return this.inner.buildAuth(auth, baseUrl); }
  chat(request: ChatRequest, ctx: AdapterCallContext) { return this.inner.chat(request, ctx); }
  chatStream(request: ChatRequest, ctx: AdapterCallContext) { return this.inner.chatStream(request, ctx); }
  discoverModels(ctx: AdapterCallContext) { return this.inner.discoverModels(ctx); }
}

const ADAPTERS: Record<string, ProtocolAdapter> = {
  openai: new OpenAIAdapter(),
  anthropic: new AnthropicAdapter(),
  gemini: new GeminiAdapter(),
  bedrock: new BedrockAdapter(),
  vertex: new VertexAdapter(),
  'github-copilot': new GithubCopilotAdapter(),
  'openai-compatible': new OpenAICompatibleAdapter(),
};

/**
 * Get the right adapter for a provider definition.
 * Falls back to OpenAI-compatible for unknown protocols.
 */
export function getAdapterForProvider(def: ProviderDefinition): ProtocolAdapter {
  // GitHub Copilot has its own adapter.
  if (def.id === 'github-copilot') return ADAPTERS['github-copilot'];

  // Gemini OAuth has its own adapter (Code Assist API).
  if (def.id === 'gemini-oauth') return new GeminiOAuthAdapter();

  // Custom providers (Ollama, LM Studio, etc.) use the OpenAI-compatible adapter.
  if (!def.isBuiltin || def.id.startsWith('custom:')) {
    return ADAPTERS['openai-compatible'];
  }

  // Map provider IDs to protocol adapters.
  const protocolMap: Record<string, string> = {
    'openai': 'openai',
    'anthropic': 'anthropic',
    'google': 'gemini',
    'google-vertex': 'vertex',
    'amazon-bedrock': 'bedrock',
    'azure': 'openai', // Azure is OpenAI-compatible
    'openrouter': 'openai',
    'mistral': 'openai',
    'gitlab': 'openai-compatible',
    'opencode': 'openai-compatible',
  };

  const protocol = protocolMap[def.id] || 'openai-compatible';
  return ADAPTERS[protocol] || ADAPTERS['openai-compatible'];
}

export function getAdapter(protocol: string): ProtocolAdapter {
  return ADAPTERS[protocol] || ADAPTERS['openai-compatible'];
}

export type { ProtocolAdapter, AdapterCallContext } from './adapter';
export { OpenAIAdapter, AnthropicAdapter, GeminiAdapter, BedrockAdapter, VertexAdapter, GithubCopilotAdapter };
