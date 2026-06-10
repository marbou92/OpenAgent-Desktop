/**
 * OpenAgent Desktop - Thinking Trace Panel
 *
 * Collapsible side panel showing real-time streaming of thinking steps,
 * color-coded by type, with timestamps, expand/collapse, search,
 * and export as markdown functionality.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { TraceEntry } from '../../types';

interface ThinkingTraceProps {
  entries: TraceEntry[];
  onClose: () => void;
}

const TRACE_TYPE_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  thinking: {
    color: 'var(--color-trace-thinking)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    label: 'Action',
  },
  tool_call: {
    color: 'var(--color-trace-tool-call)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
    label: 'Tool Call',
  },
  tool_result: {
    color: 'var(--color-trace-tool-result)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
    label: 'Tool Result',
  },
  error: {
    color: 'var(--color-trace-error)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
    label: 'Info',
  },
};

const ThinkingTrace: React.FC<ThinkingTraceProps> = ({ entries, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    let result = entries;

    if (filterType) {
      result = result.filter((e) => e.type === filterType);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.content.toLowerCase().includes(query) ||
          e.type.toLowerCase().includes(query) ||
          (e.metadata && JSON.stringify(e.metadata).toLowerCase().includes(query))
      );
    }

    return result;
  }, [entries, searchQuery, filterType]);

  const toggleExpanded = useCallback((entryId: string) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedEntries(new Set(entries.map((e) => e.id)));
  }, [entries]);

  const collapseAll = useCallback(() => {
    setExpandedEntries(new Set());
  }, []);

  const exportAsMarkdown = useCallback(() => {
    const lines: string[] = [
      '# Thinking Trace',
      '',
      `**Exported at**: ${new Date().toISOString()}`,
      `**Total entries**: ${entries.length}`,
      '',
      '---',
      '',
    ];

    for (const entry of entries) {
      const config = TRACE_TYPE_CONFIG[entry.type] || TRACE_TYPE_CONFIG.info;
      const timestamp = new Date(entry.timestamp).toLocaleTimeString();

      lines.push(`## [${config.label}] ${timestamp}`);
      lines.push('');
      lines.push(entry.content);
      lines.push('');

      if (entry.metadata && Object.keys(entry.metadata).length > 0) {
        lines.push('**Metadata**:');
        lines.push('```json');
        lines.push(JSON.stringify(entry.metadata, null, 2));
        lines.push('```');
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    }

    const markdown = lines.join('\n');
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trace-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [entries]);

  const formatTime = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return '';
    }
  };

  return (
    <div
      className="w-96 border-l flex flex-col h-full"
      style={{
        background: 'var(--color-bg-secondary)',
        borderColor: 'var(--color-border-secondary)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'var(--color-border-secondary)' }}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Trace
          </h2>
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}>
            {filteredEntries.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={expandAll}
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
            title="Expand all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
          <button
            onClick={collapseAll}
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
            title="Collapse all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
          <button
            onClick={exportAsMarkdown}
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
            title="Export as markdown"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          <button
            onClick={onClose}
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
        </div>
      </div>

      {/* Search & Filter */}
      <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--color-border-secondary)' }}>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'var(--color-bg-tertiary)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {Object.entries(TRACE_TYPE_CONFIG).map(([type, config]) => (
            <button
              key={type}
              onClick={() => setFilterType(filterType === type ? null : type)}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors"
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

      {/* Trace Entries */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <p className="text-sm mt-2" style={{ color: 'var(--color-text-muted)' }}>
              No trace entries yet
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              Send a message to see trace activity
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--color-border-secondary)' }}>
            {filteredEntries.map((entry) => {
              const config = TRACE_TYPE_CONFIG[entry.type] || TRACE_TYPE_CONFIG.info;
              const isExpanded = expandedEntries.has(entry.id);
              const isLongContent = entry.content.length > 200;

              return (
                <div
                  key={entry.id}
                  className="px-3 py-2.5"
                  style={{ borderLeft: `3px solid ${config.color}` }}
                >
                  <button
                    onClick={() => toggleExpanded(entry.id)}
                    className="w-full flex items-start gap-2 text-left"
                  >
                    <div className="flex-shrink-0 mt-0.5" style={{ color: config.color }}>
                      {config.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium" style={{ color: config.color }}>
                          {config.label}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {formatTime(entry.timestamp)}
                        </span>
                      </div>
                      <p
                        className="text-xs mt-0.5 break-words"
                        style={{
                          color: 'var(--color-text-secondary)',
                          display: !isExpanded && isLongContent ? '-webkit-box' : 'block',
                          WebkitLineClamp: !isExpanded && isLongContent ? 2 : undefined,
                          WebkitBoxOrient: !isExpanded && isLongContent ? 'vertical' : undefined,
                          overflow: !isExpanded && isLongContent ? 'hidden' : undefined,
                        }}
                      >
                        {entry.content}
                      </p>
                      {isExpanded && entry.metadata && Object.keys(entry.metadata).length > 0 && (
                        <pre
                          className="mt-1.5 p-2 rounded text-xs overflow-auto max-h-32 animate-fade-in"
                          style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-tertiary)' }}
                        >
                          {JSON.stringify(entry.metadata, null, 2)}
                        </pre>
                      )}
                    </div>
                    {isLongContent && (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--color-text-muted)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease', flexShrink: 0, marginTop: 4 }}
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ThinkingTrace;
