/**
 * OpenAgent-Desktop - Memory Management Dashboard
 *
 * React component for managing memories:
 * - Two sections: Core Memory | Experience Memory
 * - Core Memory: CRUD for each category (identity, preferences, skills, interests, notes)
 * - Experience Memory: timeline view of past sessions with summaries
 * - Search bar with semantic search (shows relevance scores)
 * - Memory stats, export/import, clear all
 * - Memory context string preview (what the agent sees)
 * - Auto-summarize toggle
 * - Dark theme with CSS variables
 */

import React, { useState, useCallback, useRef } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CoreMemoryItem {
  id: string;
  category: 'identity' | 'preferences' | 'skills' | 'interests' | 'notes';
  key: string;
  value: string;
  updatedAt: string;
  createdAt: string;
}

export interface ExperienceMemoryItem {
  id: string;
  sessionId: string;
  summary: string;
  keyTopics: string[];
  toolsUsed: string[];
  outcome: 'success' | 'partial' | 'failure';
  workingDirectory?: string;
  model?: string;
  createdAt: string;
}

export interface MemorySearchHit {
  id: string;
  type: 'core' | 'experience';
  score: number;
  matchedContent: string;
  memory: CoreMemoryItem | ExperienceMemoryItem;
}

interface MemoryDashboardProps {
  /** Core memories */
  coreMemories: CoreMemoryItem[];
  /** Experience memories */
  experiences: ExperienceMemoryItem[];
  /** Search results */
  searchResults: MemorySearchHit[];
  /** Whether a search is in progress */
  isSearching?: boolean;
  /** Memory stats */
  stats: {
    totalCoreMemories: number;
    totalExperiences: number;
    storageSizeBytes: number;
  };
  /** Preview of the context string the agent sees */
  contextStringPreview: string;
  /** Whether auto-summarize is enabled */
  autoSummarize: boolean;
  /** Callback: search */
  onSearch: (query: string) => void;
  /** Callback: add core memory */
  onAddCoreMemory: (category: CoreMemoryItem['category'], key: string, value: string) => void;
  /** Callback: update core memory */
  onUpdateCoreMemory: (id: string, value: string) => void;
  /** Callback: delete core memory */
  onDeleteCoreMemory: (id: string) => void;
  /** Callback: delete experience */
  onDeleteExperience: (id: string) => void;
  /** Callback: export memories */
  onExport: () => void;
  /** Callback: import memories */
  onImport: (data: string) => void;
  /** Callback: clear all memories */
  onClearAll: () => void;
  /** Callback: toggle auto-summarize */
  onToggleAutoSummarize: (enabled: boolean) => void;
}

// ─── Category Config ────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<
  CoreMemoryItem['category'],
  { label: string; icon: string; color: string; placeholder: string }
> = {
  identity: {
    label: 'Identity',
    icon: '👤',
    color: 'var(--color-accent)',
    placeholder: 'e.g. name: Alice, role: Developer',
  },
  preferences: {
    label: 'Preferences',
    icon: '⚙️',
    color: '#3b82f6',
    placeholder: 'e.g. language: TypeScript, editor: VS Code',
  },
  skills: {
    label: 'Skills',
    icon: '🛠️',
    color: '#22c55e',
    placeholder: 'e.g. frameworks: React, Node.js',
  },
  interests: {
    label: 'Interests',
    icon: '💡',
    color: '#f59e0b',
    placeholder: 'e.g. topics: AI, distributed systems',
  },
  notes: {
    label: 'Notes',
    icon: '📝',
    color: '#6b7280',
    placeholder: 'e.g. Always use strict TypeScript',
  },
};

const OUTCOME_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  success: { color: '#22c55e', label: 'Success', icon: '✓' },
  partial: { color: '#f59e0b', label: 'Partial', icon: '◐' },
  failure: { color: '#ef4444', label: 'Failure', icon: '✗' },
};

// ─── Main Component ─────────────────────────────────────────────────────────

