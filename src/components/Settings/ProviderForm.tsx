/**
 * OpenAgent-Desktop - Provider Form Component
 *
 * Dynamic form based on provider type, with test connection,
 * model selector, API key show/hide, and import from env vars.
 */

import React, { useState, useMemo } from 'react';
import { ProviderInfo, ProviderType, Toast } from '../../types';

const api = (window as any).openagent;

interface ProviderFormProps {
  provider: ProviderInfo | null;
  onClose: () => void;
  onSave: () => Promise<void>;
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

const PROVIDER_TYPES: { value: ProviderType | string; label: string; icon: string }[] = [
  { value: 'openai', label: 'OpenAI', icon: 'OA' },
  { value: 'anthropic', label: 'Anthropic', icon: 'AN' },
  { value: 'openrouter', label: 'OpenRouter', icon: 'OR' },
  { value: 'gemini', label: 'Google Gemini', icon: 'GG' },
  { value: 'azure_openai', label: 'Azure OpenAI', icon: 'AZ' },
  { value: 'groq', label: 'Groq', icon: 'GQ' },
  { value: 'mistral', label: 'Mistral', icon: 'MI' },
  { value: 'ollama', label: 'Ollama', icon: 'OL' },
  { value: 'xai', label: 'xAI (Grok)', icon: 'XA' },
  { value: 'perplexity', label: 'Perplexity', icon: 'PP' },
  { value: 'cerebras', label: 'Cerebras', icon: 'CB' },
  { value: 'github_copilot', label: 'GitHub Copilot', icon: 'GH' },
  { value: 'opencode', label: 'OpenCode', icon: 'OC' },
  { value: 'custom_openai', label: 'Custom OpenAI', icon: 'CU' },
];

interface ProviderFieldConfig {
  key: string;
  label: string;
  type: 'text' | 'password' | 'select';
  placeholder?: string;
  required?: boolean;
  options?: string[];
  showForTypes?: string[];
}

const FIELD_CONFIGS: ProviderFieldConfig[] = [
  { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-...', required: true, showForTypes: ['openai', 'anthropic', 'openrouter', 'gemini', 'groq', 'mistral', 'xai', 'perplexity', 'cerebras', 'github_copilot'] },
  { key: 'apiHost', label: 'API Host', type: 'text', placeholder: 'https://api.openai.com', showForTypes: ['openai', 'anthropic', 'custom_openai', 'ollama', 'opencode'] },
  { key: 'apiBasePath', label: 'API Base Path', type: 'text', placeholder: '/v1', showForTypes: ['custom_openai'] },
  { key: 'organization', label: 'Organization', type: 'text', placeholder: 'org-...', showForTypes: ['openai'] },
  { key: 'region', label: 'Region', type: 'select', options: ['eastus', 'westus', 'westeurope', 'southeastasia'], showForTypes: ['azure_openai'] },
  { key: 'deploymentName', label: 'Deployment Name', type: 'text', placeholder: 'my-deployment', showForTypes: ['azure_openai'] },
  { key: 'projectId', label: 'Project ID', type: 'text', placeholder: 'proj-...', showForTypes: ['gemini', 'gcp_vertex'] },
  { key: 'customHeaders', label: 'Custom Headers (JSON)', type: 'text', placeholder: '{"X-Custom": "value"}', showForTypes: ['custom_openai'] },
];

const ProviderForm: React.FC<ProviderFormProps> = ({ provider, onClose, onSave, addToast }) => {
  const isEditing = !!provider;

  const [formState, setFormState] = useState({
    name: provider?.name || '',
    type: provider?.type || 'openai',
    apiKey: '',
    apiHost: '',
    apiBasePath: '',
    organization: '',
    region: '',
    deploymentName: '',
    projectId: '',
    customHeaders: '',
    setAsDefault: !isEditing,
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ working: boolean; latency: number; models: string[] } | null>(null);
  const [saving, setSaving] = useState(false);

  const visibleFields = useMemo(
    () => FIELD_CONFIGS.filter((f) => !f.showForTypes || f.showForTypes.includes(formState.type)),
    [formState.type]
  );

  const selectedProviderType = useMemo(
    () => PROVIDER_TYPES.find((p) => p.value === formState.type),
    [formState.type]
  );

  const handleChange = (key: string, value: string | boolean) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const handleImportEnv = () => {
    const providerType = PROVIDER_TYPES.find((p) => p.value === formState.type);
    if (!providerType) return;

    const envVarMap: Record<string, string> = {
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      gemini: 'GOOGLE_API_KEY',
      groq: 'GROQ_API_KEY',
      mistral: 'MISTRAL_API_KEY',
      xai: 'XAI_API_KEY',
      perplexity: 'PERPLEXITY_API_KEY',
    };

    const envVar = envVarMap[formState.type];
    if (envVar) {
      addToast({
        type: 'info',
        title: `Looking for ${envVar}`,
        message: 'Check your environment variables for the API key',
      });
    } else {
      addToast({ type: 'warning', title: 'No known environment variable for this provider' });
    }
  };

  const handleTest = async () => {
    if (!api?.providers?.test) return;
    setTesting(true);
    setTestResult(null);
    try {
      // First save the provider if it's new
      if (!isEditing) {
        await handleSave(true);
      }
      const result = await api.providers.test(provider?.id || 'new');
      setTestResult(result);
      if (result.working) {
        addToast({ type: 'success', title: 'Connection successful', message: `Latency: ${result.latency}ms, Models: ${result.models.length}` });
      } else {
        addToast({ type: 'error', title: 'Connection failed' });
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Test failed', message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (silent = false) => {
    if (!api?.providers?.add) return;
    if (!formState.name.trim()) {
      addToast({ type: 'error', title: 'Provider name is required' });
      return;
    }

    setSaving(true);
    try {
      const config: Record<string, unknown> = {
        name: formState.name,
        type: formState.type,
        apiKey: formState.apiKey || undefined,
        apiHost: formState.apiHost || undefined,
        apiBasePath: formState.apiBasePath || undefined,
        organization: formState.organization || undefined,
        region: formState.region || undefined,
        deploymentName: formState.deploymentName || undefined,
        projectId: formState.projectId || undefined,
      };

      if (formState.customHeaders) {
        try {
          config.customHeaders = JSON.parse(formState.customHeaders);
        } catch {
          // Ignore invalid JSON
        }
      }

      await api.providers.add(config);
      if (!silent) {
        addToast({ type: 'success', title: 'Provider saved' });
        await onSave();
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to save provider', message: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="animate-fade-in rounded-xl border shadow-2xl w-full max-w-xl"
        style={{ background: 'var(--color-bg-elevated)', borderColor: 'var(--color-border-primary)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--color-border-secondary)' }}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {isEditing ? 'Edit Provider' : 'Add Provider'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors"
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

        {/* Form */}
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Provider Type Selector */}
          <div>
            <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--color-text-primary)' }}>Provider Type</label>
            <div className="grid grid-cols-4 gap-2">
              {PROVIDER_TYPES.map((pt) => (
                <button
                  key={pt.value}
                  onClick={() => handleChange('type', pt.value)}
                  className="flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-colors"
                  style={{
                    background: formState.type === pt.value ? 'var(--color-accent-soft)' : 'var(--color-bg-tertiary)',
                    borderColor: formState.type === pt.value ? 'var(--color-accent)' : 'var(--color-border-primary)',
                    color: formState.type === pt.value ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  }}
                >
                  <span className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
                    {pt.icon}
                  </span>
                  {pt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="text-sm font-medium mb-1 block" style={{ color: 'var(--color-text-primary)' }}>Name</label>
            <input
              type="text"
              value={formState.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder={selectedProviderType?.label || 'Provider name'}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
            />
          </div>

          {/* Dynamic Fields */}
          {visibleFields.map((field) => (
            <div key={field.key}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{field.label}</label>
                {field.key === 'apiKey' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleImportEnv}
                      className="text-xs transition-colors"
                      style={{ color: 'var(--color-accent)' }}
                    >
                      Import from env
                    </button>
                    <button
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="text-xs transition-colors"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {showApiKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                )}
              </div>
              {field.type === 'select' ? (
                <select
                  value={(formState as any)[field.key] || ''}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
                >
                  <option value="">Select...</option>
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type === 'password' && !showApiKey ? 'password' : 'text'}
                  value={(formState as any)[field.key] || ''}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
                />
              )}
            </div>
          ))}

          {/* Set as default */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formState.setAsDefault}
              onChange={(e) => handleChange('setAsDefault', e.target.checked)}
              className="rounded"
            />
            <label className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Set as default provider</label>
          </div>

          {/* Test Result */}
          {testResult && (
            <div
              className="p-3 rounded-lg border"
              style={{
                background: testResult.working ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                borderColor: testResult.working ? 'var(--color-success)' : 'var(--color-error)',
              }}
            >
              <div className="text-sm font-medium" style={{ color: testResult.working ? 'var(--color-success)' : 'var(--color-error)' }}>
                {testResult.working ? 'Connection Successful' : 'Connection Failed'}
              </div>
              {testResult.working && (
                <div className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                  Latency: {testResult.latency}ms | Models: {testResult.models.join(', ')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t" style={{ borderColor: 'var(--color-border-secondary)' }}>
          <button
            onClick={handleTest}
            disabled={testing || saving}
            className="px-4 py-2 rounded-lg text-sm border transition-colors disabled:opacity-50"
            style={{ borderColor: 'var(--color-border-primary)', color: 'var(--color-text-secondary)' }}
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm transition-colors"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Cancel
            </button>
            <button
              onClick={() => handleSave()}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ background: 'var(--color-accent)', color: 'white' }}
            >
              {saving ? 'Saving...' : 'Save Provider'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProviderForm;
