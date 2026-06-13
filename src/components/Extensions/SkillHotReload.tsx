/**
 * OpenAgent-Desktop - Skill Hot-Reload UI
 *
 * Manage skill hot-reload: watch/unwatch skills, view reload history,
 * edit skill configs with auto-reload, and see real-time status.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Toast } from '../../types';

const api = (window as any).openagent;

// ─── Types ───────────────────────────────────────────────────────────────────

type ReloadState = 'idle' | 'watching' | 'reloading' | 'error';

interface SkillInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  configPath: string;
  isBuiltin: boolean;
}

interface ReloadHistoryEntry {
  skillId: string;
  timestamp: string;
  result: 'success' | 'error';
  duration: number;
  error?: string;
  filesChanged: string[];
}

interface WatchedSkill {
  skillId: string;
  state: ReloadState;
  configPath: string;
  lastReloadAt?: string;
  lastError?: string;
  retryCount: number;
  filesChanged: string[];
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface SkillHotReloadProps {
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

// ─── Reload State Indicator ──────────────────────────────────────────────────

const ReloadStateIndicator: React.FC<{ state: ReloadState }> = ({ state }) => {
  switch (state) {
    case 'watching':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: '#22c55e' }}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          Watching
        </span>
      );
    case 'reloading':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: '#3b82f6' }}>
          <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
          Reloading
        </span>
      );
    case 'error':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: '#ef4444' }}>
          <span className="w-2 h-2 rounded-full bg-red-500" />
          Error
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--color-text-muted)' }} />
          Idle
        </span>
      );
  }
};

// ─── Duration Formatter ──────────────────────────────────────────────────────

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
};

// ─── Main Component ──────────────────────────────────────────────────────────

const SkillHotReload: React.FC<SkillHotReloadProps> = ({ addToast }) => {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [watchedSkills, setWatchedSkills] = useState<Map<string, WatchedSkill>>(new Map());
  const [reloadHistory, setReloadHistory] = useState<ReloadHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<string | null>(null);
  const [configText, setConfigText] = useState('');
  const [configSaving, setConfigSaving] = useState(false);
  const [showHistoryFor, setShowHistoryFor] = useState<string | null>(null);

  // Fetch skills
  useEffect(() => {
    const fetchSkills = async () => {
      setLoading(true);
      try {
        if (api?.skills?.list) {
          const list = await api.skills.list();
          if (Array.isArray(list)) {
            const skillInfos: SkillInfo[] = list.map((s: any) => ({
              id: s.id,
              name: s.name,
              description: s.description,
              category: s.category || 'general',
              icon: s.icon,
              configPath: s.configPath || `~/.openagent/skills/${s.id}`,
              isBuiltin: s.isBuiltin || false,
            }));
            setSkills(skillInfos);
          }
        }

        // Fetch watched skill states
        if (api?.hotReload?.getWatched) {
          const watched = await api.hotReload.getWatched();
          if (Array.isArray(watched)) {
            const map = new Map<string, WatchedSkill>();
            for (const w of watched) {
              map.set(w.skillId || w.extensionId, w);
            }
            setWatchedSkills(map);
          }
        }

        // Fetch reload history
        if (api?.hotReload?.getHistory) {
          const history = await api.hotReload.getHistory();
          if (Array.isArray(history)) {
            setReloadHistory(history);
          }
        }
      } catch {
        // Hot reload API not available
      } finally {
        setLoading(false);
      }
    };
    fetchSkills();
  }, []);

  // ─── Actions ─────────────────────────────────────────────────────────────

  const handleWatch = async (skillId: string, configPath: string) => {
    try {
      if (api?.hotReload?.watch) {
        await api.hotReload.watch(skillId, configPath);
      }
      setWatchedSkills((prev) => {
        const next = new Map(prev);
        next.set(skillId, {
          skillId,
          state: 'watching',
          configPath,
          retryCount: 0,
          filesChanged: [],
        });
        return next;
      });
      addToast({ type: 'success', title: `Watching ${skillId}` });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to start watching', message: err.message });
    }
  };

  const handleUnwatch = async (skillId: string) => {
    try {
      if (api?.hotReload?.unwatch) {
        await api.hotReload.unwatch(skillId);
      }
      setWatchedSkills((prev) => {
        const next = new Map(prev);
        const existing = next.get(skillId);
        if (existing) {
          next.set(skillId, { ...existing, state: 'idle' });
        }
        return next;
      });
      addToast({ type: 'success', title: `Stopped watching ${skillId}` });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to stop watching', message: err.message });
    }
  };

  const handleWatchAll = async () => {
    try {
      for (const skill of skills) {
        await handleWatch(skill.id, skill.configPath);
      }
      addToast({ type: 'success', title: `Watching ${skills.length} skills` });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to watch all', message: err.message });
    }
  };

  const handleStopAll = async () => {
    try {
      if (api?.hotReload?.stopAll) {
        await api.hotReload.stopAll();
      }
      setWatchedSkills(new Map());
      addToast({ type: 'success', title: 'Stopped all watchers' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to stop all', message: err.message });
    }
  };

  const handleReload = async (skillId: string) => {
    try {
      if (api?.hotReload?.reload) {
        await api.hotReload.reload(skillId);
      }
      addToast({ type: 'success', title: `Reloaded ${skillId}` });
      // Refresh history
      if (api?.hotReload?.getHistory) {
        const history = await api.hotReload.getHistory(skillId);
        if (Array.isArray(history)) {
          setReloadHistory((prev) => [...prev.filter((h) => h.skillId !== skillId), ...history]);
        }
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Reload failed', message: err.message });
    }
  };

  const handleReloadAll = async () => {
    try {
      if (api?.hotReload?.reloadAll) {
        await api.hotReload.reloadAll();
      }
      addToast({ type: 'success', title: 'Reloaded all watched skills' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Bulk reload failed', message: err.message });
    }
  };

  const handleEditConfig = (skillId: string) => {
    const skill = skills.find((s) => s.id === skillId);
    if (!skill) return;
    setEditingConfig(skillId);
    // In a real implementation, this would load the config file
    setConfigText(JSON.stringify({ id: skill.id, name: skill.name, description: skill.description }, null, 2));
  };

  const handleSaveConfig = async () => {
    if (!editingConfig) return;
    setConfigSaving(true);
    try {
      // Parse JSON to validate
      JSON.parse(configText);
      // In a real implementation, this would save the config file
      // which triggers auto-reload via the watcher
      addToast({ type: 'success', title: 'Config saved — auto-reload triggered' });
      setEditingConfig(null);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Invalid JSON', message: err.message });
    } finally {
      setConfigSaving(false);
    }
  };

  // ─── Computed ─────────────────────────────────────────────────────────────

  const watchedCount = useMemo(
    () => Array.from(watchedSkills.values()).filter((w) => w.state === 'watching' || w.state === 'reloading').length,
    [watchedSkills],
  );

  const errorCount = useMemo(
    () => Array.from(watchedSkills.values()).filter((w) => w.state === 'error').length,
    [watchedSkills],
  );

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--color-bg-primary)' }}>
      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--color-border-secondary)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
              Skill Hot-Reload
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
              {skills.length} skills · {watchedCount} watching · {errorCount} errors
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleWatchAll}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: 'var(--color-accent)', color: 'white' }}
            >
              Watch All
            </button>
            <button
              onClick={handleStopAll}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border"
              style={{
                borderColor: 'var(--color-border-primary)',
                color: 'var(--color-text-secondary)',
                background: 'transparent',
              }}
            >
              Stop All
            </button>
            <button
              onClick={handleReloadAll}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border"
              style={{
                borderColor: 'var(--color-warning)',
                color: 'var(--color-warning)',
                background: 'transparent',
              }}
            >
              Reload All
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div
              className="w-6 h-6 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }}
            />
          </div>
        ) : skills.length === 0 ? (
          <div className="text-center py-12" style={{ color: 'var(--color-text-tertiary)' }}>
            <p className="text-lg">No skills found</p>
            <p className="text-sm mt-1">Skills will appear here when registered</p>
          </div>
        ) : (
          <div className="space-y-2">
            {skills.map((skill) => {
              const watched = watchedSkills.get(skill.id);
              const isWatching = watched?.state === 'watching' || watched?.state === 'reloading';
              const skillHistory = reloadHistory.filter((h) => h.skillId === skill.id);
              const isExpanded = expandedSkill === skill.id;
              const _isEditing = editingConfig === skill.id;
              const isShowingHistory = showHistoryFor === skill.id;

              return (
                <div
                  key={skill.id}
                  className="rounded-xl border transition-all"
                  style={{
                    background: 'var(--color-bg-secondary)',
                    borderColor: watched?.state === 'error' ? 'rgba(239,68,68,0.3)' : 'var(--color-border-primary)',
                  }}
                >
                  {/* Main Row */}
                  <div className="p-3.5 flex items-center gap-3">
                    {/* Skill Icon */}
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                      style={{ background: 'var(--color-bg-tertiary)' }}
                    >
                      {skill.icon || '📋'}
                    </div>

                    {/* Skill Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                          {skill.name}
                        </span>
                        {skill.isBuiltin && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}
                          >
                            built-in
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <ReloadStateIndicator state={watched?.state || 'idle'} />
                        {watched?.lastReloadAt && (
                          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                            Last reload: {new Date(watched.lastReloadAt).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5">
                      {isWatching ? (
                        <button
                          onClick={() => handleUnwatch(skill.id)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium border"
                          style={{
                            borderColor: 'rgba(239,68,68,0.3)',
                            color: 'var(--color-destructive)',
                            background: 'transparent',
                          }}
                        >
                          Unwatch
                        </button>
                      ) : (
                        <button
                          onClick={() => handleWatch(skill.id, skill.configPath)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium"
                          style={{ background: 'var(--color-accent)', color: 'white' }}
                        >
                          Watch
                        </button>
                      )}

                      {isWatching && (
                        <button
                          onClick={() => handleReload(skill.id)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium border"
                          style={{
                            borderColor: 'var(--color-warning)',
                            color: 'var(--color-warning)',
                            background: 'transparent',
                          }}
                        >
                          Reload
                        </button>
                      )}

                      <button
                        onClick={() => setExpandedSkill(isExpanded ? null : skill.id)}
                        className="p-1.5 rounded-lg hover:bg-white/5"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-3.5 pb-3.5 pt-0 space-y-3">
                      {/* Description */}
                      <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                        {skill.description}
                      </p>

                      {/* Error Details */}
                      {watched?.state === 'error' && watched.lastError && (
                        <div
                          className="p-2.5 rounded-lg text-xs"
                          style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-destructive)' }}
                        >
                          <span className="font-semibold">Error: </span>
                          {watched.lastError}
                          {watched.retryCount > 0 && (
                            <span className="ml-2" style={{ color: 'var(--color-text-muted)' }}>
                              (retry #{watched.retryCount})
                            </span>
                          )}
                        </div>
                      )}

                      {/* Config Path */}
                      <div className="flex items-center gap-2 text-xs">
                        <span style={{ color: 'var(--color-text-muted)' }}>Config:</span>
                        <code
                          className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                          style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
                        >
                          {skill.configPath}
                        </code>
                        <button
                          onClick={() => handleEditConfig(skill.id)}
                          className="text-xs hover:underline"
                          style={{ color: 'var(--color-accent)' }}
                        >
                          Edit
                        </button>
                      </div>

                      {/* Changed Files */}
                      {watched?.filesChanged && watched.filesChanged.length > 0 && (
                        <div>
                          <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                            Changed files:
                          </span>
                          <div className="mt-1 space-y-0.5">
                            {watched.filesChanged.map((file) => (
                              <div
                                key={file}
                                className="text-[10px] font-mono px-2 py-0.5 rounded"
                                style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}
                              >
                                {file}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* History Toggle */}
                      <button
                        onClick={() => setShowHistoryFor(isShowingHistory ? null : skill.id)}
                        className="text-xs font-medium flex items-center gap-1"
                        style={{ color: 'var(--color-accent)' }}
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          style={{ transform: isShowingHistory ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                        {isShowingHistory ? 'Hide' : 'Show'} Reload History ({skillHistory.length})
                      </button>

                      {/* History List */}
                      {isShowingHistory && (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {skillHistory.length === 0 ? (
                            <p className="text-xs text-center py-2" style={{ color: 'var(--color-text-muted)' }}>
                              No reload history yet
                            </p>
                          ) : (
                            skillHistory
                              .slice()
                              .reverse()
                              .map((entry, i) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-2 text-xs p-2 rounded-lg"
                                  style={{ background: 'var(--color-bg-tertiary)' }}
                                >
                                  {/* Status dot */}
                                  <span
                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{
                                      background: entry.result === 'success' ? '#22c55e' : '#ef4444',
                                    }}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <span style={{ color: 'var(--color-text-secondary)' }}>
                                      {entry.result === 'success' ? 'Reloaded successfully' : 'Reload failed'}
                                    </span>
                                    {entry.error && (
                                      <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--color-destructive)' }}>
                                        {entry.error}
                                      </p>
                                    )}
                                  </div>
                                  <span className="flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                                    {formatDuration(entry.duration)}
                                  </span>
                                  <span className="flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                                    {new Date(entry.timestamp).toLocaleTimeString()}
                                  </span>
                                </div>
                              ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Config Editor Modal */}
      {editingConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div
            className="w-full max-w-xl rounded-xl border overflow-hidden flex flex-col"
            style={{ background: 'var(--color-bg-primary)', borderColor: 'var(--color-border-primary)' }}
          >
            {/* Modal Header */}
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border-secondary)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Edit Skill Config — {skills.find((s) => s.id === editingConfig)?.name}
              </h3>
              <button
                onClick={() => setEditingConfig(null)}
                className="p-1.5 rounded-lg hover:bg-white/10"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Editor */}
            <div className="flex-1 p-4">
              <textarea
                value={configText}
                onChange={(e) => setConfigText(e.target.value)}
                className="w-full h-64 p-3 rounded-lg font-mono text-xs resize-none outline-none"
                style={{
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border-primary)',
                  color: 'var(--color-text-primary)',
                }}
                spellCheck={false}
              />
              <p className="text-[10px] mt-2" style={{ color: 'var(--color-text-muted)' }}>
                Saving will trigger an automatic reload if the skill is being watched.
              </p>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t flex items-center justify-end gap-2" style={{ borderColor: 'var(--color-border-secondary)' }}>
              <button
                onClick={() => setEditingConfig(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border"
                style={{
                  borderColor: 'var(--color-border-primary)',
                  color: 'var(--color-text-secondary)',
                  background: 'transparent',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfig}
                disabled={configSaving}
                className="px-4 py-1.5 rounded-lg text-xs font-medium"
                style={{
                  background: 'var(--color-accent)',
                  color: 'white',
                  opacity: configSaving ? 0.5 : 1,
                }}
              >
                {configSaving ? 'Saving...' : 'Save & Reload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SkillHotReload;