const MemoryDashboard: React.FC<MemoryDashboardProps> = ({
  coreMemories,
  experiences,
  searchResults,
  isSearching = false,
  stats,
  contextStringPreview,
  autoSummarize,
  onSearch,
  onAddCoreMemory,
  onUpdateCoreMemory,
  onDeleteCoreMemory,
  onDeleteExperience,
  onExport,
  onImport,
  onClearAll,
  onToggleAutoSummarize,
}) => {
  const [activeTab, setActiveTab] = useState<'core' | 'experience' | 'search' | 'preview'>('core');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newMemoryCategory, setNewMemoryCategory] = useState<CoreMemoryItem['category']>('notes');
  const [newMemoryKey, setNewMemoryKey] = useState('');
  const [newMemoryValue, setNewMemoryValue] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [expandedExperience, setExpandedExperience] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSearch = useCallback(() => {
    if (searchQuery.trim()) {
      onSearch(searchQuery.trim());
      setActiveTab('search');
    }
  }, [searchQuery, onSearch]);

  const handleAddMemory = useCallback(() => {
    if (newMemoryKey.trim() && newMemoryValue.trim()) {
      onAddCoreMemory(newMemoryCategory, newMemoryKey.trim(), newMemoryValue.trim());
      setNewMemoryKey('');
      setNewMemoryValue('');
    }
  }, [newMemoryCategory, newMemoryKey, newMemoryValue, onAddCoreMemory]);

  const handleStartEdit = useCallback((id: string, currentValue: string) => {
    setEditingId(id);
    setEditValue(currentValue);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (editingId && editValue.trim()) {
      onUpdateCoreMemory(editingId, editValue.trim());
      setEditingId(null);
      setEditValue('');
    }
  }, [editingId, editValue, onUpdateCoreMemory]);

  const handleImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        if (text) onImport(text);
      };
      reader.readAsText(file);
    },
    [onImport]
  );

  const formatStorageSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatRelativeTime = (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

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
          <span className="text-sm">🧠</span>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Memory Dashboard
          </h3>
        </div>
        <div className="flex items-center gap-3">
          {/* Stats */}
          <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
            {stats.totalCoreMemories} core · {stats.totalExperiences} exp · {formatStorageSize(stats.storageSizeBytes)}
          </span>
        </div>
      </div>

      {/* Search bar */}
      <div
        className="px-4 py-2 border-b flex items-center gap-2"
        style={{ borderColor: 'var(--color-border-primary)' }}
      >
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search memories..."
          className="flex-1 bg-transparent text-xs outline-none"
          style={{ color: 'var(--color-text-primary)' }}
        />
        <button
          onClick={handleSearch}
          disabled={isSearching}
          className="px-2 py-1 rounded text-[10px] transition-colors"
          style={{
            background: 'var(--color-accent-soft)',
            color: 'var(--color-accent)',
          }}
        >
          {isSearching ? '...' : 'Search'}
        </button>
      </div>

      {/* Tab bar */}
      <div
        className="flex border-b"
        style={{ borderColor: 'var(--color-border-primary)' }}
      >
        {[
          { key: 'core' as const, label: 'Core Memory' },
          { key: 'experience' as const, label: 'Experience' },
          { key: 'search' as const, label: `Search${searchResults.length > 0 ? ` (${searchResults.length})` : ''}` },
          { key: 'preview' as const, label: 'Preview' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex-1 py-2 text-[10px] font-medium transition-colors"
            style={{
              color: activeTab === tab.key ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
              borderBottom: activeTab === tab.key ? '2px solid var(--color-accent)' : '2px solid transparent',
              background: activeTab === tab.key ? 'var(--color-accent-soft)' : 'transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4" style={{ maxHeight: '420px', overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'var(--color-border-primary) transparent' }}>
        {/* Core Memory Tab */}
        {activeTab === 'core' && (
          <div className="space-y-4 animate-fade-in">
            {/* Add new memory form */}
            <div
              className="p-3 rounded-lg space-y-2"
              style={{ background: 'var(--color-bg-tertiary)' }}
            >
              <div className="text-[10px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                Add Memory
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={newMemoryCategory}
                  onChange={(e) => setNewMemoryCategory(e.target.value as CoreMemoryItem['category'])}
                  className="rounded px-2 py-1 text-[10px] border-0 outline-none"
                  style={{
                    background: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>
                      {cfg.icon} {cfg.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newMemoryKey}
                  onChange={(e) => setNewMemoryKey(e.target.value)}
                  placeholder="Key"
                  className="flex-1 rounded px-2 py-1 text-[10px] border-0 outline-none"
                  style={{
                    background: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newMemoryValue}
                  onChange={(e) => setNewMemoryValue(e.target.value)}
                  placeholder={CATEGORY_CONFIG[newMemoryCategory].placeholder}
                  className="flex-1 rounded px-2 py-1 text-[10px] border-0 outline-none"
                  style={{
                    background: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-primary)',
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddMemory()}
                />
                <button
                  onClick={handleAddMemory}
                  disabled={!newMemoryKey.trim() || !newMemoryValue.trim()}
                  className="px-3 py-1 rounded text-[10px] font-medium transition-colors"
                  style={{
                    background:
                      newMemoryKey.trim() && newMemoryValue.trim()
                        ? 'var(--color-accent)'
                        : 'var(--color-bg-secondary)',
                    color:
                      newMemoryKey.trim() && newMemoryValue.trim()
                        ? '#fff'
                        : 'var(--color-text-tertiary)',
                  }}
                >
                  Add
                </button>
              </div>
            </div>

            {/* Memories by category */}
            {Object.entries(CATEGORY_CONFIG).map(([category, cfg]) => {
              const categoryMemories = coreMemories.filter((m) => m.category === category);
              if (categoryMemories.length === 0) return null;

              return (
                <div key={category}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-xs">{cfg.icon}</span>
                    <span className="text-[10px] font-semibold" style={{ color: cfg.color }}>
                      {cfg.label}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      ({categoryMemories.length})
                    </span>
                  </div>

                  <div className="space-y-1">
                    {categoryMemories.map((memory) => (
                      <div
                        key={memory.id}
                        className="flex items-start gap-2 p-2 rounded-lg group"
                        style={{ background: 'var(--color-bg-tertiary)' }}
                      >
                        {editingId === memory.id ? (
                          <div className="flex-1 flex items-center gap-2">
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="flex-1 bg-transparent text-[10px] outline-none"
                              style={{ color: 'var(--color-text-primary)' }}
                              onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                              autoFocus
                            />
                            <button
                              onClick={handleSaveEdit}
                              className="text-[9px] px-1.5 py-0.5 rounded"
                              style={{ background: 'var(--color-accent)', color: '#fff' }}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-[9px] px-1.5 py-0.5 rounded"
                              style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-tertiary)' }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] font-medium" style={{ color: 'var(--color-text-primary)' }}>
                                {memory.key}
                              </div>
                              <div className="text-[10px] truncate" style={{ color: 'var(--color-text-secondary)' }}>
                                {memory.value}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleStartEdit(memory.id, memory.value)}
                                className="text-[9px] px-1.5 py-0.5 rounded"
                                style={{ color: 'var(--color-text-tertiary)' }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => onDeleteCoreMemory(memory.id)}
                                className="text-[9px] px-1.5 py-0.5 rounded"
                                style={{ color: '#ef4444' }}
                              >
                                Del
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {coreMemories.length === 0 && (
              <div className="text-center py-6">
                <span className="text-2xl">📭</span>
                <div className="text-xs mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
                  No core memories yet. Add one above.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Experience Memory Tab */}
        {activeTab === 'experience' && (
          <div className="space-y-2 animate-fade-in">
            {experiences.map((exp) => {
              const outcomeCfg = OUTCOME_CONFIG[exp.outcome] || OUTCOME_CONFIG.partial;
              const isExpanded = expandedExperience === exp.id;

              return (
                <div
                  key={exp.id}
                  className="rounded-lg border overflow-hidden"
                  style={{ borderColor: 'var(--color-border-primary)' }}
                >
                  <div
                    className="flex items-center gap-3 p-3 cursor-pointer"
                    style={{ background: 'var(--color-bg-tertiary)' }}
                    onClick={() => setExpandedExperience(isExpanded ? null : exp.id)}
                  >
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center shrink-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ background: outcomeCfg.color }}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {exp.summary.slice(0, 80)}{exp.summary.length > 80 ? '...' : ''}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className="text-[9px] px-1 py-0.5 rounded font-medium"
                          style={{ background: outcomeCfg.color + '20', color: outcomeCfg.color }}
                        >
                          {outcomeCfg.icon} {outcomeCfg.label}
                        </span>
                        <span className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>
                          {formatRelativeTime(exp.createdAt)}
                        </span>
                      </div>
                    </div>

                    <span
                      className="text-[10px] transition-transform"
                      style={{
                        color: 'var(--color-text-tertiary)',
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)',
                      }}
                    >
                      ▸
                    </span>
                  </div>

                  {isExpanded && (
                    <div
                      className="p-3 border-t space-y-2 animate-fade-in"
                      style={{ borderColor: 'var(--color-border-primary)', background: 'var(--color-bg-secondary)' }}
                    >
                      <div className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                        {exp.summary}
                      </div>

                      {exp.keyTopics.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {exp.keyTopics.map((topic, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 rounded text-[9px]"
                              style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
                            >
                              {topic}
                            </span>
                          ))}
                        </div>
                      )}

                      {exp.toolsUsed.length > 0 && (
                        <div className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>
                          Tools: {exp.toolsUsed.join(', ')}
                        </div>
                      )}

                      {exp.model && (
                        <div className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>
                          Model: {exp.model}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>
                          {new Date(exp.createdAt).toLocaleString()}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteExperience(exp.id); }}
                          className="text-[9px] px-1.5 py-0.5 rounded"
                          style={{ color: '#ef4444' }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {experiences.length === 0 && (
              <div className="text-center py-6">
                <span className="text-2xl">📭</span>
                <div className="text-xs mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
                  No experience memories yet. They are created after sessions.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Search Results Tab */}
        {activeTab === 'search' && (
          <div className="space-y-2 animate-fade-in">
            {isSearching && (
              <div className="flex items-center justify-center py-6">
                <span className="animate-spin-slow inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full" style={{ color: 'var(--color-accent)' }} />
                <span className="ml-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  Searching...
                </span>
              </div>
            )}

            {!isSearching && searchResults.length === 0 && (
              <div className="text-center py-6">
                <span className="text-2xl">🔍</span>
                <div className="text-xs mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
                  {searchQuery ? 'No results found' : 'Enter a search query above'}
                </div>
              </div>
            )}

            {!isSearching &&
              searchResults.map((hit) => (
                <div
                  key={hit.id}
                  className="p-3 rounded-lg"
                  style={{ background: 'var(--color-bg-tertiary)' }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                      style={{
                        background: hit.type === 'core' ? 'rgba(214,122,82,0.15)' : 'rgba(34,197,94,0.15)',
                        color: hit.type === 'core' ? 'var(--color-accent)' : '#22c55e',
                      }}
                    >
                      {hit.type === 'core' ? 'Core' : 'Experience'}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>
                        Relevance
                      </span>
                      <span
                        className="text-[9px] font-mono font-semibold"
                        style={{
                          color:
                            hit.score >= 0.8
                              ? '#22c55e'
                              : hit.score >= 0.5
                              ? '#eab308'
                              : 'var(--color-text-tertiary)',
                        }}
                      >
                        {(hit.score * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                    {hit.matchedContent.slice(0, 200)}
                    {hit.matchedContent.length > 200 ? '...' : ''}
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Context Preview Tab */}
        {activeTab === 'preview' && (
          <div className="space-y-3 animate-fade-in">
            <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
              This is the memory context string that the agent sees:
            </div>
            <pre
              className="p-3 rounded-lg text-[10px] font-mono whitespace-pre-wrap max-h-60 overflow-y-auto"
              style={{
                background: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-secondary)',
                scrollbarWidth: 'thin',
                scrollbarColor: 'var(--color-border-primary) transparent',
              }}
            >
              {contextStringPreview || '(No memories loaded)'}
            </pre>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div
        className="px-4 py-3 border-t flex items-center justify-between"
        style={{ borderColor: 'var(--color-border-primary)' }}
      >
        <div className="flex items-center gap-2">
          {/* Auto-summarize toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoSummarize}
              onChange={(e) => onToggleAutoSummarize(e.target.checked)}
              className="rounded"
            />
            <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
              Auto-summarize
            </span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          {/* Import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-2 py-1 rounded text-[10px] transition-colors"
            style={{
              background: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-tertiary)',
              border: '1px solid var(--color-border-primary)',
            }}
          >
            Import
          </button>

          {/* Export */}
          <button
            onClick={onExport}
            className="px-2 py-1 rounded text-[10px] transition-colors"
            style={{
              background: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-tertiary)',
              border: '1px solid var(--color-border-primary)',
            }}
          >
            Export
          </button>

          {/* Clear all */}
          {showClearConfirm ? (
            <div className="flex items-center gap-1">
              <span className="text-[9px]" style={{ color: '#ef4444' }}>
                Sure?
              </span>
              <button
                onClick={() => {
                  onClearAll();
                  setShowClearConfirm(false);
                }}
                className="px-2 py-1 rounded text-[10px] font-medium"
                style={{ background: '#ef4444', color: '#fff' }}
              >
                Yes
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-2 py-1 rounded text-[10px]"
                style={{
                  background: 'var(--color-bg-tertiary)',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="px-2 py-1 rounded text-[10px] transition-colors"
              style={{
                background: 'rgba(239,68,68,0.1)',
                color: '#ef4444',
                border: '1px solid rgba(239,68,68,0.3)',
              }}
            >
              Clear All
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MemoryDashboard;
