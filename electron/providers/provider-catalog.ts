/**
 * OpenAgent-Desktop - Provider Catalog & Presets
 *
 * Curated catalog of all supported providers with icons, descriptions,
 * setup instructions, and quick-add presets.
 * Like OpenCowork's provider presets and OpenCode's provider registry.
 */

import { ProviderType } from './types';

// ─── Catalog Types ───────────────────────────────────────────────────────────────

export type ProviderCategory = 'major' | 'cloud' | 'local' | 'gateway' | 'specialized' | 'custom';
export type ProviderDifficulty = 'easy' | 'medium' | 'advanced';

export interface ProviderPreset {
  id: string;
  name: string;
  providerType: ProviderType;
  apiHost: string;
  defaultModel: string;
  description: string;
  requiresApiKey: boolean;
}

export interface ProviderCatalogEntry {
  type: ProviderType;
  displayName: string;
  description: string;
  icon: string;
  category: ProviderCategory;
  website: string;
  setupGuide: string;
  presets: ProviderPreset[];
  tags: string[];
  difficulty: ProviderDifficulty;
  popular: boolean;
}

// ─── Catalog Data ─────────────────────────────────────────────────────────────────

const CATALOG: ProviderCatalogEntry[] = [
  // ─── Major Providers ──────────────────────────────────────────────────────────

  {
    type: ProviderType.anthropic,
    displayName: 'Anthropic',
    description: 'Claude AI models — industry-leading reasoning, coding, and analysis capabilities with extended thinking support.',
    icon: '🧠',
    category: 'major',
    website: 'https://anthropic.com',
    setupGuide: `## Setting Up Anthropic

1. **Get an API Key**: Visit [console.anthropic.com](https://console.anthropic.com) and create an account.
2. **Create an API Key**: Navigate to API Keys section and generate a new key.
3. **Set Environment Variable** (optional): \`export ANTHROPIC_API_KEY=sk-ant-...\`
4. **Enter API Key**: Paste your key in the provider setup.
5. **Select Model**: Choose from Claude Sonnet, Opus, or Haiku.

### Tips
- Claude Sonnet 4.5 offers the best balance of speed and intelligence.
- Enable "Thinking Mode" for complex reasoning tasks.
- Set \`ANTHROPIC_HOST\` to use a custom API endpoint.`,
    presets: [
      {
        id: 'anthropic-sonnet',
        name: 'Claude Sonnet 4.5',
        providerType: ProviderType.anthropic,
        apiHost: 'https://api.anthropic.com',
        defaultModel: 'claude-sonnet-4-20250514',
        description: 'Best balance of speed and intelligence',
        requiresApiKey: true,
      },
      {
        id: 'anthropic-opus',
        name: 'Claude Opus 4',
        providerType: ProviderType.anthropic,
        apiHost: 'https://api.anthropic.com',
        defaultModel: 'claude-opus-4-20250514',
        description: 'Maximum intelligence for complex tasks',
        requiresApiKey: true,
      },
      {
        id: 'anthropic-haiku',
        name: 'Claude Haiku 3.5',
        providerType: ProviderType.anthropic,
        apiHost: 'https://api.anthropic.com',
        defaultModel: 'claude-3-5-haiku-20241022',
        description: 'Fastest responses, lower cost',
        requiresApiKey: true,
      },
    ],
    tags: ['reasoning', 'coding', 'analysis', 'thinking', 'pro'],
    difficulty: 'easy',
    popular: true,
  },

  {
    type: ProviderType.openai,
    displayName: 'OpenAI',
    description: 'GPT-5, GPT-4o, and o-series reasoning models — versatile AI with strong general capabilities.',
    icon: '⚡',
    category: 'major',
    website: 'https://openai.com',
    setupGuide: `## Setting Up OpenAI

1. **Get an API Key**: Visit [platform.openai.com](https://platform.openai.com) and sign up.
2. **Create an API Key**: Go to API Keys → Create new secret key.
3. **Set Environment Variable** (optional): \`export OPENAI_API_KEY=sk-...\`
4. **Enter API Key**: Paste your key in the provider setup.
5. **Select Model**: Choose from GPT-5, GPT-4o, o3, o4-mini, etc.

### Tips
- GPT-5 is the latest and most capable model.
- Use o-series for step-by-step reasoning tasks.
- Set organization ID if you belong to multiple orgs.`,
    presets: [
      {
        id: 'openai-gpt5',
        name: 'GPT-5',
        providerType: ProviderType.openai,
        apiHost: 'https://api.openai.com',
        defaultModel: 'gpt-5',
        description: 'Latest and most capable OpenAI model',
        requiresApiKey: true,
      },
      {
        id: 'openai-gpt4o',
        name: 'GPT-4o',
        providerType: ProviderType.openai,
        apiHost: 'https://api.openai.com',
        defaultModel: 'gpt-4o',
        description: 'Fast multimodal model',
        requiresApiKey: true,
      },
      {
        id: 'openai-o3',
        name: 'o3',
        providerType: ProviderType.openai,
        apiHost: 'https://api.openai.com',
        defaultModel: 'o3',
        description: 'Advanced reasoning model',
        requiresApiKey: true,
      },
    ],
    tags: ['reasoning', 'multimodal', 'coding', 'general'],
    difficulty: 'easy',
    popular: true,
  },

  {
    type: ProviderType.gemini,
    displayName: 'Google Gemini',
    description: 'Gemini Pro and Flash models — Google DeepMind\'s multimodal AI with massive context windows.',
    icon: '💎',
    category: 'major',
    website: 'https://ai.google.dev',
    setupGuide: `## Setting Up Google Gemini

1. **Get an API Key**: Visit [ai.google.dev](https://ai.google.dev) and create a project.
2. **Enable Generative Language API**: In Google Cloud Console, enable the API.
3. **Create API Key**: Generate a key from the API Keys section.
4. **Set Environment Variable** (optional): \`export GEMINI_API_KEY=AIza...\`
5. **Enter API Key**: Paste your key in the provider setup.

### Tips
- Gemini Pro has a 1M+ token context window.
- Gemini Flash is optimized for speed.
- Free tier available with rate limits.`,
    presets: [
      {
        id: 'gemini-pro',
        name: 'Gemini 3 Pro',
        providerType: ProviderType.gemini,
        apiHost: 'https://generativelanguage.googleapis.com',
        defaultModel: 'gemini-3-pro',
        description: 'Most capable Gemini model',
        requiresApiKey: true,
      },
      {
        id: 'gemini-flash',
        name: 'Gemini 3 Flash',
        providerType: ProviderType.gemini,
        apiHost: 'https://generativelanguage.googleapis.com',
        defaultModel: 'gemini-3-flash',
        description: 'Fast and efficient',
        requiresApiKey: true,
      },
    ],
    tags: ['multimodal', 'long-context', 'free-tier', 'pro'],
    difficulty: 'easy',
    popular: true,
  },

  // ─── Cloud Providers ──────────────────────────────────────────────────────────

  {
    type: ProviderType.azure_openai,
    displayName: 'Azure OpenAI',
    description: 'Enterprise-grade OpenAI models hosted on Microsoft Azure with compliance and security features.',
    icon: '☁️',
    category: 'cloud',
    website: 'https://azure.microsoft.com/en-us/products/ai-services/openai-service',
    setupGuide: `## Setting Up Azure OpenAI

1. **Azure Subscription**: You need an active Azure subscription.
2. **Create Resource**: Create an Azure OpenAI resource in the Azure Portal.
3. **Deploy Model**: Deploy a model (e.g., GPT-4) in your resource.
4. **Get Endpoint & Key**: Find your endpoint URL and API key in the resource.
5. **Configure**: Enter the endpoint URL, API key, and deployment name.

### Required Fields
- **API Host**: Your Azure OpenAI endpoint URL
- **Deployment Name**: The name you gave your model deployment
- **API Key**: From the Azure Portal Keys and Endpoint section`,
    presets: [
      {
        id: 'azure-gpt4',
        name: 'Azure GPT-4o',
        providerType: ProviderType.azure_openai,
        apiHost: 'https://YOUR_RESOURCE.openai.azure.com',
        defaultModel: 'gpt-4o',
        description: 'GPT-4o on Azure',
        requiresApiKey: true,
      },
    ],
    tags: ['enterprise', 'compliance', 'azure', 'microsoft'],
    difficulty: 'advanced',
    popular: false,
  },

  {
    type: ProviderType.amazon_bedrock,
    displayName: 'Amazon Bedrock',
    description: 'AWS managed service offering Claude, GPT, Llama, and other models with enterprise security.',
    icon: '🏗️',
    category: 'cloud',
    website: 'https://aws.amazon.com/bedrock',
    setupGuide: `## Setting Up Amazon Bedrock

1. **AWS Account**: You need an active AWS account with Bedrock access.
2. **Enable Models**: In AWS Console, enable the models you want to use.
3. **Configure AWS Credentials**: Set up \`~/.aws/credentials\` or environment variables.
4. **Select Region**: Choose a region where your desired models are available.
5. **Enter Credentials**: Provide AWS Access Key ID and Secret Access Key.

### Required Fields
- **API Key**: AWS Access Key ID
- **Region**: AWS region (e.g., us-east-1)
- **Profile** (optional): AWS CLI profile name`,
    presets: [
      {
        id: 'bedrock-claude',
        name: 'Bedrock Claude Sonnet',
        providerType: ProviderType.amazon_bedrock,
        apiHost: 'https://bedrock-runtime.us-east-1.amazonaws.com',
        defaultModel: 'anthropic.claude-sonnet-4-20250514-v1:0',
        description: 'Claude Sonnet on AWS Bedrock',
        requiresApiKey: true,
      },
    ],
    tags: ['enterprise', 'aws', 'multi-model', 'compliance'],
    difficulty: 'advanced',
    popular: false,
  },

  {
    type: ProviderType.gcp_vertex,
    displayName: 'Google Cloud Vertex AI',
    description: 'Enterprise Gemini and open models on Google Cloud Platform with IAM integration.',
    icon: '🔺',
    category: 'cloud',
    website: 'https://cloud.google.com/vertex-ai',
    setupGuide: `## Setting Up Google Cloud Vertex AI

1. **GCP Project**: Create a Google Cloud project with Vertex AI API enabled.
2. **Service Account**: Create a service account with Vertex AI permissions.
3. **Download Key**: Download the service account JSON key file.
4. **Configure**: Enter project ID, region, and authentication details.

### Required Fields
- **Project ID**: Your GCP project ID
- **Region**: Compute region (e.g., us-central1)
- **API Key**: Service account key or application default credentials`,
    presets: [
      {
        id: 'vertex-gemini',
        name: 'Vertex Gemini Pro',
        providerType: ProviderType.gcp_vertex,
        apiHost: 'https://us-central1-aiplatform.googleapis.com',
        defaultModel: 'gemini-3-pro',
        description: 'Gemini Pro on Vertex AI',
        requiresApiKey: true,
      },
    ],
    tags: ['enterprise', 'gcp', 'google-cloud', 'iam'],
    difficulty: 'advanced',
    popular: false,
  },

  // ─── Local Providers ──────────────────────────────────────────────────────────

  {
    type: ProviderType.ollama,
    displayName: 'Ollama',
    description: 'Run open-source LLMs locally — Llama, Mistral, Phi, Qwen, and 100+ models with zero configuration.',
    icon: '🦙',
    category: 'local',
    website: 'https://ollama.com',
    setupGuide: `## Setting Up Ollama

1. **Install Ollama**: Download from [ollama.com](https://ollama.com) or run \`curl -fsSL https://ollama.com/install.sh | sh\`
2. **Start Ollama**: Run \`ollama serve\` (or it starts automatically on install).
3. **Pull a Model**: Run \`ollama pull llama3\` to download a model.
4. **Configure**: Set the host URL (default: http://localhost:11434).
5. **No API Key Required**: Ollama runs locally and doesn't need an API key.

### Popular Models
- \`ollama pull llama3\` — Meta Llama 3
- \`ollama pull mistral\` — Mistral 7B
- \`ollama pull phi3\` — Microsoft Phi-3
- \`ollama pull qwen2\` — Alibaba Qwen 2`,
    presets: [
      {
        id: 'ollama-llama3',
        name: 'Local Ollama (Llama 3)',
        providerType: ProviderType.ollama,
        apiHost: 'http://localhost:11434',
        defaultModel: 'llama3',
        description: 'Run Llama 3 locally via Ollama',
        requiresApiKey: false,
      },
      {
        id: 'ollama-mistral',
        name: 'Local Ollama (Mistral)',
        providerType: ProviderType.ollama,
        apiHost: 'http://localhost:11434',
        defaultModel: 'mistral',
        description: 'Run Mistral locally via Ollama',
        requiresApiKey: false,
      },
    ],
    tags: ['local', 'free', 'privacy', 'open-source', 'offline'],
    difficulty: 'easy',
    popular: true,
  },

  {
    type: ProviderType.lm_studio,
    displayName: 'LM Studio',
    description: 'Desktop app for running local LLMs with a beautiful GUI — discover, download, and chat with models.',
    icon: '🔬',
    category: 'local',
    website: 'https://lmstudio.ai',
    setupGuide: `## Setting Up LM Studio

1. **Install LM Studio**: Download from [lmstudio.ai](https://lmstudio.ai).
2. **Download a Model**: Use the built-in model browser to download a model.
3. **Start Local Server**: In LM Studio, start the local API server (default port 1234).
4. **Configure**: Set host URL to http://localhost:1234.
5. **No API Key Required**: LM Studio runs locally.

### Tips
- The local server must be running for API calls to work.
- You can select which loaded model to use.`,
    presets: [
      {
        id: 'lmstudio-default',
        name: 'LM Studio Local',
        providerType: ProviderType.lm_studio,
        apiHost: 'http://localhost:1234',
        defaultModel: 'local-model',
        description: 'Use LM Studio\'s local server',
        requiresApiKey: false,
      },
    ],
    tags: ['local', 'free', 'gui', 'desktop', 'offline'],
    difficulty: 'easy',
    popular: false,
  },

  {
    type: ProviderType.docker_model_runner,
    displayName: 'Docker Model Runner',
    description: 'Run AI models inside Docker containers with the Docker Desktop Model Runner.',
    icon: '🐳',
    category: 'local',
    website: 'https://docs.docker.com/ai/',
    setupGuide: `## Setting Up Docker Model Runner

1. **Install Docker Desktop**: Get the latest version with AI support.
2. **Enable Model Runner**: In Docker Desktop settings, enable the Model Runner feature.
3. **Pull a Model**: Run \`docker model pull ai/smollm2\`.
4. **Configure**: Set host URL to http://localhost:12434.

### Tips
- Models run in isolated containers.
- Default endpoint port is 12434.`,
    presets: [
      {
        id: 'docker-smollm',
        name: 'Docker Model Runner',
        providerType: ProviderType.docker_model_runner,
        apiHost: 'http://localhost:12434',
        defaultModel: 'ai/smollm2',
        description: 'Run models in Docker containers',
        requiresApiKey: false,
      },
    ],
    tags: ['local', 'docker', 'containers', 'free'],
    difficulty: 'medium',
    popular: false,
  },

  {
    type: ProviderType.ramalama,
    displayName: 'Ramalama',
    description: 'Run AI models locally using OCI containers — simple CLI for model management.',
    icon: '🦏',
    category: 'local',
    website: 'https://github.com/containers/ramalama',
    setupGuide: `## Setting Up Ramalama

1. **Install Ramalama**: Follow instructions at the GitHub repo.
2. **Start Server**: Run \`ramalama serve\` to start the API server.
3. **Pull a Model**: Run \`ramalama pull llama3\`.
4. **Configure**: Set host URL (default: http://localhost:8080).`,
    presets: [
      {
        id: 'ramalama-default',
        name: 'Ramalama Local',
        providerType: ProviderType.ramalama,
        apiHost: 'http://localhost:8080',
        defaultModel: 'local-model',
        description: 'Run models via Ramalama',
        requiresApiKey: false,
      },
    ],
    tags: ['local', 'containers', 'oci', 'free'],
    difficulty: 'medium',
    popular: false,
  },

  // ─── Gateway Providers ────────────────────────────────────────────────────────

  {
    type: ProviderType.openrouter,
    displayName: 'OpenRouter',
    description: 'Unified API for 200+ AI models — route to any provider with a single API key and smart routing.',
    icon: '🔀',
    category: 'gateway',
    website: 'https://openrouter.ai',
    setupGuide: `## Setting Up OpenRouter

1. **Get an API Key**: Visit [openrouter.ai](https://openrouter.ai) and create an account.
2. **Add Credits**: Add credits to your account for API usage.
3. **Create API Key**: Generate a new API key from the Keys section.
4. **Set Environment Variable** (optional): \`export OPENROUTER_API_KEY=sk-or-...\`
5. **Enter API Key**: Paste your key in the provider setup.

### Tips
- Access 200+ models from a single API key.
- Models include Claude, GPT, Llama, Mistral, and more.
- Pay-per-use pricing with no subscriptions.
- Set \`HTTP-Referer\` header for rankings on openrouter.ai.`,
    presets: [
      {
        id: 'openrouter-claude',
        name: 'OpenRouter Claude',
        providerType: ProviderType.openrouter,
        apiHost: 'https://openrouter.ai',
        defaultModel: 'anthropic/claude-sonnet-4-20250514',
        description: 'Claude Sonnet via OpenRouter',
        requiresApiKey: true,
      },
      {
        id: 'openrouter-deepseek',
        name: 'OpenRouter DeepSeek R1',
        providerType: ProviderType.openrouter,
        apiHost: 'https://openrouter.ai',
        defaultModel: 'deepseek/deepseek-r1',
        description: 'DeepSeek R1 via OpenRouter',
        requiresApiKey: true,
      },
      {
        id: 'openrouter-llama',
        name: 'OpenRouter Llama 3',
        providerType: ProviderType.openrouter,
        apiHost: 'https://openrouter.ai',
        defaultModel: 'meta-llama/llama-3-70b-instruct',
        description: 'Llama 3 70B via OpenRouter',
        requiresApiKey: true,
      },
    ],
    tags: ['gateway', 'multi-model', 'routing', 'pay-per-use'],
    difficulty: 'easy',
    popular: true,
  },

  {
    type: ProviderType.litellm,
    displayName: 'LiteLLM',
    description: 'OpenAI-compatible proxy for 100+ LLM providers — unified interface with load balancing and fallbacks.',
    icon: '💡',
    category: 'gateway',
    website: 'https://litellm.ai',
    setupGuide: `## Setting Up LiteLLM

1. **Install LiteLLM**: \`pip install litellm[proxy]\`
2. **Start Proxy**: \`litellm --model gpt-4\` or use a config file.
3. **Configure**: Set host URL to your LiteLLM proxy (default: http://localhost:4000).
4. **API Key**: Optional — depends on your LiteLLM configuration.

### Tips
- LiteLLM acts as a proxy, forwarding to your configured backends.
- Supports load balancing across multiple providers.
- Great for enterprise deployments.`,
    presets: [
      {
        id: 'litellm-default',
        name: 'LiteLLM Proxy',
        providerType: ProviderType.litellm,
        apiHost: 'http://localhost:4000',
        defaultModel: 'gpt-4',
        description: 'LiteLLM proxy for multi-provider routing',
        requiresApiKey: false,
      },
    ],
    tags: ['gateway', 'proxy', 'load-balancing', 'enterprise'],
    difficulty: 'medium',
    popular: false,
  },

  // ─── Specialized Providers ────────────────────────────────────────────────────

  {
    type: ProviderType.groq,
    displayName: 'Groq',
    description: 'Ultra-fast LLM inference on LPU hardware — Llama, Mixtral, and Gemma at 800+ tokens/second.',
    icon: '🚀',
    category: 'specialized',
    website: 'https://groq.com',
    setupGuide: `## Setting Up Groq

1. **Get an API Key**: Visit [console.groq.com](https://console.groq.com) and create an account.
2. **Create API Key**: Generate a new API key.
3. **Set Environment Variable** (optional): \`export GROQ_API_KEY=gsk_...\`
4. **Enter API Key**: Paste your key in the provider setup.

### Tips
- Groq is extremely fast — great for real-time applications.
- Free tier available with generous rate limits.
- Supports Llama 3, Mixtral, and Gemma models.`,
    presets: [
      {
        id: 'groq-llama3',
        name: 'Groq Llama 3 70B',
        providerType: ProviderType.groq,
        apiHost: 'https://api.groq.com',
        defaultModel: 'llama-3-70b',
        description: 'Llama 3 70B at ultra-fast speed',
        requiresApiKey: true,
      },
    ],
    tags: ['fast', 'inference', 'lpu', 'free-tier'],
    difficulty: 'easy',
    popular: true,
  },

  {
    type: ProviderType.cerebras,
    displayName: 'Cerebras',
    description: 'Wafer-scale engine inference — unmatched speed for Llama and other open models.',
    icon: '🔶',
    category: 'specialized',
    website: 'https://cerebras.ai',
    setupGuide: `## Setting Up Cerebras

1. **Get an API Key**: Visit [cloud.cerebras.ai](https://cloud.cerebras.ai) and sign up.
2. **Create API Key**: Generate a new API key.
3. **Set Environment Variable** (optional): \`export CEREBRAS_API_KEY=csk-...\`
4. **Enter API Key**: Paste your key in the provider setup.

### Tips
- Cerebras uses CS-3 wafer-scale chips for extremely fast inference.
- Currently supports Llama models.`,
    presets: [
      {
        id: 'cerebras-llama',
        name: 'Cerebras Llama 3.3 70B',
        providerType: ProviderType.cerebras,
        apiHost: 'https://api.cerebras.ai',
        defaultModel: 'llama-3.3-70b',
        description: 'Ultra-fast Llama inference on Cerebras',
        requiresApiKey: true,
      },
    ],
    tags: ['fast', 'inference', 'wafer-scale', 'hardware'],
    difficulty: 'easy',
    popular: false,
  },

  {
    type: ProviderType.xai,
    displayName: 'xAI (Grok)',
    description: 'Grok models from xAI — real-time knowledge with humor and personality.',
    icon: '✖️',
    category: 'specialized',
    website: 'https://x.ai',
    setupGuide: `## Setting Up xAI

1. **Get an API Key**: Visit [console.x.ai](https://console.x.ai) and create an account.
2. **Create API Key**: Generate a new API key.
3. **Set Environment Variable** (optional): \`export XAI_API_KEY=xai-...\`
4. **Enter API Key**: Paste your key in the provider setup.

### Tips
- Grok models have real-time knowledge from X (Twitter).
- Grok 3 is the latest and most capable model.`,
    presets: [
      {
        id: 'xai-grok3',
        name: 'Grok 3',
        providerType: ProviderType.xai,
        apiHost: 'https://api.x.ai',
        defaultModel: 'grok-3',
        description: 'Latest Grok model with real-time knowledge',
        requiresApiKey: true,
      },
    ],
    tags: ['real-time', 'social', 'xai', 'grok'],
    difficulty: 'easy',
    popular: false,
  },

  {
    type: ProviderType.mistral,
    displayName: 'Mistral AI',
    description: 'Mistral and Codestral models — European AI with strong multilingual and coding capabilities.',
    icon: '🌊',
    category: 'specialized',
    website: 'https://mistral.ai',
    setupGuide: `## Setting Up Mistral AI

1. **Get an API Key**: Visit [console.mistral.ai](https://console.mistral.ai) and create an account.
2. **Create API Key**: Generate a new API key from the API Keys section.
3. **Set Environment Variable** (optional): \`export MISTRAL_API_KEY=...\`
4. **Enter API Key**: Paste your key in the provider setup.

### Tips
- Mistral Large is their most capable model.
- Codestral is optimized for code generation.
- Supports function calling and JSON mode.`,
    presets: [
      {
        id: 'mistral-large',
        name: 'Mistral Large',
        providerType: ProviderType.mistral,
        apiHost: 'https://api.mistral.ai',
        defaultModel: 'mistral-large-latest',
        description: 'Most capable Mistral model',
        requiresApiKey: true,
      },
      {
        id: 'mistral-codestral',
        name: 'Codestral',
        providerType: ProviderType.mistral,
        apiHost: 'https://api.mistral.ai',
        defaultModel: 'codestral-latest',
        description: 'Optimized for code generation',
        requiresApiKey: true,
      },
    ],
    tags: ['coding', 'european', 'multilingual', 'functions'],
    difficulty: 'easy',
    popular: false,
  },

  {
    type: ProviderType.perplexity,
    displayName: 'Perplexity',
    description: 'AI-powered search and answers — Sonar models with real-time web knowledge.',
    icon: '🔍',
    category: 'specialized',
    website: 'https://perplexity.ai',
    setupGuide: `## Setting Up Perplexity

1. **Get an API Key**: Visit [docs.perplexity.ai](https://docs.perplexity.ai) and create an account.
2. **Create API Key**: Generate a new API key.
3. **Set Environment Variable** (optional): \`export PERPLEXITY_API_KEY=pplx-...\`
4. **Enter API Key**: Paste your key in the provider setup.

### Tips
- Sonar models provide answers with citations.
- Great for research and fact-checking.`,
    presets: [
      {
        id: 'perplexity-sonar',
        name: 'Perplexity Sonar',
        providerType: ProviderType.perplexity,
        apiHost: 'https://api.perplexity.ai',
        defaultModel: 'sonar',
        description: 'AI search with citations',
        requiresApiKey: true,
      },
    ],
    tags: ['search', 'citations', 'real-time', 'research'],
    difficulty: 'easy',
    popular: false,
  },

  {
    type: ProviderType.github_copilot,
    displayName: 'GitHub Copilot',
    description: 'AI pair programmer integrated with GitHub — use your Copilot subscription for API access.',
    icon: '🐙',
    category: 'specialized',
    website: 'https://github.com/features/copilot',
    setupGuide: `## Setting Up GitHub Copilot

1. **Copilot Subscription**: You need an active GitHub Copilot subscription.
2. **Get Token**: Use the Copilot token extraction process.
3. **Configure**: Enter the token when prompted.

### Tips
- Requires an active Copilot subscription.
- Uses OAuth token-based authentication.
- Supports GPT-4 and Claude models.`,
    presets: [
      {
        id: 'copilot-gpt4',
        name: 'Copilot GPT-4o',
        providerType: ProviderType.github_copilot,
        apiHost: 'https://api.githubcopilot.com',
        defaultModel: 'gpt-4o',
        description: 'GPT-4o via Copilot subscription',
        requiresApiKey: true,
      },
    ],
    tags: ['coding', 'github', 'copilot', 'ide'],
    difficulty: 'medium',
    popular: false,
  },

  {
    type: ProviderType.opencode,
    displayName: 'OpenCode',
    description: 'OpenCode terminal-based coding agent — AI-powered development in your terminal.',
    icon: '💻',
    category: 'specialized',
    website: 'https://opencode.ai',
    setupGuide: `## Setting Up OpenCode

1. **Install OpenCode**: Follow instructions at opencode.ai.
2. **Configure**: Set up the API connection with authentication.
3. **Start Session**: Launch an OpenCode session.

### Tips
- Uses HTTP Basic Auth.
- Integrates with your development workflow.`,
    presets: [
      {
        id: 'opencode-default',
        name: 'OpenCode Session',
        providerType: ProviderType.opencode,
        apiHost: 'http://localhost:3000',
        defaultModel: 'default',
        description: 'Connect to an OpenCode session',
        requiresApiKey: true,
      },
    ],
    tags: ['coding', 'terminal', 'agent', 'development'],
    difficulty: 'medium',
    popular: false,
  },

  {
    type: ProviderType.databricks,
    displayName: 'Databricks',
    description: 'AI models on Databricks — DBRX and custom fine-tuned models on Lakehouse AI.',
    icon: '📊',
    category: 'specialized',
    website: 'https://databricks.com',
    setupGuide: `## Setting Up Databricks

1. **Databricks Workspace**: You need access to a Databricks workspace.
2. **Generate Token**: Create a personal access token in User Settings.
3. **Configure**: Enter your workspace URL and token.

### Tips
- Supports DBRX and custom fine-tuned models.
- Enterprise-grade MLOps platform.`,
    presets: [
      {
        id: 'databricks-dbrx',
        name: 'Databricks DBRX',
        providerType: ProviderType.databricks,
        apiHost: 'https://your-workspace.databricks.com',
        defaultModel: 'databricks-dbrx-instruct',
        description: 'DBRX model on Databricks',
        requiresApiKey: true,
      },
    ],
    tags: ['enterprise', 'lakehouse', 'fine-tuning', 'mlops'],
    difficulty: 'advanced',
    popular: false,
  },

  {
    type: ProviderType.novita,
    displayName: 'Novita AI',
    description: 'GPU cloud with LLM inference — cost-effective access to open-source models.',
    icon: '🌟',
    category: 'specialized',
    website: 'https://novita.ai',
    setupGuide: `## Setting Up Novita AI

1. **Get an API Key**: Visit [novita.ai](https://novita.ai) and create an account.
2. **Add Credits**: Add credits for API usage.
3. **Create API Key**: Generate a key from the dashboard.
4. **Enter API Key**: Paste your key in the provider setup.`,
    presets: [
      {
        id: 'novita-llama',
        name: 'Novita Llama 3 70B',
        providerType: ProviderType.novita,
        apiHost: 'https://api.novita.ai',
        defaultModel: 'meta-llama/llama-3-70b-instruct',
        description: 'Llama 3 on Novita GPU cloud',
        requiresApiKey: true,
      },
    ],
    tags: ['gpu', 'inference', 'cost-effective'],
    difficulty: 'easy',
    popular: false,
  },

  {
    type: ProviderType.venice,
    displayName: 'Venice',
    description: 'Privacy-focused AI inference — no content moderation, no data retention.',
    icon: '🏛️',
    category: 'specialized',
    website: 'https://venice.ai',
    setupGuide: `## Setting Up Venice

1. **Get an API Key**: Visit [venice.ai](https://venice.ai) and create an account.
2. **Create API Key**: Generate a key from the dashboard.
3. **Enter API Key**: Paste your key in the provider setup.

### Tips
- Privacy-first: no content logging or moderation.
- Supports popular open-source models.`,
    presets: [
      {
        id: 'venice-llama',
        name: 'Venice Llama 3',
        providerType: ProviderType.venice,
        apiHost: 'https://api.venice.ai',
        defaultModel: 'llama-3-70b',
        description: 'Llama 3 with privacy focus',
        requiresApiKey: true,
      },
    ],
    tags: ['privacy', 'no-logging', 'uncensored'],
    difficulty: 'easy',
    popular: false,
  },

  {
    type: ProviderType.snowflake,
    displayName: 'Snowflake Cortex',
    description: 'AI models in Snowflake Data Cloud — Arctic and more with seamless data integration.',
    icon: '❄️',
    category: 'specialized',
    website: 'https://snowflake.com',
    setupGuide: `## Setting Up Snowflake Cortex

1. **Snowflake Account**: You need an active Snowflake account with Cortex access.
2. **Generate Token**: Create an API key from your Snowflake account.
3. **Configure**: Enter your Snowflake API endpoint and key.`,
    presets: [
      {
        id: 'snowflake-arctic',
        name: 'Snowflake Arctic',
        providerType: ProviderType.snowflake,
        apiHost: 'https://api.snowflake.com',
        defaultModel: 'snowflake-arctic',
        description: 'Arctic model on Snowflake',
        requiresApiKey: true,
      },
    ],
    tags: ['data-cloud', 'enterprise', 'arctic'],
    difficulty: 'advanced',
    popular: false,
  },

  {
    type: ProviderType.amazon_sagemaker,
    displayName: 'Amazon SageMaker',
    description: 'AWS SageMaker AI endpoints — deploy custom models with full infrastructure control.',
    icon: '🔧',
    category: 'cloud',
    website: 'https://aws.amazon.com/sagemaker',
    setupGuide: `## Setting Up Amazon SageMaker

1. **AWS Account**: Active AWS account with SageMaker access.
2. **Create Endpoint**: Deploy a model to a SageMaker endpoint.
3. **Configure**: Enter the endpoint URL and AWS credentials.

### Required Fields
- **API Host**: SageMaker endpoint URL
- **API Key**: AWS Access Key ID
- **Region**: AWS region`,
    presets: [
      {
        id: 'sagemaker-custom',
        name: 'SageMaker Custom Endpoint',
        providerType: ProviderType.amazon_sagemaker,
        apiHost: 'https://runtime.sagemaker.us-east-1.amazonaws.com',
        defaultModel: 'custom-endpoint',
        description: 'Custom SageMaker endpoint',
        requiresApiKey: true,
      },
    ],
    tags: ['enterprise', 'aws', 'custom-models', 'endpoints'],
    difficulty: 'advanced',
    popular: false,
  },

  {
    type: ProviderType.ollama_cloud,
    displayName: 'Ollama Cloud',
    description: 'Cloud-hosted Ollama inference — run open-source models without local setup.',
    icon: '☁️',
    category: 'cloud',
    website: 'https://ollama.com',
    setupGuide: `## Setting Up Ollama Cloud

1. **Get an API Key**: Sign up at ollama.com for cloud access.
2. **Create API Key**: Generate a key from your account.
3. **Enter API Key**: Paste your key in the provider setup.`,
    presets: [
      {
        id: 'ollama-cloud-llama',
        name: 'Ollama Cloud Llama 3',
        providerType: ProviderType.ollama_cloud,
        apiHost: 'https://api.ollama.cloud',
        defaultModel: 'llama-3-70b',
        description: 'Llama 3 on Ollama Cloud',
        requiresApiKey: true,
      },
    ],
    tags: ['cloud', 'ollama', 'open-source'],
    difficulty: 'easy',
    popular: false,
  },

  // ─── Other Specialized Providers ──────────────────────────────────────────────

  {
    type: ProviderType.avian,
    displayName: 'Avian',
    description: 'AI infrastructure platform providing access to multiple models via unified API.',
    icon: '🐦',
    category: 'specialized',
    website: 'https://avian.io',
    setupGuide: `## Setting Up Avian

1. **Get an API Key**: Visit [avian.io](https://avian.io) and create an account.
2. **Create API Key**: Generate a key from the dashboard.
3. **Enter API Key**: Paste your key in the provider setup.`,
    presets: [
      {
        id: 'avian-default',
        name: 'Avian AI',
        providerType: ProviderType.avian,
        apiHost: 'https://api.avian.io',
        defaultModel: 'gpt-4',
        description: 'AI via Avian platform',
        requiresApiKey: true,
      },
    ],
    tags: ['infrastructure', 'multi-model'],
    difficulty: 'easy',
    popular: false,
  },

  {
    type: ProviderType.futurmix,
    displayName: 'FuturMix',
    description: 'AI model hosting platform for inference and deployment.',
    icon: '🔮',
    category: 'specialized',
    website: 'https://futurmix.ai',
    setupGuide: `## Setting Up FuturMix

1. **Get an API Key**: Visit [futurmix.ai](https://futurmix.ai) and create an account.
2. **Create API Key**: Generate a key from the dashboard.
3. **Enter API Key**: Paste your key in the provider setup.`,
    presets: [
      {
        id: 'futurmix-default',
        name: 'FuturMix AI',
        providerType: ProviderType.futurmix,
        apiHost: 'https://api.futurmix.ai',
        defaultModel: 'default',
        description: 'AI via FuturMix',
        requiresApiKey: true,
      },
    ],
    tags: ['hosting', 'inference'],
    difficulty: 'easy',
    popular: false,
  },

  {
    type: ProviderType.near_ai,
    displayName: 'NEAR AI',
    description: 'Decentralized AI platform on the NEAR blockchain — privacy-preserving inference.',
    icon: '🔗',
    category: 'specialized',
    website: 'https://near.ai',
    setupGuide: `## Setting Up NEAR AI

1. **Get an API Key**: Visit [near.ai](https://near.ai) and create an account.
2. **Create API Key**: Generate a key from the dashboard.
3. **Enter API Key**: Paste your key in the provider setup.`,
    presets: [
      {
        id: 'near-default',
        name: 'NEAR AI',
        providerType: ProviderType.near_ai,
        apiHost: 'https://api.near.ai',
        defaultModel: 'default',
        description: 'AI via NEAR decentralized platform',
        requiresApiKey: true,
      },
    ],
    tags: ['decentralized', 'blockchain', 'privacy'],
    difficulty: 'medium',
    popular: false,
  },

  {
    type: ProviderType.ovhcloud,
    displayName: 'OVHcloud AI',
    description: 'European cloud AI endpoints — GDPR-compliant LLM inference.',
    icon: '🇪🇺',
    category: 'cloud',
    website: 'https://ovhcloud.com',
    setupGuide: `## Setting Up OVHcloud AI

1. **OVHcloud Account**: Create an account at ovhcloud.com.
2. **Subscribe to AI Endpoints**: Enable the AI Endpoints service.
3. **Get API Key**: Generate credentials from the dashboard.
4. **Enter API Key**: Paste your key in the provider setup.`,
    presets: [
      {
        id: 'ovhcloud-mistral',
        name: 'OVHcloud Mistral',
        providerType: ProviderType.ovhcloud,
        apiHost: 'https://gra.ai.ai.endpoints.cloud.ovh.net',
        defaultModel: 'Mistral-7B-Instruct',
        description: 'Mistral on OVHcloud EU infrastructure',
        requiresApiKey: true,
      },
    ],
    tags: ['european', 'gdpr', 'compliance', 'cloud'],
    difficulty: 'medium',
    popular: false,
  },

  {
    type: ProviderType.routstr,
    displayName: 'Routstr',
    description: 'AI routing platform — intelligent request routing across multiple providers.',
    icon: '🛤️',
    category: 'gateway',
    website: 'https://routstr.com',
    setupGuide: `## Setting Up Routstr

1. **Get an API Key**: Visit [routstr.com](https://routstr.com) and create an account.
2. **Create API Key**: Generate a key from the dashboard.
3. **Enter API Key**: Paste your key in the provider setup.`,
    presets: [
      {
        id: 'routstr-default',
        name: 'Routstr AI',
        providerType: ProviderType.routstr,
        apiHost: 'https://api.routstr.com',
        defaultModel: 'default',
        description: 'AI routing via Routstr',
        requiresApiKey: true,
      },
    ],
    tags: ['routing', 'gateway', 'multi-provider'],
    difficulty: 'easy',
    popular: false,
  },

  {
    type: ProviderType.saladcloud,
    displayName: 'SaladCloud',
    description: 'GPU cloud for cost-effective AI inference — run open-source models affordably.',
    icon: '🥗',
    category: 'specialized',
    website: 'https://salad.com',
    setupGuide: `## Setting Up SaladCloud

1. **Get an API Key**: Visit [salad.com](https://salad.com) and create an account.
2. **Create API Key**: Generate a key from the dashboard.
3. **Enter API Key**: Paste your key in the provider setup.`,
    presets: [
      {
        id: 'saladcloud-llama',
        name: 'SaladCloud Llama 3',
        providerType: ProviderType.saladcloud,
        apiHost: 'https://api.salad.com',
        defaultModel: 'meta-llama/llama-3-70b',
        description: 'Llama 3 on SaladCloud GPUs',
        requiresApiKey: true,
      },
    ],
    tags: ['gpu', 'cost-effective', 'inference'],
    difficulty: 'easy',
    popular: false,
  },

  {
    type: ProviderType.scaleway,
    displayName: 'Scaleway',
    description: 'European cloud with LLM inference — data sovereignty and GDPR compliance.',
    icon: '🇫🇷',
    category: 'cloud',
    website: 'https://scaleway.com',
    setupGuide: `## Setting Up Scaleway

1. **Scaleway Account**: Create an account at scaleway.com.
2. **Enable AI Endpoints**: Subscribe to the AI inference service.
3. **Get API Key**: Generate an API key from the dashboard.
4. **Enter API Key**: Paste your key in the provider setup.`,
    presets: [
      {
        id: 'scaleway-llama',
        name: 'Scaleway Llama 3',
        providerType: ProviderType.scaleway,
        apiHost: 'https://api.scaleway.com/llm/v1',
        defaultModel: 'llama-3-70b-instruct',
        description: 'Llama 3 on Scaleway EU cloud',
        requiresApiKey: true,
      },
    ],
    tags: ['european', 'gdpr', 'sovereignty', 'cloud'],
    difficulty: 'medium',
    popular: false,
  },

  {
    type: ProviderType.tetrate,
    displayName: 'Tetrate',
    description: 'Enterprise AI gateway — secure, manage, and monitor AI API traffic.',
    icon: '🛡️',
    category: 'gateway',
    website: 'https://tetrate.io',
    setupGuide: `## Setting Up Tetrate

1. **Tetrate Account**: Contact Tetrate for enterprise access.
2. **Configure Gateway**: Set up the AI gateway for your organization.
3. **Get API Key**: Generate credentials for the gateway.
4. **Enter API Key**: Paste your key in the provider setup.`,
    presets: [
      {
        id: 'tetrate-default',
        name: 'Tetrate Gateway',
        providerType: ProviderType.tetrate,
        apiHost: 'https://api.tetrate.io',
        defaultModel: 'default',
        description: 'Enterprise AI gateway',
        requiresApiKey: true,
      },
    ],
    tags: ['enterprise', 'gateway', 'security', 'monitoring'],
    difficulty: 'advanced',
    popular: false,
  },

  {
    type: ProviderType.chatgpt_codex,
    displayName: 'ChatGPT Codex',
    description: 'OpenAI Codex for code generation — optimized for programming tasks.',
    icon: '📝',
    category: 'specialized',
    website: 'https://openai.com',
    setupGuide: `## Setting Up ChatGPT Codex

1. **OpenAI Account**: You need an OpenAI API key with Codex access.
2. **Use OpenAI Key**: Your existing OpenAI API key works.
3. **Enter API Key**: Paste your OpenAI key in the provider setup.`,
    presets: [
      {
        id: 'codex-mini',
        name: 'Codex Mini',
        providerType: ProviderType.chatgpt_codex,
        apiHost: 'https://api.openai.com',
        defaultModel: 'codex-mini',
        description: 'Code-optimized model',
        requiresApiKey: true,
      },
    ],
    tags: ['coding', 'codex', 'openai', 'generation'],
    difficulty: 'easy',
    popular: false,
  },

  {
    type: ProviderType.atomic_chat,
    displayName: 'Atomic Chat',
    description: 'AI chat platform with conversational AI capabilities.',
    icon: '⚛️',
    category: 'specialized',
    website: 'https://atomic.chat',
    setupGuide: `## Setting Up Atomic Chat

1. **Get an API Key**: Visit [atomic.chat](https://atomic.chat) and create an account.
2. **Create API Key**: Generate a key from the dashboard.
3. **Enter API Key**: Paste your key in the provider setup.`,
    presets: [
      {
        id: 'atomic-default',
        name: 'Atomic Chat',
        providerType: ProviderType.atomic_chat,
        apiHost: 'https://api.atomic.chat',
        defaultModel: 'default',
        description: 'AI chat via Atomic',
        requiresApiKey: true,
      },
    ],
    tags: ['chat', 'conversational'],
    difficulty: 'easy',
    popular: false,
  },

  {
    type: ProviderType.vmware_tanzu,
    displayName: 'VMware Tanzu AI',
    description: 'Enterprise AI platform on VMware Tanzu — run models in your private cloud.',
    icon: '🏭',
    category: 'cloud',
    website: 'https://tanzu.vmware.com',
    setupGuide: `## Setting Up VMware Tanzu AI

1. **VMware Account**: Contact VMware for Tanzu AI access.
2. **Configure Platform**: Set up Tanzu AI in your infrastructure.
3. **Get API Key**: Generate credentials for the API.
4. **Enter API Key**: Paste your key in the provider setup.`,
    presets: [
      {
        id: 'tanzu-default',
        name: 'VMware Tanzu AI',
        providerType: ProviderType.vmware_tanzu,
        apiHost: 'https://api.tanzu.vmware.com',
        defaultModel: 'default',
        description: 'Enterprise AI on VMware Tanzu',
        requiresApiKey: true,
      },
    ],
    tags: ['enterprise', 'private-cloud', 'vmware'],
    difficulty: 'advanced',
    popular: false,
  },

  {
    type: ProviderType.custom_openai,
    displayName: 'Custom OpenAI API',
    description: 'Any OpenAI-compatible API endpoint — connect to your own or third-party LLM services.',
    icon: '🔧',
    category: 'custom',
    website: '',
    setupGuide: `## Setting Up Custom OpenAI API

1. **Identify Endpoint**: Know the URL of your OpenAI-compatible API.
2. **Get Credentials**: Obtain the API key if authentication is required.
3. **Configure**: Enter the API host URL and optional base path.
4. **Select Model**: Enter the model name supported by your endpoint.

### Compatible With
- vLLM
- Text Generation Inference (TGI)
- FastChat
- LocalAI
- Any server implementing the OpenAI chat completions API`,
    presets: [
      {
        id: 'custom-vllm',
        name: 'Custom vLLM',
        providerType: ProviderType.custom_openai,
        apiHost: 'http://localhost:8000',
        defaultModel: 'custom-model',
        description: 'Connect to a vLLM server',
        requiresApiKey: false,
      },
    ],
    tags: ['custom', 'self-hosted', 'compatible', 'any-api'],
    difficulty: 'medium',
    popular: false,
  },
];

