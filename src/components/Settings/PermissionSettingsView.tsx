/**
 * OpenAgent-Desktop — PermissionSettingsView (Phase 2)
 *
 * A dedicated Permissions section in Settings that contains:
 *   1. The permission mode dropdown (Auto/Approve/Smart Approve/Chat) —
 *      moved here from the General section.
 *   2. Tool enable/disable toggles — grouped by category. Disabling a tool
 *      hides it from the AI entirely (it can't call it).
 *   3. Bash/cmd safety — blocklist + allowlist with editable rules.
 */

import React, { useState, useMemo } from 'react';
import { AppSettings, BashSafetyConfig, BashSafetyRule } from '../../types';

interface PermissionSettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
}

// ─── Tool definitions ────────────────────────────────────────────────────────

interface ToolDef {
  name: string;
  description: string;
  category: 'File ops' | 'Shell' | 'Search' | 'Questions' | 'Skills';
}

const BUILTIN_TOOLS: ToolDef[] = [
  // File ops
  { name: 'read', description: 'Read file contents', category: 'File ops' },
  { name: 'write', description: 'Write/create files', category: 'File ops' },
  { name: 'edit', description: 'Edit existing files', category: 'File ops' },
  // Shell
  { name: 'bash', description: 'Run shell commands (bash/cmd/powershell)', category: 'Shell' },
  // Search
  { name: 'glob', description: 'Find files by pattern', category: 'Search' },
  { name: 'grep', description: 'Search file contents', category: 'Search' },
  // Questions
  { name: 'AskUserQuestion', description: 'Ask the user a multiple-choice question', category: 'Questions' },
  { name: 'TodoWrite', description: 'Create/update a todo list', category: 'Questions' },
];

const CATEGORY_ORDER: ToolDef['category'][] = ['File ops', 'Shell', 'Search', 'Questions', 'Skills'];

const CATEGORY_ICONS: Record<ToolDef['category'], React.ReactNode> = {
  'File ops': (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  Shell: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
  Search: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Questions: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  Skills: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  ),
};

// ─── Toggle Switch ───────────────────────────────────────────────────────────

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; color?: string }> = ({ checked, onChange, color }) => (
  <button
    onClick={() => onChange(!checked)}
    className="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors"
    style={{ background: checked ? (color || 'var(--color-accent)') : 'var(--color-border-secondary)' }}
  >
    <span
      className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
      style={{ transform: `translateX(${checked ? '18px' : '3px'})` }}
    />
  </button>
);

// ─── Main Component ──────────────────────────────────────────────────────────

