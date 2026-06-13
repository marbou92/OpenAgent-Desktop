/**
 * Execution Context Bar - OpenCowork Style
 *
 * Shows execution status, elapsed time, token usage, context window usage,
 * and active agent mode. Like OpenCowork's execution clock panel.
 * Displayed at the top of the main content area during agent runs.
 */

import React, { useState, useEffect } from 'react';
import { AgentMode } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────────

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ContextWindowInfo {
  used: number;
  max: number;
  canCompact: boolean;
}

export interface ExecutionContextBarProps {
  /** Whether an agent execution is currently running */
  isRunning: boolean;
  /** Whether execution is paused */
  isPaused?: boolean;
  /** Execution start time ISO string */
  startAt: string | null;
  /** Execution end time ISO string (null if still running) */
  endAt: string | null;
  /** Current step number */
  currentStep?: number;
  /** Total steps allowed */
  maxSteps?: number;
  /** Active agent mode */
  agentMode?: AgentMode;
  /** Token usage for current session */
  tokenUsage?: TokenUsage;
  /** Context window info */
  contextWindow?: ContextWindowInfo;
  /** Active provider name */
  providerName?: string;
  /** Active model name */
  modelName?: string;
  /** Pause handler */
  onPause?: () => void;
  /** Resume handler */
  onResume?: () => void;
  /** Stop handler */
  onStop?: () => void;
  /** Compact context handler */
  onCompact?: () => void;
}

// ─── Mode Config ───────────────────────────────────────────────────────────────────

const MODE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  build: { label: 'Build', color: '#22c55e', icon: '⚡' },
  plan: { label: 'Plan', color: '#3b82f6', icon: '📋' },
  chat: { label: 'Chat', color: '#8b5cf6', icon: '💬' },
  smart: { label: 'Smart', color: '#f59e0b', icon: '🛡️' },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────────

