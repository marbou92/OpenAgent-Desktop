/**
 * Trace Panel - OpenCowork Style
 *
 * Right panel showing execution trace, thinking steps, tool calls,
 * context usage, and memory information.
 * Tabbed: Trace | Context | Memory | Security
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { TraceEntry, CoreMemory, ExperienceMemory, ContextUsage, ProviderHealthSnapshot } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────────

type TraceTabId = 'trace' | 'context' | 'memory' | 'security';

interface TracePanelProps {
  /** Trace entries */
  traceEntries: TraceEntry[];
  /** Context window usage info */
  contextUsage?: ContextUsage | null;
  /** Core memories */
  coreMemories?: CoreMemory[];
  /** Experience memories */
  experiences?: ExperienceMemory[];
  /** Provider health snapshots */
  healthSnapshots?: ProviderHealthSnapshot[];
  /** Security scan results */
  securityAlerts?: SecurityAlert[];
  /** Compact context handler */
  onCompact?: () => void;
  /** Search experiences handler */
  onSearchExperiences?: (query: string) => void;
  /** Close/toggle handler */
  onToggle?: () => void;
}

interface SecurityAlert {
  id: string;
  type: 'injection' | 'permission' | 'blocked' | 'warning';
  message: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolved: boolean;
}

// ─── Trace Type Config ─────────────────────────────────────────────────────────────

const TRACE_TYPE_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  thinking: {
    color: 'var(--color-trace-thinking)',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    label: 'Thinking',
  },
  action: {
    color: 'var(--color-trace-action)',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    label: 'Action',
  },
  tool_call: {
    color: 'var(--color-trace-tool-call)',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
    label: 'Tool Call',
  },
  tool_result: {
    color: 'var(--color-trace-tool-result)',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
    label: 'Result',
  },
  error: {
    color: 'var(--color-trace-error)',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
    label: 'Error',
  },
  info: {
    color: 'var(--color-trace-info)',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
    label: 'Info',
  },
};

// ─── Security alert type config ────────────────────────────────────────────────────

const SECURITY_TYPE_CONFIG: Record<SecurityAlert['type'], { icon: string; color: string }> = {
  injection: { icon: '💉', color: 'var(--color-error)' },
  permission: { icon: '🛡️', color: 'var(--color-warning)' },
  blocked: { icon: '🚫', color: 'var(--color-error)' },
  warning: { icon: '⚠️', color: 'var(--color-warning)' },
};

const SEVERITY_COLORS: Record<SecurityAlert['severity'], string> = {
  low: 'var(--color-info)',
  medium: 'var(--color-warning)',
  high: '#f97316',
  critical: 'var(--color-error)',
};

// ─── Component ────────────────────────────────────────────────────────────────────

