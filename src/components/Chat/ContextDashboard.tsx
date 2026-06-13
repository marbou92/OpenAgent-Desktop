/**
 * OpenAgent-Desktop - Context Usage Dashboard
 *
 * Real-time context usage dashboard showing:
 * - Circular progress indicator for context window usage
 * - Token breakdown by type (system prompt, tools, conversation, memory)
 * - Color-coded usage levels (green <60%, yellow 60-80%, red >80%)
 * - Compaction controls and history
 * - Recommended action indicator
 * - Animated transitions, dark theme
 */

import React, { useState } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ContextUsageData {
  totalTokens: number;
  maxTokens: number;
  usagePercent: number;
  promptTokens: number;
  completionTokens: number;
  breakdown: {
    systemPrompt: number;
    tools: number;
    conversation: number;
    memory: number;
  };
}

export interface CompactionHistoryEntry {
  trigger: 'threshold' | 'message_count' | 'time_based' | 'manual';
  tokensBefore: number;
  tokensAfter: number;
  savedTokens: number;
  strategy: 'tool-pair' | 'summary' | 'hybrid';
  timestamp: string;
}

export interface AutoCompactionConfig {
  enabled: boolean;
  thresholdPercent: number;
  strategy: 'tool-pair' | 'summary' | 'hybrid';
  autoApply: boolean;
}

interface ContextDashboardProps {
  /** Current context usage data */
  usage: ContextUsageData | null;
  /** Compaction history */
  compactionHistory: CompactionHistoryEntry[];
  /** Current auto-compaction config */
  autoConfig: AutoCompactionConfig;
  /** Recommended action */
  recommendedAction: 'none' | 'compact' | 'summarize' | 'truncate' | 'error';
  /** Last compaction time */
  lastCompactionAt: string | null;
  /** Total tokens saved */
  totalTokensSaved: number;
  /** Callback: compact now */
  onCompactNow: () => void;
  /** Callback: toggle auto-compaction */
  onToggleAuto: (enabled: boolean) => void;
  /** Callback: change threshold */
  onThresholdChange: (threshold: number) => void;
  /** Callback: change strategy */
  onStrategyChange: (strategy: 'tool-pair' | 'summary' | 'hybrid') => void;
  /** Callback: toggle auto-apply */
  onToggleAutoApply: (autoApply: boolean) => void;
  /** Whether compaction is in progress */
  isCompacting?: boolean;
}

// ─── Color Helpers ──────────────────────────────────────────────────────────

const getUsageColor = (percent: number): string => {
  if (percent < 0.6) return '#22c55e'; // green
  if (percent < 0.8) return '#eab308'; // yellow
  return '#ef4444'; // red
};

const getUsageColorDim = (percent: number): string => {
  if (percent < 0.6) return 'rgba(34,197,94,0.15)';
  if (percent < 0.8) return 'rgba(234,179,8,0.15)';
  return 'rgba(239,68,68,0.15)';
};

const getActionConfig = (
  action: string
): { label: string; color: string; icon: string; description: string } => {
  switch (action) {
    case 'none':
      return { label: 'OK', color: '#22c55e', icon: '✓', description: 'Context is within limits' };
    case 'compact':
      return { label: 'Compact', color: '#eab308', icon: '⬇', description: 'Consider compacting context' };
    case 'summarize':
      return { label: 'Summarize', color: '#f59e0b', icon: '📋', description: 'Summarization recommended' };
    case 'truncate':
      return { label: 'Truncate', color: '#ef4444', icon: '✂', description: 'Context critically full' };
    case 'error':
      return { label: 'Overflow', color: '#ef4444', icon: '⚠', description: 'Context window exceeded!' };
    default:
      return { label: 'Unknown', color: '#6b7280', icon: '?', description: '' };
  }
};

// ─── Circular Progress Component ────────────────────────────────────────────

const CircularProgress: React.FC<{
  percent: number;
  size?: number;
  strokeWidth?: number;
}> = ({ percent, size = 120, strokeWidth = 8 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - percent * circumference;
  const color = getUsageColor(percent);

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-bg-tertiary)"
        strokeWidth={strokeWidth}
      />
      {/* Progress arc */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }}
      />
    </svg>
  );
};

// ─── Token Breakdown Bar ────────────────────────────────────────────────────