function formatElapsed(startAt: string, endAt: string | null): string {
  const start = new Date(startAt).getTime();
  const end = endAt ? new Date(endAt).getTime() : Date.now();
  const diffMs = end - start;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

function getContextColor(percent: number): string {
  if (percent > 80) return 'var(--color-error)';
  if (percent > 60) return 'var(--color-warning)';
  return 'var(--color-success)';
}

// ─── Component ────────────────────────────────────────────────────────────────────

const ExecutionContextBar: React.FC<ExecutionContextBarProps> = ({
  isRunning,
  isPaused = false,
  startAt,
  endAt,
  currentStep,
  maxSteps,
  agentMode,
  tokenUsage,
  contextWindow,
  providerName,
  modelName,
  onPause,
  onResume,
  onStop,
  onCompact,
}) => {
  const [elapsed, setElapsed] = useState('');
  const [expanded, setExpanded] = useState(false);

  // ── Timer update ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!startAt) {
      setElapsed('');
      return;
    }

    const update = () => {
      setElapsed(formatElapsed(startAt, endAt));
    };

    update();

    if (isRunning && !endAt && !isPaused) {
      const interval = setInterval(update, 1000);
      return () => clearInterval(interval);
    }
  }, [startAt, endAt, isRunning, isPaused]);

  // ── Context percentage ───────────────────────────────────────────────────

  const contextPercent =
    contextWindow && contextWindow.max > 0
      ? (contextWindow.used / contextWindow.max) * 100
      : 0;

  // Don't render if nothing to show
  if (!startAt && !isRunning) return null;

  const modeConfig = agentMode ? MODE_CONFIG[agentMode] : null;

  return (
    <div
      className="border-b animate-fade-in"
      style={{
        background: 'var(--color-bg-secondary)',
        borderColor: 'var(--color-border-secondary)',
      }}
    >
      {/* Compact bar (single line) */}
      <div
        className="flex items-center gap-3 px-4 py-1.5 text-xs"
        style={{ minHeight: '32px' }}
      >
        {/* Status indicator */}
        <div className="flex items-center gap-1.5">
          {isRunning && !endAt && !isPaused && (
            <span className="relative flex h-2 w-2">
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ background: 'var(--color-success)' }}
              />
              <span
                className="relative inline-flex rounded-full h-2 w-2"
                style={{ background: 'var(--color-success)' }}
              />
            </span>
          )}
          {isPaused && (
            <span
              className="inline-flex rounded-sm h-2 w-2"
              style={{ background: 'var(--color-warning)' }}
            />
          )}
          {endAt && (
            <span
              className="inline-flex rounded-full h-2 w-2"
              style={{ background: 'var(--color-text-muted)' }}
            />
          )}
        </div>

        {/* Agent mode badge */}
        {modeConfig && (
          <span
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
            style={{
              background: modeConfig.color + '18',
              color: modeConfig.color,
              border: `1px solid ${modeConfig.color}30`,
            }}
          >
            <span>{modeConfig.icon}</span>
            <span>{modeConfig.label}</span>
          </span>
        )}

        {/* Elapsed time */}
        {startAt && (
          <span
            className="font-mono tabular-nums font-medium"
            style={{
              color: isRunning && !endAt
                ? isPaused
                  ? 'var(--color-warning)'
                  : 'var(--color-success)'
                : 'var(--color-text-tertiary)',
            }}
          >
            {isPaused ? '⏸' : '⏱'} {elapsed}
          </span>
        )}

        {/* Step counter */}
        {currentStep !== undefined && (
          <span style={{ color: 'var(--color-text-tertiary)' }}>
            Step {currentStep}{maxSteps ? `/${maxSteps}` : ''}
          </span>
        )}

        {/* Separator */}
        <span style={{ color: 'var(--color-border-primary)' }}>│</span>

        {/* Token usage */}
        {tokenUsage && (
          <span style={{ color: 'var(--color-text-tertiary)' }}>
            Tokens: {formatTokenCount(tokenUsage.promptTokens)}↑ {formatTokenCount(tokenUsage.completionTokens)}↓
          </span>
        )}

        {/* Context usage bar (compact) */}
        {contextWindow && (
          <div className="flex items-center gap-1.5">
            <span style={{ color: 'var(--color-text-tertiary)' }}>Ctx:</span>
            <div
              className="w-16 h-1.5 rounded-full overflow-hidden"
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
            <span style={{ color: getContextColor(contextPercent) }} className="font-mono text-[10px]">
              {Math.round(contextPercent)}%
            </span>
          </div>
        )}

        {/* Provider / Model */}
        {(providerName || modelName) && (
          <span className="truncate" style={{ color: 'var(--color-text-muted)' }}>
            {providerName && modelName ? `${providerName} / ${modelName}` : providerName || modelName}
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Control buttons */}
        <div className="flex items-center gap-1">
          {isRunning && !endAt && (
            <>
              {isPaused ? (
                <button
                  onClick={onResume}
                  className="p-1 rounded transition-colors"
                  style={{ color: 'var(--color-success)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  title="Resume"
                  aria-label="Resume execution"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={onPause}
                  className="p-1 rounded transition-colors"
                  style={{ color: 'var(--color-warning)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  title="Pause"
                  aria-label="Pause execution"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                </button>
              )}
              <button
                onClick={onStop}
                className="p-1 rounded transition-colors"
                style={{ color: 'var(--color-error)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                title="Stop"
                aria-label="Stop execution"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 rounded transition-colors"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          title={expanded ? 'Collapse details' : 'Expand details'}
          aria-label="Toggle execution details"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.15s ease' }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div
          className="px-4 pb-3 pt-1 border-t animate-fade-in"
          style={{ borderColor: 'var(--color-border-secondary)' }}
        >
          <div className="grid grid-cols-3 gap-4">
            {/* Token breakdown */}
            {tokenUsage && (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  Token Usage
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Prompt</span>
                    <span className="text-xs font-mono" style={{ color: 'var(--color-text-primary)' }}>
                      {tokenUsage.promptTokens.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Completion</span>
                    <span className="text-xs font-mono" style={{ color: 'var(--color-text-primary)' }}>
                      {tokenUsage.completionTokens.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: 'var(--color-border-secondary)' }}>
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Total</span>
                    <span className="text-xs font-mono font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {tokenUsage.totalTokens.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Context window details */}
            {contextWindow && (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  Context Window
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Usage</span>
                      <span className="text-xs font-mono" style={{ color: getContextColor(contextPercent) }}>
                        {contextWindow.used.toLocaleString()} / {contextWindow.max.toLocaleString()}
                      </span>
                    </div>
                    <div
                      className="w-full h-2 rounded-full overflow-hidden"
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
                  </div>
                  {contextWindow.canCompact && (
                    <button
                      onClick={onCompact}
                      className="w-full px-2 py-1 rounded text-[10px] font-medium transition-colors"
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
              </div>
            )}

            {/* Execution info */}
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                Execution
              </div>
              <div className="space-y-1">
                {startAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Started</span>
                    <span className="text-xs font-mono" style={{ color: 'var(--color-text-primary)' }}>
                      {new Date(startAt).toLocaleTimeString()}
                    </span>
                  </div>
                )}
                {endAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Ended</span>
                    <span className="text-xs font-mono" style={{ color: 'var(--color-text-primary)' }}>
                      {new Date(endAt).toLocaleTimeString()}
                    </span>
                  </div>
                )}
                {currentStep !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Step</span>
                    <span className="text-xs font-mono" style={{ color: 'var(--color-text-primary)' }}>
                      {currentStep}{maxSteps ? ` / ${maxSteps}` : ''}
                    </span>
                  </div>
                )}
                {providerName && modelName && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Model</span>
                    <span className="text-xs" style={{ color: 'var(--color-text-primary)' }}>
                      {providerName} / {modelName}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExecutionContextBar;