const TracePanel: React.FC<TracePanelProps> = ({
  traceEntries,
  contextUsage,
  coreMemories = [],
  experiences = [],
  healthSnapshots = [],
  securityAlerts = [],
  onCompact,
  onSearchExperiences,
  onToggle,
}) => {
  const [activeTab, setActiveTab] = useState<TraceTabId>('trace');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<string | null>(null);
  const [memorySearchQuery, setMemorySearchQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Filter trace entries ─────────────────────────────────────────────────

  const filteredEntries = useMemo(() => {
    let result = traceEntries;
    if (filterType) {
      result = result.filter((e) => e.type === filterType);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.content.toLowerCase().includes(query) ||
          e.type.toLowerCase().includes(query) ||
          (e.metadata && JSON.stringify(e.metadata).toLowerCase().includes(query)),
      );
    }
    return result;
  }, [traceEntries, searchQuery, filterType]);

  // ── Auto-scroll ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredEntries]);

  // ── Toggle entry expansion ───────────────────────────────────────────────

  const toggleExpanded = useCallback((entryId: string) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }, []);

  // ── Context percentage ───────────────────────────────────────────────────

  const contextPercent =
    contextUsage && contextUsage.maxTokens > 0
      ? contextUsage.usagePercent
      : 0;

  const getContextColor = (percent: number): string => {
    if (percent > 80) return 'var(--color-error)';
    if (percent > 60) return 'var(--color-warning)';
    return 'var(--color-success)';
  };

  // ── Tab definitions ──────────────────────────────────────────────────────

  const TABS: { id: TraceTabId; label: string; badge?: number }[] = [
    { id: 'trace', label: 'Trace', badge: traceEntries.length },
    { id: 'context', label: 'Context' },
    { id: 'memory', label: 'Memory', badge: coreMemories.length },
    { id: 'security', label: 'Security', badge: securityAlerts.filter((a) => !a.resolved).length },
  ];

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: 'var(--color-bg-primary)' }}
    >
      {/* Header with tabs */}
      <div
        className="flex items-center justify-between px-2 py-1.5 border-b"
        style={{ borderColor: 'var(--color-border-secondary)', background: 'var(--color-bg-secondary)' }}
      >
        <div className="flex items-center gap-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors"
              style={{
                background: activeTab === tab.id ? 'var(--color-bg-tertiary)' : 'transparent',
                color: activeTab === tab.id ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
              }}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className="text-[9px] px-1 py-0 rounded-full font-medium"
                  style={{
                    background: activeTab === tab.id ? 'var(--color-accent-soft)' : 'var(--color-bg-tertiary)',
                    color: activeTab === tab.id ? 'var(--color-accent)' : 'var(--color-text-muted)',
                    minWidth: '14px',
                    textAlign: 'center' as const,
                  }}
                >
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
        {onToggle && (
          <button
            onClick={onToggle}
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
            aria-label="Close trace panel"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {/* ─── Trace Tab ───────────────────────────────────────────────────── */}
        {activeTab === 'trace' && (
          <div className="flex flex-col h-full">
            {/* Search and filter bar */}
            <div
              className="px-3 py-2 border-b space-y-2"
              style={{ borderColor: 'var(--color-border-secondary)' }}
            >
              <div
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
                style={{ background: 'var(--color-bg-tertiary)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search traces..."
                  className="flex-1 bg-transparent text-xs outline-none"
                  style={{ color: 'var(--color-text-primary)' }}
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(TRACE_TYPE_CONFIG).map(([type, config]) => (
                  <button
                    key={type}
                    onClick={() => setFilterType(filterType === type ? null : type)}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors"
                    style={{
                      background: filterType === type ? `${config.color}20` : 'transparent',
                      color: filterType === type ? config.color : 'var(--color-text-tertiary)',
                      border: filterType === type ? `1px solid ${config.color}40` : '1px solid transparent',
                    }}
                  >
                    {config.icon}
                    <span>{config.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Trace entries */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              {filteredEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                    No trace entries yet
                  </p>
                </div>
              ) : (
                <div>
                  {filteredEntries.map((entry) => {
                    const config = TRACE_TYPE_CONFIG[entry.type] || TRACE_TYPE_CONFIG.info;
                    const isExpanded = expandedEntries.has(entry.id);
                    const isLongContent = entry.content.length > 150;

                    return (
                      <div
                        key={entry.id}
                        className="px-3 py-2 cursor-pointer transition-colors"
                        style={{
                          borderLeft: `3px solid ${config.color}`,
                          background: isExpanded ? `${config.color}08` : 'transparent',
                        }}
                        onClick={() => toggleExpanded(entry.id)}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-shrink-0 mt-0.5" style={{ color: config.color }}>
                            {config.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-medium" style={{ color: config.color }}>
                                {config.label}
                              </span>
                              <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                                {new Date(entry.timestamp).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </span>
                            </div>
                            <p
                              className="text-[11px] mt-0.5 break-words"
                              style={{
                                color: 'var(--color-text-secondary)',
                                display: !isExpanded && isLongContent ? '-webkit-box' : 'block',
                                WebkitLineClamp: !isExpanded && isLongContent ? 2 : undefined,
                                WebkitBoxOrient: !isExpanded && isLongContent ? 'vertical' as const : undefined,
                                overflow: !isExpanded && isLongContent ? 'hidden' : undefined,
                              }}
                            >
                              {entry.content}
                            </p>
                            {isExpanded && entry.metadata && Object.keys(entry.metadata).length > 0 && (
                              <pre
                                className="mt-1.5 p-2 rounded text-[10px] overflow-auto max-h-32 animate-fade-in"
                                style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-tertiary)' }}
                              >
                                {JSON.stringify(entry.metadata, null, 2)}
                              </pre>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Context Tab ─────────────────────────────────────────────────── */}
        {activeTab === 'context' && (
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {/* Context window usage */}
            <CollapsibleSection title="Context Window" defaultOpen>
              {contextUsage ? (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Usage</span>
                      <span className="text-xs font-mono" style={{ color: getContextColor(contextPercent) }}>
                        {contextUsage.totalTokens.toLocaleString()} / {contextUsage.maxTokens.toLocaleString()}
                      </span>
                    </div>
                    <div
                      className="w-full h-2.5 rounded-full overflow-hidden"
                      style={{ background: 'var(--color-bg-tertiary)' }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(contextPercent, 100)}%`,
                          background: getContextColor(contextPercent),
                        }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        {Math.round(contextPercent)}% used
                      </span>
                      <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        {(contextUsage.maxTokens - contextUsage.totalTokens).toLocaleString()} remaining
                      </span>
                    </div>
                  </div>

                  {/* Token breakdown */}
                  <div
                    className="p-2.5 rounded-lg space-y-1.5"
                    style={{ background: 'var(--color-bg-secondary)' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Prompt tokens</span>
                      <span className="text-xs font-mono" style={{ color: 'var(--color-text-primary)' }}>
                        {contextUsage.promptTokens.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Completion tokens</span>
                      <span className="text-xs font-mono" style={{ color: 'var(--color-text-primary)' }}>
                        {contextUsage.completionTokens.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Compact button */}
                  {contextUsage.canCompact && onCompact && (
                    <button
                      onClick={onCompact}
                      className="w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                      style={{
                        background: 'var(--color-accent-soft)',
                        color: 'var(--color-accent)',
                        border: '1px solid var(--color-accent)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--color-accent)';
                        e.currentTarget.style.color = 'white';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--color-accent-soft)';
                        e.currentTarget.style.color = 'var(--color-accent)';
                      }}
                    >
                      Compact Context
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>No context data available</p>
                </div>
              )}
            </CollapsibleSection>

            {/* Message count */}
            <CollapsibleSection title="Messages" defaultOpen>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-2 py-1 rounded" style={{ background: 'var(--color-bg-secondary)' }}>
                  <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Total messages</span>
                  <span className="text-xs font-mono" style={{ color: 'var(--color-text-primary)' }}>
                    —
                  </span>
                </div>
                <div className="flex items-center justify-between px-2 py-1 rounded" style={{ background: 'var(--color-bg-secondary)' }}>
                  <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>User messages</span>
                  <span className="text-xs font-mono" style={{ color: 'var(--color-text-primary)' }}>
                    —
                  </span>
                </div>
                <div className="flex items-center justify-between px-2 py-1 rounded" style={{ background: 'var(--color-bg-secondary)' }}>
                  <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Assistant messages</span>
                  <span className="text-xs font-mono" style={{ color: 'var(--color-text-primary)' }}>
                    —
                  </span>
                </div>
              </div>
            </CollapsibleSection>
          </div>
        )}

        {/* ─── Memory Tab ─────────────────────────────────────────────────── */}
        {activeTab === 'memory' && (
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {/* Search experiences */}
            <div
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
              style={{ background: 'var(--color-bg-tertiary)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={memorySearchQuery}
                onChange={(e) => {
                  setMemorySearchQuery(e.target.value);
                  onSearchExperiences?.(e.target.value);
                }}
                placeholder="Search memories..."
                className="flex-1 bg-transparent text-xs outline-none"
                style={{ color: 'var(--color-text-primary)' }}
              />
            </div>

            {/* Core memories */}
            <CollapsibleSection title={`Core Memories (${coreMemories.length})`} defaultOpen>
              {coreMemories.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>No core memories</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {coreMemories.map((memory) => (
                    <div
                      key={memory.id}
                      className="px-2.5 py-2 rounded-lg"
                      style={{ background: 'var(--color-bg-secondary)' }}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span
                          className="text-[9px] px-1 py-0.5 rounded font-medium uppercase"
                          style={{
                            background: 'var(--color-accent-soft)',
                            color: 'var(--color-accent)',
                          }}
                        >
                          {memory.category}
                        </span>
                        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                          {memory.key}
                        </span>
                      </div>
                      <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                        {memory.value}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleSection>

            {/* Recent experiences */}
            <CollapsibleSection title={`Recent Experiences (${experiences.length})`} defaultOpen={false}>
              {experiences.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>No recent experiences</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {experiences.slice(0, 10).map((exp) => (
                    <div
                      key={exp.id}
                      className="px-2.5 py-2 rounded-lg"
                      style={{ background: 'var(--color-bg-secondary)' }}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span
                          className="text-[9px] px-1 py-0.5 rounded font-medium"
                          style={{
                            background: exp.outcome === 'success' ? 'rgba(34,197,94,0.1)' : exp.outcome === 'failure' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                            color: exp.outcome === 'success' ? 'var(--color-success)' : exp.outcome === 'failure' ? 'var(--color-error)' : 'var(--color-warning)',
                          }}
                        >
                          {exp.outcome}
                        </span>
                        {exp.model && (
                          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                            {exp.model}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] line-clamp-2" style={{ color: 'var(--color-text-secondary)' }}>
                        {exp.summary}
                      </p>
                      {exp.keyTopics.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {exp.keyTopics.slice(0, 3).map((topic, i) => (
                            <span
                              key={i}
                              className="text-[9px] px-1 py-0.5 rounded"
                              style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}
                            >
                              {topic}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleSection>
          </div>
        )}

        {/* ─── Security Tab ───────────────────────────────────────────────── */}
        {activeTab === 'security' && (
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {/* Risk overview */}
            <CollapsibleSection title="Security Overview" defaultOpen>
              <div className="grid grid-cols-2 gap-2">
                <div
                  className="p-2.5 rounded-lg text-center"
                  style={{ background: 'var(--color-bg-secondary)' }}
                >
                  <div className="text-lg font-bold" style={{ color: 'var(--color-error)' }}>
                    {securityAlerts.filter((a) => !a.resolved).length}
                  </div>
                  <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>Active Alerts</div>
                </div>
                <div
                  className="p-2.5 rounded-lg text-center"
                  style={{ background: 'var(--color-bg-secondary)' }}
                >
                  <div className="text-lg font-bold" style={{ color: 'var(--color-success)' }}>
                    {securityAlerts.filter((a) => a.resolved).length}
                  </div>
                  <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>Resolved</div>
                </div>
              </div>
            </CollapsibleSection>

            {/* Security alerts */}
            <CollapsibleSection title="Alerts" defaultOpen>
              {securityAlerts.length === 0 ? (
                <div className="text-center py-6">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2"
                    style={{ background: 'rgba(34,197,94,0.1)' }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <polyline points="9 12 12 15 16 10" />
                    </svg>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    No security issues detected
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {securityAlerts.map((alert) => {
                    const typeConfig = SECURITY_TYPE_CONFIG[alert.type];
                    return (
                      <div
                        key={alert.id}
                        className="px-2.5 py-2 rounded-lg"
                        style={{
                          background: 'var(--color-bg-secondary)',
                          borderLeft: `3px solid ${SEVERITY_COLORS[alert.severity]}`,
                          opacity: alert.resolved ? 0.5 : 1,
                        }}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs">{typeConfig.icon}</span>
                          <span
                            className="text-[9px] px-1 py-0.5 rounded font-medium uppercase"
                            style={{
                              background: `${SEVERITY_COLORS[alert.severity]}18`,
                              color: SEVERITY_COLORS[alert.severity],
                            }}
                          >
                            {alert.severity}
                          </span>
                          {alert.resolved && (
                            <span
                              className="text-[9px] px-1 py-0.5 rounded font-medium"
                              style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--color-success)' }}
                            >
                              Resolved
                            </span>
                          )}
                        </div>
                        <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                          {alert.message}
                        </p>
                        <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                          {new Date(alert.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CollapsibleSection>

            {/* Blocked attempts */}
            <CollapsibleSection title="Blocked Attempts" defaultOpen={false}>
              <div className="space-y-1.5">
                {securityAlerts
                  .filter((a) => a.type === 'blocked')
                  .map((alert) => (
                    <div
                      key={alert.id}
                      className="px-2 py-1.5 rounded text-xs flex items-center gap-2"
                      style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)' }}
                    >
                      <span>🚫</span>
                      <span className="truncate">{alert.message}</span>
                    </div>
                  ))}
                {securityAlerts.filter((a) => a.type === 'blocked').length === 0 && (
                  <p className="text-xs text-center py-3" style={{ color: 'var(--color-text-tertiary)' }}>
                    No blocked attempts
                  </p>
                )}
              </div>
            </CollapsibleSection>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Collapsible Section ──────────────────────────────────────────────────────────

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  defaultOpen = true,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 w-full text-left mb-2"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-text-tertiary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
          {title}
        </span>
      </button>
      {isOpen && children}
    </div>
  );
};

export default TracePanel;
