/**
 * OpenAgent-Desktop - Enhanced Mode Switch Component
 *
 * Pill-shaped toggle for switching agent modes: Build | Plan | Chat | Smart
 * Color-coded with active indicator, keyboard shortcuts, custom agent selector,
 * auto-detection indicator, and animated transitions.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AgentDefinition, AgentMode } from '../../types';

interface ModeOption {
  id: AgentMode;
  label: string;
  color: string;
  icon: string;
  description: string;
  shortcut: string;
}

const MODES: ModeOption[] = [
  { id: 'build', label: 'Build', color: '#22c55e', icon: '⚡', description: 'Full autonomy — all tools enabled', shortcut: '1' },
  { id: 'plan', label: 'Plan', color: '#3b82f6', icon: '📋', description: 'Read-only analysis — no changes', shortcut: '2' },
  { id: 'chat', label: 'Chat', color: 'var(--color-accent)', icon: '💬', description: 'Pure conversation — no tools', shortcut: '3' },
  { id: 'smart', label: 'Smart', color: '#f59e0b', icon: '🛡️', description: 'Safe ops auto-approved, sensitive needs confirmation', shortcut: '4' },
];

interface ModeSwitchProps {
  activeMode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  customAgents?: AgentDefinition[];
  autoDetected?: boolean;
  autoDetectedMode?: AgentMode;
  onAutoAccept?: () => void;
  onAutoDismiss?: () => void;
}

const ModeSwitch: React.FC<ModeSwitchProps> = ({
  activeMode,
  onModeChange,
  customAgents,
  autoDetected = false,
  autoDetectedMode,
  onAutoAccept: _onAutoAccept,
  onAutoDismiss: _onAutoDismiss,
}) => {
  const [hoveredMode, setHoveredMode] = useState<AgentMode | null>(null);
  const [showCustomAgents, setShowCustomAgents] = useState(false);
  const [animatingMode, setAnimatingMode] = useState<AgentMode | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const prevModeRef = useRef<AgentMode>(activeMode);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger if not in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const modeMap: Record<string, AgentMode> = {
        '1': 'build',
        '2': 'plan',
        '3': 'chat',
        '4': 'smart',
      };

      const mode = modeMap[e.key];
      if (mode && mode !== activeMode) {
        e.preventDefault();
        onModeChange(mode);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeMode, onModeChange]);

  // ── Animate mode switch ─────────────────────────────────────────────────

  useEffect(() => {
    if (prevModeRef.current !== activeMode) {
      setAnimatingMode(activeMode);
      const timer = setTimeout(() => setAnimatingMode(null), 300);
      prevModeRef.current = activeMode;
      return () => clearTimeout(timer);
    }
  }, [activeMode]);

  // ── Close dropdown on outside click ─────────────────────────────────────

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowCustomAgents(false);
      }
    };

    if (showCustomAgents) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCustomAgents]);

  // ── Get custom agents for current mode ──────────────────────────────────

  const agentsForCurrentMode = (customAgents || []).filter(
    (agent) => agent.mode === activeMode && !agent.isBuiltIn,
  );

  const activeModeConfig = MODES.find((m) => m.id === activeMode) || MODES[0];

  const handleModeClick = useCallback((mode: AgentMode) => {
    onModeChange(mode);
    setShowCustomAgents(false);
  }, [onModeChange]);

  return (
    <div className="flex items-center gap-2">
      {/* Mode buttons */}
      <div
        className="flex items-center gap-0.5 p-0.5 rounded-lg relative"
        style={{ background: 'var(--color-bg-tertiary)' }}
      >
        {MODES.map((mode) => {
          const isActive = activeMode === mode.id;
          const isAnimating = animatingMode === mode.id;
          const isAutoSuggested = autoDetected && autoDetectedMode === mode.id;

          return (
            <div key={mode.id} className="relative">
              <button
                onClick={() => handleModeClick(mode.id)}
                onMouseEnter={() => setHoveredMode(mode.id)}
                onMouseLeave={() => setHoveredMode(null)}
                className="relative px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200 flex items-center gap-1"
                style={{
                  background: isActive ? 'var(--color-bg-elevated)' : 'transparent',
                  color: isActive ? mode.color : 'var(--color-text-tertiary)',
                  boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                  transform: isAnimating ? 'scale(1.05)' : 'scale(1)',
                }}
                title={`${mode.description} [${mode.shortcut}]`}
              >
                {isActive && (
                  <span
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 rounded-full transition-all duration-300"
                    style={{
                      background: mode.color,
                      width: isAnimating ? '1.5rem' : '1rem',
                    }}
                  />
                )}
                <span>{mode.icon}</span>
                <span>{mode.label}</span>

                {/* Auto-detected indicator */}
                {isAutoSuggested && !isActive && (
                  <span
                    className="absolute -top-1 -right-1 w-2 h-2 rounded-full animate-pulse"
                    style={{ background: mode.color }}
                  />
                )}
              </button>

              {/* Tooltip on hover */}
              {hoveredMode === mode.id && !isActive && (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-[10px] rounded-md whitespace-nowrap z-50 pointer-events-none"
                  style={{
                    background: 'var(--color-bg-elevated)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border)',
                    boxShadow: 'var(--shadow-elevated)',
                  }}
                >
                  {mode.description}
                  <span className="ml-1.5 opacity-50">[{mode.shortcut}]</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Custom agent selector (if custom agents exist for this mode) */}
      {agentsForCurrentMode.length > 0 && (
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowCustomAgents(!showCustomAgents)}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors"
            style={{
              background: showCustomAgents ? activeModeConfig.color + '20' : 'var(--color-bg-tertiary)',
              color: showCustomAgents ? activeModeConfig.color : 'var(--color-text-tertiary)',
              border: showCustomAgents ? `1px solid ${activeModeConfig.color}40` : '1px solid transparent',
            }}
          >
            <span>👤</span>
            <span>{agentsForCurrentMode.length}</span>
            <svg
              className="w-3 h-3 transition-transform"
              style={{ transform: showCustomAgents ? 'rotate(180deg)' : 'rotate(0)' }}
              viewBox="0 0 12 12"
              fill="none"
            >
              <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>

          {/* Dropdown */}
          {showCustomAgents && (
            <div
              className="absolute top-full left-0 mt-1 py-1 rounded-lg shadow-lg z-50 min-w-[180px]"
              style={{
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div
                className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Custom Agents
              </div>
              {agentsForCurrentMode.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => {
                    // If there's a way to select a specific agent, call onModeChange
                    // with the agent context. For now, just switch mode.
                    handleModeClick(agent.mode);
                    setShowCustomAgents(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:opacity-90 transition-colors flex items-center gap-2"
                  style={{ color: 'var(--color-text-primary)' }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: agent.color || activeModeConfig.color }}
                  />
                  <span className="truncate">{agent.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Auto-detected badge */}
      {autoDetected && autoDetectedMode && !showCustomAgents && (
        <div
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium animate-fade-in"
          style={{
            background: (MODES.find((m) => m.id === autoDetectedMode)?.color || 'var(--color-accent)') + '20',
            color: MODES.find((m) => m.id === autoDetectedMode)?.color || 'var(--color-accent)',
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'currentColor' }} />
          <span>Auto</span>
        </div>
      )}
    </div>
  );
};

export default ModeSwitch;
