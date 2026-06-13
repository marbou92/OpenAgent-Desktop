/**
 * OpenAgent-Desktop - Steer/Mid-Flight Correction Panel
 *
 * React component for steering running agents:
 * - Input field for steer messages
 * - Priority selector (low/normal/high/critical)
 * - Steer type selector (redirect/constraint/clarification/cancel/pause)
 * - Quick-steer buttons: "Stop", "Slow down", "Be more careful", "Focus on X"
 * - Pending steers queue with status
 * - Steer history timeline showing injected → acknowledged → completed
 * - Auto-steer settings: enable/disable, configure auto-redirect rules
 * - Steer result display (what the agent did in response)
 * - Keyboard shortcut: Ctrl+Shift+S to focus steer input
 * - Dark theme
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type SteerPriority = 'low' | 'normal' | 'high' | 'critical';
type SteerType = 'redirect' | 'constraint' | 'clarification' | 'cancel' | 'pause';
type SteerStatus = 'pending' | 'acknowledged' | 'completed' | 'cancelled';

interface SteerMessage {
  id: string;
  content: string;
  priority: SteerPriority;
  type: SteerType;
  sessionId: string;
  injectedAt: string;
  acknowledgedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  status: SteerStatus;
  result?: SteerResult;
  metadata?: Record<string, unknown>;
}

interface SteerResult {
  agentResponse: string;
  actionsTaken: string[];
  wasEffective: boolean;
  completedAt: string;
}

interface AutoSteerConfig {
  enabled: boolean;
  redirectOnRepeat: boolean;
  repeatThreshold: number;
  pauseOnError: boolean;
  errorThreshold: number;
  constraintOnTokens: boolean;
  tokenThreshold: number;
}

interface SteerPanelProps {
  sessionId: string;
  pendingSteers: SteerMessage[];
  steerHistory: SteerMessage[];
  autoSteerConfig: AutoSteerConfig;
  onInject: (sessionId: string, content: string, options?: { priority?: SteerPriority; type?: SteerType }) => void;
  onAcknowledge: (steerId: string) => void;
  onComplete: (steerId: string, result: SteerResult) => void;
  onCancel: (steerId: string) => void;
  onClearPending: (sessionId: string) => void;
  onAutoSteerConfigChange: (config: Partial<AutoSteerConfig>) => void;
  onQuickSteerStop: (sessionId: string) => void;
  onQuickSteerSlowDown: (sessionId: string) => void;
  onQuickSteerBeCareful: (sessionId: string) => void;
  onQuickSteerFocusOn: (sessionId: string, focus: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<SteerPriority, { label: string; color: string; bgColor: string; icon: string }> = {
  low: { label: 'Low', color: '#6b7280', bgColor: 'rgba(107,114,128,0.15)', icon: '⬇' },
  normal: { label: 'Normal', color: '#3b82f6', bgColor: 'rgba(59,130,246,0.15)', icon: '➡' },
  high: { label: 'High', color: '#f59e0b', bgColor: 'rgba(245,158,11,0.15)', icon: '⬆' },
  critical: { label: 'Critical', color: '#ef4444', bgColor: 'rgba(239,68,68,0.15)', icon: '⚠' },
};

const TYPE_CONFIG: Record<SteerType, { label: string; color: string; icon: string; description: string }> = {
  redirect: { label: 'Redirect', color: '#3b82f6', icon: '🔀', description: 'Change the agent\'s direction' },
  constraint: { label: 'Constraint', color: '#f59e0b', icon: '🔒', description: 'Add limits to agent behavior' },
  clarification: { label: 'Clarify', color: '#8b5cf6', icon: '❓', description: 'Ask the agent to clarify' },
  cancel: { label: 'Cancel', color: '#ef4444', icon: '🛑', description: 'Stop execution' },
  pause: { label: 'Pause', color: '#f97316', icon: '⏸', description: 'Pause execution' },
};

const STATUS_CONFIG: Record<SteerStatus, { label: string; color: string; icon: string }> = {
  pending: { label: 'Pending', color: '#f59e0b', icon: '⏳' },
  acknowledged: { label: 'Acknowledged', color: '#3b82f6', icon: '👀' },
  completed: { label: 'Completed', color: '#22c55e', icon: '✓' },
  cancelled: { label: 'Cancelled', color: '#6b7280', icon: '✕' },
};

// ─── Sub-Components ───────────────────────────────────────────────────────────

const SteerTimelineEntry: React.FC<{ steer: SteerMessage }> = ({ steer }) => {
  const typeConfig = TYPE_CONFIG[steer.type];
  const statusConfig = STATUS_CONFIG[steer.status];

  return (
    <div
      className="flex gap-2 p-2.5 rounded-lg group"
      style={{ background: 'var(--color-bg-tertiary)' }}
    >
      {/* Timeline connector */}
      <div className="flex flex-col items-center shrink-0">
        <span className="text-sm">{statusConfig.icon}</span>
        <div
          className="flex-1 w-px mt-1"
          style={{ background: 'var(--color-border-primary)', minHeight: '8px' }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px]" style={{ color: typeConfig.color }}>
            {typeConfig.icon} {typeConfig.label}
          </span>
          <span
            className="px-1 py-0.5 rounded text-[9px] font-medium"
            style={{ background: PRIORITY_CONFIG[steer.priority].bgColor, color: PRIORITY_CONFIG[steer.priority].color }}
          >
            {PRIORITY_CONFIG[steer.priority].label}
          </span>
          <span
            className="px-1 py-0.5 rounded text-[9px] font-medium"
            style={{ background: statusConfig.color + '20', color: statusConfig.color }}
          >
            {statusConfig.label}
          </span>
        </div>

        <p className="text-xs mb-1" style={{ color: 'var(--color-text-primary)' }}>
          {steer.content}
        </p>

        {/* Timeline: injected → acknowledged → completed */}
        <div className="flex items-center gap-2 text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
          <span>Injected: {new Date(steer.injectedAt).toLocaleTimeString()}</span>
          {steer.acknowledgedAt && (
            <span>→ Ack: {new Date(steer.acknowledgedAt).toLocaleTimeString()}</span>
          )}
          {steer.completedAt && (
            <span>→ Done: {new Date(steer.completedAt).toLocaleTimeString()}</span>
          )}
          {steer.cancelledAt && (
            <span>→ Cancelled: {new Date(steer.cancelledAt).toLocaleTimeString()}</span>
          )}
        </div>

        {/* Result display */}
        {steer.result && (
          <div
            className="mt-1.5 p-2 rounded"
            style={{ background: steer.result.wasEffective ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)' }}
          >
            <div className="text-[10px] font-medium mb-0.5" style={{ color: steer.result.wasEffective ? '#22c55e' : '#ef4444' }}>
              {steer.result.wasEffective ? '✓ Effective' : '✕ Not Effective'}
            </div>
            <div className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
              {steer.result.agentResponse}
            </div>
            {steer.result.actionsTaken.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {steer.result.actionsTaken.map((action, i) => (
                  <span
                    key={i}
                    className="px-1 py-0.5 rounded text-[8px]"
                    style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-tertiary)' }}
                  >
                    {action}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const PendingSteerCard: React.FC<{
  steer: SteerMessage;
  onAcknowledge: (id: string) => void;
  onCancel: (id: string) => void;
}> = ({ steer, onAcknowledge, onCancel }) => {
  const priorityConfig = PRIORITY_CONFIG[steer.priority];
  const typeConfig = TYPE_CONFIG[steer.type];
  const statusConfig = STATUS_CONFIG[steer.status];

  return (
    <div
      className="p-2.5 rounded-lg animate-slide-in-up"
      style={{
        background: priorityConfig.bgColor,
        border: `1px solid ${priorityConfig.color}30`,
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{typeConfig.icon}</span>
          <span className="text-[10px] font-medium" style={{ color: typeConfig.color }}>
            {typeConfig.label}
          </span>
          <span
            className="px-1 py-0.5 rounded text-[9px] font-medium"
            style={{ background: priorityConfig.bgColor, color: priorityConfig.color }}
          >
            {priorityConfig.icon} {priorityConfig.label}
          </span>
        </div>
        <span
          className="px-1 py-0.5 rounded text-[9px]"
          style={{ color: statusConfig.color }}
        >
          {statusConfig.icon} {statusConfig.label}
        </span>
      </div>
      <p className="text-xs mb-2" style={{ color: 'var(--color-text-primary)' }}>
        {steer.content}
      </p>
      <div className="flex items-center gap-1.5">
        {steer.status === 'pending' && (
          <>
            <button
              onClick={() => onAcknowledge(steer.id)}
              className="px-2 py-0.5 rounded text-[10px] font-medium"
              style={{ background: 'var(--color-accent)', color: '#fff' }}
            >
              Acknowledge
            </button>
            <button
              onClick={() => onCancel(steer.id)}
              className="px-2 py-0.5 rounded text-[10px] font-medium"
              style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border-primary)' }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const SteerPanel: React.FC<SteerPanelProps> = ({
  sessionId,
  pendingSteers,
  steerHistory,
  autoSteerConfig,
  onInject,
  onAcknowledge,
  _onComplete,
  onCancel,
  onClearPending,
  onAutoSteerConfigChange,
  onQuickSteerStop,
  onQuickSteerSlowDown,
  onQuickSteerBeCareful,
  onQuickSteerFocusOn,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<SteerPriority>('normal');
  const [type, setType] = useState<SteerType>('redirect');
  const [focusTarget, setFocusTarget] = useState('');
  const [showAutoConfig, setShowAutoConfig] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Keyboard shortcut: Ctrl+Shift+S to focus input ──────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleInject = useCallback(() => {
    if (!message.trim()) return;
    onInject(sessionId, message.trim(), { priority, type });
    setMessage('');
  }, [message, priority, type, sessionId, onInject]);

  const handleQuickStop = useCallback(() => {
    onQuickSteerStop(sessionId);
  }, [sessionId, onQuickSteerStop]);

  const handleQuickSlowDown = useCallback(() => {
    onQuickSteerSlowDown(sessionId);
  }, [sessionId, onQuickSteerSlowDown]);

  const handleQuickBeCareful = useCallback(() => {
    onQuickSteerBeCareful(sessionId);
  }, [sessionId, onQuickSteerBeCareful]);

  const handleQuickFocus = useCallback(() => {
    if (!focusTarget.trim()) return;
    onQuickSteerFocusOn(sessionId, focusTarget.trim());
    setFocusTarget('');
  }, [focusTarget, sessionId, onQuickSteerFocusOn]);

  // ── Collapsed view ────────────────────────────────────────────────────────

  if (isCollapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors w-full"
        style={{
          background: pendingSteers.length > 0 ? 'rgba(245,158,11,0.1)' : 'var(--color-bg-tertiary)',
          border: pendingSteers.length > 0 ? '1px solid rgba(245,158,11,0.3)' : '1px solid var(--color-border-primary)',
        }}
        title="Ctrl+Shift+S to open steer panel"
      >
        <span className="text-sm">🎯</span>
        <span className="text-xs font-medium flex-1 text-left" style={{ color: 'var(--color-text-primary)' }}>
          Steer Agent
        </span>
        {pendingSteers.length > 0 && (
          <span
            className="px-1.5 py-0.5 rounded-full text-[9px] font-medium"
            style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b' }}
          >
            {pendingSteers.length} pending
          </span>
        )}
      </button>
    );
  }

  // ── Full view ─────────────────────────────────────────────────────────────

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
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: 'var(--color-border-primary)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">🎯</span>
          <h3 className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Steer Agent
          </h3>
          {pendingSteers.length > 0 && (
            <span
              className="px-1.5 py-0.5 rounded-full text-[9px] font-medium animate-pulse"
              style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b' }}
            >
              {pendingSteers.length} pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowAutoConfig(!showAutoConfig)}
            className="px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors"
            style={{
              background: showAutoConfig ? 'var(--color-accent-soft)' : 'transparent',
              color: showAutoConfig ? 'var(--color-accent)' : 'var(--color-text-muted)',
            }}
          >
            ⚙️ Auto
          </button>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-1 rounded transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
              title="Collapse panel"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M2 8L6 4L10 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Steer input */}
        <div>
          <div className="flex gap-1.5 mb-2">
            {/* Message input */}
            <input
              ref={inputRef}
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleInject();
                }
              }}
              className="flex-1 text-xs px-3 py-2 rounded-lg border-none outline-none"
              style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)' }}
              placeholder="Type a steer message... (Ctrl+Shift+S)"
            />
            <button
              onClick={handleInject}
              disabled={!message.trim()}
              className="px-3 py-2 rounded-lg text-xs font-medium transition-all shrink-0"
              style={{
                background: message.trim() ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                color: message.trim() ? '#fff' : 'var(--color-text-muted)',
              }}
            >
              Send
            </button>
          </div>

          {/* Priority & Type selectors */}
          <div className="flex items-center gap-3">
            {/* Priority */}
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
                Priority:
              </span>
              {(Object.entries(PRIORITY_CONFIG) as [SteerPriority, typeof PRIORITY_CONFIG[SteerPriority]][]).map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => setPriority(key)}
                  className="px-1.5 py-0.5 rounded text-[9px] font-medium transition-all"
                  style={{
                    background: priority === key ? config.bgColor : 'transparent',
                    color: priority === key ? config.color : 'var(--color-text-muted)',
                    border: priority === key ? `1px solid ${config.color}30` : '1px solid transparent',
                  }}
                >
                  {config.label}
                </button>
              ))}
            </div>

            {/* Type */}
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
                Type:
              </span>
              {(Object.entries(TYPE_CONFIG) as [SteerType, typeof TYPE_CONFIG[SteerType]][]).map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => setType(key)}
                  className="px-1.5 py-0.5 rounded text-[9px] font-medium transition-all"
                  style={{
                    background: type === key ? config.color + '20' : 'transparent',
                    color: type === key ? config.color : 'var(--color-text-muted)',
                    border: type === key ? `1px solid ${config.color}30` : '1px solid transparent',
                  }}
                  title={config.description}
                >
                  {config.icon}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Quick-steer buttons */}
        <div>
          <div className="text-[9px] font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
            Quick Actions
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={handleQuickStop}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              🛑 Stop
            </button>
            <button
              onClick={handleQuickSlowDown}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors"
              style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}
            >
              ⏸ Slow Down
            </button>
            <button
              onClick={handleQuickBeCareful}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors"
              style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}
            >
              🔒 Be Careful
            </button>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={focusTarget}
                onChange={(e) => setFocusTarget(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleQuickFocus();
                }}
                className="w-24 text-[10px] px-2 py-1 rounded border-none outline-none"
                style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)' }}
                placeholder="Focus on..."
              />
              <button
                onClick={handleQuickFocus}
                disabled={!focusTarget.trim()}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors"
                style={{
                  background: focusTarget.trim() ? 'rgba(139,92,246,0.15)' : 'var(--color-bg-tertiary)',
                  color: focusTarget.trim() ? '#8b5cf6' : 'var(--color-text-muted)',
                  border: `1px solid ${focusTarget.trim() ? 'rgba(139,92,246,0.3)' : 'transparent'}`,
                }}
              >
                🔀 Focus
              </button>
            </div>
          </div>
        </div>

        {/* Pending steers */}
        {pendingSteers.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
                Pending ({pendingSteers.length})
              </span>
              <button
                onClick={() => onClearPending(sessionId)}
                className="text-[9px] font-medium"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Clear All
              </button>
            </div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {pendingSteers.map((steer) => (
                <PendingSteerCard
                  key={steer.id}
                  steer={steer}
                  onAcknowledge={onAcknowledge}
                  onCancel={onCancel}
                />
              ))}
            </div>
          </div>
        )}

        {/* Auto-steer config */}
        {showAutoConfig && (
          <div
            className="p-3 rounded-lg space-y-2.5 animate-fade-in"
            style={{ background: 'var(--color-bg-tertiary)' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-xs">🤖</span>
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  Auto-Steer
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSteerConfig.enabled}
                  onChange={(e) => onAutoSteerConfigChange({ enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div
                  className="w-8 h-4 rounded-full transition-colors peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-transform"
                  style={{ background: autoSteerConfig.enabled ? 'var(--color-accent)' : 'var(--color-bg-hover)' }}
                />
              </label>
            </div>

            {autoSteerConfig.enabled && (
              <>
                {/* Redirect on repeat */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      Auto-redirect on repeat
                    </div>
                    <div className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      Redirect if same tool called {autoSteerConfig.repeatThreshold}+ times
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSteerConfig.redirectOnRepeat}
                      onChange={(e) => onAutoSteerConfigChange({ redirectOnRepeat: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div
                      className="w-6 h-3 rounded-full transition-colors peer-checked:after:translate-x-3 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-2 after:w-2 after:transition-transform"
                      style={{ background: autoSteerConfig.redirectOnRepeat ? 'var(--color-accent)' : 'var(--color-bg-hover)' }}
                    />
                  </label>
                </div>

                {/* Repeat threshold */}
                {autoSteerConfig.redirectOnRepeat && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      Repeat threshold
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onAutoSteerConfigChange({ repeatThreshold: Math.max(2, autoSteerConfig.repeatThreshold - 1) })}
                        className="w-5 h-5 rounded text-[10px] flex items-center justify-center"
                        style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)' }}
                      >
                        -
                      </button>
                      <span className="text-xs font-mono w-4 text-center" style={{ color: 'var(--color-text-primary)' }}>
                        {autoSteerConfig.repeatThreshold}
                      </span>
                      <button
                        onClick={() => onAutoSteerConfigChange({ repeatThreshold: Math.min(10, autoSteerConfig.repeatThreshold + 1) })}
                        className="w-5 h-5 rounded text-[10px] flex items-center justify-center"
                        style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)' }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}

                {/* Pause on error */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      Auto-pause on errors
                    </div>
                    <div className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      Pause after {autoSteerConfig.errorThreshold} errors
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSteerConfig.pauseOnError}
                      onChange={(e) => onAutoSteerConfigChange({ pauseOnError: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div
                      className="w-6 h-3 rounded-full transition-colors peer-checked:after:translate-x-3 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-2 after:w-2 after:transition-transform"
                      style={{ background: autoSteerConfig.pauseOnError ? 'var(--color-accent)' : 'var(--color-bg-hover)' }}
                    />
                  </label>
                </div>

                {/* Constraint on tokens */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      Constraint on high token usage
                    </div>
                    <div className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      Add constraint above {autoSteerConfig.tokenThreshold.toLocaleString()} tokens
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSteerConfig.constraintOnTokens}
                      onChange={(e) => onAutoSteerConfigChange({ constraintOnTokens: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div
                      className="w-6 h-3 rounded-full transition-colors peer-checked:after:translate-x-3 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-2 after:w-2 after:transition-transform"
                      style={{ background: autoSteerConfig.constraintOnTokens ? 'var(--color-accent)' : 'var(--color-bg-hover)' }}
                    />
                  </label>
                </div>
              </>
            )}
          </div>
        )}

        {/* Steer History */}
        <div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1 text-[9px] font-medium w-full mb-1.5"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <span style={{ transform: showHistory ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
              ▸
            </span>
            Steer History ({steerHistory.length})
          </button>

          {showHistory && steerHistory.length > 0 && (
            <div className="space-y-1.5 max-h-60 overflow-y-auto animate-fade-in">
              {steerHistory.map((steer) => (
                <SteerTimelineEntry key={steer.id} steer={steer} />
              ))}
            </div>
          )}

          {showHistory && steerHistory.length === 0 && (
            <div className="text-[10px] text-center py-3 animate-fade-in" style={{ color: 'var(--color-text-muted)' }}>
              No steer history yet
            </div>
          )}
        </div>

        {/* Keyboard shortcut hint */}
        <div className="text-[9px] text-center pt-1" style={{ color: 'var(--color-text-muted)' }}>
          <kbd
            className="px-1 py-0.5 rounded text-[8px]"
            style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-primary)' }}
          >
            Ctrl+Shift+S
          </kbd>
          {' '}to focus input
        </div>
      </div>
    </div>
  );
};

export default SteerPanel;
