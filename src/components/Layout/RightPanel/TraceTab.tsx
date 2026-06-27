/**
 * OpenAgent-Desktop - Trace Tab (Phase 3.1 Redesign)
 *
 * Redesigned agent trace with a collapsible TREE view instead of the old
 * flat list. Entries are grouped into "steps" (each step = one LLM call +
 * its tool calls + results), making it easy to follow the agent's reasoning.
 *
 *   ▸ Step 1 — 14:32                    [3 tool calls]
 *     │ 💭 Thinking: "I need to read the file..."
 *     │ ⚙ bash  ✓ completed
 *     │   $ npm run build
 *     │   → Build succeeded in 2.3s
 *     │ 📝 Text: "The build passed. Here's..."
 *   ▸ Step 2 — 14:33
 *
 * Features:
 *   - Step grouping (entries between 'step-finish' events)
 *   - Expand/collapse per step
 *   - Tool call status icons (pending spinner / completed check / failed X)
 *   - Metadata preview (inline, not a separate pre block)
 *   - Search + type filter (kept from the old design)
 *   - Export as markdown (kept from the old design)
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { TraceEntry } from '../../../types';

interface TraceTabProps {
  entries: TraceEntry[];
}

const TYPE_CONFIG: Record<string, { color: string; iconPath: string; label: string }> = {
  thinking: { color: 'var(--color-trace-thinking)', iconPath: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3 M12 17h.01', label: 'Thinking' },
  action: { color: 'var(--color-trace-action)', iconPath: 'M13 2L3 14h7l-1 8 10-12h-7l1-8z', label: 'Action' },
  tool_call: { color: 'var(--color-trace-tool-call)', iconPath: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z', label: 'Tool Call' },
  tool_result: { color: 'var(--color-trace-tool-result)', iconPath: 'M16 18l6-6-6-6 M8 6l-6 6 6 6', label: 'Tool Result' },
  error: { color: 'var(--color-trace-error)', iconPath: 'M15 9l-6 6 M9 9l6 6', label: 'Error' },
  info: { color: 'var(--color-trace-info)', iconPath: 'M12 16v-4 M12 8h.01', label: 'Info' },
};

interface StepGroup {
  id: string;
  index: number;
  entries: TraceEntry[];
  startTime: string;
  toolCallCount: number;
  hasError: boolean;
  /** Phase 0.9.1: first tool name for the step header summary. */
  firstToolName?: string;
  /** Phase 0.9.1: overall step status (worst of all tool results). */
  status: 'completed' | 'denied' | 'deactivated' | 'mixed' | 'pending';
}

/**
 * Phase 0.9.1: Build a StepGroup with a summary (first tool name + overall
 * status) so the step header can show what ran at a glance.
 */
function buildStep(stepIndex: number, entries: TraceEntry[]): StepGroup {
  const toolCalls = entries.filter(e => e.type === 'tool_call');
  const toolResults = entries.filter(e => e.type === 'tool_result');
  const firstToolName = toolCalls[0]?.metadata?.toolName as string | undefined;
  let status: StepGroup['status'] = 'pending';
  if (toolResults.length > 0) {
    const statuses = toolResults.map(r => (r.metadata?.status as string) || 'completed');
    const allSame = statuses.every(s => s === statuses[0]);
    status = allSame ? (statuses[0] as StepGroup['status']) : 'mixed';
  }
  return {
    id: `step-${stepIndex}`,
    index: stepIndex,
    entries,
    startTime: entries[0].timestamp,
    toolCallCount: toolCalls.length,
    hasError: entries.some(e => e.type === 'error'),
    firstToolName,
    status,
  };
}

/**
 * Group flat trace entries into steps. A new step starts whenever we see
 * an 'action' or 'thinking' entry after a 'tool_result' or 'tool_call'
 * entry (i.e. the agent started a new round of reasoning).
 */
function groupIntoSteps(entries: TraceEntry[]): StepGroup[] {
  if (entries.length === 0) return [];

  const steps: StepGroup[] = [];
  let currentStep: TraceEntry[] = [];
  let stepIndex = 0;

  for (const entry of entries) {
    // Start a new step if:
    // - current step is non-empty AND
    // - this entry is a 'thinking' or 'action' (start of new reasoning)
    // - and the previous entry was a tool_result or tool_call (end of prev step)
    const lastEntry = currentStep[currentStep.length - 1];
    const isReasoningStart = entry.type === 'thinking' || entry.type === 'action';
    const prevWasTool = lastEntry && (lastEntry.type === 'tool_result' || lastEntry.type === 'tool_call');

    if (currentStep.length > 0 && isReasoningStart && prevWasTool) {
      steps.push(buildStep(stepIndex, currentStep));
      stepIndex++;
      currentStep = [];
    }

    currentStep.push(entry);
  }

  // Push the final step
  if (currentStep.length > 0) {
    steps.push(buildStep(stepIndex, currentStep));
  }

  return steps;
}