const PermissionSettingsView: React.FC<PermissionSettingsViewProps> = ({ settings, onUpdateSettings }) => {
  const [showBlocklist, setShowBlocklist] = useState(true);
  const [showAllowlist, setShowAllowlist] = useState(false);
  const [newBlockPattern, setNewBlockPattern] = useState('');
  const [newAllowPattern, setNewAllowPattern] = useState('');

  const toolEnabled = settings.toolEnabled || {};
  const bashSafety = settings.bashSafety || { enabled: true, blocklist: [], allowlist: [] };

  // ─── Tool toggle handlers ──────────────────────────────────────────────────

  const setToolEnabled = (toolName: string, enabled: boolean) => {
    onUpdateSettings({ toolEnabled: { ...toolEnabled, [toolName]: enabled } });
  };

  // Group tools by category
  const toolsByCategory = useMemo(() => {
    const groups: Record<string, ToolDef[]> = {};
    for (const tool of BUILTIN_TOOLS) {
      if (!groups[tool.category]) groups[tool.category] = [];
      groups[tool.category].push(tool);
    }
    return groups;
  }, []);

  // ─── Bash safety handlers ──────────────────────────────────────────────────

  const updateBashSafety = (updates: Partial<BashSafetyConfig>) => {
    onUpdateSettings({ bashSafety: { ...bashSafety, ...updates } });
  };

  const toggleBlocklistRule = (idx: number) => {
    const newBlocklist = [...bashSafety.blocklist];
    newBlocklist[idx] = { ...newBlocklist[idx], enabled: !newBlocklist[idx].enabled };
    updateBashSafety({ blocklist: newBlocklist });
  };

  const removeBlocklistRule = (idx: number) => {
    updateBashSafety({ blocklist: bashSafety.blocklist.filter((_, i) => i !== idx) });
  };

  const addBlocklistRule = () => {
    if (!newBlockPattern.trim()) return;
    updateBashSafety({
      blocklist: [...bashSafety.blocklist, {
        pattern: newBlockPattern.trim(),
        description: 'Custom rule',
        enabled: true,
        category: 'custom',
      }],
    });
    setNewBlockPattern('');
  };

  const toggleAllowlistRule = (idx: number) => {
    const newAllowlist = [...bashSafety.allowlist];
    newAllowlist[idx] = { ...newAllowlist[idx], enabled: !newAllowlist[idx].enabled };
    updateBashSafety({ allowlist: newAllowlist });
  };

  const removeAllowlistRule = (idx: number) => {
    updateBashSafety({ allowlist: bashSafety.allowlist.filter((_, i) => i !== idx) });
  };

  const addAllowlistRule = () => {
    if (!newAllowPattern.trim()) return;
    updateBashSafety({
      allowlist: [...bashSafety.allowlist, {
        pattern: newAllowPattern.trim(),
        description: 'Custom rule',
        enabled: true,
        category: 'custom',
      }],
    });
    setNewAllowPattern('');
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ─── Permission Mode ─────────────────────────────────────────────── */}
      <div
        className="rounded-xl border p-4"
        style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}
      >
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
          Permission Mode
        </h3>
        <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
          Global override — takes precedence over all other permission settings.
        </p>
        <select
          value={settings.permissionMode}
          onChange={(e) => onUpdateSettings({ permissionMode: e.target.value as any })}
          className="w-full px-3 py-2 rounded-lg text-sm outline-none border cursor-pointer"
          style={{
            background: 'var(--color-bg-tertiary)',
            borderColor: 'var(--color-border-primary)',
            color: 'var(--color-text-primary)',
          }}
        >
          <option value="auto">Auto — approve everything automatically (no dialogs)</option>
          <option value="approve">Approve — ask for every tool call</option>
          <option value="smart_approve">Smart Approve — safe ops auto-approved, dangerous ops ask</option>
          <option value="chat">Chat — no tools allowed (conversation only)</option>
        </select>
      </div>

      {/* ─── Tool Toggles ───────────────────────────────────────────────── */}
      <div
        className="rounded-xl border p-4"
        style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}
      >
        <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
          Tools
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
          Disable a tool to hide it from the AI entirely. Disabled tools cannot be called.
        </p>

        {CATEGORY_ORDER.map((category) => {
          const tools = toolsByCategory[category];
          if (!tools || tools.length === 0) return null;
          return (
            <div key={category} className="mb-4 last:mb-0">
              {/* Category header */}
              <div
                className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {CATEGORY_ICONS[category]}
                <span>{category}</span>
              </div>
              {/* Tool rows */}
              <div className="space-y-1">
                {tools.map((tool) => {
                  const enabled = toolEnabled[tool.name] !== false; // default true
                  return (
                    <div
                      key={tool.name}
                      className="flex items-center justify-between px-3 py-2 rounded-lg"
                      style={{ background: 'var(--color-bg-tertiary)' }}
                    >
                      <div className="flex-1 min-w-0">
                        <span
                          className="text-xs font-mono font-medium"
                          style={{ color: enabled ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}
                        >
                          {tool.name}
                        </span>
                        <span
                          className="text-[11px] ml-2"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          {tool.description}
                        </span>
                      </div>
                      <Toggle checked={enabled} onChange={(v) => setToolEnabled(tool.name, v)} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Bash / CMD Safety ──────────────────────────────────────────── */}
      <div
        className="rounded-xl border p-4"
        style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Bash / CMD Safety
          </h3>
          <Toggle
            checked={bashSafety.enabled}
            onChange={(v) => updateBashSafety({ enabled: v })}
            color="#22c55e"
          />
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
          When enabled, bash/cmd/powershell commands are checked against a blocklist (auto-deny)
          and an allowlist (auto-allow). Commands matching neither are passed to normal permission checks.
        </p>

        {/* Blocklist */}
        <div className="mb-4">
          <button
            onClick={() => setShowBlocklist(!showBlocklist)}
            className="flex items-center gap-2 w-full text-left mb-2"
          >
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: showBlocklist ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span className="text-xs font-semibold" style={{ color: '#ef4444' }}>
              Blocklist ({bashSafety.blocklist.filter(r => r.enabled).length} active)
            </span>
          </button>
          {showBlocklist && (
            <div className="space-y-1 ml-4">
              {bashSafety.blocklist.map((rule, idx) => (
                <RuleRow
                  key={idx}
                  rule={rule}
                  onToggle={() => toggleBlocklistRule(idx)}
                  onRemove={() => removeBlocklistRule(idx)}
                  color="#ef4444"
                />
              ))}
              {/* Add new rule */}
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text"
                  value={newBlockPattern}
                  onChange={(e) => setNewBlockPattern(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addBlocklistRule()}
                  placeholder="Add pattern to block (e.g. rm -rf)"
                  className="flex-1 px-2 py-1.5 rounded-lg text-xs font-mono outline-none border"
                  style={{
                    background: 'var(--color-bg-tertiary)',
                    borderColor: 'var(--color-border-primary)',
                    color: 'var(--color-text-primary)',
                  }}
                />
                <button
                  onClick={addBlocklistRule}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                  style={{ background: '#ef4444', color: 'white' }}
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Allowlist */}
        <div>
          <button
            onClick={() => setShowAllowlist(!showAllowlist)}
            className="flex items-center gap-2 w-full text-left mb-2"
          >
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: showAllowlist ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span className="text-xs font-semibold" style={{ color: '#22c55e' }}>
              Allowlist ({bashSafety.allowlist.filter(r => r.enabled).length} active)
            </span>
          </button>
          {showAllowlist && (
            <div className="space-y-1 ml-4">
              {bashSafety.allowlist.map((rule, idx) => (
                <RuleRow
                  key={idx}
                  rule={rule}
                  onToggle={() => toggleAllowlistRule(idx)}
                  onRemove={() => removeAllowlistRule(idx)}
                  color="#22c55e"
                />
              ))}
              {/* Add new rule */}
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text"
                  value={newAllowPattern}
                  onChange={(e) => setNewAllowPattern(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addAllowlistRule()}
                  placeholder="Add pattern to allow (e.g. git status)"
                  className="flex-1 px-2 py-1.5 rounded-lg text-xs font-mono outline-none border"
                  style={{
                    background: 'var(--color-bg-tertiary)',
                    borderColor: 'var(--color-border-primary)',
                    color: 'var(--color-text-primary)',
                  }}
                />
                <button
                  onClick={addAllowlistRule}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                  style={{ background: '#22c55e', color: 'white' }}
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Rule Row (used for both blocklist + allowlist) ──────────────────────────

const RuleRow: React.FC<{
  rule: BashSafetyRule;
  onToggle: () => void;
  onRemove: () => void;
  color: string;
}> = ({ rule, onToggle, onRemove, color }) => (
  <div
    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
    style={{ background: 'var(--color-bg-tertiary)', opacity: rule.enabled ? 1 : 0.4 }}
  >
    <Toggle checked={rule.enabled} onChange={onToggle} color={color} />
    <code
      className="text-[11px] font-mono flex-1 min-w-0 truncate"
      style={{ color: 'var(--color-text-primary)' }}
    >
      {rule.pattern}
    </code>
    <span
      className="text-[10px] flex-shrink-0"
      style={{ color: 'var(--color-text-muted)' }}
    >
      {rule.description}
    </span>
    <button
      onClick={onRemove}
      className="flex-shrink-0 p-0.5 rounded transition-colors"
      style={{ color: 'var(--color-text-muted)' }}
      onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)'; }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  </div>
);

export default PermissionSettingsView;
