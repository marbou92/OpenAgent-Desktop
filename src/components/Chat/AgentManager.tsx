/**
 * OpenAgent-Desktop - Agent Manager Component
 *
 * UI for managing custom agents and browsing presets.
 * Features:
 * - List of all agents (built-in + custom)
 * - Create custom agent form: name, mode selector, prompt, permissions editor, model selector
 * - Edit/delete custom agents
 * - Import/export agent definitions as JSON
 * - Agent presets gallery
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AgentMode, AgentDefinition, Toast } from '../../types';

const api = (window as any).openagent;

// ─── Props ──────────────────────────────────────────────────────────────────────

interface AgentManagerProps {
  onAgentSelect?: (agent: AgentDefinition) => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  onClose?: () => void;
}

// ─── Preset Definition (matches backend AgentPreset) ────────────────────────────

interface AgentPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  mode: AgentMode;
  prompt: string;
  permissions: Record<string, 'allow' | 'ask' | 'deny'>;
  model?: string;
  tags: string[];
  isBuiltIn?: boolean;
}

// ─── Mode Config ────────────────────────────────────────────────────────────────

const MODE_CONFIG: Record<AgentMode, { label: string; color: string; icon: string; description: string }> = {
  build: { label: 'Build', color: '#22c55e', icon: '⚡', description: 'Full autonomy — all tools enabled' },
  plan: { label: 'Plan', color: '#3b82f6', icon: '📋', description: 'Read-only analysis — no changes' },
  chat: { label: 'Chat', color: '#8b5cf6', icon: '💬', description: 'Pure conversation — no tools' },
  smart: { label: 'Smart', color: '#f59e0b', icon: '🛡️', description: 'Safe ops auto, sensitive needs confirm' },
};

const DEFAULT_PERMISSIONS: Record<AgentMode, Record<string, 'allow' | 'ask' | 'deny'>> = {
  build: { '*': 'allow' },
  plan: { '*': 'deny', 'read': 'allow', 'glob': 'allow', 'grep': 'allow' },
  chat: { '*': 'deny' },
  smart: { '*': 'ask', 'read': 'allow', 'glob': 'allow', 'grep': 'allow' },
};

const TOOL_NAMES = [
  'read', 'write', 'edit', 'bash', 'glob', 'grep',
  'bash:git status', 'bash:git diff', 'bash:git log',
  'bash:ls', 'bash:cat', 'bash:node', 'bash:npm',
  'bash:rm', 'bash:sudo',
];

// ─── Tab Types ──────────────────────────────────────────────────────────────────

type TabId = 'agents' | 'presets' | 'create';

// ─── Component ──────────────────────────────────────────────────────────────────

const AgentManager: React.FC<AgentManagerProps> = ({ onAgentSelect, addToast, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabId>('agents');
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [presets, setPresets] = useState<AgentPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAgent, setEditingAgent] = useState<AgentDefinition | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formMode, setFormMode] = useState<AgentMode>('build');
  const [formDescription, setFormDescription] = useState('');
  const [formPrompt, setFormPrompt] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formPermissions, setFormPermissions] = useState<Record<string, 'allow' | 'ask' | 'deny'>>(DEFAULT_PERMISSIONS.build);
  const [formMaxSteps, setFormMaxSteps] = useState(100);
  const [formTemperature, setFormTemperature] = useState(0.7);
  const [saving, setSaving] = useState(false);

  // Import/Export state
  const [importJson, setImportJson] = useState('');
  const [showImport, setShowImport] = useState(false);

  // ── Load agents and presets ──────────────────────────────────────────────

  const loadAgents = useCallback(async () => {
    try {
      const list = await api.agents.list();
      setAgents(list || []);
    } catch (err: any) {
      addToast({ title: 'Failed to load agents', message: err.message, type: 'error' });
    }
  }, [addToast]);

  const loadPresets = useCallback(async () => {
    try {
      // Try to get presets from API; fall back to built-in list
      if (api.agentPresets?.list) {
        const list = await api.agentPresets.list();
        setPresets(list || []);
      } else {
        // Use built-in presets as fallback
        setPresets(BUILT_IN_PRESETS_FALLBACK);
      }
    } catch {
      setPresets(BUILT_IN_PRESETS_FALLBACK);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadAgents(), loadPresets()]);
      setLoading(false);
    };
    init();
  }, [loadAgents, loadPresets]);

  // ── Form helpers ─────────────────────────────────────────────────────────

  const resetForm = useCallback(() => {
    setFormName('');
    setFormMode('build');
    setFormDescription('');
    setFormPrompt('');
    setFormModel('');
    setFormPermissions(DEFAULT_PERMISSIONS.build);
    setFormMaxSteps(100);
    setFormTemperature(0.7);
    setEditingAgent(null);
  }, []);

  const populateForm = useCallback((agent: AgentDefinition) => {
    setFormName(agent.name);
    setFormMode(agent.mode);
    setFormDescription(agent.description);
    setFormPrompt(agent.prompt || '');
    setFormModel(agent.model || '');
    setFormPermissions(agent.permissions || DEFAULT_PERMISSIONS[agent.mode]);
    setFormMaxSteps(agent.maxSteps || 100);
    setFormTemperature(agent.temperature || 0.7);
    setEditingAgent(agent);
    setActiveTab('create');
  }, []);

  // ── CRUD operations ─────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!formName.trim()) {
      addToast({ title: 'Validation Error', message: 'Agent name is required', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      const agentData: any = {
        id: editingAgent?.id || `custom-${formName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
        name: formName.trim(),
        mode: formMode,
        description: formDescription.trim(),
        prompt: formPrompt.trim() || undefined,
        model: formModel.trim() || undefined,
        permissions: formPermissions,
        maxSteps: formMaxSteps,
        temperature: formTemperature,
        isBuiltIn: false,
      };

      if (editingAgent && !editingAgent.isBuiltIn) {
        // Update existing agent
        await api.agents.create(agentData);
        addToast({ title: 'Agent Updated', message: `"${formName}" has been updated`, type: 'success' });
      } else {
        // Create new agent
        await api.agents.create(agentData);
        addToast({ title: 'Agent Created', message: `"${formName}" has been created`, type: 'success' });
      }

      await loadAgents();
      resetForm();
      setActiveTab('agents');
    } catch (err: any) {
      addToast({ title: 'Save Failed', message: err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (agentId: string) => {
    try {
      await api.agents.delete(agentId);
      addToast({ title: 'Agent Deleted', message: 'The agent has been removed', type: 'success' });
      setShowDeleteConfirm(null);
      await loadAgents();
    } catch (err: any) {
      addToast({ title: 'Delete Failed', message: err.message, type: 'error' });
    }
  };

  // ── Import / Export ─────────────────────────────────────────────────────

  const handleExport = () => {
    const json = JSON.stringify(agents.filter((a) => !a.isBuiltIn), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'openagent-agents.json';
    a.click();
    URL.revokeObjectURL(url);
    addToast({ title: 'Export Complete', message: 'Custom agents exported as JSON', type: 'success' });
  };

  const handleImport = () => {
    try {
      const parsed = JSON.parse(importJson);
      const agentList = Array.isArray(parsed) ? parsed : [parsed];
      let imported = 0;

      for (const agentData of agentList) {
        if (agentData.name && agentData.mode) {
          const newAgent = {
            ...agentData,
            id: agentData.id || `imported-${Date.now()}-${imported}`,
            isBuiltIn: false,
          };

          // Attempt to create via API
          api.agents.create(newAgent).catch(() => {});
          imported++;
        }
      }

      addToast({ title: 'Import Complete', message: `Imported ${imported} agent(s)`, type: 'success' });
      setShowImport(false);
      setImportJson('');
      loadAgents();
    } catch {
      addToast({ title: 'Import Failed', message: 'Invalid JSON format', type: 'error' });
    }
  };

  const handleApplyPreset = (preset: AgentPreset) => {
    setFormName(preset.name);
    setFormMode(preset.mode);
    setFormDescription(preset.description);
    setFormPrompt(preset.prompt);
    setFormModel(preset.model || '');
    setFormPermissions(preset.permissions);
    setFormMaxSteps(100);
    setFormTemperature(0.7);
    setEditingAgent(null);
    setActiveTab('create');
    addToast({ title: 'Preset Loaded', message: `"${preset.name}" — customize and save`, type: 'info' });
  };

  // ── Permission editor ───────────────────────────────────────────────────

  const updatePermission = (tool: string, level: 'allow' | 'ask' | 'deny') => {
    setFormPermissions((prev) => ({ ...prev, [tool]: level }));
  };

  const addCustomPermission = (pattern: string, level: 'allow' | 'ask' | 'deny') => {
    if (pattern.trim()) {
      setFormPermissions((prev) => ({ ...prev, [pattern.trim()]: level }));
    }
  };

  const removePermission = (pattern: string) => {
    setFormPermissions((prev) => {
      const next = { ...prev };
      delete next[pattern];
      return next;
    });
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" style={{ color: 'var(--color-text-tertiary)' }}>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>Loading agents...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <h2 className="text-sm font-semibold">Agent Manager</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="px-2.5 py-1 text-xs rounded-md transition-colors"
            style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
            title="Export custom agents"
          >
            Export
          </button>
          <button
            onClick={() => setShowImport(!showImport)}
            className="px-2.5 py-1 text-xs rounded-md transition-colors"
            style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
            title="Import agents from JSON"
          >
            Import
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-2 py-1 text-xs rounded-md hover:opacity-80"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Import Dialog */}
      {showImport && (
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-secondary)' }}>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
            Paste agent JSON:
          </label>
          <textarea
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            className="w-full h-24 px-3 py-2 text-xs rounded-md resize-none focus:outline-none focus:ring-1"
            style={{
              background: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-primary)',
              borderColor: 'var(--color-border)',

            }}
            placeholder='[{"name": "My Agent", "mode": "build", ...}]'
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => { setShowImport(false); setImportJson(''); }}
              className="px-3 py-1 text-xs rounded-md"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              className="px-3 py-1 text-xs rounded-md font-medium"
              style={{ background: 'var(--color-accent)', color: '#fff' }}
            >
              Import
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex px-4 pt-2 gap-0.5" style={{ background: 'var(--color-bg-secondary)' }}>
        {(['agents', 'presets', 'create'] as TabId[]).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              if (tab === 'create') resetForm();
              setActiveTab(tab);
            }}
            className="px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors capitalize"
            style={{
              background: activeTab === tab ? 'var(--color-bg-primary)' : 'transparent',
              color: activeTab === tab ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
              borderBottom: activeTab === tab ? '2px solid var(--color-accent)' : '2px solid transparent',
            }}
          >
            {tab === 'create' ? (editingAgent ? 'Edit Agent' : '+ New Agent') : tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3" style={{ background: 'var(--color-bg-primary)' }}>
        {/* Agents Tab */}
        {activeTab === 'agents' && (
          <div className="space-y-2">
            {agents.length === 0 && (
              <p className="text-xs py-8 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
                No agents found. Create one or apply a preset.
              </p>
            )}
            {agents.map((agent) => {
              const modeConf = MODE_CONFIG[agent.mode];
              return (
                <div
                  key={agent.id}
                  className="rounded-lg border p-3 transition-colors cursor-pointer hover:opacity-90"
                  style={{
                    background: 'var(--color-bg-secondary)',
                    borderColor: 'var(--color-border)',
                  }}
                  onClick={() => onAgentSelect?.(agent)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-base">{modeConf.icon}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{agent.name}</span>
                          <span
                            className="px-1.5 py-0.5 text-[10px] font-medium rounded-full"
                            style={{
                              background: modeConf.color + '20',
                              color: modeConf.color,
                            }}
                          >
                            {modeConf.label}
                          </span>
                          {agent.isBuiltIn && (
                            <span
                              className="px-1.5 py-0.5 text-[10px] rounded-full"
                              style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}
                            >
                              Built-in
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-tertiary)' }}>
                          {agent.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      {!agent.isBuiltIn && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); populateForm(agent); }}
                            className="p-1 rounded text-xs hover:opacity-80"
                            style={{ color: 'var(--color-text-tertiary)' }}
                            title="Edit agent"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(agent.id); }}
                            className="p-1 rounded text-xs hover:opacity-80"
                            style={{ color: 'var(--color-destructive)' }}
                            title="Delete agent"
                          >
                            🗑️
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Delete confirmation */}
                  {showDeleteConfirm === agent.id && (
                    <div className="mt-2 pt-2 flex items-center justify-between" style={{ borderTop: '1px solid var(--color-border)' }}>
                      <span className="text-xs" style={{ color: 'var(--color-destructive)' }}>
                        Delete this agent?
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(null); }}
                          className="px-2 py-0.5 text-xs rounded"
                          style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(agent.id); }}
                          className="px-2 py-0.5 text-xs rounded font-medium"
                          style={{ background: 'var(--color-destructive)', color: '#fff' }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Presets Tab */}
        {activeTab === 'presets' && (
          <div className="space-y-2">
            {presets.map((preset) => {
              const modeConf = MODE_CONFIG[preset.mode];
              return (
                <div
                  key={preset.id}
                  className="rounded-lg border p-3 transition-colors"
                  style={{
                    background: 'var(--color-bg-secondary)',
                    borderColor: 'var(--color-border)',
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-lg">{preset.icon}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{preset.name}</span>
                          <span
                            className="px-1.5 py-0.5 text-[10px] font-medium rounded-full"
                            style={{ background: modeConf.color + '20', color: modeConf.color }}
                          >
                            {modeConf.label}
                          </span>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                          {preset.description}
                        </p>
                        {preset.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {preset.tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-1.5 py-0.5 text-[10px] rounded-full"
                                style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleApplyPreset(preset)}
                      className="px-2.5 py-1 text-xs rounded-md font-medium ml-2 shrink-0"
                      style={{ background: 'var(--color-accent)', color: '#fff' }}
                    >
                      Use
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Create / Edit Tab */}
        {activeTab === 'create' && (
          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                Agent Name *
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1"
                style={{
                  background: 'var(--color-bg-tertiary)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                }}
                placeholder="My Custom Agent"
              />
            </div>

            {/* Mode Selector */}
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                Mode
              </label>
              <div className="flex gap-1">
                {Object.entries(MODE_CONFIG).map(([mode, conf]) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setFormMode(mode as AgentMode);
                      // Reset permissions to default for that mode
                      setFormPermissions(DEFAULT_PERMISSIONS[mode as AgentMode]);
                    }}
                    className="flex-1 px-2 py-1.5 text-xs rounded-md font-medium transition-all"
                    style={{
                      background: formMode === mode ? conf.color + '20' : 'var(--color-bg-tertiary)',
                      color: formMode === mode ? conf.color : 'var(--color-text-tertiary)',
                      border: formMode === mode ? `1px solid ${conf.color}` : '1px solid transparent',
                    }}
                  >
                    {conf.icon} {conf.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                {MODE_CONFIG[formMode].description}
              </p>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                Description
              </label>
              <input
                type="text"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1"
                style={{
                  background: 'var(--color-bg-tertiary)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                }}
                placeholder="A short description of what this agent does"
              />
            </div>

            {/* Prompt */}
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                System Prompt
              </label>
              <textarea
                value={formPrompt}
                onChange={(e) => setFormPrompt(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md resize-y focus:outline-none focus:ring-1"
                style={{
                  background: 'var(--color-bg-tertiary)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                  minHeight: '100px',
                }}
                placeholder="You are an expert AI assistant that..."
              />
            </div>

            {/* Model */}
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                Model Override (optional)
              </label>
              <input
                type="text"
                value={formModel}
                onChange={(e) => setFormModel(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1"
                style={{
                  background: 'var(--color-bg-tertiary)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                }}
                placeholder="Leave empty for default model"
              />
            </div>

            {/* Permissions Editor */}
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                Permissions
              </label>
              <div className="rounded-md border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
                <div
                  className="grid grid-cols-[1fr_60px_60px_60px_28px] gap-0 text-[10px] font-medium px-2 py-1"
                  style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}
                >
                  <span>Pattern</span>
                  <span className="text-center">Allow</span>
                  <span className="text-center">Ask</span>
                  <span className="text-center">Deny</span>
                  <span />
                </div>
                {Object.entries(formPermissions).map(([pattern, level]) => (
                  <div
                    key={pattern}
                    className="grid grid-cols-[1fr_60px_60px_60px_28px] gap-0 items-center px-2 py-1 border-t"
                    style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-secondary)' }}
                  >
                    <span className="text-xs font-mono truncate" style={{ color: 'var(--color-text-primary)' }}>
                      {pattern}
                    </span>
                    {(['allow', 'ask', 'deny'] as const).map((l) => (
                      <div key={l} className="flex justify-center">
                        <input
                          type="radio"
                          name={`perm-${pattern}`}
                          checked={level === l}
                          onChange={() => updatePermission(pattern, l)}
                          className="w-3 h-3"
                        />
                      </div>
                    ))}
                    <button
                      onClick={() => removePermission(pattern)}
                      className="text-xs opacity-50 hover:opacity-100"
                      style={{ color: 'var(--color-destructive)' }}
                      title="Remove rule"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {/* Add new permission */}
                <AddPermissionRow onAdd={addCustomPermission} />
              </div>
            </div>

            {/* Advanced Settings */}
            <details className="group">
              <summary
                className="text-xs font-medium cursor-pointer py-1"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Advanced Settings
              </summary>
              <div className="mt-2 space-y-3 pl-2">
                <div className="flex items-center gap-3">
                  <label className="text-xs shrink-0 w-20" style={{ color: 'var(--color-text-tertiary)' }}>
                    Max Steps
                  </label>
                  <input
                    type="number"
                    value={formMaxSteps}
                    onChange={(e) => setFormMaxSteps(Number(e.target.value))}
                    className="w-24 px-2 py-1 text-xs rounded-md"
                    style={{
                      background: 'var(--color-bg-tertiary)',
                      color: 'var(--color-text-primary)',
                      border: '1px solid var(--color-border)',
                    }}
                    min={1}
                    max={10000}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs shrink-0 w-20" style={{ color: 'var(--color-text-tertiary)' }}>
                    Temperature
                  </label>
                  <input
                    type="number"
                    value={formTemperature}
                    onChange={(e) => setFormTemperature(Number(e.target.value))}
                    className="w-24 px-2 py-1 text-xs rounded-md"
                    style={{
                      background: 'var(--color-bg-tertiary)',
                      color: 'var(--color-text-primary)',
                      border: '1px solid var(--color-border)',
                    }}
                    min={0}
                    max={2}
                    step={0.1}
                  />
                </div>
              </div>
            </details>

            {/* Save / Cancel */}
            <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <button
                onClick={() => { resetForm(); setActiveTab('agents'); }}
                className="px-3 py-1.5 text-xs rounded-md"
                style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formName.trim()}
                className="px-4 py-1.5 text-xs rounded-md font-medium disabled:opacity-50"
                style={{ background: 'var(--color-accent)', color: '#fff' }}
              >
                {saving ? 'Saving...' : editingAgent ? 'Update Agent' : 'Create Agent'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Sub-components ─────────────────────────────────────────────────────────────

/** Row for adding a new permission pattern */
const AddPermissionRow: React.FC<{ onAdd: (pattern: string, level: 'allow' | 'ask' | 'deny') => void }> = ({ onAdd }) => {
  const [pattern, setPattern] = useState('');
  const [level, setLevel] = useState<'allow' | 'ask' | 'deny'>('ask');

  return (
    <div
      className="grid grid-cols-[1fr_60px_60px_60px_28px] gap-0 items-center px-2 py-1.5 border-t"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-secondary)' }}
    >
      <input
        type="text"
        value={pattern}
        onChange={(e) => setPattern(e.target.value)}
        className="text-xs font-mono px-1 py-0.5 rounded focus:outline-none"
        style={{
          background: 'var(--color-bg-tertiary)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border)',
        }}
        placeholder="e.g. bash:git *"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && pattern.trim()) {
            onAdd(pattern, level);
            setPattern('');
          }
        }}
      />
      {(['allow', 'ask', 'deny'] as const).map((l) => (
        <div key={l} className="flex justify-center">
          <input
            type="radio"
            name="new-perm-level"
            checked={level === l}
            onChange={() => setLevel(l)}
            className="w-3 h-3"
          />
        </div>
      ))}
      <button
        onClick={() => {
          if (pattern.trim()) {
            onAdd(pattern, level);
            setPattern('');
          }
        }}
        className="text-xs opacity-60 hover:opacity-100"
        style={{ color: 'var(--color-success)' }}
        title="Add rule"
      >
        +
      </button>
    </div>
  );
};

// ─── Fallback Built-in Presets ──────────────────────────────────────────────────

const BUILT_IN_PRESETS_FALLBACK: AgentPreset[] = [
  {
    id: 'code-reviewer', name: 'Code Reviewer', description: 'Analyzes code for quality, patterns, and potential issues.',
    icon: '🔍', mode: 'plan', prompt: 'You are a senior code reviewer...', permissions: { '*': 'deny', 'read': 'allow', 'glob': 'allow', 'grep': 'allow' },
    tags: ['review', 'quality', 'analysis'], isBuiltIn: true,
  },
  {
    id: 'bug-fixer', name: 'Bug Fixer', description: 'Diagnoses and fixes bugs with full tool access.',
    icon: '🐛', mode: 'build', prompt: 'You are an expert bug fixer...', permissions: { '*': 'allow' },
    tags: ['bug', 'fix', 'debug'], isBuiltIn: true,
  },
  {
    id: 'documentation-writer', name: 'Documentation Writer', description: 'Generates and improves documentation.',
    icon: '📝', mode: 'plan', prompt: 'You are a documentation specialist...', permissions: { '*': 'deny', 'read': 'allow', 'glob': 'allow', 'grep': 'allow' },
    tags: ['documentation', 'docs'], isBuiltIn: true,
  },
  {
    id: 'test-generator', name: 'Test Generator', description: 'Generates comprehensive test suites for existing code.',
    icon: '🧪', mode: 'build', prompt: 'You are a test engineering specialist...', permissions: { '*': 'allow' },
    tags: ['test', 'testing'], isBuiltIn: true,
  },
  {
    id: 'code-explainer', name: 'Code Explainer', description: 'Explains code in plain language.',
    icon: '💡', mode: 'chat', prompt: 'You are a patient code explainer...', permissions: { '*': 'deny' },
    tags: ['explain', 'learn'], isBuiltIn: true,
  },
  {
    id: 'refactoring-assistant', name: 'Refactoring Assistant', description: 'Helps refactor code safely with step-by-step approvals.',
    icon: '🔧', mode: 'smart', prompt: 'You are a refactoring specialist...', permissions: { '*': 'ask', 'read': 'allow' },
    tags: ['refactor', 'clean-code'], isBuiltIn: true,
  },
  {
    id: 'security-auditor', name: 'Security Auditor', description: 'Scans code for security vulnerabilities.',
    icon: '🛡️', mode: 'plan', prompt: 'You are a security auditor...', permissions: { '*': 'deny', 'read': 'allow', 'glob': 'allow', 'grep': 'allow' },
    tags: ['security', 'audit'], isBuiltIn: true,
  },
  {
    id: 'project-scaffolder', name: 'Project Scaffolder', description: 'Sets up new projects with best-practice configurations.',
    icon: '🏗️', mode: 'build', prompt: 'You are a project scaffolding specialist...', permissions: { '*': 'allow' },
    tags: ['scaffold', 'project'], isBuiltIn: true,
  },
];

export default AgentManager;
