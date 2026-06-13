/**
 * OpenAgent-Desktop - Provider Catalog View Component
 *
 * Browse and add providers from a curated catalog.
 * Grid layout with category filters, search, popular section,
 * quick-add presets, and setup guide viewer.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Toast } from '../../types';

const api = (window as any).openagent;

// ─── Types ───────────────────────────────────────────────────────────────────────

type ProviderCategory = 'all' | 'major' | 'cloud' | 'local' | 'gateway' | 'specialized' | 'custom';
type ProviderDifficulty = 'easy' | 'medium' | 'advanced';

interface ProviderPreset {
  id: string;
  name: string;
  providerType: string;
  apiHost: string;
  defaultModel: string;
  description: string;
  requiresApiKey: boolean;
}

interface ProviderCatalogEntry {
  type: string;
  displayName: string;
  description: string;
  icon: string;
  category: string;
  website: string;
  setupGuide: string;
  presets: ProviderPreset[];
  tags: string[];
  difficulty: ProviderDifficulty;
  popular: boolean;
}

interface ProviderCatalogViewProps {
  addToast: (toast: Omit<Toast, 'id'>) => void;
  onProviderAdded?: () => void;
}

// ─── Catalog Data (mirrors electron/providers/provider-catalog.ts) ───────────────

const CATALOG: ProviderCatalogEntry[] = [
  {
    type: 'anthropic',
    displayName: 'Anthropic',
    description: 'Claude AI models — industry-leading reasoning, coding, and analysis capabilities.',
    icon: '🧠',
    category: 'major',
    website: 'https://anthropic.com',
    setupGuide: '## Setting Up Anthropic\n\n1. Visit [console.anthropic.com](https://console.anthropic.com)\n2. Create an API key\n3. Paste your key in the provider setup\n4. Select a Claude model',
    presets: [
      { id: 'anthropic-sonnet', name: 'Claude Sonnet 4.5', providerType: 'anthropic', apiHost: 'https://api.anthropic.com', defaultModel: 'claude-sonnet-4-20250514', description: 'Best balance of speed and intelligence', requiresApiKey: true },
      { id: 'anthropic-opus', name: 'Claude Opus 4', providerType: 'anthropic', apiHost: 'https://api.anthropic.com', defaultModel: 'claude-opus-4-20250514', description: 'Maximum intelligence for complex tasks', requiresApiKey: true },
      { id: 'anthropic-haiku', name: 'Claude Haiku 3.5', providerType: 'anthropic', apiHost: 'https://api.anthropic.com', defaultModel: 'claude-3-5-haiku-20241022', description: 'Fastest responses, lower cost', requiresApiKey: true },
    ],
    tags: ['reasoning', 'coding', 'analysis', 'thinking'],
    difficulty: 'easy',
    popular: true,
  },
  {
    type: 'openai',
    displayName: 'OpenAI',
    description: 'GPT-5, GPT-4o, and o-series reasoning models — versatile AI with strong general capabilities.',
    icon: '⚡',
    category: 'major',
    website: 'https://openai.com',
    setupGuide: '## Setting Up OpenAI\n\n1. Visit [platform.openai.com](https://platform.openai.com)\n2. Create an API key\n3. Paste your key in the provider setup\n4. Select a GPT model',
    presets: [
      { id: 'openai-gpt5', name: 'GPT-5', providerType: 'openai', apiHost: 'https://api.openai.com', defaultModel: 'gpt-5', description: 'Latest and most capable OpenAI model', requiresApiKey: true },
      { id: 'openai-gpt4o', name: 'GPT-4o', providerType: 'openai', apiHost: 'https://api.openai.com', defaultModel: 'gpt-4o', description: 'Fast multimodal model', requiresApiKey: true },
      { id: 'openai-o3', name: 'o3', providerType: 'openai', apiHost: 'https://api.openai.com', defaultModel: 'o3', description: 'Advanced reasoning model', requiresApiKey: true },
    ],
    tags: ['reasoning', 'multimodal', 'coding', 'general'],
    difficulty: 'easy',
    popular: true,
  },
  {
    type: 'gemini',
    displayName: 'Google Gemini',
    description: 'Gemini Pro and Flash models — Google DeepMind\'s multimodal AI with massive context windows.',
    icon: '💎',
    category: 'major',
    website: 'https://ai.google.dev',
    setupGuide: '## Setting Up Google Gemini\n\n1. Visit [ai.google.dev](https://ai.google.dev)\n2. Create a project and API key\n3. Paste your key in the provider setup\n4. Select a Gemini model',
    presets: [
      { id: 'gemini-pro', name: 'Gemini 3 Pro', providerType: 'gemini', apiHost: 'https://generativelanguage.googleapis.com', defaultModel: 'gemini-3-pro', description: 'Most capable Gemini model', requiresApiKey: true },
      { id: 'gemini-flash', name: 'Gemini 3 Flash', providerType: 'gemini', apiHost: 'https://generativelanguage.googleapis.com', defaultModel: 'gemini-3-flash', description: 'Fast and efficient', requiresApiKey: true },
    ],
    tags: ['multimodal', 'long-context', 'free-tier'],
    difficulty: 'easy',
    popular: true,
  },
  {
    type: 'groq',
    displayName: 'Groq',
    description: 'Ultra-fast LLM inference on LPU hardware — Llama, Mixtral at 800+ tokens/second.',
    icon: '🚀',
    category: 'specialized',
    website: 'https://groq.com',
    setupGuide: '## Setting Up Groq\n\n1. Visit [console.groq.com](https://console.groq.com)\n2. Create an API key\n3. Paste your key in the provider setup',
    presets: [
      { id: 'groq-llama3', name: 'Groq Llama 3 70B', providerType: 'groq', apiHost: 'https://api.groq.com', defaultModel: 'llama-3-70b', description: 'Llama 3 70B at ultra-fast speed', requiresApiKey: true },
    ],
    tags: ['fast', 'inference', 'lpu', 'free-tier'],
    difficulty: 'easy',
    popular: true,
  },
  {
    type: 'openrouter',
    displayName: 'OpenRouter',
    description: 'Unified API for 200+ AI models — route to any provider with a single API key.',
    icon: '🔀',
    category: 'gateway',
    website: 'https://openrouter.ai',
    setupGuide: '## Setting Up OpenRouter\n\n1. Visit [openrouter.ai](https://openrouter.ai)\n2. Create an account and add credits\n3. Generate an API key\n4. Paste your key in the provider setup',
    presets: [
      { id: 'openrouter-claude', name: 'OpenRouter Claude', providerType: 'openrouter', apiHost: 'https://openrouter.ai', defaultModel: 'anthropic/claude-sonnet-4-20250514', description: 'Claude Sonnet via OpenRouter', requiresApiKey: true },
      { id: 'openrouter-deepseek', name: 'OpenRouter DeepSeek R1', providerType: 'openrouter', apiHost: 'https://openrouter.ai', defaultModel: 'deepseek/deepseek-r1', description: 'DeepSeek R1 via OpenRouter', requiresApiKey: true },
      { id: 'openrouter-llama', name: 'OpenRouter Llama 3', providerType: 'openrouter', apiHost: 'https://openrouter.ai', defaultModel: 'meta-llama/llama-3-70b-instruct', description: 'Llama 3 70B via OpenRouter', requiresApiKey: true },
    ],
    tags: ['gateway', 'multi-model', 'routing', 'pay-per-use'],
    difficulty: 'easy',
    popular: true,
  },
  {
    type: 'ollama',
    displayName: 'Ollama',
    description: 'Run open-source LLMs locally — Llama, Mistral, Phi, Qwen, and 100+ models with zero config.',
    icon: '🦙',
    category: 'local',
    website: 'https://ollama.com',
    setupGuide: '## Setting Up Ollama\n\n1. Install from [ollama.com](https://ollama.com)\n2. Run `ollama serve`\n3. Pull a model: `ollama pull llama3`\n4. No API key required',
    presets: [
      { id: 'ollama-llama3', name: 'Local Ollama (Llama 3)', providerType: 'ollama', apiHost: 'http://localhost:11434', defaultModel: 'llama3', description: 'Run Llama 3 locally', requiresApiKey: false },
      { id: 'ollama-mistral', name: 'Local Ollama (Mistral)', providerType: 'ollama', apiHost: 'http://localhost:11434', defaultModel: 'mistral', description: 'Run Mistral locally', requiresApiKey: false },
    ],
    tags: ['local', 'free', 'privacy', 'open-source', 'offline'],
    difficulty: 'easy',
    popular: true,
  },
  {
    type: 'azure_openai',
    displayName: 'Azure OpenAI',
    description: 'Enterprise-grade OpenAI models on Microsoft Azure with compliance and security.',
    icon: '☁️',
    category: 'cloud',
    website: 'https://azure.microsoft.com/en-us/products/ai-services/openai-service',
    setupGuide: '## Setting Up Azure OpenAI\n\n1. Create an Azure OpenAI resource\n2. Deploy a model\n3. Get endpoint URL and API key\n4. Enter deployment name',
    presets: [
      { id: 'azure-gpt4', name: 'Azure GPT-4o', providerType: 'azure_openai', apiHost: 'https://YOUR_RESOURCE.openai.azure.com', defaultModel: 'gpt-4o', description: 'GPT-4o on Azure', requiresApiKey: true },
    ],
    tags: ['enterprise', 'compliance', 'azure', 'microsoft'],
    difficulty: 'advanced',
    popular: false,
  },
  {
    type: 'amazon_bedrock',
    displayName: 'Amazon Bedrock',
    description: 'AWS managed service for Claude, GPT, Llama, and other models with enterprise security.',
    icon: '🏗️',
    category: 'cloud',
    website: 'https://aws.amazon.com/bedrock',
    setupGuide: '## Setting Up Amazon Bedrock\n\n1. Enable Bedrock in AWS Console\n2. Configure AWS credentials\n3. Select region and model',
    presets: [
      { id: 'bedrock-claude', name: 'Bedrock Claude Sonnet', providerType: 'amazon_bedrock', apiHost: 'https://bedrock-runtime.us-east-1.amazonaws.com', defaultModel: 'anthropic.claude-sonnet-4-20250514-v1:0', description: 'Claude on AWS Bedrock', requiresApiKey: true },
    ],
    tags: ['enterprise', 'aws', 'multi-model', 'compliance'],
    difficulty: 'advanced',
    popular: false,
  },
  {
    type: 'gcp_vertex',
    displayName: 'Google Cloud Vertex AI',
    description: 'Enterprise Gemini and open models on GCP with IAM integration.',
    icon: '🔺',
    category: 'cloud',
    website: 'https://cloud.google.com/vertex-ai',
    setupGuide: '## Setting Up Vertex AI\n\n1. Create a GCP project with Vertex AI API\n2. Set up service account\n3. Enter project ID and credentials',
    presets: [
      { id: 'vertex-gemini', name: 'Vertex Gemini Pro', providerType: 'gcp_vertex', apiHost: 'https://us-central1-aiplatform.googleapis.com', defaultModel: 'gemini-3-pro', description: 'Gemini on Vertex AI', requiresApiKey: true },
    ],
    tags: ['enterprise', 'gcp', 'google-cloud', 'iam'],
    difficulty: 'advanced',
    popular: false,
  },
  {
    type: 'lm_studio',
    displayName: 'LM Studio',
    description: 'Desktop app for running local LLMs with a beautiful GUI.',
    icon: '🔬',
    category: 'local',
    website: 'https://lmstudio.ai',
    setupGuide: '## Setting Up LM Studio\n\n1. Install from [lmstudio.ai](https://lmstudio.ai)\n2. Download a model\n3. Start the local server\n4. No API key required',
    presets: [
      { id: 'lmstudio-default', name: 'LM Studio Local', providerType: 'lm_studio', apiHost: 'http://localhost:1234', defaultModel: 'local-model', description: 'Use LM Studio local server', requiresApiKey: false },
    ],
    tags: ['local', 'free', 'gui', 'desktop', 'offline'],
    difficulty: 'easy',
    popular: false,
  },
  {
    type: 'docker_model_runner',
    displayName: 'Docker Model Runner',
    description: 'Run AI models inside Docker containers with Docker Desktop.',
    icon: '🐳',
    category: 'local',
    website: 'https://docs.docker.com/ai/',
    setupGuide: '## Setting Up Docker Model Runner\n\n1. Install Docker Desktop with AI support\n2. Enable Model Runner\n3. Pull a model',
    presets: [
      { id: 'docker-smollm', name: 'Docker Model Runner', providerType: 'docker_model_runner', apiHost: 'http://localhost:12434', defaultModel: 'ai/smollm2', description: 'Run models in Docker', requiresApiKey: false },
    ],
    tags: ['local', 'docker', 'containers', 'free'],
    difficulty: 'medium',
    popular: false,
  },
  {
    type: 'litellm',
    displayName: 'LiteLLM',
    description: 'OpenAI-compatible proxy for 100+ LLM providers with load balancing and fallbacks.',
    icon: '💡',
    category: 'gateway',
    website: 'https://litellm.ai',
    setupGuide: '## Setting Up LiteLLM\n\n1. Install: `pip install litellm[proxy]`\n2. Start proxy: `litellm --model gpt-4`\n3. Configure host URL',
    presets: [
      { id: 'litellm-default', name: 'LiteLLM Proxy', providerType: 'litellm', apiHost: 'http://localhost:4000', defaultModel: 'gpt-4', description: 'LiteLLM proxy', requiresApiKey: false },
    ],
    tags: ['gateway', 'proxy', 'load-balancing', 'enterprise'],
    difficulty: 'medium',
    popular: false,
  },
  {
    type: 'mistral',
    displayName: 'Mistral AI',
    description: 'Mistral and Codestral models — European AI with strong multilingual and coding capabilities.',
    icon: '🌊',
    category: 'specialized',
    website: 'https://mistral.ai',
    setupGuide: '## Setting Up Mistral AI\n\n1. Visit [console.mistral.ai](https://console.mistral.ai)\n2. Create an API key\n3. Paste your key',
    presets: [
      { id: 'mistral-large', name: 'Mistral Large', providerType: 'mistral', apiHost: 'https://api.mistral.ai', defaultModel: 'mistral-large-latest', description: 'Most capable Mistral model', requiresApiKey: true },
      { id: 'mistral-codestral', name: 'Codestral', providerType: 'mistral', apiHost: 'https://api.mistral.ai', defaultModel: 'codestral-latest', description: 'Optimized for code', requiresApiKey: true },
    ],
    tags: ['coding', 'european', 'multilingual', 'functions'],
    difficulty: 'easy',
    popular: false,
  },
  {
    type: 'xai',
    displayName: 'xAI (Grok)',
    description: 'Grok models from xAI — real-time knowledge with humor and personality.',
    icon: '✖️',
    category: 'specialized',
    website: 'https://x.ai',
    setupGuide: '## Setting Up xAI\n\n1. Visit [console.x.ai](https://console.x.ai)\n2. Create an API key\n3. Paste your key',
    presets: [
      { id: 'xai-grok3', name: 'Grok 3', providerType: 'xai', apiHost: 'https://api.x.ai', defaultModel: 'grok-3', description: 'Latest Grok model', requiresApiKey: true },
    ],
    tags: ['real-time', 'social', 'xai', 'grok'],
    difficulty: 'easy',
    popular: false,
  },
  {
    type: 'cerebras',
    displayName: 'Cerebras',
    description: 'Wafer-scale engine inference — unmatched speed for Llama and open models.',
    icon: '🔶',
    category: 'specialized',
    website: 'https://cerebras.ai',
    setupGuide: '## Setting Up Cerebras\n\n1. Visit [cloud.cerebras.ai](https://cloud.cerebras.ai)\n2. Create an API key\n3. Paste your key',
    presets: [
      { id: 'cerebras-llama', name: 'Cerebras Llama 3.3 70B', providerType: 'cerebras', apiHost: 'https://api.cerebras.ai', defaultModel: 'llama-3.3-70b', description: 'Ultra-fast Llama inference', requiresApiKey: true },
    ],
    tags: ['fast', 'inference', 'wafer-scale', 'hardware'],
    difficulty: 'easy',
    popular: false,
  },
  {
    type: 'perplexity',
    displayName: 'Perplexity',
    description: 'AI-powered search and answers — Sonar models with real-time web knowledge.',
    icon: '🔍',
    category: 'specialized',
    website: 'https://perplexity.ai',
    setupGuide: '## Setting Up Perplexity\n\n1. Visit [docs.perplexity.ai](https://docs.perplexity.ai)\n2. Create an API key\n3. Paste your key',
    presets: [
      { id: 'perplexity-sonar', name: 'Perplexity Sonar', providerType: 'perplexity', apiHost: 'https://api.perplexity.ai', defaultModel: 'sonar', description: 'AI search with citations', requiresApiKey: true },
    ],
    tags: ['search', 'citations', 'real-time', 'research'],
    difficulty: 'easy',
    popular: false,
  },
  {
    type: 'github_copilot',
    displayName: 'GitHub Copilot',
    description: 'AI pair programmer — use your Copilot subscription for API access.',
    icon: '🐙',
    category: 'specialized',
    website: 'https://github.com/features/copilot',
    setupGuide: '## Setting Up GitHub Copilot\n\n1. Need an active Copilot subscription\n2. Extract OAuth token\n3. Configure token',
    presets: [
      { id: 'copilot-gpt4', name: 'Copilot GPT-4o', providerType: 'github_copilot', apiHost: 'https://api.githubcopilot.com', defaultModel: 'gpt-4o', description: 'GPT-4o via Copilot', requiresApiKey: true },
    ],
    tags: ['coding', 'github', 'copilot', 'ide'],
    difficulty: 'medium',
    popular: false,
  },
  {
    type: 'novita',
    displayName: 'Novita AI',
    description: 'GPU cloud with cost-effective LLM inference.',
    icon: '🌟',
    category: 'specialized',
    website: 'https://novita.ai',
    setupGuide: '## Setting Up Novita AI\n\n1. Visit [novita.ai](https://novita.ai)\n2. Create an API key',
    presets: [
      { id: 'novita-llama', name: 'Novita Llama 3 70B', providerType: 'novita', apiHost: 'https://api.novita.ai', defaultModel: 'meta-llama/llama-3-70b-instruct', description: 'Llama 3 on Novita', requiresApiKey: true },
    ],
    tags: ['gpu', 'inference', 'cost-effective'],
    difficulty: 'easy',
    popular: false,
  },
  {
    type: 'venice',
    displayName: 'Venice',
    description: 'Privacy-focused AI inference — no content moderation, no data retention.',
    icon: '🏛️',
    category: 'specialized',
    website: 'https://venice.ai',
    setupGuide: '## Setting Up Venice\n\n1. Visit [venice.ai](https://venice.ai)\n2. Create an API key',
    presets: [
      { id: 'venice-llama', name: 'Venice Llama 3', providerType: 'venice', apiHost: 'https://api.venice.ai', defaultModel: 'llama-3-70b', description: 'Privacy-focused Llama 3', requiresApiKey: true },
    ],
    tags: ['privacy', 'no-logging', 'uncensored'],
    difficulty: 'easy',
    popular: false,
  },
  {
    type: 'deepseek',
    displayName: 'DeepSeek',
    description: 'DeepSeek R1 and V3 models — advanced reasoning at competitive pricing.',
    icon: '🔮',
    category: 'specialized',
    website: 'https://deepseek.com',
    setupGuide: '## Setting Up DeepSeek\n\n1. Visit [platform.deepseek.com](https://platform.deepseek.com)\n2. Create an API key\n3. Paste your key',
    presets: [
      { id: 'deepseek-r1', name: 'DeepSeek R1', providerType: 'custom_openai', apiHost: 'https://api.deepseek.com', defaultModel: 'deepseek-reasoner', description: 'Advanced reasoning model', requiresApiKey: true },
    ],
    tags: ['reasoning', 'coding', 'cost-effective'],
    difficulty: 'easy',
    popular: false,
  },
  {
    type: 'custom_openai',
    displayName: 'Custom OpenAI API',
    description: 'Any OpenAI-compatible endpoint — vLLM, TGI, LocalAI, and more.',
    icon: '🔧',
    category: 'custom',
    website: '',
    setupGuide: '## Setting Up Custom OpenAI API\n\n1. Identify your OpenAI-compatible endpoint URL\n2. Get credentials if required\n3. Enter host URL and model name',
    presets: [
      { id: 'custom-vllm', name: 'Custom vLLM', providerType: 'custom_openai', apiHost: 'http://localhost:8000', defaultModel: 'custom-model', description: 'Connect to vLLM', requiresApiKey: false },
    ],
    tags: ['custom', 'self-hosted', 'compatible', 'any-api'],
    difficulty: 'medium',
    popular: false,
  },
];

// ─── Category Tabs ───────────────────────────────────────────────────────────────

const CATEGORY_TABS: { id: ProviderCategory; label: string; icon: string }[] = [
  { id: 'all', label: 'All', icon: '📦' },
  { id: 'major', label: 'Major', icon: '⭐' },
  { id: 'cloud', label: 'Cloud', icon: '☁️' },
  { id: 'local', label: 'Local', icon: '🏠' },
  { id: 'gateway', label: 'Gateway', icon: '🔀' },
  { id: 'specialized', label: 'Specialized', icon: '🎯' },
  { id: 'custom', label: 'Custom', icon: '🔧' },
];

// ─── Difficulty Badge ────────────────────────────────────────────────────────────

const DifficultyBadge: React.FC<{ difficulty: ProviderDifficulty }> = ({ difficulty }) => {
  const config = {
    easy: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', label: 'Easy' },
    medium: { bg: 'rgba(234,179,8,0.12)', color: '#eab308', label: 'Medium' },
    advanced: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', label: 'Advanced' },
  }[difficulty];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '9999px',
        fontSize: '10px',
        fontWeight: 600,
        background: config.bg,
        color: config.color,
        letterSpacing: '0.02em',
      }}
    >
      {config.label}
    </span>
  );
};

// ─── Quick Add Modal ─────────────────────────────────────────────────────────────

interface QuickAddModalProps {
  preset: ProviderPreset;
  entry: ProviderCatalogEntry;
  onClose: () => void;
  onAdded: () => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

const QuickAddModal: React.FC<QuickAddModalProps> = ({ preset, entry, onClose, onAdded, addToast }) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [adding, setAdding] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleAdd = async () => {
    if (preset.requiresApiKey && !apiKey.trim()) {
      addToast({ type: 'error', title: 'API key is required' });
      return;
    }

    setAdding(true);
    try {
      if (api?.providers?.add) {
        await api.providers.add({
          name: `${entry.displayName} - ${preset.name}`,
          type: preset.providerType,
          apiKey: apiKey.trim() || undefined,
          apiHost: preset.apiHost,
          models: [preset.defaultModel],
        });
        addToast({ type: 'success', title: `${preset.name} added successfully!` });
        onAdded();
        onClose();
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to add provider', message: err.message });
    } finally {
      setAdding(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      if (api?.providers?.test) {
        const result = await api.providers.test({
          type: preset.providerType,
          apiKey: apiKey.trim() || undefined,
          apiHost: preset.apiHost,
          model: preset.defaultModel,
        });
        if (result?.working) {
          addToast({ type: 'success', title: 'Connection test passed!', message: `Latency: ${result.latency}ms` });
        } else {
          addToast({ type: 'warning', title: 'Connection test failed', message: 'Check your API key and settings' });
        }
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Test failed', message: err.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border-primary)',
          borderRadius: '12px',
          padding: '24px',
          width: '460px',
          maxWidth: '90vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <span style={{ fontSize: '28px' }}>{entry.icon}</span>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {preset.name}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
              {preset.description}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '12px', padding: '10px', borderRadius: '8px', background: 'var(--color-bg-tertiary)' }}>
          <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>Model</div>
          <div style={{ fontSize: '13px', fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>
            {preset.providerType}/{preset.defaultModel}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '6px' }}>Host</div>
          <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>
            {preset.apiHost}
          </div>
        </div>

        {preset.requiresApiKey && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              API Key
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key..."
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border-primary)',
                  background: 'var(--color-bg-secondary)',
                  color: 'var(--color-text-primary)',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
              <button
                onClick={() => setShowKey(!showKey)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border-primary)',
                  background: 'var(--color-bg-secondary)',
                  color: 'var(--color-text-secondary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                {showKey ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={handleTest}
            disabled={testing || (preset.requiresApiKey && !apiKey.trim())}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid var(--color-border-primary)',
              background: 'var(--color-bg-secondary)',
              color: 'var(--color-text-secondary)',
              fontSize: '13px',
              cursor: testing ? 'wait' : 'pointer',
              opacity: testing || (preset.requiresApiKey && !apiKey.trim()) ? 0.5 : 1,
            }}
          >
            {testing ? 'Testing...' : 'Test'}
          </button>
          <button
            onClick={handleAdd}
            disabled={adding || (preset.requiresApiKey && !apiKey.trim())}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--color-accent)',
              color: 'var(--color-bg-primary)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: adding ? 'wait' : 'pointer',
              opacity: adding || (preset.requiresApiKey && !apiKey.trim()) ? 0.5 : 1,
            }}
          >
            {adding ? 'Adding...' : 'Add Provider'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Setup Guide Viewer ──────────────────────────────────────────────────────────

interface SetupGuideViewerProps {
  entry: ProviderCatalogEntry;
  onClose: () => void;
}

const SetupGuideViewer: React.FC<SetupGuideViewerProps> = ({ entry, onClose }) => {
  // Simple markdown-ish rendering
  const renderGuide = (text: string) => {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('## ')) {
        return <h3 key={i} style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)', marginTop: '12px', marginBottom: '6px' }}>{line.slice(3)}</h3>;
      }
      if (line.startsWith('### ')) {
        return <h4 key={i} style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginTop: '10px', marginBottom: '4px' }}>{line.slice(4)}</h4>;
      }
      if (line.startsWith('- ')) {
        return <li key={i} style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginLeft: '16px', marginBottom: '2px' }}>{renderInline(line.slice(2))}</li>;
      }
      if (line.match(/^\d+\.\s/)) {
        return <li key={i} style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginLeft: '16px', marginBottom: '2px', listStyleType: 'decimal' }}>{renderInline(line.replace(/^\d+\.\s/, ''))}</li>;
      }
      if (line.trim() === '') return <br key={i} />;
      return <p key={i} style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>{renderInline(line)}</p>;
    });
  };

  const renderInline = (text: string) => {
    // Handle [text](url) links
    const parts = text.split(/\[([^\]]+)\]\(([^)]+)\)/g);
    if (parts.length === 1) {
      // Handle `code` inline
      return renderCodeInline(text);
    }
    return parts.map((part, i) => {
      if (i % 3 === 1) {
        const url = parts[i + 1];
        return (
          <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}>
            {part}
          </a>
        );
      }
      if (i % 3 === 2) return null;
      return <span key={i}>{renderCodeInline(part)}</span>;
    });
  };

  const renderCodeInline = (text: string) => {
    const parts = text.split(/`([^`]+)`/g);
    if (parts.length === 1) return text;
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        return (
          <code key={i} style={{
            padding: '1px 5px',
            borderRadius: '4px',
            background: 'var(--color-bg-tertiary)',
            fontSize: '12px',
            fontFamily: 'monospace',
          }}>
            {part}
          </code>
        );
      }
      return part;
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border-primary)',
          borderRadius: '12px',
          padding: '24px',
          width: '560px',
          maxWidth: '90vw',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>{entry.icon}</span>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {entry.displayName} Setup Guide
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              border: '1px solid var(--color-border-primary)',
              background: 'var(--color-bg-secondary)',
              color: 'var(--color-text-tertiary)',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            ✕
          </button>
        </div>

        <div>{renderGuide(entry.setupGuide)}</div>

        {entry.website && (
          <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--color-border-primary)' }}>
            <a
              href={entry.website}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-accent)', fontSize: '13px', textDecoration: 'none' }}
            >
              Visit {entry.displayName} website →
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Provider Card ───────────────────────────────────────────────────────────────

interface ProviderCardProps {
  entry: ProviderCatalogEntry;
  onQuickAdd: (preset: ProviderPreset) => void;
  onViewGuide: (entry: ProviderCatalogEntry) => void;
}

const ProviderCard: React.FC<ProviderCardProps> = ({ entry, onQuickAdd, onViewGuide }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border-primary)',
        borderRadius: '10px',
        overflow: 'hidden',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-accent)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border-primary)'; }}
    >
      <div style={{ padding: '14px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
          <span style={{ fontSize: '24px', lineHeight: 1 }}>{entry.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {entry.displayName}
              </span>
              <DifficultyBadge difficulty={entry.difficulty} />
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {entry.description}
            </div>
          </div>
        </div>

        {/* Tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px' }}>
          {entry.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              style={{
                padding: '1px 7px',
                borderRadius: '9999px',
                fontSize: '10px',
                background: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-tertiary)',
                border: '1px solid var(--color-border-primary)',
              }}
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {entry.presets.slice(0, expanded ? undefined : 2).map((preset) => (
            <button
              key={preset.id}
              onClick={() => onQuickAdd(preset)}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid var(--color-accent)',
                background: 'transparent',
                color: 'var(--color-accent)',
                fontSize: '11px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'var(--color-accent)';
                (e.currentTarget as HTMLElement).style.color = 'var(--color-bg-primary)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
                (e.currentTarget as HTMLElement).style.color = 'var(--color-accent)';
              }}
            >
              + {preset.name}
            </button>
          ))}
          {entry.presets.length > 2 && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid var(--color-border-primary)',
                background: 'transparent',
                color: 'var(--color-text-tertiary)',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              +{entry.presets.length - 2} more
            </button>
          )}
          <button
            onClick={() => onViewGuide(entry)}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid var(--color-border-primary)',
              background: 'transparent',
              color: 'var(--color-text-tertiary)',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            📖 Guide
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────────

const ProviderCatalogView: React.FC<ProviderCatalogViewProps> = ({ addToast, onProviderAdded }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ProviderCategory>('all');
  const [quickAddPreset, setQuickAddPreset] = useState<{ preset: ProviderPreset; entry: ProviderCatalogEntry } | null>(null);
  const [guideEntry, setGuideEntry] = useState<ProviderCatalogEntry | null>(null);

  const popularEntries = useMemo(() => CATALOG.filter((e) => e.popular), []);

  const filteredEntries = useMemo(() => {
    let entries = CATALOG;

    if (activeCategory !== 'all') {
      entries = entries.filter((e) => e.category === activeCategory);
    }

    if (searchQuery.trim()) {
      const lower = searchQuery.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.displayName.toLowerCase().includes(lower) ||
          e.description.toLowerCase().includes(lower) ||
          e.tags.some((t) => t.toLowerCase().includes(lower)) ||
          e.type.toLowerCase().includes(lower)
      );
    }

    return entries;
  }, [activeCategory, searchQuery]);

  const handleQuickAdd = useCallback((preset: ProviderPreset) => {
    const entry = CATALOG.find((e) => e.type === preset.providerType);
    if (entry) {
      setQuickAddPreset({ preset, entry });
    }
  }, []);

  const handleViewGuide = useCallback((entry: ProviderCatalogEntry) => {
    setGuideEntry(entry);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Search Bar */}
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', fontSize: '14px' }}>
          🔍
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search providers, models, tags..."
          style={{
            width: '100%',
            padding: '10px 12px 10px 36px',
            borderRadius: '8px',
            border: '1px solid var(--color-border-primary)',
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)',
            fontSize: '13px',
            outline: 'none',
            transition: 'border-color 0.15s',
          }}
          onFocus={(e) => { (e.target as HTMLElement).style.borderColor = 'var(--color-accent)'; }}
          onBlur={(e) => { (e.target as HTMLElement).style.borderColor = 'var(--color-border-primary)'; }}
        />
      </div>

      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '4px' }}>
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveCategory(tab.id)}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid',
              borderColor: activeCategory === tab.id ? 'var(--color-accent)' : 'var(--color-border-primary)',
              background: activeCategory === tab.id ? 'rgba(var(--color-accent-rgb, 59,130,246),0.1)' : 'var(--color-bg-secondary)',
              color: activeCategory === tab.id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              fontSize: '12px',
              fontWeight: activeCategory === tab.id ? 600 : 400,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Popular Section (only show when on "All" tab and no search) */}
      {activeCategory === 'all' && !searchQuery.trim() && (
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#eab308' }}>⭐</span> Popular Providers
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
            {popularEntries.map((entry) => (
              <ProviderCard
                key={entry.type}
                entry={entry}
                onQuickAdd={handleQuickAdd}
                onViewGuide={handleViewGuide}
              />
            ))}
          </div>
        </div>
      )}

      {/* All/Filtered Providers */}
      <div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>
            {activeCategory === 'all' ? 'All Providers' : `${CATEGORY_TABS.find(t => t.id === activeCategory)?.label || ''} Providers`}
          </span>
          <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--color-text-tertiary)' }}>
            {filteredEntries.length} provider{filteredEntries.length !== 1 ? 's' : ''}
          </span>
        </div>

        {filteredEntries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-tertiary)', fontSize: '13px' }}>
            No providers found matching "{searchQuery}"
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
            {filteredEntries
              .filter((e) => !(activeCategory === 'all' && !searchQuery.trim() && e.popular))
              .concat(activeCategory === 'all' && !searchQuery.trim() ? [] : [])
              .map((entry) => (
                <ProviderCard
                  key={entry.type}
                  entry={entry}
                  onQuickAdd={handleQuickAdd}
                  onViewGuide={handleViewGuide}
                />
              ))}
          </div>
        )}
      </div>

      {/* Quick Add Modal */}
      {quickAddPreset && (
        <QuickAddModal
          preset={quickAddPreset.preset}
          entry={quickAddPreset.entry}
          onClose={() => setQuickAddPreset(null)}
          onAdded={() => onProviderAdded?.()}
          addToast={addToast}
        />
      )}

      {/* Setup Guide Viewer */}
      {guideEntry && (
        <SetupGuideViewer entry={guideEntry} onClose={() => setGuideEntry(null)} />
      )}
    </div>
  );
};

export default ProviderCatalogView;
