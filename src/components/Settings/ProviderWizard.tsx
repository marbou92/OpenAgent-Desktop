/**
 * OpenAgent-Desktop - Provider Setup Wizard Component
 *
 * Step-by-step wizard for adding a new AI provider:
 * Step 1: Choose provider type
 * Step 2: Enter API key / credentials
 * Step 3: Configure host URL
 * Step 4: Select default model
 * Step 5: Test connection
 *
 * Includes progress indicator, show/hide API key toggle,
 * and auto-populated defaults per provider type.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { ProviderMetadata, Toast } from '../../types';

const api = (window as any).openagent;

// ─── Wizard Steps ──────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Provider', description: 'Choose type' },
  { id: 2, label: 'Credentials', description: 'API key' },
  { id: 3, label: 'Host', description: 'Server URL' },
  { id: 4, label: 'Model', description: 'Default model' },
  { id: 5, label: 'Test', description: 'Verify' },
] as const;

// ─── All Provider Types with Metadata ──────────────────────────────────────────

const ALL_PROVIDERS: ProviderMetadata[] = [
  { type: 'anthropic', displayName: 'Anthropic', description: 'Claude AI models', requiresApiKey: true, defaultHost: 'https://api.anthropic.com', defaultBasePath: '/v1', defaultModels: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'], supportsStreaming: true, supportsToolUse: true, supportsThinking: true, envVarApiKey: 'ANTHROPIC_API_KEY', envVarHost: 'ANTHROPIC_HOST', website: 'https://anthropic.com' },
  { type: 'openai', displayName: 'OpenAI', description: 'GPT-4, GPT-4o, and more', requiresApiKey: true, defaultHost: 'https://api.openai.com', defaultBasePath: '/v1', defaultModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'], supportsStreaming: true, supportsToolUse: true, supportsThinking: false, envVarApiKey: 'OPENAI_API_KEY', envVarHost: 'OPENAI_HOST', website: 'https://openai.com' },
  { type: 'openrouter', displayName: 'OpenRouter', description: 'Multi-model gateway', requiresApiKey: true, defaultHost: 'https://openrouter.ai', defaultBasePath: '/api/v1', defaultModels: ['anthropic/claude-sonnet-4-20250514', 'openai/gpt-4o', 'google/gemini-pro-1.5'], supportsStreaming: true, supportsToolUse: true, supportsThinking: false, envVarApiKey: 'OPENROUTER_API_KEY', envVarHost: '', website: 'https://openrouter.ai' },
  { type: 'azure_openai', displayName: 'Azure OpenAI', description: 'Enterprise OpenAI on Azure', requiresApiKey: true, defaultHost: 'https://YOUR_RESOURCE.openai.azure.com', defaultBasePath: '/openai', defaultModels: ['gpt-4o', 'gpt-4-turbo', 'gpt-35-turbo'], supportsStreaming: true, supportsToolUse: true, supportsThinking: false, envVarApiKey: 'AZURE_OPENAI_API_KEY', envVarHost: 'AZURE_OPENAI_ENDPOINT', website: 'https://azure.microsoft.com/en-us/products/ai-services/openai-service' },
  { type: 'gemini', displayName: 'Google Gemini', description: 'Google AI models', requiresApiKey: true, defaultHost: 'https://generativelanguage.googleapis.com', defaultBasePath: '/v1beta', defaultModels: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'], supportsStreaming: true, supportsToolUse: true, supportsThinking: false, envVarApiKey: 'GOOGLE_API_KEY', envVarHost: '', website: 'https://ai.google.dev' },
  { type: 'gcp_vertex', displayName: 'GCP Vertex AI', description: 'Google Cloud AI Platform', requiresApiKey: true, defaultHost: 'https://aiplatform.googleapis.com', defaultBasePath: '/v1', defaultModels: ['gemini-1.5-pro', 'gemini-1.5-flash'], supportsStreaming: true, supportsToolUse: true, supportsThinking: false, envVarApiKey: 'GOOGLE_APPLICATION_CREDENTIALS', envVarHost: 'GOOGLE_CLOUD_REGION', website: 'https://cloud.google.com/vertex-ai' },
  { type: 'amazon_bedrock', displayName: 'Amazon Bedrock', description: 'AWS AI service', requiresApiKey: true, defaultHost: 'https://bedrock-runtime.us-east-1.amazonaws.com', defaultBasePath: '', defaultModels: ['anthropic.claude-3-5-sonnet', 'anthropic.claude-3-opus', 'meta.llama3-70b'], supportsStreaming: true, supportsToolUse: true, supportsThinking: false, envVarApiKey: 'AWS_ACCESS_KEY_ID', envVarHost: 'AWS_REGION', website: 'https://aws.amazon.com/bedrock' },
  { type: 'groq', displayName: 'Groq', description: 'Ultra-fast LLM inference', requiresApiKey: true, defaultHost: 'https://api.groq.com', defaultBasePath: '/openai/v1', defaultModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'], supportsStreaming: true, supportsToolUse: true, supportsThinking: false, envVarApiKey: 'GROQ_API_KEY', envVarHost: '', website: 'https://groq.com' },
  { type: 'mistral', displayName: 'Mistral AI', description: 'Mistral and Mixtral models', requiresApiKey: true, defaultHost: 'https://api.mistral.ai', defaultBasePath: '/v1', defaultModels: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest', 'open-mistral-7b'], supportsStreaming: true, supportsToolUse: true, supportsThinking: false, envVarApiKey: 'MISTRAL_API_KEY', envVarHost: '', website: 'https://mistral.ai' },
  { type: 'ollama', displayName: 'Ollama', description: 'Run models locally', requiresApiKey: false, defaultHost: 'http://localhost:11434', defaultBasePath: '/api', defaultModels: ['llama3.1', 'codellama', 'mistral', 'phi3'], supportsStreaming: true, supportsToolUse: true, supportsThinking: false, envVarApiKey: '', envVarHost: 'OLLAMA_HOST', website: 'https://ollama.ai' },
  { type: 'lm_studio', displayName: 'LM Studio', description: 'Local model inference', requiresApiKey: false, defaultHost: 'http://localhost:1234', defaultBasePath: '/v1', defaultModels: ['default'], supportsStreaming: true, supportsToolUse: false, supportsThinking: false, envVarApiKey: '', envVarHost: '', website: 'https://lmstudio.ai' },
  { type: 'litellm', displayName: 'LiteLLM', description: 'Universal LLM proxy', requiresApiKey: false, defaultHost: 'http://localhost:4000', defaultBasePath: '/v1', defaultModels: ['gpt-4o', 'claude-3-5-sonnet'], supportsStreaming: true, supportsToolUse: true, supportsThinking: false, envVarApiKey: 'LITELLM_API_KEY', envVarHost: 'LITELLM_HOST', website: 'https://github.com/BerriAI/litellm' },
  { type: 'databricks', displayName: 'Databricks', description: 'Databricks AI models', requiresApiKey: true, defaultHost: 'https://YOUR_DATABRICKS_HOST', defaultBasePath: '/serving-endpoints', defaultModels: ['databricks-dbrx-instruct', 'databricks-mixtral-8x7b'], supportsStreaming: true, supportsToolUse: true, supportsThinking: false, envVarApiKey: 'DATABRICKS_TOKEN', envVarHost: 'DATABRICKS_HOST', website: 'https://databricks.com' },
  { type: 'perplexity', displayName: 'Perplexity', description: 'AI-powered search models', requiresApiKey: true, defaultHost: 'https://api.perplexity.ai', defaultBasePath: '', defaultModels: ['sonar-pro', 'sonar', 'pplx-70b-online'], supportsStreaming: true, supportsToolUse: false, supportsThinking: false, envVarApiKey: 'PERPLEXITY_API_KEY', envVarHost: '', website: 'https://perplexity.ai' },
  { type: 'xai', displayName: 'xAI (Grok)', description: 'Grok AI models', requiresApiKey: true, defaultHost: 'https://api.x.ai', defaultBasePath: '/v1', defaultModels: ['grok-3', 'grok-3-mini', 'grok-2'], supportsStreaming: true, supportsToolUse: true, supportsThinking: false, envVarApiKey: 'XAI_API_KEY', envVarHost: '', website: 'https://x.ai' },
  { type: 'github_copilot', displayName: 'GitHub Copilot', description: 'GitHub AI assistant', requiresApiKey: true, defaultHost: 'https://api.githubcopilot.com', defaultBasePath: '', defaultModels: ['gpt-4o', 'gpt-4-turbo', 'claude-3-5-sonnet'], supportsStreaming: true, supportsToolUse: true, supportsThinking: false, envVarApiKey: 'GITHUB_TOKEN', envVarHost: '', website: 'https://github.com/features/copilot' },
  { type: 'cerebras', displayName: 'Cerebras', description: 'Fast AI inference', requiresApiKey: true, defaultHost: 'https://api.cerebras.ai', defaultBasePath: '/v1', defaultModels: ['llama-3.3-70b', 'llama3.1-8b'], supportsStreaming: true, supportsToolUse: false, supportsThinking: false, envVarApiKey: 'CEREBRAS_API_KEY', envVarHost: '', website: 'https://cerebras.ai' },
  { type: 'novita', displayName: 'Novita AI', description: 'GPU cloud platform', requiresApiKey: true, defaultHost: 'https://api.novita.ai', defaultBasePath: '/v3', defaultModels: ['meta-llama/llama-3-70b-instruct'], supportsStreaming: true, supportsToolUse: false, supportsThinking: false, envVarApiKey: 'NOVITA_API_KEY', envVarHost: '', website: 'https://novita.ai' },
  { type: 'venice', displayName: 'Venice AI', description: 'Privacy-focused AI', requiresApiKey: true, defaultHost: 'https://api.venice.ai', defaultBasePath: '/api/v1', defaultModels: ['llama-3.1-405b', 'mixtral-8x22b'], supportsStreaming: true, supportsToolUse: false, supportsThinking: false, envVarApiKey: 'VENICE_API_KEY', envVarHost: '', website: 'https://venice.ai' },
  { type: 'opencode', displayName: 'OpenCode', description: 'Open-source coding AI', requiresApiKey: false, defaultHost: 'http://localhost:8080', defaultBasePath: '/v1', defaultModels: ['default'], supportsStreaming: true, supportsToolUse: true, supportsThinking: false, envVarApiKey: '', envVarHost: '', website: 'https://github.com/opencode-ai/opencode' },
  { type: 'custom_openai', displayName: 'Custom OpenAI', description: 'Any OpenAI-compatible API', requiresApiKey: false, defaultHost: 'http://localhost:8000', defaultBasePath: '/v1', defaultModels: [], supportsStreaming: true, supportsToolUse: true, supportsThinking: false, envVarApiKey: '', envVarHost: '', website: '' },
];

// ─── Provider Icon Map ─────────────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#d4a574',
  openai: '#10a37f',
  openrouter: '#6366f1',
  azure_openai: '#0078d4',
  gemini: '#4285f4',
  gcp_vertex: '#4285f4',
  amazon_bedrock: '#ff9900',
  groq: '#f55036',
  mistral: '#ff7000',
  ollama: '#6b7280',
  lm_studio: '#22c55e',
  litellm: '#8b5cf6',
  databricks: '#ff3621',
  perplexity: '#22c55e',
  xai: '#1da1f2',
  github_copilot: '#1f2937',
  cerebras: '#0ea5e9',
  novita: '#ec4899',
  venice: '#8b5cf6',
  opencode: '#f59e0b',
  custom_openai: '#6b7280',
};

// ─── Props ─────────────────────────────────────────────────────────────────────

interface ProviderWizardProps {
  onClose: () => void;
  onSave: () => Promise<void>;
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────

const ProviderWizard: React.FC<ProviderWizardProps> = ({ onClose, onSave, addToast }) => {
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<ProviderMetadata | null>(null);
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiHost, setApiHost] = useState('');
  const [apiBasePath, setApiBasePath] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [setAsDefault, setSetAsDefault] = useState(true);

  // Test state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ working: boolean; latency: number; models: string[] } | null>(null);
  const [saving, setSaving] = useState(false);

  // ─── Step Navigation ─────────────────────────────────────────────────────────

  const canGoNext = useMemo(() => {
    switch (step) {
      case 1: return selectedType !== null && name.trim().length > 0;
      case 2: return !selectedType?.requiresApiKey || apiKey.trim().length > 0;
      case 3: return apiHost.trim().length > 0;
      case 4: return selectedModel.trim().length > 0 || customModel.trim().length > 0;
      case 5: return true;
      default: return false;
    }
  }, [step, selectedType, name, apiKey, apiHost, selectedModel, customModel]);

  const handleNext = useCallback(() => {
    if (step === 1 && selectedType) {
      // Pre-fill defaults when moving from step 1
      if (!apiHost) setApiHost(selectedType.defaultHost);
      if (!apiBasePath) setApiBasePath(selectedType.defaultBasePath);
      if (!name) setName(selectedType.displayName);
    }
    if (step === 2 && selectedType) {
      // Auto-select first model if none chosen
      if (!selectedModel && selectedType.defaultModels.length > 0) {
        setSelectedModel(selectedType.defaultModels[0]);
      }
    }
    if (step < 5) setStep(step + 1);
  }, [step, selectedType, apiHost, apiBasePath, name, selectedModel]);

  const handleBack = useCallback(() => {
    if (step > 1) setStep(step - 1);
  }, [step]);

  // ─── Handle Provider Type Select ─────────────────────────────────────────────

  const handleSelectType = useCallback((provider: ProviderMetadata) => {
    setSelectedType(provider);
    setName(provider.displayName);
    setApiHost(provider.defaultHost);
    setApiBasePath(provider.defaultBasePath);
    setApiKey('');
    setSelectedModel(provider.defaultModels[0] || '');
    setCustomModel('');
    setTestResult(null);
  }, []);

  // ─── Test Connection ─────────────────────────────────────────────────────────

  const handleTest = useCallback(async () => {
    if (!api?.providers?.add) return;
    setTesting(true);
    setTestResult(null);
    try {
      // Save the provider first so we can test it
      const config: Record<string, unknown> = {
        name,
        type: selectedType?.type,
        apiKey: apiKey || undefined,
        apiHost: apiHost || undefined,
        apiBasePath: apiBasePath || undefined,
      };
      const result = await api.providers.add(config);
      if (api?.providers?.test && result?.id) {
        const test = await api.providers.test(result.id);
        setTestResult(test);
        if (test.working) {
          addToast({ type: 'success', title: 'Connection successful', message: `Latency: ${test.latency}ms` });
        } else {
          addToast({ type: 'error', title: 'Connection failed' });
        }
      }
    } catch (err: any) {
      setTestResult({ working: false, latency: 0, models: [] });
      addToast({ type: 'error', title: 'Test failed', message: err.message });
    } finally {
      setTesting(false);
    }
  }, [name, selectedType, apiKey, apiHost, apiBasePath, addToast]);

  // ─── Save & Close ────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!api?.providers?.add) return;
    setSaving(true);
    try {
      const model = customModel || selectedModel;
      const config: Record<string, unknown> = {
        name,
        type: selectedType?.type,
        apiKey: apiKey || undefined,
        apiHost: apiHost || undefined,
        apiBasePath: apiBasePath || undefined,
        models: [model],
      };
      await api.providers.add(config);

      if (setAsDefault && model && api?.providers?.setDefault) {
        // We don't have the ID yet, but the last added provider should work
        try {
          const providers = await api.providers.list();
          const added = providers.find((p: any) => p.name === name);
          if (added) {
            await api.providers.setDefault(added.id, model);
          }
        } catch {
          // Best effort
        }
      }

      addToast({ type: 'success', title: 'Provider added successfully' });
      await onSave();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to add provider', message: err.message });
    } finally {
      setSaving(false);
    }
  }, [name, selectedType, apiKey, apiHost, apiBasePath, selectedModel, customModel, setAsDefault, addToast, onSave]);

  // ─── Progress Indicator ──────────────────────────────────────────────────────

  const renderProgress = () => (
    <div className="flex items-center gap-1 px-6 py-4">
      {STEPS.map((s, index) => (
        <React.Fragment key={s.id}>
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
              style={{
                background: step > s.id
                  ? 'var(--color-success)'
                  : step === s.id
                  ? 'var(--color-accent)'
                  : 'var(--color-bg-tertiary)',
                color: step >= s.id ? 'white' : 'var(--color-text-muted)',
              }}
            >
              {step > s.id ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                s.id
              )}
            </div>
            <span
              className="text-xs font-medium hidden sm:inline"
              style={{
                color: step >= s.id ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              }}
            >
              {s.label}
            </span>
          </div>
          {index < STEPS.length - 1 && (
            <div
              className="flex-1 h-0.5 rounded-full mx-1 transition-all"
              style={{
                background: step > s.id ? 'var(--color-success)' : 'var(--color-bg-tertiary)',
              }}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  // ─── Step Content ────────────────────────────────────────────────────────────

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
                Choose Provider Type
              </h3>
              <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                Select from {ALL_PROVIDERS.length} supported AI providers
              </p>
            </div>

            {/* Provider Name */}
            <div>
              <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>
                Provider Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Provider"
                className="w-full px-3 py-2.5 rounded-lg border text-sm"
                style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
              />
            </div>

            {/* Provider Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-64 overflow-y-auto p-1">
              {ALL_PROVIDERS.map((provider) => {
                const color = PROVIDER_COLORS[provider.type] || 'var(--color-accent)';
                const isSelected = selectedType?.type === provider.type;
                return (
                  <button
                    key={provider.type}
                    onClick={() => handleSelectType(provider)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all"
                    style={{
                      background: isSelected ? `${color}15` : 'var(--color-bg-secondary)',
                      borderColor: isSelected ? color : 'var(--color-border-primary)',
                      borderWidth: isSelected ? '2px' : '1px',
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold"
                      style={{ background: `${color}20`, color }}
                    >
                      {provider.displayName.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-xs font-medium" style={{ color: isSelected ? color : 'var(--color-text-primary)' }}>
                      {provider.displayName}
                    </span>
                    <span className="text-xs truncate w-full" style={{ color: 'var(--color-text-muted)' }}>
                      {provider.description}
                    </span>
                    {provider.requiresApiKey ? (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}>Key required</span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--color-success)' }}>Free / Local</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
                Enter Credentials
              </h3>
              <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                {selectedType?.requiresApiKey
                  ? `Enter your ${selectedType.displayName} API key`
                  : `${selectedType?.displayName} does not require an API key`}
              </p>
            </div>

            {selectedType?.requiresApiKey ? (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                    API Key
                  </label>
                  <div className="flex items-center gap-2">
                    {selectedType.envVarApiKey && (
                      <span className="text-xs px-2 py-0.5 rounded font-mono" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}>
                        {selectedType.envVarApiKey}
                      </span>
                    )}
                    <button
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="text-xs transition-colors"
                      style={{ color: 'var(--color-accent)' }}
                    >
                      {showApiKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-3 py-2.5 rounded-lg border text-sm pr-10"
                    style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {showApiKey ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                  Your API key is stored locally and encrypted. It is never sent to our servers.
                </p>
              </div>
            ) : (
              <div
                className="p-4 rounded-lg flex items-center gap-3"
                style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.2)', borderWidth: '1px' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--color-success)' }}>No API key required</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    This provider runs locally or doesn't require authentication
                  </p>
                </div>
              </div>
            )}

            {selectedType?.website && (
              <a
                href={selectedType.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs flex items-center gap-1 transition-colors"
                style={{ color: 'var(--color-accent)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                Get an API key from {selectedType.displayName}
              </a>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
                Configure Host URL
              </h3>
              <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                Set the API server endpoint for {selectedType?.displayName}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>
                API Host
              </label>
              <input
                type="text"
                value={apiHost}
                onChange={(e) => setApiHost(e.target.value)}
                placeholder={selectedType?.defaultHost || 'https://api.example.com'}
                className="w-full px-3 py-2.5 rounded-lg border text-sm font-mono"
                style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
              />
              {selectedType?.envVarHost && (
                <p className="text-xs mt-1.5 font-mono" style={{ color: 'var(--color-text-muted)' }}>
                  Env var: {selectedType.envVarHost}
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>
                API Base Path
              </label>
              <input
                type="text"
                value={apiBasePath}
                onChange={(e) => setApiBasePath(e.target.value)}
                placeholder={selectedType?.defaultBasePath || '/v1'}
                className="w-full px-3 py-2.5 rounded-lg border text-sm font-mono"
                style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
              />
            </div>

            {/* Connection info */}
            <div
              className="p-3 rounded-lg"
              style={{ background: 'var(--color-bg-tertiary)' }}
            >
              <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-tertiary)' }}>FULL ENDPOINT</div>
              <code className="text-xs font-mono" style={{ color: 'var(--color-accent)' }}>
                {apiHost}{apiBasePath}
              </code>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
                Select Default Model
              </h3>
              <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                Choose the default model for {selectedType?.displayName} sessions
              </p>
            </div>

            {selectedType && selectedType.defaultModels.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  Available Models
                </label>
                <div className="grid gap-2">
                  {selectedType.defaultModels.map((model) => (
                    <button
                      key={model}
                      onClick={() => { setSelectedModel(model); setCustomModel(''); }}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all"
                      style={{
                        background: selectedModel === model ? 'var(--color-accent-soft)' : 'var(--color-bg-secondary)',
                        borderColor: selectedModel === model ? 'var(--color-accent)' : 'var(--color-border-primary)',
                      }}
                    >
                      <div
                        className="w-4 h-4 rounded-full border-2 flex items-center justify-center"
                        style={{ borderColor: selectedModel === model ? 'var(--color-accent)' : 'var(--color-border-primary)' }}
                      >
                        {selectedModel === model && (
                          <div className="w-2 h-2 rounded-full" style={{ background: 'var(--color-accent)' }} />
                        )}
                      </div>
                      <span className="text-sm font-mono" style={{ color: selectedModel === model ? 'var(--color-accent)' : 'var(--color-text-primary)' }}>
                        {model}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>
                Custom Model Name
              </label>
              <input
                type="text"
                value={customModel}
                onChange={(e) => { setCustomModel(e.target.value); if (e.target.value) setSelectedModel(''); }}
                placeholder="Enter custom model name..."
                className="w-full px-3 py-2.5 rounded-lg border text-sm font-mono"
                style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
              />
              <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                Enter a model name not listed above (e.g., a fine-tuned model)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="set-default"
                checked={setAsDefault}
                onChange={(e) => setSetAsDefault(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="set-default" className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                Set as default provider and model
              </label>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
                Test Connection
              </h3>
              <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                Verify your provider configuration before saving
              </p>
            </div>

            {/* Summary */}
            <div
              className="p-4 rounded-lg space-y-2"
              style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-primary)' }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold"
                  style={{ background: `${PROVIDER_COLORS[selectedType?.type || ''] || 'var(--color-accent)'}20`, color: PROVIDER_COLORS[selectedType?.type || ''] || 'var(--color-accent)' }}
                >
                  {selectedType?.displayName?.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{name}</div>
                  <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{selectedType?.type}</div>
                </div>
              </div>
              {[
                { label: 'Host', value: apiHost + apiBasePath },
                { label: 'API Key', value: apiKey ? `${apiKey.slice(0, 8)}${'*'.repeat(8)}` : 'Not required' },
                { label: 'Model', value: customModel || selectedModel },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between text-sm">
                  <span style={{ color: 'var(--color-text-tertiary)' }}>{item.label}</span>
                  <span className="font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>{item.value}</span>
                </div>
              ))}
            </div>

            {/* Test Button & Result */}
            <button
              onClick={handleTest}
              disabled={testing}
              className="w-full py-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-primary)', color: 'var(--color-text-primary)' }}
            >
              {testing ? (
                <>
                  <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin-slow" style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
                  Testing connection...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  Test Connection
                </>
              )}
            </button>

            {testResult && (
              <div
                className="p-4 rounded-lg animate-fade-in"
                style={{
                  background: testResult.working ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                  borderColor: testResult.working ? 'var(--color-success)' : 'var(--color-error)',
                  borderWidth: '1px',
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  {testResult.working ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                  )}
                  <span className="font-medium text-sm" style={{ color: testResult.working ? 'var(--color-success)' : 'var(--color-error)' }}>
                    {testResult.working ? 'Connection Successful!' : 'Connection Failed'}
                  </span>
                </div>
                {testResult.working && (
                  <div className="text-xs space-y-1" style={{ color: 'var(--color-text-tertiary)' }}>
                    <div>Latency: <span style={{ color: 'var(--color-text-primary)' }}>{testResult.latency}ms</span></div>
                    <div>Available models: <span style={{ color: 'var(--color-text-primary)' }}>{testResult.models.length}</span></div>
                    {testResult.models.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {testResult.models.slice(0, 5).map((m) => (
                          <span key={m} className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--color-bg-tertiary)' }}>{m}</span>
                        ))}
                        {testResult.models.length > 5 && (
                          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>+{testResult.models.length - 5} more</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="animate-fade-in rounded-xl border shadow-2xl w-full max-w-2xl"
        style={{ background: 'var(--color-bg-elevated)', borderColor: 'var(--color-border-primary)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--color-border-secondary)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-accent-soft)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                <line x1="6" y1="6" x2="6.01" y2="6" />
                <line x1="6" y1="18" x2="6.01" y2="18" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>Add AI Provider</h2>
              <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Step {step} of 5</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Progress */}
        {renderProgress()}

        {/* Step Content */}
        <div className="px-6 py-4 max-h-[55vh] overflow-y-auto">
          {renderStepContent()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t" style={{ borderColor: 'var(--color-border-secondary)' }}>
          <button
            onClick={handleBack}
            disabled={step === 1}
            className="px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-30"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            ← Back
          </button>
          <div className="flex gap-2">
            {step < 5 ? (
              <button
                onClick={handleNext}
                disabled={!canGoNext}
                className="px-6 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-all"
                style={{ background: 'var(--color-accent)', color: 'white' }}
              >
                Next →
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-all flex items-center gap-2"
                style={{ background: 'var(--color-success)', color: 'white' }}
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin-slow" style={{ borderColor: 'white', borderTopColor: 'transparent' }} />
                    Saving...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Save Provider
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProviderWizard;
