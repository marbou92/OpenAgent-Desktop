/**
 * OpenAgent-Desktop - Skills View
 *
 * Browse and execute skills - reusable workflows that combine
 * prompts, tools, and automation.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Toast } from '../../types';

const api = (window as any).openagent;

interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  author: string;
  icon?: string;
  steps: { id: string; name: string; type: string }[];
  variables: { name: string; description: string; type: string; required: boolean; options?: string[]; defaultValue?: unknown }[];
  requiredExtensions: string[];
  tags: string[];
  isBuiltin: boolean;
}

interface SkillExecution {
  id: string;
  skillId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStepIndex: number;
  startedAt: string;
  completedAt?: string;
  results: { stepId: string; status: string; output?: string; error?: string }[];
  error?: string;
}

interface SkillsViewProps {
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  coding: '💻',
  writing: '📝',
  analysis: '📊',
  automation: '🤖',
  design: '🎨',
  communication: '💬',
};

const SkillsView: React.FC<SkillsViewProps> = ({ addToast }) => {
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSkill, setSelectedSkill] = useState<SkillDefinition | null>(null);
  const [executions, setExecutions] = useState<SkillExecution[]>([]);
  const [executing, setExecuting] = useState(false);
  const [variableValues, setVariableValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);

  const fetchSkills = useCallback(async () => {
    try {
      if (api?.skills?.list) {
        const list = await api.skills.list();
        setSkills(list);
      }
    } catch {
      // Skills not available yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const categories = ['all', ...new Set(skills.map((s) => s.category))];
  const filteredSkills = selectedCategory === 'all' ? skills : skills.filter((s) => s.category === selectedCategory);

  const handleExecute = async () => {
    if (!selectedSkill) return;

    // Validate required variables
    for (const v of selectedSkill.variables) {
      if (v.required && !variableValues[v.name]) {
        addToast({ type: 'error', title: `Missing required variable: ${v.name}` });
        return;
      }
    }

    setExecuting(true);
    try {
      const execution = await api.skills.execute(selectedSkill.id, variableValues);
      setExecutions((prev) => [execution, ...prev]);
      addToast({ type: 'success', title: `Skill "${selectedSkill.name}" started` });
      setSelectedSkill(null);
      setVariableValues({});
    } catch (err: any) {
      addToast({ type: 'error', title: 'Execution failed', message: err.message });
    } finally {
      setExecuting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Loading skills...</div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>Skills</h2>

      {/* Category Filter */}
      <div className="flex gap-2 flex-wrap">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className="px-3 py-1 rounded-lg text-xs transition-colors border"
            style={{
              background: selectedCategory === cat ? 'var(--color-accent-soft)' : 'var(--color-bg-tertiary)',
              borderColor: selectedCategory === cat ? 'var(--color-accent)' : 'var(--color-border-primary)',
              color: selectedCategory === cat ? 'var(--color-accent)' : 'var(--color-text-secondary)',
            }}
          >
            {CATEGORY_ICONS[cat] || '📦'} {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Skills Grid */}
      <div className="grid grid-cols-2 gap-3">
        {filteredSkills.map((skill) => (
          <div
            key={skill.id}
            className="p-3 rounded-lg border cursor-pointer transition-colors"
            style={{
              borderColor: selectedSkill?.id === skill.id ? 'var(--color-accent)' : 'var(--color-border-primary)',
              background: selectedSkill?.id === skill.id ? 'var(--color-accent-soft)' : 'var(--color-bg-secondary)',
            }}
            onClick={() => {
              setSelectedSkill(skill);
              // Initialize variable values with defaults
              const defaults: Record<string, unknown> = {};
              skill.variables.forEach((v) => {
                if (v.defaultValue !== undefined) defaults[v.name] = v.defaultValue;
              });
              setVariableValues(defaults);
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">{skill.icon || CATEGORY_ICONS[skill.category] || '📦'}</span>
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{skill.name}</div>
                <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{skill.category}</div>
              </div>
            </div>
            <div className="text-xs mt-2" style={{ color: 'var(--color-text-secondary)' }}>{skill.description}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
              {skill.steps.length} steps | {skill.tags.join(', ')}
            </div>
          </div>
        ))}
      </div>

      {/* Skill Detail & Execution Panel */}
      {selectedSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-xl border shadow-2xl w-full max-w-lg" style={{ background: 'var(--color-bg-elevated)', borderColor: 'var(--color-border-primary)' }}>
            <div className="p-4 border-b" style={{ borderColor: 'var(--color-border-secondary)' }}>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{selectedSkill.icon || '📦'}</span>
                <div>
                  <h3 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>{selectedSkill.name}</h3>
                  <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>v{selectedSkill.version} by {selectedSkill.author}</div>
                </div>
              </div>
            </div>
            <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
              <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{selectedSkill.description}</div>

              {/* Steps */}
              <div>
                <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-tertiary)' }}>Steps</div>
                <div className="space-y-1">
                  {selectedSkill.steps.map((step, i) => (
                    <div key={step.id} className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>{i + 1}</span>
                      {step.name}
                      <span className="text-xs px-1 rounded" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}>{step.type}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Variables */}
              {selectedSkill.variables.length > 0 && (
                <div>
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-tertiary)' }}>Variables</div>
                  <div className="space-y-2">
                    {selectedSkill.variables.map((v) => (
                      <div key={v.name}>
                        <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                          {v.name} {v.required && <span style={{ color: '#ef4444' }}>*</span>}
                        </label>
                        {v.type === 'select' && v.options ? (
                          <select
                            value={(variableValues[v.name] as string) || ''}
                            onChange={(e) => setVariableValues((prev) => ({ ...prev, [v.name]: e.target.value }))}
                            className="w-full px-2 py-1 rounded border text-xs mt-0.5"
                            style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
                          >
                            <option value="">Select...</option>
                            {v.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        ) : v.type === 'boolean' ? (
                          <input
                            type="checkbox"
                            checked={(variableValues[v.name] as boolean) || false}
                            onChange={(e) => setVariableValues((prev) => ({ ...prev, [v.name]: e.target.checked }))}
                            className="mt-1"
                          />
                        ) : (
                          <input
                            type="text"
                            value={(variableValues[v.name] as string) || ''}
                            onChange={(e) => setVariableValues((prev) => ({ ...prev, [v.name]: e.target.value }))}
                            placeholder={v.description}
                            className="w-full px-2 py-1 rounded border text-xs mt-0.5"
                            style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Required Extensions */}
              {selectedSkill.requiredExtensions.length > 0 && (
                <div>
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-tertiary)' }}>Required Extensions</div>
                  <div className="flex gap-1 flex-wrap">
                    {selectedSkill.requiredExtensions.map((ext) => (
                      <span key={ext} className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}>{ext}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t" style={{ borderColor: 'var(--color-border-secondary)' }}>
              <button
                onClick={() => { setSelectedSkill(null); setVariableValues({}); }}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleExecute}
                disabled={executing}
                className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: 'var(--color-accent)', color: 'white' }}
              >
                {executing ? 'Executing...' : 'Execute Skill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent Executions */}
      {executions.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>Recent Executions</h3>
          <div className="space-y-1">
            {executions.slice(0, 5).map((exec) => {
              const skill = skills.find((s) => s.id === exec.skillId);
              const statusColors: Record<string, string> = {
                completed: '#22c55e',
                failed: '#ef4444',
                running: '#eab308',
                pending: '#6b7280',
              };
              return (
                <div key={exec.id} className="flex items-center justify-between p-2 rounded-lg text-xs" style={{ background: 'var(--color-bg-secondary)' }}>
                  <div className="flex items-center gap-2">
                    <span style={{ color: statusColors[exec.status] || '#6b7280' }}>●</span>
                    <span style={{ color: 'var(--color-text-primary)' }}>{skill?.name || exec.skillId}</span>
                  </div>
                  <div style={{ color: 'var(--color-text-tertiary)' }}>
                    {new Date(exec.startedAt).toLocaleTimeString()} | Step {exec.currentStepIndex + 1}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default SkillsView;
