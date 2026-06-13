/**
 * OpenAgent-Desktop - Auto Mode Indicator Component
 *
 * Shows when auto-mode detection has suggested a mode.
 * Displays "Auto-detected: Build mode" with confidence percentage.
 * Accept/Dismiss buttons with animated appearance.
 */

import React, { useState, useEffect } from 'react';

export type AgentMode = 'build' | 'plan' | 'chat' | 'smart';

interface AutoModeIndicatorProps {
  detectedMode: AgentMode;
  confidence: number;
  reason?: string;
  onAccept: () => void;
  onDismiss: () => void;
}

const MODE_CONFIG: Record<AgentMode, { label: string; color: string; icon: string }> = {
  build: { label: 'Build', color: '#22c55e', icon: '⚡' },
  plan: { label: 'Plan', color: '#3b82f6', icon: '📋' },
  chat: { label: 'Chat', color: '#8b5cf6', icon: '💬' },
  smart: { label: 'Smart', color: '#f59e0b', icon: '🛡️' },
};

const AutoModeIndicator: React.FC<AutoModeIndicatorProps> = ({
  detectedMode,
  confidence,
  reason,
  onAccept,
  onDismiss,
}) => {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const config = MODE_CONFIG[detectedMode];

  // Animated entrance
  useEffect(() => {
    // Small delay for entrance animation
    const timer = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Auto-dismiss after 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      handleDismiss();
    }, 10000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(() => {
      onDismiss();
    }, 200);
  };

  const handleAccept = () => {
    setExiting(true);
    setTimeout(() => {
      onAccept();
    }, 200);
  };

  const confidencePercent = Math.round(confidence * 100);

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200"
      style={{
        background: config.color + '10',
        borderColor: config.color + '30',
        opacity: visible && !exiting ? 1 : 0,
        transform: visible && !exiting ? 'translateY(0)' : 'translateY(-4px)',
      }}
    >
      {/* Pulsing dot */}
      <span
        className="w-2 h-2 rounded-full shrink-0 animate-pulse"
        style={{ background: config.color }}
      />

      {/* Mode info */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <span style={{ color: config.color }} className="text-sm">
          {config.icon}
        </span>
        <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
          Auto-detected: {config.label} mode
        </span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
          style={{
            background: confidencePercent >= 70 ? config.color + '20' : 'var(--color-bg-tertiary)',
            color: confidencePercent >= 70 ? config.color : 'var(--color-text-tertiary)',
          }}
        >
          {confidencePercent}%
        </span>
      </div>

      {/* Reason tooltip */}
      {reason && (
        <span
          className="text-[10px] truncate max-w-[200px]"
          style={{ color: 'var(--color-text-tertiary)' }}
          title={reason}
        >
          {reason}
        </span>
      )}

      {/* Accept / Dismiss buttons */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={handleAccept}
          className="px-2 py-0.5 text-[10px] font-medium rounded transition-colors"
          style={{
            background: config.color,
            color: '#fff',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.opacity = '0.85';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.opacity = '1';
          }}
        >
          Accept
        </button>
        <button
          onClick={handleDismiss}
          className="px-2 py-0.5 text-[10px] rounded transition-colors"
          style={{
            background: 'var(--color-bg-tertiary)',
            color: 'var(--color-text-tertiary)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = 'var(--color-text-secondary)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = 'var(--color-text-tertiary)';
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};

export default AutoModeIndicator;
