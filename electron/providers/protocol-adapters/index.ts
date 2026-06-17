/**
 * OpenAgent-Desktop - Protocol Adapter Index
 *
 * Maps a ProviderProtocol to its adapter implementation. The ProviderClient
 * looks up the adapter here per chat call.
 */

import { ProviderProtocol } from '../v3-types';
import { ProtocolAdapter } from './adapter';
import { OpenAIAdapter } from './openai-adapter';
import { AnthropicAdapter } from './anthropic-adapter';
import { GeminiAdapter } from './gemini-adapter';
import { BedrockAdapter } from './bedrock-adapter';
import { VertexAdapter } from './vertex-adapter';

const ADAPTERS: Record<ProviderProtocol, ProtocolAdapter> = {
  openai: new OpenAIAdapter(),
  anthropic: new AnthropicAdapter(),
  gemini: new GeminiAdapter(),
  bedrock: new BedrockAdapter(),
  vertex: new VertexAdapter(),
};

export function getAdapter(protocol: ProviderProtocol): ProtocolAdapter {
  return ADAPTERS[protocol];
}

export type { ProtocolAdapter, AdapterCallContext } from './adapter';
export { OpenAIAdapter, AnthropicAdapter, GeminiAdapter, BedrockAdapter, VertexAdapter };