const TokenBreakdownBar: React.FC<{
  breakdown: ContextUsageData['breakdown'];
  maxTokens: number;
}> = ({ breakdown, maxTokens }) => {
  const segments = [
    { label: 'System', value: breakdown.systemPrompt, color: '#8b5cf6' },
    { label: 'Tools', value: breakdown.tools, color: '#3b82f6' },
    { label: 'Conversation', value: breakdown.conversation, color: '#22c55e' },
    { label: 'Memory', value: breakdown.memory, color: '#f59e0b' },
  ];

  const total = segments.reduce((s, seg) => s + seg.value, 0);

  return (
    <div className="space-y-2">
      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden" style={{ background: 'var(--color-bg-tertiary)' }}>
        {segments.map((seg) => {
          const width = maxTokens > 0 ? (seg.value / maxTokens) * 100 : 0;
          return (
            <div
              key={seg.label}
              style={{
                width: `${width}%`,
                background: seg.color,
                transition: 'width 0.4s ease',
                minWidth: width > 0 ? '2px' : '0',
              }}
              title={`${seg.label}: ${seg.value.toLocaleString()} tokens`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: seg.color }} />
            <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {seg.label}
            </span>
            <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-secondary)' }}>
              {seg.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
        Total used: <span style={{ color: 'var(--color-text-primary)' }}>{total.toLocaleString()}</span>
        {' / '}
        {maxTokens.toLocaleString()} tokens
      </div>
    </div>
  );
};

// ─── Main Dashboard Component ───────────────────────────────────────────────

const ContextDashboard: React.FC<ContextDashboardProps> = ({
  usage,
  compactionHistory,
  autoConfig,
  recommendedAction,
  lastCompactionAt,
  totalTokensSaved,
  onCompactNow,
  onToggleAuto,
  onThresholdChange,
  onStrategyChange,
  onToggleAutoApply,
  isCompacting = false,
}) => {
  const [showHistory, setShowHistory] = useState(false);

  const formatTokens = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  const actionConfig = getActionConfig(recommendedAction);
  const usagePercent = usage?.usagePercent ?? 0;

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
          <span className="text-sm">📊</span>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Context Dashboard
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Recommended action badge */}
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
            style={{
              background: actionConfig.color + '20',
              color: actionConfig.color,
            }}
            title={actionConfig.description}
          >
            <span>{actionConfig.icon}</span>
            <span>{actionConfig.label}</span>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Circular progress + stats */}
        <div className="flex items-center gap-6">
          {/* Circular indicator */}
          <div className="relative shrink-0">
            <CircularProgress percent={usagePercent} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="text-xl font-bold"
                style={{ color: getUsageColor(usagePercent), transition: 'color 0.3s ease' }}
              >
                {Math.round(usagePercent * 100)}%
              </span>
              <span className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>
                used
              </span>
            </div>
          </div>

          {/* Quick stats */}
          <div className="flex-1 space-y-2 min-w-0">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded-lg" style={{ background: 'var(--color-bg-tertiary)' }}>
                <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  Used
                </div>
                <div className="text-sm font-mono font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  {usage ? formatTokens(usage.totalTokens) : '—'}
                </div>
              </div>
              <div className="p-2 rounded-lg" style={{ background: 'var(--color-bg-tertiary)' }}>
                <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  Max
                </div>
                <div className="text-sm font-mono font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  {usage ? formatTokens(usage.maxTokens) : '—'}
                </div>
              </div>
              <div className="p-2 rounded-lg" style={{ background: 'var(--color-bg-tertiary)' }}>
                <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  Saved
                </div>
                <div className="text-sm font-mono font-semibold" style={{ color: '#22c55e' }}>
                  {formatTokens(totalTokensSaved)}
                </div>
              </div>
              <div className="p-2 rounded-lg" style={{ background: 'var(--color-bg-tertiary)' }}>
                <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  Last Compact
                </div>
                <div className="text-[11px] font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                  {lastCompactionAt ? new Date(lastCompactionAt).toLocaleTimeString() : 'Never'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Token breakdown */}
        {usage?.breakdown && (
          <TokenBreakdownBar breakdown={usage.breakdown} maxTokens={usage.maxTokens} />
        )}

        {/* Compact Now button */}
        <button
          onClick={onCompactNow}
          disabled={isCompacting}
          className="w-full py-2 rounded-lg text-xs font-medium transition-all"
          style={{
            background: isCompacting
              ? 'var(--color-bg-tertiary)'
              : getUsageColorDim(usagePercent),
            color: isCompacting ? 'var(--color-text-tertiary)' : getUsageColor(usagePercent),
            border: `1px solid ${isCompacting ? 'var(--color-border-primary)' : getUsageColor(usagePercent) + '40'}`,
            opacity: isCompacting ? 0.7 : 1,
          }}
        >
          {isCompacting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin-slow inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full" />
              Compacting...
            </span>
          ) : (
            'Compact Now'
          )}
        </button>

        {/* Auto-compaction toggle & config */}
        <div
          className="p-3 rounded-lg space-y-3"
          style={{ background: 'var(--color-bg-tertiary)' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs">🔄</span>
              <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                Auto-Compaction
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoConfig.enabled}
                onChange={(e) => onToggleAuto(e.target.checked)}
                className="sr-only peer"
              />
              <div
                className="w-8 h-4 rounded-full transition-colors peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-transform"
                style={{
                  background: autoConfig.enabled ? 'var(--color-accent)' : 'var(--color-bg-hover)',
                }}
              />
            </label>
          </div>

          {autoConfig.enabled && (
            <div className="space-y-3 animate-fade-in">
              {/* Threshold slider */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                    Threshold
                  </span>
                  <span
                    className="text-[10px] font-mono"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {Math.round(autoConfig.thresholdPercent * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="0.95"
                  step="0.05"
                  value={autoConfig.thresholdPercent}
                  onChange={(e) => onThresholdChange(parseFloat(e.target.value))}
                  className="w-full h-1 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, ${getUsageColor(autoConfig.thresholdPercent)} 0%, ${getUsageColor(autoConfig.thresholdPercent)} ${((autoConfig.thresholdPercent - 0.5) / 0.45) * 100}%, var(--color-bg-hover) ${((autoConfig.thresholdPercent - 0.5) / 0.45) * 100}%, var(--color-bg-hover) 100%)`,
                  }}
                />
              </div>

              {/* Strategy selector */}
              <div>
                <span className="text-[10px] block mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
                  Strategy
                </span>
                <div className="flex gap-1">
                  {(['tool-pair', 'summary', 'hybrid'] as const).map((strategy) => (
                    <button
                      key={strategy}
                      onClick={() => onStrategyChange(strategy)}
                      className="flex-1 py-1 rounded text-[10px] font-medium transition-colors"
                      style={{
                        background:
                          autoConfig.strategy === strategy
                            ? 'var(--color-accent)'
                            : 'var(--color-bg-secondary)',
                        color:
                          autoConfig.strategy === strategy
                            ? '#fff'
                            : 'var(--color-text-tertiary)',
                        border: `1px solid ${autoConfig.strategy === strategy ? 'var(--color-accent)' : 'var(--color-border-primary)'}`,
                      }}
                    >
                      {strategy === 'tool-pair' ? 'Tool-Pair' : strategy === 'summary' ? 'Summary' : 'Hybrid'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto-apply toggle */}
              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  Auto-apply (skip preview)
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoConfig.autoApply}
                    onChange={(e) => onToggleAutoApply(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div
                    className="w-8 h-4 rounded-full transition-colors peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-transform"
                    style={{
                      background: autoConfig.autoApply ? 'var(--color-accent)' : 'var(--color-bg-hover)',
                    }}
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Compaction History */}
        <div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1 text-[10px] font-medium w-full"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <span style={{ transform: showHistory ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
              ▸
            </span>
            Compaction History ({compactionHistory.length})
          </button>

          {showHistory && compactionHistory.length > 0 && (
            <div
              className="mt-2 space-y-1 max-h-40 overflow-y-auto animate-fade-in"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: 'var(--color-border-primary) transparent',
              }}
            >
              {compactionHistory.map((entry, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2 rounded text-[10px]"
                  style={{ background: 'var(--color-bg-tertiary)' }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="px-1 py-0.5 rounded text-[9px] font-medium"
                      style={{
                        background: 'var(--color-accent-soft)',
                        color: 'var(--color-accent)',
                      }}
                    >
                      {entry.strategy}
                    </span>
                    <span style={{ color: 'var(--color-text-tertiary)' }}>
                      {entry.trigger}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{ color: '#22c55e' }}>
                      -{entry.savedTokens.toLocaleString()} tokens
                    </span>
                    <span style={{ color: 'var(--color-text-tertiary)' }}>
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showHistory && compactionHistory.length === 0 && (
            <div
              className="mt-2 text-[10px] text-center py-3 animate-fade-in"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              No compactions yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContextDashboard;
