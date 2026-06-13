/**
 * OpenAgent-Desktop - Config Set Manager
 * 
 * Manage named API configurations. Create, edit, switch, delete.
 * Like OpenCowork's config set manager.
 */

import React, { useState } from 'react';
import { ConfigSetInfo } from '../Chat/ConfigSetSelector';

interface ConfigSetManagerProps {
  configSets: ConfigSetInfo[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string, providerType: string, model: string) => void;
  onDelete: (id: string) => void;
}

const ConfigSetManager: React.FC<ConfigSetManagerProps> = ({
  configSets,
  activeId,
  onSelect,
  onCreate,
  onDelete,
}) => {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newProvider, setNewProvider] = useState('openai');
  const [newModel, setNewModel] = useState('gpt-4');

  const handleCreate = () => {
    if (!newName.trim()) return;
    onCreate(newName.trim(), newProvider, newModel);
    setNewName('');
    setShowCreate(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>API Configurations</h3>
        <button
          onClick={() => setShowCreate(true)}
          className="px-2 py-1 rounded text-xs font-medium"
          style={{ background: 'var(--color-accent)', color: 'white' }}
        >
          + New Config
        </button>
      </div>

      <div className="space-y-2">
        {configSets.map((cs) => (
          <div
            key={cs.id}
            className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
              activeId === cs.id ? 'ring-1' : ''
            }`}
            style={{
              borderColor: activeId === cs.id ? 'var(--color-accent)' : 'var(--color-border-primary)',
              background: activeId === cs.id ? 'var(--color-accent-soft)' : 'var(--color-bg-secondary)',
            }}
            onClick={() => onSelect(cs.id)}
          >
            <div>
              <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {cs.name}
                {cs.isDefault && (
                  <span className="ml-2 text-[10px] px-1 rounded" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>default</span>
                )}
              </div>
              <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {cs.providerType} / {cs.model}
              </div>
            </div>
            {!cs.isDefault && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(cs.id); }}
                className="text-xs px-2 py-1 rounded transition-colors"
                style={{ color: '#ef4444' }}
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </div>

      {showCreate && (
        <div className="p-3 rounded-lg border" style={{ borderColor: 'var(--color-border-primary)', background: 'var(--color-bg-tertiary)' }}>
          <div className="space-y-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Config name"
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
            />
            <select
              value={newProvider}
              onChange={(e) => setNewProvider(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="gemini">Google Gemini</option>
              <option value="ollama">Ollama</option>
              <option value="openrouter">OpenRouter</option>
              <option value="groq">Groq</option>
              <option value="custom_openai">Custom OpenAI</option>
            </select>
            <input
              type="text"
              value={newModel}
              onChange={(e) => setNewModel(e.target.value)}
              placeholder="Model name"
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                className="flex-1 px-3 py-2 rounded-lg text-xs font-medium"
                style={{ background: 'var(--color-accent)', color: 'white' }}
              >
                Create
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-3 py-2 rounded-lg text-xs"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigSetManager;
