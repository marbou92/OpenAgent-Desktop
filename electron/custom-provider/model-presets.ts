/**
 * OpenAgent-Desktop Aether - Custom Provider Presets
 * 
 * Pre-configured custom endpoints for popular AI providers.
 * Extracted from OpenCowork's model presets.
 */

import type { CustomProviderPreset } from './types';

export const CUSTOM_PROVIDER_PRESETS: CustomProviderPreset[] = [
  {
    name: 'DeepSeek',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', contextWindow: 128000, supportsStreaming: true, supportsToolUse: true },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', contextWindow: 128000, supportsStreaming: true, supportsThinking: true },
    ],
  },
  {
    name: 'Kimi (Moonshot)',
    protocol: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: [
      { id: 'kimi-k2-thinking', name: 'Kimi K2 Thinking', contextWindow: 128000, supportsStreaming: true, supportsThinking: true },
    ],
  },
  {
    name: 'GLM (Zhipu)',
    protocol: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { id: 'glm-5', name: 'GLM-5', contextWindow: 128000, supportsStreaming: true, supportsToolUse: true },
    ],
  },
  {
    name: 'MiniMax',
    protocol: 'openai',
    baseUrl: 'https://api.minimax.chat/v1',
    models: [
      { id: 'MiniMax-M2.5', name: 'MiniMax M2.5', supportsStreaming: true },
    ],
  },
  {
    name: 'xAI (Grok)',
    protocol: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    models: [
      { id: 'grok-code-fast-1', name: 'Grok Code Fast', supportsStreaming: true, supportsToolUse: true },
    ],
  },
  {
    name: 'Mistral',
    protocol: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', supportsStreaming: true, supportsToolUse: true },
    ],
  },
  {
    name: 'Cohere',
    protocol: 'openai',
    baseUrl: 'https://api.cohere.com/v2',
    models: [
      { id: 'command-r-plus', name: 'Command R+', contextWindow: 128000, supportsStreaming: true, supportsToolUse: true },
    ],
  },
  {
    name: 'Perplexity',
    protocol: 'openai',
    baseUrl: 'https://api.perplexity.ai',
    models: [
      { id: 'sonar-pro', name: 'Sonar Pro', supportsStreaming: true },
    ],
  },
];
