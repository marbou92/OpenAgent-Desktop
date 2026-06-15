/**
 * OpenAgent-Desktop Aether - Custom Protocol Provider Module
 */

export { CustomProvider } from './custom-provider';
export { OpenAIProtocolHandler } from './protocol-openai';
export { AnthropicProtocolHandler } from './protocol-anthropic';
export { GeminiProtocolHandler } from './protocol-gemini';
export { CUSTOM_PROVIDER_PRESETS } from './model-presets';
export type {
  CustomProtocolType, CustomProviderConfig, CustomProviderModel,
  CustomProviderMessage, CustomProviderResponse, CustomProviderStreamChunk,
  CustomProviderPreset,
} from './types';