const TraceTab: React.FC<TraceTabProps> = ({ entries }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  // Auto-expand the latest step
  useEffect(() => {
    if (entries.length > 0) {
      const steps = groupIntoSteps(entries);
      if (steps.length > 0) {
        const lastStep = steps[steps.length - 1];
        setExpandedSteps(prev => {
          const next = new Set(prev);
          next.add(lastStep.id);
          return next;
        });
      }
    }
  }, [entries.length]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const steps = useMemo(() => groupIntoSteps(filteredEntries), [filteredEntries]);

  const toggleStep = useCallback((stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedSteps(new Set(steps.map(s => s.id)));
  }, [steps]);

  const collapseAll = useCallback(() => {
    setExpandedSteps(new Set());
  }, []);

  const exportAsMarkdown = useCallback(() => {
    const lines: string[] = [
      '# Agent Trace',
      '',
      `**Exported at**: ${new Date().toISOString()}`,
      `**Total entries**: ${entries.length}`,
      `**Steps**: ${steps.length}`,
      '',
      '---',
      '',
    ];
    for (const step of steps) {
      lines.push(`## Step ${step.index + 1}`);
      lines.push('');
      for (const entry of step.entries) {
        const config = TYPE_CONFIG[entry.type] || TYPE_CONFIG.info;
        const time = new Date(entry.timestamp).toLocaleTimeString();
        lines.push(`### [${config.label}] ${time}`);
        lines.push(entry.content);
        if (entry.metadata && Object.keys(entry.metadata).length > 0) {
          lines.push('```json');
          lines.push(JSON.stringify(entry.metadata, null, 2));
          lines.push('```');
        }
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
  }, [entries, steps]);

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
    <div className="flex flex-col h-full">
      {/* Toolbar: search + filter + actions */}
      <div className="px-3 py-2 border-b flex-shrink-0" style={{ borderColor: 'var(--color-border-secondary)' }}>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--color-bg-tertiary)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search trace..."
              className="flex-1 bg-transparent text-xs outline-none"
              style={{ color: 'var(--color-text-primary)' }}
            />
          </div>
          <button
            onClick={expandAll}
            className="p-1.5 rounded transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
            title="Expand all"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
          <button
            onClick={collapseAll}
            className="p-1.5 rounded transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
            title="Collapse all"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
          <button
            onClick={exportAsMarkdown}
            className="p-1.5 rounded transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
            title="Export as markdown"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        </div>
        {/* Type filter chips */}
        <div className="flex flex-wrap gap-1 mt-2">
          {Object.entries(TYPE_CONFIG).map(([type, config]) => (
            <button
              key={type}
              onClick={() => setFilterType(filterType === type ? null : type)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors"
              style={{
                background: filterType === type ? `${config.color}20` : 'transparent',
                color: filterType === type ? config.color : 'var(--color-text-muted)',
                border: filterType === type ? `1px solid ${config.color}40` : '1px solid transparent',
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d={config.iconPath} />
              </svg>
              <span>{config.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Steps tree */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {steps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 px-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <p className="text-sm mt-3" style={{ color: 'var(--color-text-muted)' }}>
              No trace yet
            </p>
            <p className="text-xs mt-1 text-center" style={{ color: 'var(--color-text-muted)' }}>
              Send a message to see the agent's reasoning steps
            </p>
          </div>
        ) : (
          <div className="py-1">
            {steps.map((step) => {
              const isExpanded = expandedSteps.has(step.id);
              return (
                <div key={step.id} className="px-2">
                  {/* Step header */}
                  <button
                    onClick={() => toggleStep(step.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors"
                    style={{ background: isExpanded ? 'var(--color-bg-tertiary)' : 'transparent' }}
                    onMouseEnter={(e) => {
                      if (!isExpanded) e.currentTarget.style.background = 'var(--color-bg-tertiary)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isExpanded) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--color-text-tertiary)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease', flexShrink: 0 }}
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{
                        background: step.hasError ? 'rgba(239,68,68,0.1)' : 'var(--color-accent-soft)',
                        color: step.hasError ? 'var(--color-error)' : 'var(--color-accent)',
                      }}
                    >
                      #{step.index + 1}
                    </span>
                    {/* Phase 0.9.1: show the first tool name so the step header
                        tells you WHAT ran, not just how many. */}
                    {step.firstToolName && (
                      <span className="text-[11px] font-medium truncate" style={{ color: 'var(--color-text-secondary)', maxWidth: '120px' }}>
                        {step.firstToolName}
                      </span>
                    )}
                    <span className="text-[11px] ml-auto" style={{ color: 'var(--color-text-muted)' }}>
                      {formatTime(step.startTime)}
                    </span>
                    {/* Phase 0.9.1: status badge — green (completed), red (denied),
                        grey (deactivated), mixed (varies). */}
                    {step.toolCallCount > 0 && (
                      <span
                        className="text-[10px] px-1 py-0.5 rounded flex items-center gap-0.5"
                        style={{
                          background: step.status === 'denied' ? 'rgba(239,68,68,0.1)'
                            : step.status === 'deactivated' ? 'rgba(107,114,128,0.1)'
                            : step.status === 'mixed' ? 'rgba(245,158,11,0.1)'
                            : 'rgba(16,185,129,0.1)',
                          color: step.status === 'denied' ? 'var(--color-error)'
                            : step.status === 'deactivated' ? 'var(--color-text-muted)'
                            : step.status === 'mixed' ? 'var(--color-warning)'
                            : 'var(--color-success, #10b981)',
                        }}
                      >
                        {step.status === 'completed' && (
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        )}
                        {step.toolCallCount} tool{step.toolCallCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {step.hasError && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                    )}
                  </button>

                  {/* Step entries (tree children) */}
                  {isExpanded && (
                    <div className="ml-3 pl-3 border-l animate-fade-in" style={{ borderColor: 'var(--color-border-secondary)' }}>
                      {step.entries.map((entry, idx) => (
                        <TraceEntryItem key={`${entry.id}-${idx}`} entry={entry} formatTime={formatTime} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Trace Entry Item (extracted to avoid hooks-in-map violation) ────────────

const TraceEntryItem: React.FC<{
  entry: TraceEntry;
  formatTime: (ts: string) => string;
}> = ({ entry, formatTime }) => {
  const [expanded, setExpanded] = useState(false);
  const config = TYPE_CONFIG[entry.type] || TYPE_CONFIG.info;
  const isLong = entry.content.length > 150;
  // Phase 0.9.2: for tool_call entries, show the tool name as a bold label
  // and the args as a subtle monospace preview. For tool_result entries,
  // show a status-colored icon.
  const toolName = entry.type === 'tool_call' ? (entry.metadata?.toolName as string | undefined) : undefined;
  const resultStatus = entry.type === 'tool_result' ? (entry.metadata?.status as string | undefined) : undefined;
  const resultColor = resultStatus === 'denied' ? 'var(--color-error)'
    : resultStatus === 'deactivated' ? 'var(--color-text-muted)'
    : 'var(--color-success, #10b981)';

  return (
    <div className="py-1.5 flex items-start gap-2">
      {/* Phase 0.9.2: tool_result gets a status-colored icon instead of the
          generic tool-result icon, so you can see at a glance if it succeeded. */}
      {entry.type === 'tool_result' ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={resultColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
          {resultStatus === 'denied' ? (
            <>
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </>
          ) : resultStatus === 'deactivated' ? (
            <>
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </>
          ) : (
            <polyline points="20 6 9 17 4 12" />
          )}
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={config.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
          <path d={config.iconPath} />
        </svg>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {/* Phase 0.9.2: for tool_call, show the tool name as the label
              instead of the generic "Tool Call" text. */}
          <span className="text-[10px] font-medium font-mono" style={{ color: config.color }}>
            {toolName || config.label}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            {formatTime(entry.timestamp)}
          </span>
        </div>
        <p
          className="text-[11px] mt-0.5 break-words font-mono"
          style={{
            color: 'var(--color-text-secondary)',
            display: !expanded && isLong ? '-webkit-box' : 'block',
            WebkitLineClamp: !expanded && isLong ? 2 : undefined,
            WebkitBoxOrient: !expanded && isLong ? 'vertical' : undefined,
            overflow: !expanded && isLong ? 'hidden' : undefined,
            cursor: isLong ? 'pointer' : 'default',
          }}
          onClick={() => isLong && setExpanded(!expanded)}
        >
          {entry.content}
        </p>
        {expanded && entry.metadata && Object.keys(entry.metadata).length > 0 && (
          <pre
            className="mt-1 p-1.5 rounded text-[10px] overflow-auto max-h-24 animate-fade-in font-mono"
            style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-tertiary)' }}
          >
            {JSON.stringify(entry.metadata, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
};

export default TraceTab;
