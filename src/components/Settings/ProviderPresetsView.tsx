/**
 * OpenAgent-Desktop Aether - Provider Presets View
 *
 * Shows pre-configured custom provider endpoints loaded from the main process
 * via IPC (custom-provider:presets). Falls back to a minimal static list if
 * IPC is unavailable.
 */

import React, { useState, useEffect } from 'react';

const api = (window as any).openagent;

interface ProviderPreset {
  name: string;
  protocol: string;
  baseUrl: string;
  models: Array<{ id: string; name: string; contextWindow?: number; supportsStreaming?: boolean; supportsToolUse?: boolean; supportsThinking?: boolean }>;
}

interface ProviderPresetsViewProps {
  onSelectPreset: (preset: ProviderPreset) => void;
}

const FALLBACK_PRESETS: ProviderPreset[] = [
  { name: 'DeepSeek', protocol: 'openai', baseUrl: 'https://api.deepseek.com/v1', models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat' }, { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' }] },
  { name: 'Kimi (Moonshot)', protocol: 'openai', baseUrl: 'https://api.moonshot.cn/v1', models: [{ id: 'kimi-k2-thinking', name: 'Kimi K2 Thinking' }] },
  { name: 'GLM (Zhipu)', protocol: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: [{ id: 'glm-5', name: 'GLM-5' }] },
  { name: 'MiniMax', protocol: 'openai', baseUrl: 'https://api.minimax.chat/v1', models: [{ id: 'MiniMax-M2.5', name: 'MiniMax M2.5' }] },
  { name: 'xAI (Grok)', protocol: 'openai', baseUrl: 'https://api.x.ai/v1', models: [{ id: 'grok-code-fast-1', name: 'Grok Code Fast' }] },
  { name: 'Mistral', protocol: 'openai', baseUrl: 'https://api.mistral.ai/v1', models: [{ id: 'mistral-large-latest', name: 'Mistral Large' }] },
  { name: 'Cohere', protocol: 'openai', baseUrl: 'https://api.cohere.com/v2', models: [{ id: 'command-r-plus', name: 'Command R+' }] },
  { name: 'Perplexity', protocol: 'openai', baseUrl: 'https://api.perplexity.ai', models: [{ id: 'sonar-pro', name: 'Sonar Pro' }] },
];

export const ProviderPresetsView: React.FC<ProviderPresetsViewProps> = ({ onSelectPreset }) => {
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'ipc' | 'fallback'>('fallback');

  useEffect(() => {
    loadPresets();
  }, []);

  const loadPresets = async () => {
    try {
      // Try loading from main process via IPC (single source of truth)
      if (api?.customProviders?.presets) {
        const ipcPresets = await api.customProviders.presets();
        if (Array.isArray(ipcPresets) && ipcPresets.length > 0) {
          setPresets(ipcPresets);
          setSource('ipc');
          setLoading(false);
          return;
        }
      }
    } catch {
      // IPC failed — fall through to fallback
    }

    // Fallback: use static list if IPC is unavailable (e.g. dev mode without Electron)
    setPresets(FALLBACK_PRESETS);
    setSource('fallback');
    setLoading(false);
  };

  if (loading) return <div className="p-4" style={{ color: 'var(--color-text-tertiary)' }}>Loading presets...</div>;

  return (
    <div className="provider-presets space-y-3">
      <h3 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>Quick Setup — Popular Providers</h3>
      <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
        Click a provider to auto-fill its configuration. You'll just need to add your API key.
        {source === 'ipc' && <span className="ml-1 opacity-60">(Live from backend)</span>}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {presets.map((preset) => (
          <button
            key={preset.name}
            onClick={() => onSelectPreset(preset)}
            className="p-4 border rounded-lg text-left transition-colors"
            style={{ borderColor: 'var(--color-border-primary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-primary)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <div className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{preset.name}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>{(preset.protocol || 'openai').toUpperCase()} API format</div>
            <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{preset.models?.length || 0} model{(preset.models?.length || 0) !== 1 ? 's' : ''}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ProviderPresetsView;
