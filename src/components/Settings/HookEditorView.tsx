/**
 * OpenAgent-Desktop - Hook Editor View Component
 *
 * Visual hook editor for creating and editing lifecycle hooks.
 * Also includes HookLogView for displaying hook execution history.
 *
 * Phase 4 addition.
 */

import { useState } from 'react';
import { HookInfo, HookType, HookConditions } from '../../types';

const _api = (window as any).openagent;

// ─── Hook Editor ───────────────────────────────────────────────────────────────

interface HookEditorProps {
  hook?: HookInfo; // undefined = creating new
  onSave: (hook: Omit<HookInfo, 'id'>) => void;
  onCancel: () => void;
}

const HOOK_TYPES: { value: HookType; label: string; description: string }[] = [
  { value: 'PreToolUse', label: 'Pre-Tool Use', description: 'Runs before a tool is executed. Can deny the tool call.' },
  { value: 'PostToolUse', label: 'Post-Tool Use', description: 'Runs after a tool has been executed.' },
  { value: 'UserPromptSubmit', label: 'User Prompt Submit', description: 'Runs when a user submits a prompt. Can deny the submission.' },
  { value: 'PreSession', label: 'Pre-Session', description: 'Runs before a session starts.' },
  { value: 'PostSession', label: 'Post-Session', description: 'Runs after a session ends.' },
];

