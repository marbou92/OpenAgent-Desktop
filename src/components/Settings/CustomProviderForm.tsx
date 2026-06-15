/**
 * OpenAgent-Desktop Aether - Custom Provider Form
 * 
 * Form for adding/editing custom protocol providers.
 * Supports OpenAI, Anthropic, and Gemini API formats.
 */

import React, { useState, useEffect } from 'react';

interface CustomProviderFormProps {
  onSave: (config: any) => void;
  onCancel: () => void;
  initialConfig?: any;
  presets?: any[];
}

const PROTOCOL_OPTIONS = [
  { value: 'openai', label: 'OpenAI Chat API', description: 'Compatible with DeepSeek, Kimi, GLM, Mistral, etc.' },
  { value: 'anthropic', label: 'Anthropic Messages API', description: 'Anthropic Claude API format' },
  { value: 'gemini', label: 'Gemini Generate Content API', description: 'Google Gemini API format' },
];

export const CustomProviderForm: React.FC<CustomProviderFormProps> = ({ onSave, onCancel, initialConfig, presets = [] }) => {
  const [name, setName] = useState(initialConfig?.name || '');
  const [baseUrl, setBaseUrl] = useState(initialConfig?.baseUrl || '');
  const [apiKey, setApiKey] = useState(initialConfig?.apiKey || '');
  const [protocol, setProtocol] = useState(initialConfig?.protocol || 'openai');
  const [modelId, setModelId] = useState(initialConfig?.models?.[0]?.id || '');
  const [modelName, setModelName] = useState(initialConfig?.models?.[0]?.name || '');
  const [usePreset, setUsePreset] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ working: boolean; latency: number } | null>(null);

  useEffect(() => {
    if (usePreset && selectedPreset) {
      const preset = presets.find((p: any) => p.name === selectedPreset);
      if (preset) {
        setName(preset.name);
        setBaseUrl(preset.baseUrl);
        setProtocol(preset.protocol);
        if (preset.models?.[0]) {
          setModelId(preset.models[0].id);
          setModelName(preset.models[0].name);
        }
      }
    }
  }, [usePreset, selectedPreset, presets]);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await (window as any).openagent?.providers?.test(`custom:${name.toLowerCase().replace(/\s+/g, '-')}`);
      setTestResult(result);
    } catch (err) {
      setTestResult({ working: false, latency: 0 });
    }
    setTesting(false);
  };

  const handleSave = () => {
    onSave({
      name,
      type: 'custom',
      protocol,
      baseUrl,
      apiKey,
      models: modelId ? [{ id: modelId, name: modelName || modelId, supportsStreaming: true, supportsToolUse: protocol === 'openai' }] : [],
    });
  };

  return (
    <div className="custom-provider-form space-y-4">
      <h3 className="text-lg font-semibold">Add Custom Provider</h3>
      
      {/* Preset selector */}
      {presets.length > 0 && (
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={usePreset} onChange={(e) => setUsePreset(e.target.checked)} />
            <span>Use preset</span>
          </label>
          {usePreset && (
            <select value={selectedPreset} onChange={(e) => setSelectedPreset(e.target.value)} className="w-full p-2 border rounded bg-gray-800 text-white">
              <option value="">Select a preset...</option>
              {presets.map((p: any) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Manual configuration */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Provider Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., DeepSeek" className="w-full p-2 border rounded bg-gray-800 text-white" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">API Protocol</label>
          <select value={protocol} onChange={(e) => setProtocol(e.target.value)} className="w-full p-2 border rounded bg-gray-800 text-white">
            {PROTOCOL_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            {PROTOCOL_OPTIONS.find(o => o.value === protocol)?.description}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Base URL</label>
          <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" className="w-full p-2 border rounded bg-gray-800 text-white" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">API Key</label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." className="w-full p-2 border rounded bg-gray-800 text-white" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Model ID</label>
            <input type="text" value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="model-name" className="w-full p-2 border rounded bg-gray-800 text-white" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Model Display Name</label>
            <input type="text" value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="Model Name" className="w-full p-2 border rounded bg-gray-800 text-white" />
          </div>
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div className={`p-3 rounded ${testResult.working ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
          {testResult.working ? `Connected! Latency: ${testResult.latency}ms` : 'Connection failed. Check your settings.'}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        <button onClick={onCancel} className="px-4 py-2 border rounded hover:bg-gray-700">Cancel</button>
        <button onClick={handleTest} disabled={testing || !apiKey || !baseUrl} className="px-4 py-2 border rounded hover:bg-gray-700 disabled:opacity-50">
          {testing ? 'Testing...' : 'Test Connection'}
        </button>
        <button onClick={handleSave} disabled={!name || !baseUrl || !apiKey} className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">
          Save Provider
        </button>
      </div>
    </div>
  );
};

export default CustomProviderForm;
