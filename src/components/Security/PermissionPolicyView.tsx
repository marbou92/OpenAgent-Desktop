/**
 * OpenAgent-Desktop - Permission Policy View
 *
 * React component for managing permission policies:
 * - List of policies with mode badges and rule counts
 * - Create/edit policy form: name, description, agent mode, rules editor
 * - Rules editor: add/remove patterns with level selector (allow/ask/deny)
 * - Pattern autocomplete based on known tools
 * - Condition editor: add time/session/error conditions
 * - Policy templates gallery: "Full Autonomy", "Read Only", "Safe Mode", etc.
 * - Import/Export policies as JSON
 * - Active policy indicator
 * - Dark theme
 */

import React, { useState, useCallback, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type PermissionLevel = 'allow' | 'ask' | 'deny';
type AgentMode = 'build' | 'plan' | 'chat' | 'smart' | 'custom';

interface PolicyRule {
  pattern: string;
  level: PermissionLevel;
  reason?: string;
  category?: string;
  priority?: number;
}

interface PolicyCondition {
  type: 'time' | 'session_count' | 'tool_count' | 'error_count' | 'custom';
  operator: 'lt' | 'gt' | 'eq' | 'lte' | 'gte' | 'between' | 'in';
  value: number | string | number[] | string[];
  secondaryValue?: number | string;
  description?: string;
  enabled: boolean;
}

interface PermissionPolicy {
  id: string;
  name: string;
  description: string;
  rules: PolicyRule[];
  conditions: PolicyCondition[];
  agentMode: AgentMode;
  isDefault: boolean;
  isBuiltIn: boolean;
  inheritsFrom?: string;
  createdAt: string;
  updatedAt: string;
}

interface PolicyTemplate {
  id: string;
  name: string;
  description: string;
  agentMode: AgentMode;
  rules: PolicyRule[];
  conditions: PolicyCondition[];
  icon: string;
  color: string;
}

interface PermissionPolicyViewProps {
  policies: PermissionPolicy[];
  activePolicyId?: string;
  templates?: PolicyTemplate[];
  onCreatePolicy: (policy: Omit<PermissionPolicy, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdatePolicy: (id: string, updates: Partial<PermissionPolicy>) => void;
  onDeletePolicy: (id: string) => void;
  onSetActive: (policyId: string) => void;
  onImportPolicies: (json: string) => void;
  onExportPolicies: () => Promise<string>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODE_CONFIG: Record<AgentMode, { label: string; color: string; icon: string }> = {
  build: { label: 'Build', color: '#22c55e', icon: '⚡' },
  plan: { label: 'Plan', color: '#3b82f6', icon: '📋' },
  chat: { label: 'Chat', color: '#8b5cf6', icon: '💬' },
  smart: { label: 'Smart', color: '#f59e0b', icon: '🛡️' },
  custom: { label: 'Custom', color: '#6b7280', icon: '⚙️' },
};

const LEVEL_CONFIG: Record<PermissionLevel, { label: string; color: string; bgColor: string }> = {
  allow: { label: 'Allow', color: '#22c55e', bgColor: 'rgba(34,197,94,0.15)' },
  ask: { label: 'Ask', color: '#f59e0b', bgColor: 'rgba(245,158,11,0.15)' },
  deny: { label: 'Deny', color: '#ef4444', bgColor: 'rgba(239,68,68,0.15)' },
};

const KNOWN_PATTERNS = [
  '*', 'bash', 'read', 'write', 'edit', 'glob', 'grep',
  'bash:*', 'bash:git *', 'bash:rm -rf *', 'bash:sudo *',
  'bash:ls *', 'bash:cat *', 'bash:node *', 'bash:python *',
  'read:*', 'read:src/**', 'edit:*', 'edit:src/**',
  'write:*', 'write:src/**', 'edit:/etc/*', 'edit:/system/*',
  'write:/etc/*', 'write:/system/*',
  'file:read', 'file:write', 'network:*',
];

// ─── Sub-Components ───────────────────────────────────────────────────────────

const ModeBadge: React.FC<{ mode: AgentMode; size?: 'sm' | 'md' }> = ({ mode, size = 'sm' }) => {
  const config = MODE_CONFIG[mode];
  const sizeClasses = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClasses}`}
      style={{ background: config.color + '20', color: config.color }}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
};

const LevelBadge: React.FC<{ level: PermissionLevel }> = ({ level }) => {
  const config = LEVEL_CONFIG[level];
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{ background: config.bgColor, color: config.color }}
    >
      {config.label}
    </span>
  );
};

const RuleRow: React.FC<{
  rule: PolicyRule;
  index: number;
  onUpdate: (index: number, updates: Partial<PolicyRule>) => void;
  onRemove: (index: number) => void;
  showSuggestions: boolean;
}> = ({ rule, index, onUpdate, onRemove, showSuggestions }) => {
  const [patternInput, setPatternInput] = useState(rule.pattern);
  const [showDropdown, setShowDropdown] = useState(false);
  const [hoveredSuggIdx, setHoveredSuggIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredSuggestions = KNOWN_PATTERNS.filter(
    (p) => patternInput.length > 0 && p.toLowerCase().includes(patternInput.toLowerCase()) && p !== patternInput,
  ).slice(0, 8);

  return (
    <div
      className="flex items-center gap-2 p-2 rounded-lg group"
      style={{ background: 'var(--color-bg-tertiary)' }}
    >
      {/* Pattern input */}
      <div className="relative flex-1 min-w-0">
        <input
          ref={inputRef}
          type="text"
          value={patternInput}
          onChange={(e) => {
            setPatternInput(e.target.value);
            onUpdate(index, { pattern: e.target.value });
            setShowDropdown(showSuggestions && e.target.value.length > 0);
          }}
          onFocus={() => setShowDropdown(showSuggestions && patternInput.length > 0)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          className="w-full text-xs font-mono px-2 py-1.5 rounded border-none outline-none"
          style={{
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)',
          }}
          placeholder="e.g. bash:git *"
        />
        {/* Autocomplete dropdown — minimal opencode-style */}
        {showDropdown && filteredSuggestions.length > 0 && (
          <div
            className="absolute top-full left-0 right-0 mt-1 rounded-[10px] shadow-lg z-50 max-h-40 overflow-y-auto"
            style={{
              background: 'var(--v2-background-bg-base, var(--color-bg-elevated))',
              boxShadow: 'var(--v2-elevation-floating, var(--shadow-popover))',
              padding: '4px',
            }}
          >
            {filteredSuggestions.map((suggestion, idx) => {
              const isActive = false;
              const isHovered = hoveredSuggIdx === idx;
              return (
                <button
                  key={suggestion}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-left rounded-[6px] transition-colors"
                  style={{
                    background: isActive
                      ? 'var(--v2-overlay-simple-overlay-hover, var(--color-accent-soft))'
                      : isHovered
                      ? 'var(--v2-overlay-simple-overlay-hover, var(--color-bg-hover))'
                      : 'transparent',
                  }}
                  onMouseDown={() => {
                    setPatternInput(suggestion);
                    onUpdate(index, { pattern: suggestion });
                    setShowDropdown(false);
                  }}
                  onMouseEnter={() => setHoveredSuggIdx(idx)}
                  onMouseLeave={() => setHoveredSuggIdx(null)}
                >
                  <span
                    className="text-[13px] flex-1 truncate font-mono"
                    style={{
                      color: isActive ? 'var(--color-accent)' : 'var(--v2-text-text-base, var(--color-text-primary))',
                      fontFamily: 'var(--v2-font-family-text)',
                    }}
                  >
                    {suggestion}
                  </span>
                  {isActive && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Level selector */}
      <div className="flex gap-0.5 shrink-0">
        {(['allow', 'ask', 'deny'] as PermissionLevel[]).map((level) => {
          const config = LEVEL_CONFIG[level];
          const isActive = rule.level === level;
          return (
            <button
              key={level}
              onClick={() => onUpdate(index, { level })}
              className="px-2 py-1 rounded text-[10px] font-medium transition-all"
              style={{
                background: isActive ? config.bgColor : 'transparent',
                color: isActive ? config.color : 'var(--color-text-muted)',
                border: isActive ? `1px solid ${config.color}40` : '1px solid transparent',
              }}
            >
              {config.label}
            </button>
          );
        })}
      </div>

      {/* Reason input */}
      <input
        type="text"
        value={rule.reason || ''}
        onChange={(e) => onUpdate(index, { reason: e.target.value })}
        className="w-24 text-[10px] px-1.5 py-1 rounded border-none outline-none"
        style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)' }}
        placeholder="Reason"
      />

      {/* Remove button */}
      <button
        onClick={() => onRemove(index)}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
        style={{ color: 'var(--color-text-muted)' }}
        title="Remove rule"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
};

const ConditionRow: React.FC<{
  condition: PolicyCondition;
  index: number;
  onUpdate: (index: number, updates: Partial<PolicyCondition>) => void;
  onRemove: (index: number) => void;
}> = ({ condition, index, onUpdate, onRemove }) => {
  return (
    <div
      className="flex items-center gap-2 p-2 rounded-lg group"
      style={{ background: 'var(--color-bg-tertiary)' }}
    >
      {/* Enabled toggle */}
      <label className="relative inline-flex items-center cursor-pointer shrink-0">
        <input
          type="checkbox"
          checked={condition.enabled}
          onChange={(e) => onUpdate(index, { enabled: e.target.checked })}
          className="sr-only peer"
        />
        <div
          className="w-6 h-3 rounded-full transition-colors peer-checked:after:translate-x-3 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-2 after:w-2 after:transition-transform"
          style={{ background: condition.enabled ? 'var(--color-accent)' : 'var(--color-bg-hover)' }}
        />
      </label>

      {/* Type selector */}
      <select
        value={condition.type}
        onChange={(e) => onUpdate(index, { type: e.target.value as PolicyCondition['type'] })}
        className="text-[10px] px-1.5 py-1 rounded border-none outline-none"
        style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}
      >
        <option value="time">Time</option>
        <option value="session_count">Session Count</option>
        <option value="tool_count">Tool Count</option>
        <option value="error_count">Error Count</option>
        <option value="custom">Custom</option>
      </select>

      {/* Operator selector */}
      <select
        value={condition.operator}
        onChange={(e) => onUpdate(index, { operator: e.target.value as PolicyCondition['operator'] })}
        className="text-[10px] px-1.5 py-1 rounded border-none outline-none"
        style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}
      >
        <option value="lt">&lt;</option>
        <option value="gt">&gt;</option>
        <option value="eq">=</option>
        <option value="lte">&le;</option>
        <option value="gte">&ge;</option>
        <option value="between">Between</option>
      </select>

      {/* Value input */}
      <input
        type="text"
        value={String(condition.value)}
        onChange={(e) => {
          const val = e.target.value;
          const num = Number(val);
          onUpdate(index, { value: isNaN(num) ? val : num });
        }}
        className="w-16 text-[10px] px-1.5 py-1 rounded border-none outline-none"
        style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}
        placeholder="Value"
      />

      {/* Secondary value for between */}
      {condition.operator === 'between' && (
        <input
          type="text"
          value={String(condition.secondaryValue || '')}
          onChange={(e) => {
            const val = e.target.value;
            const num = Number(val);
            onUpdate(index, { secondaryValue: isNaN(num) ? val : num });
          }}
          className="w-16 text-[10px] px-1.5 py-1 rounded border-none outline-none"
          style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}
          placeholder="Max"
        />
      )}

      {/* Description */}
      <input
        type="text"
        value={condition.description || ''}
        onChange={(e) => onUpdate(index, { description: e.target.value })}
        className="flex-1 min-w-0 text-[10px] px-1.5 py-1 rounded border-none outline-none"
        style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)' }}
        placeholder="Description"
      />

      {/* Remove */}
      <button
        onClick={() => onRemove(index)}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
        style={{ color: 'var(--color-text-muted)' }}
        title="Remove condition"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
};

const TemplateCard: React.FC<{
  template: PolicyTemplate;
  onSelect: (templateId: string) => void;
}> = ({ template, onSelect }) => (
  <button
    onClick={() => onSelect(template.id)}
    className="text-left p-3 rounded-lg transition-all hover:scale-[1.02]"
    style={{
      background: template.color + '10',
      border: `1px solid ${template.color}30`,
    }}
  >
    <div className="flex items-center gap-2 mb-1">
      <span className="text-lg">{template.icon}</span>
      <span className="text-xs font-semibold" style={{ color: template.color }}>
        {template.name}
      </span>
    </div>
    <p className="text-[10px] leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
      {template.description}
    </p>
    <div className="flex items-center gap-2 mt-2">
      <ModeBadge mode={template.agentMode} size="sm" />
      <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
        {template.rules.length} rules
      </span>
    </div>
  </button>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const PermissionPolicyView: React.FC<PermissionPolicyViewProps> = ({
  policies,
  activePolicyId,
  templates = [],
  onCreatePolicy,
  onUpdatePolicy,
  onDeletePolicy,
  onSetActive,
  onImportPolicies,
  onExportPolicies,
}) => {
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Omit<PermissionPolicy, 'id' | 'createdAt' | 'updatedAt'> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedPolicy = policies.find((p) => p.id === selectedPolicyId);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCreateNew = useCallback(() => {
    setEditingPolicy({
      name: '',
      description: '',
      rules: [{ pattern: '*', level: 'ask', reason: 'Default rule' }],
      conditions: [],
      agentMode: 'custom',
      isDefault: false,
      isBuiltIn: false,
    });
    setIsEditing(true);
    setSelectedPolicyId(null);
  }, []);

  const handleEditPolicy = useCallback((policy: PermissionPolicy) => {
    setEditingPolicy({
      name: policy.name,
      description: policy.description,
      rules: [...policy.rules],
      conditions: [...policy.conditions],
      agentMode: policy.agentMode,
      isDefault: policy.isDefault,
      isBuiltIn: policy.isBuiltIn,
      inheritsFrom: policy.inheritsFrom,
    });
    setIsEditing(true);
  }, []);

  const handleSavePolicy = useCallback(() => {
    if (!editingPolicy || !editingPolicy.name.trim()) return;

    if (selectedPolicyId) {
      onUpdatePolicy(selectedPolicyId, editingPolicy);
    } else {
      onCreatePolicy(editingPolicy);
    }

    setIsEditing(false);
    setEditingPolicy(null);
  }, [editingPolicy, selectedPolicyId, onCreatePolicy, onUpdatePolicy]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditingPolicy(null);
  }, []);

  const handleAddRule = useCallback(() => {
    if (!editingPolicy) return;
    setEditingPolicy({
      ...editingPolicy,
      rules: [...editingPolicy.rules, { pattern: '', level: 'ask' }],
    });
  }, [editingPolicy]);

  const handleUpdateRule = useCallback((index: number, updates: Partial<PolicyRule>) => {
    if (!editingPolicy) return;
    const newRules = [...editingPolicy.rules];
    newRules[index] = { ...newRules[index], ...updates };
    setEditingPolicy({ ...editingPolicy, rules: newRules });
  }, [editingPolicy]);

  const handleRemoveRule = useCallback((index: number) => {
    if (!editingPolicy) return;
    const newRules = editingPolicy.rules.filter((_, i) => i !== index);
    setEditingPolicy({ ...editingPolicy, rules: newRules });
  }, [editingPolicy]);

  const handleAddCondition = useCallback(() => {
    if (!editingPolicy) return;
    setEditingPolicy({
      ...editingPolicy,
      conditions: [
        ...editingPolicy.conditions,
        { type: 'time', operator: 'between', value: 9, secondaryValue: 17, enabled: true, description: 'Business hours only' },
      ],
    });
  }, [editingPolicy]);

  const handleUpdateCondition = useCallback((index: number, updates: Partial<PolicyCondition>) => {
    if (!editingPolicy) return;
    const newConditions = [...editingPolicy.conditions];
    newConditions[index] = { ...newConditions[index], ...updates };
    setEditingPolicy({ ...editingPolicy, conditions: newConditions });
  }, [editingPolicy]);

  const handleRemoveCondition = useCallback((index: number) => {
    if (!editingPolicy) return;
    const newConditions = editingPolicy.conditions.filter((_, i) => i !== index);
    setEditingPolicy({ ...editingPolicy, conditions: newConditions });
  }, [editingPolicy]);

  const handleTemplateSelect = useCallback((templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    setEditingPolicy({
      name: template.name,
      description: template.description,
      rules: [...template.rules],
      conditions: [...template.conditions],
      agentMode: template.agentMode,
      isDefault: false,
      isBuiltIn: false,
    });
    setIsEditing(true);
    setShowTemplates(false);
  }, [templates]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) onImportPolicies(content);
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [onImportPolicies]);

  const handleExport = useCallback(async () => {
    const json = await onExportPolicies();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openagent-policies-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [onExportPolicies]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        background: 'var(--color-bg-elevated)',
        borderColor: 'var(--color-border-primary)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'var(--color-border-primary)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">🛡️</span>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Permission Policies
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="px-2 py-1 rounded text-[10px] font-medium transition-colors"
            style={{
              background: showTemplates ? 'var(--color-accent-soft)' : 'var(--color-bg-tertiary)',
              color: showTemplates ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
              border: `1px solid ${showTemplates ? 'var(--color-accent)' : 'var(--color-border-primary)'}`,
            }}
          >
            📋 Templates
          </button>
          <button
            onClick={handleImport}
            className="px-2 py-1 rounded text-[10px] font-medium transition-colors"
            style={{
              background: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-tertiary)',
              border: '1px solid var(--color-border-primary)',
            }}
          >
            ⬆ Import
          </button>
          <button
            onClick={handleExport}
            className="px-2 py-1 rounded text-[10px] font-medium transition-colors"
            style={{
              background: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-tertiary)',
              border: '1px solid var(--color-border-primary)',
            }}
          >
            ⬇ Export
          </button>
          <button
            onClick={handleCreateNew}
            className="px-2 py-1 rounded text-[10px] font-medium transition-colors"
            style={{
              background: 'var(--color-accent-soft)',
              color: 'var(--color-accent)',
              border: '1px solid var(--color-accent)',
            }}
          >
            + New Policy
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileImport}
          className="hidden"
        />
      </div>

      <div className="flex" style={{ minHeight: '400px' }}>
        {/* ── Policy List ───────────────────────────────────────────────────── */}
        <div
          className="w-56 shrink-0 border-r overflow-y-auto"
          style={{ borderColor: 'var(--color-border-primary)', maxHeight: '500px' }}
        >
          {policies.map((policy) => {
            const isActive = policy.id === activePolicyId;
            const isSelected = policy.id === selectedPolicyId;

            return (
              <button
                key={policy.id}
                onClick={() => {
                  setSelectedPolicyId(policy.id);
                  setIsEditing(false);
                }}
                className="w-full text-left p-3 transition-colors"
                style={{
                  background: isSelected
                    ? 'var(--color-bg-hover)'
                    : 'transparent',
                  borderLeft: isActive ? '3px solid var(--color-accent)' : '3px solid transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-tertiary)';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                    {policy.name}
                  </span>
                  {isActive && (
                    <span
                      className="shrink-0 w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ background: 'var(--color-accent)' }}
                      title="Active policy"
                    />
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <ModeBadge mode={policy.agentMode} size="sm" />
                  <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                    {policy.rules.length}r
                  </span>
                </div>
                {policy.isBuiltIn && (
                  <span className="text-[9px] mt-0.5 inline-block px-1 rounded" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}>
                    Built-in
                  </span>
                )}
              </button>
            );
          })}

          {policies.length === 0 && (
            <div className="p-4 text-center text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              No policies yet. Create one to get started.
            </div>
          )}
        </div>

        {/* ── Main Content ──────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto" style={{ maxHeight: '500px' }}>
          {/* Templates Gallery */}
          {showTemplates && (
            <div className="p-4 border-b" style={{ borderColor: 'var(--color-border-primary)' }}>
              <h4 className="text-xs font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
                Policy Templates
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {templates.map((template) => (
                  <TemplateCard key={template.id} template={template} onSelect={handleTemplateSelect} />
                ))}
              </div>
            </div>
          )}

          {/* Edit/Create Form */}
          {isEditing && editingPolicy ? (
            <div className="p-4 space-y-4 animate-fade-in">
              {/* Policy name & description */}
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
                    Policy Name
                  </label>
                  <input
                    type="text"
                    value={editingPolicy.name}
                    onChange={(e) => setEditingPolicy({ ...editingPolicy, name: e.target.value })}
                    className="w-full text-xs px-3 py-2 rounded-lg border-none outline-none"
                    style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)' }}
                    placeholder="e.g., My Custom Policy"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
                    Description
                  </label>
                  <textarea
                    value={editingPolicy.description}
                    onChange={(e) => setEditingPolicy({ ...editingPolicy, description: e.target.value })}
                    className="w-full text-xs px-3 py-2 rounded-lg border-none outline-none resize-none"
                    style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)' }}
                    placeholder="Describe what this policy is for"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
                    Agent Mode
                  </label>
                  <div className="flex gap-1">
                    {(Object.entries(MODE_CONFIG) as [AgentMode, typeof MODE_CONFIG[AgentMode]][]).map(([mode, config]) => (
                      <button
                        key={mode}
                        onClick={() => setEditingPolicy({ ...editingPolicy, agentMode: mode })}
                        className="px-2.5 py-1.5 rounded text-[10px] font-medium transition-all flex items-center gap-1"
                        style={{
                          background: editingPolicy.agentMode === mode ? config.color + '20' : 'var(--color-bg-tertiary)',
                          color: editingPolicy.agentMode === mode ? config.color : 'var(--color-text-muted)',
                          border: editingPolicy.agentMode === mode ? `1px solid ${config.color}40` : '1px solid transparent',
                        }}
                      >
                        <span>{config.icon}</span>
                        <span>{config.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Rules Editor */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    Rules
                  </label>
                  <button
                    onClick={handleAddRule}
                    className="px-2 py-0.5 rounded text-[10px] font-medium"
                    style={{
                      background: 'var(--color-accent-soft)',
                      color: 'var(--color-accent)',
                      border: '1px solid var(--color-accent)',
                    }}
                  >
                    + Add Rule
                  </button>
                </div>
                <div className="space-y-1">
                  {editingPolicy.rules.map((rule, index) => (
                    <RuleRow
                      key={index}
                      rule={rule}
                      index={index}
                      onUpdate={handleUpdateRule}
                      onRemove={handleRemoveRule}
                      showSuggestions={true}
                    />
                  ))}
                  {editingPolicy.rules.length === 0 && (
                    <div className="text-[10px] text-center py-4" style={{ color: 'var(--color-text-muted)' }}>
                      No rules defined. Add a rule to get started.
                    </div>
                  )}
                </div>
              </div>

              {/* Conditions Editor */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    Conditions
                  </label>
                  <button
                    onClick={handleAddCondition}
                    className="px-2 py-0.5 rounded text-[10px] font-medium"
                    style={{
                      background: 'var(--color-bg-tertiary)',
                      color: 'var(--color-text-tertiary)',
                      border: '1px solid var(--color-border-primary)',
                    }}
                  >
                    + Add Condition
                  </button>
                </div>
                <div className="space-y-1">
                  {editingPolicy.conditions.map((condition, index) => (
                    <ConditionRow
                      key={index}
                      condition={condition}
                      index={index}
                      onUpdate={handleUpdateCondition}
                      onRemove={handleRemoveCondition}
                    />
                  ))}
                  {editingPolicy.conditions.length === 0 && (
                    <div className="text-[10px] text-center py-3" style={{ color: 'var(--color-text-muted)' }}>
                      No conditions. All rules apply unconditionally.
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: 'var(--color-border-primary)' }}>
                <button
                  onClick={handleSavePolicy}
                  disabled={!editingPolicy.name.trim()}
                  className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: editingPolicy.name.trim() ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                    color: editingPolicy.name.trim() ? '#fff' : 'var(--color-text-muted)',
                    border: 'none',
                    opacity: editingPolicy.name.trim() ? 1 : 0.5,
                  }}
                >
                  {selectedPolicyId ? 'Update Policy' : 'Create Policy'}
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="px-4 py-2 rounded-lg text-xs font-medium"
                  style={{
                    background: 'var(--color-bg-tertiary)',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border-primary)',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : selectedPolicy ? (
            /* Policy Detail View */
            <div className="p-4 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                      {selectedPolicy.name}
                    </h4>
                    <ModeBadge mode={selectedPolicy.agentMode} size="md" />
                    {selectedPolicy.id === activePolicyId && (
                      <span
                        className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                        style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
                      >
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                    {selectedPolicy.description}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {selectedPolicy.id !== activePolicyId && (
                    <button
                      onClick={() => onSetActive(selectedPolicy.id)}
                      className="px-2 py-1 rounded text-[10px] font-medium"
                      style={{ background: 'var(--color-accent)', color: '#fff' }}
                    >
                      Set Active
                    </button>
                  )}
                  {!selectedPolicy.isBuiltIn && (
                    <>
                      <button
                        onClick={() => handleEditPolicy(selectedPolicy)}
                        className="px-2 py-1 rounded text-[10px] font-medium"
                        style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-primary)' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          onDeletePolicy(selectedPolicy.id);
                          setSelectedPolicyId(null);
                        }}
                        className="px-2 py-1 rounded text-[10px] font-medium"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Rules list */}
              <div>
                <h5 className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>
                  Rules ({selectedPolicy.rules.length})
                </h5>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {selectedPolicy.rules.map((rule, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 p-2 rounded-lg"
                      style={{ background: 'var(--color-bg-tertiary)' }}
                    >
                      <span className="text-xs font-mono shrink-0" style={{ color: 'var(--color-accent)' }}>
                        {rule.pattern}
                      </span>
                      <span className="flex-1" />
                      <LevelBadge level={rule.level} />
                      {rule.reason && (
                        <span className="text-[10px] truncate max-w-32" style={{ color: 'var(--color-text-tertiary)' }}>
                          {rule.reason}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Conditions list */}
              {selectedPolicy.conditions.length > 0 && (
                <div>
                  <h5 className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>
                    Conditions ({selectedPolicy.conditions.length})
                  </h5>
                  <div className="space-y-1">
                    {selectedPolicy.conditions.map((condition, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 p-2 rounded-lg"
                        style={{ background: 'var(--color-bg-tertiary)' }}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: condition.enabled ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
                        />
                        <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                          {condition.type} {condition.operator} {String(condition.value)}
                          {condition.operator === 'between' ? `..${condition.secondaryValue}` : ''}
                        </span>
                        {condition.description && (
                          <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                            — {condition.description}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="flex items-center gap-4 text-[10px] pt-2 border-t" style={{ borderColor: 'var(--color-border-primary)', color: 'var(--color-text-muted)' }}>
                <span>Created: {new Date(selectedPolicy.createdAt).toLocaleDateString()}</span>
                <span>Updated: {new Date(selectedPolicy.updatedAt).toLocaleDateString()}</span>
                {selectedPolicy.isBuiltIn && <span className="px-1 rounded" style={{ background: 'var(--color-bg-tertiary)' }}>Built-in</span>}
              </div>
            </div>
          ) : (
            /* Empty State */
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <span className="text-3xl mb-3">🛡️</span>
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>
                Select a policy to view
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                Choose a policy from the list or create a new one using templates
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PermissionPolicyView;