export default function HookEditorView({ hook, onSave, onCancel }: HookEditorProps) {
  const [name, setName] = useState(hook?.name || '');
  const [hookType, setHookType] = useState<HookType>(hook?.type || 'PreToolUse');
  const [command, setCommand] = useState(hook?.command || '');
  const [toolNameFilter, setToolNameFilter] = useState(hook?.conditions?.toolName || '');
  const [extensionIdFilter, setExtensionIdFilter] = useState(hook?.conditions?.extensionId || '');
  const [patternFilter, setPatternFilter] = useState(hook?.conditions?.pattern || '');
  const [timeout, setTimeoutVal] = useState(hook?.timeout?.toString() || '30');
  const [enabled, setEnabled] = useState(hook?.enabled ?? true);

  const selectedHookType = HOOK_TYPES.find((t) => t.value === hookType);

  const handleSave = () => {
    if (!name.trim() || !command.trim()) return;

    const conditions: HookConditions = {};
    if (toolNameFilter.trim()) conditions.toolName = toolNameFilter.trim();
    if (extensionIdFilter.trim()) conditions.extensionId = extensionIdFilter.trim();
    if (patternFilter.trim()) conditions.pattern = patternFilter.trim();

    onSave({
      name: name.trim(),
      type: hookType,
      command: command.trim(),
      enabled,
      conditions,
      timeout: parseInt(timeout, 10) || 30,
      createdAt: hook?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  const isValid = name.trim() && command.trim();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {hook ? 'Edit Hook' : 'Create New Hook'}
        </h3>
      </div>

      {/* Hook Name */}
      <div>
        <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
          Hook Name <span style={{ color: 'var(--color-error)' }}>*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Lint before tool use"
          className="w-full px-3 py-2 rounded-lg border text-sm"
          style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
        />
      </div>

      {/* Trigger Event */}
      <div>
        <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
          Trigger Event <span style={{ color: 'var(--color-error)' }}>*</span>
        </label>
        <select
          value={hookType}
          onChange={(e) => setHookType(e.target.value as HookType)}
          className="w-full px-3 py-2 rounded-lg border text-sm"
          style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
        >
          {HOOK_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        {selectedHookType && (
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>{selectedHookType.description}</p>
        )}
      </div>

      {/* Command */}
      <div>
        <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
          Command <span style={{ color: 'var(--color-error)' }}>*</span>
        </label>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="e.g., python3 script.py"
          className="w-full px-3 py-2 rounded-lg border text-sm font-mono"
          style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
        />
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
          Shell command to run. Hook context is provided via stdin as JSON.
        </p>
      </div>

      {/* Conditions Section */}
      <div>
        <label className="text-sm font-medium block mb-2" style={{ color: 'var(--color-text-secondary)' }}>
          Conditions
        </label>
        <div
          className="rounded-lg border p-4 space-y-3"
          style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)' }}
        >
          {/* Tool Name Filter */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
              Tool Name Filter
            </label>
            <input
              type="text"
              value={toolNameFilter}
              onChange={(e) => setToolNameFilter(e.target.value)}
              placeholder="e.g., shell, file_editor (optional)"
              className="w-full px-3 py-1.5 rounded-lg border text-sm"
              style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
            />
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Only trigger for specific tool names
            </p>
          </div>

          {/* Extension ID Filter */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
              Extension ID Filter
            </label>
            <input
              type="text"
              value={extensionIdFilter}
              onChange={(e) => setExtensionIdFilter(e.target.value)}
              placeholder="e.g., ext-shell (optional)"
              className="w-full px-3 py-1.5 rounded-lg border text-sm"
              style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
            />
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Only trigger for tools from a specific extension
            </p>
          </div>

          {/* Pattern Filter */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
              Pattern Filter
            </label>
            <input
              type="text"
              value={patternFilter}
              onChange={(e) => setPatternFilter(e.target.value)}
              placeholder="e.g., ^rm\\s+-rf (optional regex)"
              className="w-full px-3 py-1.5 rounded-lg border text-sm font-mono"
              style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
            />
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Regex pattern to match against context content
            </p>
          </div>
        </div>
      </div>

      {/* Timeout */}
      <div>
        <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
          Timeout (seconds)
        </label>
        <input
          type="number"
          value={timeout}
          onChange={(e) => setTimeoutVal(e.target.value)}
          min={1}
          max={300}
          className="w-32 px-3 py-2 rounded-lg border text-sm"
          style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
        />
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
          Maximum execution time before the hook is killed
        </p>
      </div>

      {/* Enabled Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Enabled</span>
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Enable or disable this hook without deleting it
          </p>
        </div>
        <button
          onClick={() => setEnabled(!enabled)}
          className="relative w-10 h-5 rounded-full transition-colors"
          style={{ background: enabled ? 'var(--color-accent)' : 'var(--color-bg-tertiary)' }}
        >
          <span
            className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
            style={{ transform: enabled ? 'translateX(20px)' : 'translateX(0)' }}
          />
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={!isValid}
          className="px-6 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          style={{ background: 'var(--color-accent)', color: 'white' }}
        >
          {hook ? 'Save Changes' : 'Create Hook'}
        </button>
        <button
          onClick={onCancel}
          className="px-6 py-2 rounded-lg text-sm font-medium border"
          style={{ borderColor: 'var(--color-border-primary)', color: 'var(--color-text-secondary)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Hook Log View ─────────────────────────────────────────────────────────────

export interface HookLogEntry {
  id: string;
  timestamp: string;
  hookName: string;
  hookId: string;
  trigger: HookType;
  result: 'success' | 'failure';
  output?: string;
  duration: number;
  deny?: boolean;
  reason?: string;
}

// Sample hook log entries for display
const SAMPLE_LOG_ENTRIES: HookLogEntry[] = [
  { id: '1', timestamp: new Date(Date.now() - 120000).toISOString(), hookName: 'Lint checker', hookId: 'hook-1', trigger: 'PreToolUse', result: 'success', output: 'No linting issues found', duration: 245 },
  { id: '2', timestamp: new Date(Date.now() - 300000).toISOString(), hookName: 'Security scanner', hookId: 'hook-2', trigger: 'PreToolUse', result: 'failure', output: 'Potential unsafe command detected', duration: 380, deny: true, reason: 'Blocked potentially destructive command' },
  { id: '3', timestamp: new Date(Date.now() - 600000).toISOString(), hookName: 'Session logger', hookId: 'hook-3', trigger: 'PostSession', result: 'success', output: 'Session stats logged', duration: 120 },
  { id: '4', timestamp: new Date(Date.now() - 900000).toISOString(), hookName: 'Prompt validator', hookId: 'hook-4', trigger: 'UserPromptSubmit', result: 'success', duration: 85 },
  { id: '5', timestamp: new Date(Date.now() - 1200000).toISOString(), hookName: 'Tool usage tracker', hookId: 'hook-5', trigger: 'PostToolUse', result: 'success', output: 'Tool usage recorded', duration: 156 },
  { id: '6', timestamp: new Date(Date.now() - 1800000).toISOString(), hookName: 'Lint checker', hookId: 'hook-1', trigger: 'PreToolUse', result: 'failure', output: '2 linting errors found', duration: 312 },
  { id: '7', timestamp: new Date(Date.now() - 2400000).toISOString(), hookName: 'Session logger', hookId: 'hook-3', trigger: 'PreSession', result: 'success', output: 'Session initialized', duration: 95 },
  { id: '8', timestamp: new Date(Date.now() - 3600000).toISOString(), hookName: 'Security scanner', hookId: 'hook-2', trigger: 'PreToolUse', result: 'success', output: 'Command is safe', duration: 210 },
];

interface HookLogViewProps {
  entries?: HookLogEntry[];
  maxEntries?: number;
}

export function HookLogView({ entries, maxEntries = 50 }: HookLogViewProps) {
  const logEntries = (entries || SAMPLE_LOG_ENTRIES).slice(0, maxEntries);

  const _formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatTimeAgo = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div>
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
        </svg>
        Execution Log
        <span className="text-xs font-normal" style={{ color: 'var(--color-text-tertiary)' }}>
          (last {logEntries.length} executions)
        </span>
      </h3>

      <div
        className="rounded-lg border overflow-hidden"
        style={{ borderColor: 'var(--color-border-primary)' }}
      >
        {/* Table Header */}
        <div
          className="grid grid-cols-[100px_1fr_110px_70px_60px] gap-2 px-3 py-2 text-xs font-semibold"
          style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}
        >
          <span>Time</span>
          <span>Hook</span>
          <span>Trigger</span>
          <span>Duration</span>
          <span>Result</span>
        </div>

        {/* Table Rows */}
        <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
          {logEntries.map((entry) => (
            <div
              key={entry.id}
              className="grid grid-cols-[100px_1fr_110px_70px_60px] gap-2 px-3 py-2 text-xs border-t"
              style={{ borderColor: 'var(--color-border-primary)' }}
            >
              <span title={new Date(entry.timestamp).toLocaleString()} style={{ color: 'var(--color-text-tertiary)' }}>
                {formatTimeAgo(entry.timestamp)}
              </span>
              <span className="truncate font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {entry.hookName}
              </span>
              <span className="px-1.5 py-0.5 rounded text-center" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)', fontSize: '10px' }}>
                {entry.trigger}
              </span>
              <span style={{ color: 'var(--color-text-tertiary)' }}>
                {entry.duration}ms
              </span>
              <span className="flex items-center gap-1">
                {entry.result === 'success' ? (
                  <>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span style={{ color: 'var(--color-success)' }}>OK</span>
                  </>
                ) : (
                  <>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    <span style={{ color: 'var(--color-error)' }}>Fail</span>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {logEntries.length === 0 && (
        <div className="text-center py-6" style={{ color: 'var(--color-text-tertiary)' }}>
          <p className="text-sm">No hook executions recorded</p>
        </div>
      )}
    </div>
  );
}
