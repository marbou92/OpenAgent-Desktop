/**
 * BashToolCard — terminal-style bash command card.
 *
 * Collapsed: shows the command in a mono-spaced terminal block, with an
 * exit-code indicator (green check = success, red X = error).
 * Expanded: shows the full stdout/stderr in a scrollable mono block.
 */
import React from 'react';
import { ToolRendererProps, getResultString, getToolVisual } from '../ToolRenderers';

const BashToolCard: React.FC<ToolRendererProps> = ({ toolCall, expanded, onToggle }) => {
  const args = (toolCall.arguments || {}) as Record<string, unknown>;
  const command = typeof args.command === 'string' ? args.command : '';
  const description = typeof args.description === 'string' ? args.description : '';

  const status = toolCall.status;
  const visual = getToolVisual(toolCall.name);
  const isError = status === 'failed';
  const isDenied = status === 'denied';
  const isDeactivated = status === 'deactivated';
  const isPending = status === 'pending';

  const output = getResultString(toolCall);

  // Try to find an exit code in the result (object form: { exitCode, stdout, stderr, ... }).
  let exitCode: number | null = null;
  if (toolCall.result && typeof toolCall.result === 'object') {
    const r = toolCall.result as Record<string, unknown>;
    if (typeof r.exitCode === 'number') exitCode = r.exitCode;
    else if (typeof r.code === 'number') exitCode = r.code;
    else if (typeof r.exit_code === 'number') exitCode = r.exit_code;
  }

  // ─── Phase 2.4.2: per-tool visual identity ───────────────────────
  // Subtle 1px border on top/right/bottom; 3px solid colored stripe on left.
  // Status override: denied/failed → red, deactivated → grey; otherwise the tool's color.
  // Background uses the tool's faint tint regardless of status.
  const leftBorderColor = isDenied || isError
    ? '#ef4444'
    : isDeactivated
    ? 'var(--color-text-muted)'
    : visual?.color ?? 'var(--color-border-secondary)';
  const tintBg = visual?.tint ?? 'rgba(0,0,0,0.15)';

  // Truncated command for the header
  const truncatedCommand = command.length > 80 ? command.slice(0, 77) + '…' : command;

  // ─── Phase 2.7: Collapsed = compact inline chip (Claude Code-style).
  // Expanded = full-width details panel (kept unchanged below).
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] my-0.5 transition-all max-w-full"
        style={{
          background: tintBg,
          border: '1px solid var(--color-border-secondary)',
          borderLeft: `3px solid ${leftBorderColor}`,
          cursor: 'pointer',
          fontFamily: 'var(--v2-font-family-text, inherit)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = tintBg; }}
      >
        {/* Tool shape icon — colored with the tool's accent color */}
        <span className="flex-shrink-0" style={{ color: visual?.color ?? 'var(--color-text-secondary)', display: 'inline-flex' }}>
          {visual?.shape}
        </span>
        {/* Tool name */}
        <span className="font-mono flex-shrink-0" style={{ color: isDeactivated ? 'var(--color-text-muted)' : 'var(--color-text-secondary)' }}>
          bash
        </span>
        {/* Summary — the command */}
        {truncatedCommand ? (
          <span className="font-mono truncate min-w-0" style={{ color: 'var(--color-text-primary)', maxWidth: '40ch' }} title={command}>
            <span style={{ color: 'var(--color-text-muted)' }}>· $ </span>
            {truncatedCommand}
          </span>
        ) : isPending ? (
          <span className="flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>· …</span>
        ) : null}
        {/* Status badge */}
        {isPending ? (
          <span className="flex-shrink-0" style={{ color: 'var(--color-accent)' }}>· running</span>
        ) : isDenied ? (
          <span className="flex-shrink-0" style={{ color: '#ef4444' }}>· denied</span>
        ) : isDeactivated ? (
          <span className="flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>· off</span>
        ) : isError ? (
          <span className="flex-shrink-0" style={{ color: '#ef4444' }}>· {exitCode !== null ? `exit ${exitCode}` : 'error'}</span>
        ) : (
          <span className="flex-shrink-0" style={{ color: 'var(--color-success)' }}>· {exitCode !== null ? `exit ${exitCode}` : 'ok'}</span>
        )}
      </button>
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden my-1.5"
      style={{ border: '1px solid var(--color-border-secondary)', borderLeft: `3px solid ${leftBorderColor}`, background: tintBg }}
    >
      {/* Header row — clickable */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors"
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        {/* Tool shape icon — colored with the tool's accent color */}
        <span className="flex-shrink-0" style={{ color: visual?.color ?? 'var(--color-text-secondary)', display: 'inline-flex' }}>
          {visual?.shape}
        </span>

        {/* Tool label */}
        <span
          className="text-xs font-mono font-semibold flex-shrink-0"
          style={{ color: isDeactivated ? 'var(--color-text-muted)' : 'var(--color-text-secondary)' }}
        >
          bash
        </span>

        {/* Command preview — terminal style chip */}
        <span
          className="text-xs font-mono truncate flex-1 min-w-0 px-1.5 py-0.5 rounded"
          style={{
            background: 'var(--color-bg-tertiary)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border-secondary)',
          }}
          title={command}
        >
          <span style={{ color: 'var(--color-text-muted)', marginRight: 4 }}>$</span>
          {truncatedCommand || (isPending ? '…' : '')}
        </span>

        {/* Exit code indicator (collapsed) */}
        {!isPending && !isDeactivated && (
          <span
            className="text-[10px] font-semibold flex-shrink-0 px-1.5 py-0.5 rounded"
            style={{
              color: isError || isDenied ? '#ef4444' : 'var(--color-success)',
              background: isError || isDenied ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
            }}
            title={exitCode !== null ? `Exit code: ${exitCode}` : 'Result'}
          >
            {exitCode !== null ? `exit ${exitCode}` : isError ? 'error' : 'ok'}
          </span>
        )}

        {/* Chevron */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-text-muted)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="flex-shrink-0"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="animate-fade-in" style={{ borderTop: '1px solid var(--color-border-secondary)' }}>
          {/* Optional description */}
          {description && (
            <div className="px-3 pt-2">
              <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--color-text-muted)' }}>
                Description
              </span>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                {description}
              </p>
            </div>
          )}

          {/* Command block (terminal style) */}
          <div className="px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Command
            </div>
            <pre
              className="text-xs font-mono whitespace-pre-wrap break-all rounded-lg p-2.5"
              style={{
                background: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border-secondary)',
              }}
            >
              <span style={{ color: 'var(--color-text-muted)' }}>$ </span>
              {command}
            </pre>
          </div>

          {/* Output */}
          {output && (
            <div className="px-3 pb-2" style={{ borderTop: '1px solid var(--color-border-secondary)' }}>
              <div className="text-[10px] uppercase tracking-wider font-medium mt-2 mb-1" style={{ color: 'var(--color-text-muted)' }}>
                {isError || isDenied ? 'Error Output' : 'Output'}
              </div>
              <pre
                className="text-xs font-mono whitespace-pre-wrap break-all rounded-lg p-2.5 max-h-[300px] overflow-y-auto"
                style={{
                  background: isError || isDenied ? 'rgba(239,68,68,0.05)' : 'var(--color-bg-tertiary)',
                  color: isError || isDenied ? 'var(--color-error)' : 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border-secondary)',
                }}
              >
                {output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BashToolCard;
