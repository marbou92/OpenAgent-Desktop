/**
 * OpenAgent-Desktop - Right Context Panel
 * 
 * Collapsible right panel showing:
 * - File context for active session
 * - Trace steps (thinking, tool calls, tool results)
 * - Token count / context window usage bar
 * - Execution clock
 */

import React, { useState } from 'react';

interface TraceStep {
  id: string;
  type: 'thinking' | 'tool_call' | 'tool_result' | 'message';
  content: string;
  toolName?: string;
  timestamp: string;
  isExpanded?: boolean;
}

interface FileContext {
  path: string;
  language?: string;
  lineCount?: number;
}

interface RightPanelProps {
  traceSteps: TraceStep[];
  fileContexts: FileContext[];
  tokenUsage: { used: number; max: number };
  executionClock: { startAt: string | null; endAt: string | null } | null;
  isCollapsed: boolean;
  onToggle: () => void;
}

const RightPanel: React.FC<RightPanelProps> = ({
  traceSteps,
  fileContexts,
  tokenUsage,
  executionClock,
  isCollapsed,
  onToggle,
}) => {
  const [activeTab, setActiveTab] = useState<'trace' | 'context' | 'memory'>('trace');

  if (isCollapsed) {
    return (
      <button
        onClick={onToggle}
        className="flex items-center justify-center w-8 border-l hover:bg-[var(--color-bg-tertiary)] transition-colors"
        style={{ borderColor: 'var(--color-border-primary)' }}
        title="Show context panel"
      >
        <span style={{ color: 'var(--color-text-tertiary)', writingMode: 'vertical-lr', fontSize: '11px' }}>
          Context
        </span>
      </button>
    );
  }

  const usagePercent = tokenUsage.max > 0 ? (tokenUsage.used / tokenUsage.max) * 100 : 0;
  const usageColor = usagePercent > 80 ? '#ef4444' : usagePercent > 50 ? '#eab308' : '#22c55e';

  const formatClock = (start: string, end?: string | null): string => {
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const diffMs = endTime - startTime;
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  return (
    <div
      className="flex flex-col border-l w-80 h-full overflow-hidden"
      style={{ background: 'var(--color-bg-primary)', borderColor: 'var(--color-border-primary)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--color-border-secondary)' }}>
        <div className="flex items-center gap-1">
          {(['trace', 'context', 'memory'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-2 py-1 rounded text-xs font-medium transition-colors capitalize"
              style={{
                background: activeTab === tab ? 'var(--color-bg-tertiary)' : 'transparent',
                color: activeTab === tab ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
              }}
            >
              {tab}
            </button>
          ))}
        </div>
        <button onClick={onToggle} className="text-xs px-1 rounded hover:bg-[var(--color-bg-tertiary)]" style={{ color: 'var(--color-text-tertiary)' }}>
          ✕
        </button>
      </div>

      {/* Execution Clock + Token Bar */}
      <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--color-border-secondary)' }}>
        {executionClock?.startAt && (
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Execution</span>
            <span className="text-xs font-mono font-medium" style={{ color: executionClock.endAt ? 'var(--color-text-primary)' : '#22c55e' }}>
              {formatClock(executionClock.startAt, executionClock.endAt)}
            </span>
          </div>
        )}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Context</span>
            <span className="text-xs font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
              {tokenUsage.used.toLocaleString()} / {tokenUsage.max.toLocaleString()}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full" style={{ background: 'var(--color-bg-tertiary)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(usagePercent, 100)}%`, background: usageColor }}
            />
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'trace' && (
          <div className="p-2 space-y-1">
            {traceSteps.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>No trace steps yet</div>
              </div>
            ) : (
              traceSteps.map((step) => (
                <TraceStepItem key={step.id} step={step} />
              ))
            )}
          </div>
        )}

        {activeTab === 'context' && (
          <div className="p-2 space-y-1">
            {fileContexts.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>No file context</div>
              </div>
            ) : (
              fileContexts.map((file, i) => (
                <div key={i} className="px-2 py-1.5 rounded text-xs flex items-center gap-2" style={{ background: 'var(--color-bg-secondary)' }}>
                  <span style={{ color: 'var(--color-accent)' }}>📄</span>
                  <span className="truncate font-mono" style={{ color: 'var(--color-text-primary)' }}>{file.path}</span>
                  {file.lineCount && (
                    <span style={{ color: 'var(--color-text-tertiary)' }}>{file.lineCount}L</span>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'memory' && (
          <div className="p-2">
            <div className="text-center py-8">
              <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Memory panel coming soon</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const TraceStepItem: React.FC<{ step: TraceStep }> = ({ step }) => {
  const [expanded, setExpanded] = useState(false);

  const icon = step.type === 'thinking' ? '💭' : step.type === 'tool_call' ? '🔧' : step.type === 'tool_result' ? '📋' : '💬';
  const bgColor = step.type === 'thinking' ? 'rgba(139,92,246,0.05)' : step.type === 'tool_call' ? 'rgba(59,130,246,0.05)' : step.type === 'tool_result' ? 'rgba(34,197,94,0.05)' : 'var(--color-bg-secondary)';

  return (
    <div
      className="rounded border overflow-hidden cursor-pointer transition-colors"
      style={{ borderColor: 'var(--color-border-primary)', background: bgColor }}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <span className="text-xs">{icon}</span>
        <span className="text-xs font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
          {step.toolName || step.type}
        </span>
        <span className="ml-auto text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          {new Date(step.timestamp).toLocaleTimeString()}
        </span>
      </div>
      {expanded && (
        <div className="px-2 pb-2 text-xs font-mono whitespace-pre-wrap" style={{ color: 'var(--color-text-secondary)', maxHeight: '200px', overflow: 'auto' }}>
          {step.content}
        </div>
      )}
    </div>
  );
};

export default RightPanel;