// ─── ProviderCatalog Class ───────────────────────────────────────────────────────

export class ProviderCatalog {
  private entries: Map<ProviderType, ProviderCatalogEntry> = new Map();

  constructor() {
    for (const entry of CATALOG) {
      this.entries.set(entry.type, entry);
    }
  }

  /**
   * List all catalog entries.
   */
  list(): ProviderCatalogEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Get a specific catalog entry by provider type.
   */
  get(type: ProviderType): ProviderCatalogEntry | undefined {
    return this.entries.get(type);
  }

  /**
   * Get entries by category.
   */
  getByCategory(category: ProviderCategory): ProviderCatalogEntry[] {
    return this.list().filter((e) => e.category === category);
  }

  /**
   * Search catalog entries by name, description, or tags.
   */
  search(query: string): ProviderCatalogEntry[] {
    const lower = query.toLowerCase();
    return this.list().filter(
      (e) =>
        e.displayName.toLowerCase().includes(lower) ||
        e.description.toLowerCase().includes(lower) ||
        e.tags.some((t) => t.toLowerCase().includes(lower)) ||
        e.type.toLowerCase().includes(lower)
    );
  }

  /**
   * Get all quick-add presets across all providers.
   */
  getPresets(): ProviderPreset[] {
    return this.list().flatMap((e) => e.presets);
  }

