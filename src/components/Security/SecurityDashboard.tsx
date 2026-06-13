/**
 * OpenAgent-Desktop - Security Dashboard
 *
 * React component showing security status:
 * - Overview cards: total scans, threats blocked, warnings, risk score
 * - Recent security findings list with severity badges
 * - Prompt injection detection stats
 * - Command injection detection stats
 * - Scan history timeline
 * - Risk score trend chart (simple bar chart)
 * - Config panel: toggle detection types, set risk threshold, add custom patterns
 * - Blocked attempts log with details
 * - Dark theme
 */

import React, { useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

interface SecurityFinding {
  id: string;
  type: 'prompt_injection' | 'suspicious_content' | 'data_exfiltration' | 'command_injection';
  severity: SecuritySeverity;
  confidence: number;
  description: string;
  matchedPattern?: string;
  location: 'tool_result' | 'user_input' | 'file_content';
  timestamp: string;
  blocked: boolean;
  contentPreview?: string;
}

interface SecurityScanEntry {
  id: string;
  scannedAt: string;
  contentLength: number;
  findings: SecurityFinding[];
  isSafe: boolean;
  riskScore: number;
}

interface SecurityConfig {
  enablePromptInjectionDetection: boolean;
  enableDataExfiltrationDetection: boolean;
  enableCommandInjectionDetection: boolean;
  maxRiskScore: number;
  customPatterns: string[];
}

interface BlockedAttempt {
  id: string;
  timestamp: string;
  finding: SecurityFinding;
  action: 'blocked' | 'sanitized' | 'warned';
  sessionId?: string;
  toolName?: string;
}

interface RiskScoreDataPoint {
  timestamp: string;
  riskScore: number;
  blocked: boolean;
}

interface SecurityDashboardProps {
  findings: SecurityFinding[];
  scanHistory: SecurityScanEntry[];
  blockedAttempts: BlockedAttempt[];
  riskScoreTrend: RiskScoreDataPoint[];
  config: SecurityConfig;
  totalScans: number;
  threatsBlocked: number;
  warningsCount: number;
  currentRiskScore: number;
  onConfigChange: (config: Partial<SecurityConfig>) => void;
  onAddCustomPattern: (pattern: string) => void;
  onRemoveCustomPattern: (pattern: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<SecuritySeverity, { label: string; color: string; bgColor: string; icon: string }> = {
  critical: { label: 'Critical', color: '#ef4444', bgColor: 'rgba(239,68,68,0.15)', icon: '🔴' },
  high: { label: 'High', color: '#f97316', bgColor: 'rgba(249,115,22,0.15)', icon: '🟠' },
  medium: { label: 'Medium', color: '#f59e0b', bgColor: 'rgba(245,158,11,0.15)', icon: '🟡' },
  low: { label: 'Low', color: '#22c55e', bgColor: 'rgba(34,197,94,0.15)', icon: '🟢' },
};

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  prompt_injection: { label: 'Prompt Injection', color: '#ef4444', icon: '💉' },
  command_injection: { label: 'Command Injection', color: '#f97316', icon: '🖥️' },
  data_exfiltration: { label: 'Data Exfiltration', color: '#f59e0b', icon: '📤' },
  suspicious_content: { label: 'Suspicious Content', color: '#8b5cf6', icon: '🔍' },
};

const LOCATION_LABELS: Record<string, string> = {
  tool_result: 'Tool Result',
  user_input: 'User Input',
  file_content: 'File Content',
};

// ─── Sub-Components ───────────────────────────────────────────────────────────

const StatCard: React.FC<{
  label: string;
  value: string | number;
  icon: string;
  color: string;
  subtext?: string;
}> = ({ label, value, icon, color, subtext }) => (
  <div
    className="p-3 rounded-lg"
    style={{ background: 'var(--color-bg-tertiary)' }}
  >
    <div className="flex items-center gap-2 mb-1">
      <span className="text-sm">{icon}</span>
      <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
        {label}
      </span>
    </div>
    <div className="text-lg font-bold" style={{ color }}>
      {value}
    </div>
    {subtext && (
      <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
        {subtext}
      </div>
    )}
  </div>
);

const SeverityBadge: React.FC<{ severity: SecuritySeverity }> = ({ severity }) => {
  const config = SEVERITY_CONFIG[severity];
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium"
      style={{ background: config.bgColor, color: config.color }}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
};

const FindingRow: React.FC<{ finding: SecurityFinding }> = ({ finding }) => {
  const typeConfig = TYPE_CONFIG[finding.type] || TYPE_CONFIG.suspicious_content;

  return (
    <div
      className="flex items-center gap-3 p-2.5 rounded-lg transition-colors"
      style={{ background: 'var(--color-bg-tertiary)' }}
    >
      <SeverityBadge severity={finding.severity} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium" style={{ color: typeConfig.color }}>
            {typeConfig.icon} {typeConfig.label}
          </span>
          <span className="text-[9px] px-1 rounded" style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-tertiary)' }}>
            {LOCATION_LABELS[finding.location] || finding.location}
          </span>
          {finding.blocked && (
            <span className="text-[9px] px-1 rounded font-medium" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
              BLOCKED
            </span>
          )}
        </div>
        <div className="text-[10px] truncate" style={{ color: 'var(--color-text-secondary)' }}>
          {finding.description}
        </div>
        {finding.matchedPattern && (
          <div className="text-[10px] font-mono mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
            Pattern: {finding.matchedPattern}
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        <div className="text-[10px] font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
          {Math.round(finding.confidence * 100)}%
        </div>
        <div className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
          {new Date(finding.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};

const RiskScoreChart: React.FC<{ data: RiskScoreDataPoint[] }> = ({ data }) => {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-20 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        No risk score data yet
      </div>
    );
  }

  const maxScore = Math.max(...data.map((d) => d.riskScore), 0.1);

  return (
    <div className="flex items-end gap-1 h-20">
      {data.slice(-20).map((point, i) => {
        const height = Math.max((point.riskScore / maxScore) * 100, 4);
        const color = point.riskScore >= 0.7 ? '#ef4444' : point.riskScore >= 0.4 ? '#f59e0b' : '#22c55e';

        return (
          <div
            key={i}
            className="flex-1 rounded-t transition-all"
            style={{
              height: `${height}%`,
              background: point.blocked ? `${color}80` : color,
              minHeight: '4px',
              opacity: 0.7 + (i / data.length) * 0.3,
            }}
            title={`Risk: ${Math.round(point.riskScore * 100)}%${point.blocked ? ' (Blocked)' : ''}`}
          />
        );
      })}
    </div>
  );
};

const BlockedAttemptRow: React.FC<{ attempt: BlockedAttempt }> = ({ attempt }) => {
  const actionColors: Record<string, { bg: string; color: string }> = {
    blocked: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
    sanitized: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
    warned: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
  };
  const actionConfig = actionColors[attempt.action] || actionColors.warned;

  return (
    <div
      className="flex items-center gap-2 p-2 rounded-lg"
      style={{ background: 'var(--color-bg-tertiary)' }}
    >
      <span
        className="px-1.5 py-0.5 rounded text-[9px] font-medium"
        style={{ background: actionConfig.bg, color: actionConfig.color }}
      >
        {attempt.action.toUpperCase()}
      </span>
      <span className="text-[10px] flex-1 truncate" style={{ color: 'var(--color-text-secondary)' }}>
        {attempt.finding.description}
      </span>
      {attempt.toolName && (
        <span className="text-[9px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
          {attempt.toolName}
        </span>
      )}
      <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
        {new Date(attempt.timestamp).toLocaleTimeString()}
      </span>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const SecurityDashboard: React.FC<SecurityDashboardProps> = ({
  findings,
  scanHistory,
  blockedAttempts,
  riskScoreTrend,
  config,
  totalScans,
  threatsBlocked,
  warningsCount,
  currentRiskScore,
  onConfigChange,
  onAddCustomPattern,
  onRemoveCustomPattern,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'findings' | 'history' | 'blocked' | 'config'>('overview');
  const [newPattern, setNewPattern] = useState('');

  // ── Computed stats ──────────────────────────────────────────────────────

  const promptInjectionCount = findings.filter((f) => f.type === 'prompt_injection').length;
  const commandInjectionCount = findings.filter((f) => f.type === 'command_injection').length;
  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const _highCount = findings.filter((f) => f.severity === 'high').length;

  const riskScoreColor = currentRiskScore >= 0.7 ? '#ef4444' : currentRiskScore >= 0.4 ? '#f59e0b' : '#22c55e';

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAddPattern = useCallback(() => {
    if (!newPattern.trim()) return;
    onAddCustomPattern(newPattern.trim());
    setNewPattern('');
  }, [newPattern, onAddCustomPattern]);

  // ── Tabs config ───────────────────────────────────────────────────────────

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: '📊' },
    { id: 'findings' as const, label: 'Findings', icon: '🔍', badge: findings.length },
    { id: 'history' as const, label: 'History', icon: '📋' },
    { id: 'blocked' as const, label: 'Blocked', icon: '🚫', badge: blockedAttempts.length },
    { id: 'config' as const, label: 'Config', icon: '⚙️' },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

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
          <span className="text-sm">🔒</span>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Security Dashboard
          </h3>
          {criticalCount > 0 && (
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-medium animate-pulse"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
            >
              {criticalCount} Critical
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
            Risk Score:
          </span>
          <span className="text-sm font-bold" style={{ color: riskScoreColor }}>
            {Math.round(currentRiskScore * 100)}%
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <div
        className="flex items-center gap-0.5 px-3 py-1.5 border-b overflow-x-auto"
        style={{ borderColor: 'var(--color-border-primary)', background: 'var(--color-bg-secondary)' }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium transition-colors whitespace-nowrap"
            style={{
              background: activeTab === tab.id ? 'var(--color-bg-elevated)' : 'transparent',
              color: activeTab === tab.id ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
              boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span
                className="ml-0.5 px-1 rounded-full text-[8px]"
                style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4" style={{ maxHeight: '450px', overflowY: 'auto' }}>
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-4 animate-fade-in">
            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatCard
                label="Total Scans"
                value={totalScans}
                icon="🔍"
                color="var(--color-text-primary)"
              />
              <StatCard
                label="Threats Blocked"
                value={threatsBlocked}
                icon="🚫"
                color="#ef4444"
                subtext={criticalCount > 0 ? `${criticalCount} critical` : undefined}
              />
              <StatCard
                label="Warnings"
                value={warningsCount}
                icon="⚠️"
                color="#f59e0b"
              />
              <StatCard
                label="Risk Score"
                value={`${Math.round(currentRiskScore * 100)}%`}
                icon="📊"
                color={riskScoreColor}
              />
            </div>

            {/* Detection type breakdown */}
            <div
              className="p-3 rounded-lg"
              style={{ background: 'var(--color-bg-tertiary)' }}
            >
              <h5 className="text-[10px] font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-muted)' }}>
                Detection Breakdown
              </h5>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 p-2 rounded" style={{ background: 'var(--color-bg-secondary)' }}>
                  <span className="text-sm">💉</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-medium" style={{ color: '#ef4444' }}>
                      Prompt Injection
                    </div>
                    <div className="text-xs font-bold" style={{ color: 'var(--color-text-primary)' }}>
                      {promptInjectionCount}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 rounded" style={{ background: 'var(--color-bg-secondary)' }}>
                  <span className="text-sm">🖥️</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-medium" style={{ color: '#f97316' }}>
                      Command Injection
                    </div>
                    <div className="text-xs font-bold" style={{ color: 'var(--color-text-primary)' }}>
                      {commandInjectionCount}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Risk score trend */}
            <div>
              <h5 className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>
                Risk Score Trend
              </h5>
              <RiskScoreChart data={riskScoreTrend} />
              <div className="flex justify-between mt-1">
                <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>Older</span>
                <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>Recent</span>
              </div>
            </div>

            {/* Recent findings preview */}
            {findings.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                    Recent Findings
                  </h5>
                  <button
                    onClick={() => setActiveTab('findings')}
                    className="text-[10px] font-medium"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    View all →
                  </button>
                </div>
                <div className="space-y-1">
                  {findings.slice(0, 3).map((finding) => (
                    <FindingRow key={finding.id} finding={finding} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Findings Tab */}
        {activeTab === 'findings' && (
          <div className="space-y-2 animate-fade-in">
            {findings.length > 0 ? (
              <>
                {/* Severity filter */}
                <div className="flex items-center gap-1 mb-2">
                  <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                    Filter:
                  </span>
                  {(['critical', 'high', 'medium', 'low'] as SecuritySeverity[]).map((sev) => {
                    const count = findings.filter((f) => f.severity === sev).length;
                    if (count === 0) return null;
                    const config = SEVERITY_CONFIG[sev];
                    return (
                      <span
                        key={sev}
                        className="px-1.5 py-0.5 rounded text-[9px] font-medium cursor-default"
                        style={{ background: config.bgColor, color: config.color }}
                      >
                        {count} {config.label}
                      </span>
                    );
                  })}
                </div>
                <div className="space-y-1 max-h-80 overflow-y-auto">
                  {findings.map((finding) => (
                    <FindingRow key={finding.id} finding={finding} />
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <span className="text-3xl mb-3">✅</span>
                <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  No security findings
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  All scans have come back clean
                </p>
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="space-y-2 animate-fade-in">
            {scanHistory.length > 0 ? (
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {scanHistory.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg"
                    style={{ background: 'var(--color-bg-tertiary)' }}
                  >
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: entry.isSafe ? '#22c55e' : '#ef4444' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium" style={{ color: entry.isSafe ? '#22c55e' : '#ef4444' }}>
                          {entry.isSafe ? 'Safe' : 'Blocked'}
                        </span>
                        <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
                          Risk: {Math.round(entry.riskScore * 100)}%
                        </span>
                        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                          {entry.findings.length} finding{entry.findings.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="text-[9px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                        {entry.contentLength.toLocaleString()} chars scanned
                      </div>
                    </div>
                    <span className="text-[9px] shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                      {new Date(entry.scannedAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <span className="text-3xl mb-3">📋</span>
                <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  No scan history
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  Scans will appear here as the agent processes content
                </p>
              </div>
            )}
          </div>
        )}

        {/* Blocked Tab */}
        {activeTab === 'blocked' && (
          <div className="space-y-2 animate-fade-in">
            {blockedAttempts.length > 0 ? (
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {blockedAttempts.map((attempt) => (
                  <BlockedAttemptRow key={attempt.id} attempt={attempt} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <span className="text-3xl mb-3">🛡️</span>
                <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  No blocked attempts
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  All interactions have been safe
                </p>
              </div>
            )}
          </div>
        )}

        {/* Config Tab */}
        {activeTab === 'config' && (
          <div className="space-y-4 animate-fade-in">
            {/* Detection toggles */}
            <div>
              <h5 className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>
                Detection Types
              </h5>
              <div className="space-y-2">
                {[
                  { key: 'enablePromptInjectionDetection', label: 'Prompt Injection Detection', icon: '💉', description: 'Detect attempts to override instructions' },
                  { key: 'enableCommandInjectionDetection', label: 'Command Injection Detection', icon: '🖥️', description: 'Detect malicious shell commands' },
                  { key: 'enableDataExfiltrationDetection', label: 'Data Exfiltration Detection', icon: '📤', description: 'Detect data leak attempts' },
                ].map(({ key, label, icon, description }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between p-3 rounded-lg"
                    style={{ background: 'var(--color-bg-tertiary)' }}
                  >
                    <div className="flex items-center gap-2">
                      <span>{icon}</span>
                      <div>
                        <div className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                          {label}
                        </div>
                        <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                          {description}
                        </div>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config[key as keyof SecurityConfig] as boolean}
                        onChange={(e) => onConfigChange({ [key]: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div
                        className="w-8 h-4 rounded-full transition-colors peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-transform"
                        style={{
                          background: config[key as keyof SecurityConfig] ? 'var(--color-accent)' : 'var(--color-bg-hover)',
                        }}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Risk threshold */}
            <div
              className="p-3 rounded-lg"
              style={{ background: 'var(--color-bg-tertiary)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  Risk Threshold
                </span>
                <span className="text-xs font-mono" style={{ color: 'var(--color-accent)' }}>
                  {Math.round(config.maxRiskScore * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={config.maxRiskScore}
                onChange={(e) => onConfigChange({ maxRiskScore: parseFloat(e.target.value) })}
                className="w-full h-1 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #22c55e 0%, #f59e0b 50%, #ef4444 100%)`,
                }}
              />
              <div className="flex justify-between mt-1">
                <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>Strict (10%)</span>
                <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>Lenient (100%)</span>
              </div>
              <p className="text-[10px] mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
                Content with risk scores above this threshold will be blocked
              </p>
            </div>

            {/* Custom patterns */}
            <div>
              <h5 className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>
                Custom Detection Patterns
              </h5>
              <div className="flex gap-1.5 mb-2">
                <input
                  type="text"
                  value={newPattern}
                  onChange={(e) => setNewPattern(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddPattern();
                  }}
                  className="flex-1 text-xs px-3 py-1.5 rounded-lg border-none outline-none"
                  style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)' }}
                  placeholder="Enter regex pattern, e.g., /dangerous.*/i"
                />
                <button
                  onClick={handleAddPattern}
                  disabled={!newPattern.trim()}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    background: newPattern.trim() ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                    color: newPattern.trim() ? '#fff' : 'var(--color-text-muted)',
                  }}
                >
                  Add
                </button>
              </div>
              {config.customPatterns.length > 0 && (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {config.customPatterns.map((pattern, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 p-2 rounded-lg group"
                      style={{ background: 'var(--color-bg-tertiary)' }}
                    >
                      <span className="text-[10px] font-mono flex-1 truncate" style={{ color: 'var(--color-accent)' }}>
                        {pattern}
                      </span>
                      <button
                        onClick={() => onRemoveCustomPattern(pattern)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
                        style={{ color: 'var(--color-text-muted)' }}
                        title="Remove pattern"
                      >
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {config.customPatterns.length === 0 && (
                <div className="text-[10px] text-center py-2" style={{ color: 'var(--color-text-muted)' }}>
                  No custom patterns defined
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SecurityDashboard;
