/**
 * OpenAgent-Desktop Aether - Provider Presets View
 * 
 * Shows pre-configured custom provider endpoints.
 */

import React, { useState, useEffect } from 'react';

interface ProviderPresetsViewProps {
  onSelectPreset: (preset: any) => void;
}

export const ProviderPresetsView: React.FC<ProviderPresetsViewProps> = ({ onSelectPreset }) => {
  const [presets, setPresets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPresets();
  }, []);

  const loadPresets = async () => {
    try {
      // This will be connected to IPC once the main process is updated
      // For now, use static data
      setPresets([
        { name: 'DeepSeek', protocol: 'openai', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'] },
        { name: 'Kimi (Moonshot)', protocol: 'openai', baseUrl: 'https://api.moonshot.cn/v1', models: ['kimi-k2-thinking'] },
        { name: 'GLM (Zhipu)', protocol: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-5'] },
        { name: 'MiniMax', protocol: 'openai', baseUrl: 'https://api.minimax.chat/v1', models: ['MiniMax-M2.5'] },
        { name: 'xAI (Grok)', protocol: 'openai', baseUrl: 'https://api.x.ai/v1', models: ['grok-code-fast-1'] },
        { name: 'Mistral', protocol: 'openai', baseUrl: 'https://api.mistral.ai/v1', models: ['mistral-large-latest'] },
        { name: 'Cohere', protocol: 'openai', baseUrl: 'https://api.cohere.com/v2', models: ['command-r-plus'] },
        { name: 'Perplexity', protocol: 'openai', baseUrl: 'https://api.perplexity.ai', models: ['sonar-pro'] },
      ]);
    } catch {
      setPresets([]);
    }
    setLoading(false);
  };

  if (loading) return <div className="p-4 text-gray-400">Loading presets...</div>;

  return (
    <div className="provider-presets space-y-3">
      <h3 className="text-lg font-semibold">Quick Setup — Popular Providers</h3>
      <p className="text-sm text-gray-400">Click a provider to auto-fill its configuration. You'll just need to add your API key.</p>
      <div className="grid grid-cols-2 gap-3">
        {presets.map((preset) => (
          <button
            key={preset.name}
            onClick={() => onSelectPreset(preset)}
            className="p-4 border rounded-lg hover:border-blue-500 hover:bg-gray-800/50 text-left transition-colors"
          >
            <div className="font-medium">{preset.name}</div>
            <div className="text-xs text-gray-400 mt-1">{preset.protocol.toUpperCase()} API format</div>
            <div className="text-xs text-gray-500 mt-1">{preset.models.length} model{preset.models.length !== 1 ? 's' : ''}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ProviderPresetsView;
