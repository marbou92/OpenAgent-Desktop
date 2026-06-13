/**
 * OpenAgent-Desktop - Hooks View Component
 *
 * Displays and manages hook configurations with:
 * - Add new hook form (name, type, command)
 * - Hook list with enable/disable indicator
 * - Remove hook functionality
 */

import React, { useState } from 'react';
import { HookInfo, Toast } from '../../types';
import { getAPI } from '../../utils/api';

interface HooksViewProps {
  hooks: HookInfo[];
  onRefresh: () => Promise<void>;
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

const api = getAPI();

const HooksView: React.FC<HooksViewProps> = ({ hooks, onRefresh, addToast }) => {
  const [newHookName, setNewHookName] = useState('');
  const [newHookType, setNewHookType] = useState<HookInfo['type']>('PreToolUse');
  const [newHookCommand, setNewHookCommand] = useState('');

  const handleAddHook = async () => {
    if (!api?.hooks?.add || !newHookName || !newHookCommand) return;
    try {
      await api.hooks.add({
        name: newHookName,
        type: newHookType,
        command: newHookCommand,
        enabled: true,
        conditions: {},
      });
      setNewHookName('');
      setNewHookCommand('');
      await onRefresh();
      addToast({ type: 'success', title: 'Hook added' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to add hook', message: err.message });
    }
  };

  const handleRemoveHook = async (hookId: string) => {
    if (!api?.hooks?.remove) return;
    try {
      await api.hooks.remove(hookId);
      await onRefresh();
      addToast({ type: 'success', title: 'Hook removed' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to remove hook', message: err.message });
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6" style={{ background: 'var(--color-bg-primary)' }}>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--color-text-primary)' }}>Hooks</h1>

        {/* Add Hook Form */}
        <div className="rounded-xl p-4 mb-6 border" style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>Add New Hook</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <input
              type="text"
              value={newHookName}
              onChange={(e) => setNewHookName(e.target.value)}
              placeholder="Hook name"
              className="px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
            />
            <select
              value={newHookType}
              onChange={(e) => setNewHookType(e.target.value as any)}
              className="px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
            >
              <option value="PreToolUse">PreToolUse</option>
              <option value="PostToolUse">PostToolUse</option>
              <option value="UserPromptSubmit">UserPromptSubmit</option>
              <option value="PreSession">PreSession</option>
              <option value="PostSession">PostSession</option>
            </select>
            <input
              type="text"
              value={newHookCommand}
              onChange={(e) => setNewHookCommand(e.target.value)}
              placeholder="Shell command"
              className="px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
            />
          </div>
          <button
            onClick={handleAddHook}
            disabled={!newHookName || !newHookCommand}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
            style={{ background: 'var(--color-accent)', color: 'white' }}
          >
            Add Hook
          </button>
        </div>

        {/* Hook List */}
        <div className="space-y-3">
          {hooks.length === 0 && (
            <div className="text-center py-12" style={{ color: 'var(--color-text-tertiary)' }}>
              <p className="text-lg">No hooks configured</p>
              <p className="text-sm mt-1">Add a hook above to customize agent behavior</p>
            </div>
          )}
          {hooks.map((hook) => (
            <div
              key={hook.id}
              className="rounded-xl p-4 border flex items-center justify-between"
              style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: hook.enabled ? 'var(--color-success)' : 'var(--color-text-muted)' }}
                  />
                  <span className="font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                    {hook.name}
                  </span>
                  <span
                    className="px-2 py-0.5 rounded text-xs font-medium"
                    style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
                  >
                    {hook.type}
                  </span>
                </div>
                <p className="text-xs mt-1 font-mono truncate" style={{ color: 'var(--color-text-tertiary)' }}>
                  {hook.command}
                </p>
              </div>
              <button
                onClick={() => handleRemoveHook(hook.id)}
                className="ml-3 p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--color-error)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                aria-label="Remove hook"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HooksView;