  /**
   * Get presets for a specific provider.
   */
  getPresetsForProvider(type: ProviderType): ProviderPreset[] {
    return this.entries.get(type)?.presets || [];
  }

  /**
   * Get popular providers (marked with popular flag).
   */
  getPopular(): ProviderCatalogEntry[] {
    return this.list().filter((e) => e.popular);
  }

  /**
   * Get entries by difficulty level.
   */
  getByDifficulty(difficulty: ProviderDifficulty): ProviderCatalogEntry[] {
    return this.list().filter((e) => e.difficulty === difficulty);
  }

  /**
   * Get all available categories.
   */
  getCategories(): ProviderCategory[] {
    const categories = new Set(this.list().map((e) => e.category));
    return ['major', 'cloud', 'local', 'gateway', 'specialized', 'custom'].filter(
      (c) => categories.has(c as ProviderCategory)
    ) as ProviderCategory[];
  }

  /**
   * Get a specific preset by ID.
   */
  getPreset(presetId: string): ProviderPreset | undefined {
    return this.getPresets().find((p) => p.id === presetId);
  }

  /**
   * Get the setup guide for a provider.
   */
  getSetupGuide(type: ProviderType): string {
    return this.entries.get(type)?.setupGuide || 'No setup guide available for this provider.';
  }

  /**
   * Add or update a catalog entry.
   */
  register(entry: ProviderCatalogEntry): void {
    this.entries.set(entry.type, entry);
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────────

let instance: ProviderCatalog | null = null;

export function getProviderCatalog(): ProviderCatalog {
  if (!instance) {
    instance = new ProviderCatalog();
  }
  return instance;
}

export function setProviderCatalog(catalog: ProviderCatalog): void {
  instance = catalog;
}

export function resetProviderCatalog(): void {
  instance = null;
}
