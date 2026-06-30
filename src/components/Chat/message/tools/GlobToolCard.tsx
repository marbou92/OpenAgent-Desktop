/**
 * GlobToolCard — file-pattern match card.
 *
 * Collapsed: shows the glob pattern.
 * Expanded: shows the matched files as a list.
 */
import React from 'react';
import { ToolRendererProps, getStatusIcon, getResultString } from '../ToolRenderers';

function parseGlobResult(raw: string): string[] {
  if (!raw) return [];
  // Result may be a plain newline-separated list, or JSON like
  // {"files": [...]} / [...]. Handle both.
  const trimmed = raw.trim();
  // Try JSON first if it looks like JSON.
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((p) => (typeof p === 'string' ? p : String(p)));
      }
      if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>;
        for (const key of ['files', 'matches', 'paths', 'results']) {
          if (Array.isArray(obj[key])) {
            return (obj[key] as unknown[]).map((p) => (typeof p === 'string' ? p : String(p)));
          }
        }
      }
    } catch {
      // fall through to line-based parsing
    }
  }
  // Plain newline / whitespace-separated list of paths.
  return trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

const GlobToolCard: React.FC<ToolRendererProps> = ({ toolCall, expanded, onToggle }) => {
  const args = (toolCall.arguments || {}) as Record<string, unknown>;
  const pattern = typeof args.pattern === 'string' ? args.pattern : '';
  const path = typeof args.path === 'string' ? args.path : '';

  const status = toolCall.status;
  const { icon: statusIcon, color: statusColor } = getStatusIcon(status);
  const isError = status === 'failed';
  const isDenied = status === 'denied';
  const isDeactivated = status === 'deactivated';
  const isPending = status === 'pending';

  const borderColor = isDeactivated
    ? 'var(--color-border-secondary)'
    : isDenied
    ? 'rgba(239,68,68,0.3)'
    : isError
    ? 'rgba(239,68,68,0.25)'
    : isPending
    ? 'rgba(214,122,82,0.15)'
    : 'var(--color-border-secondary)';
  const bgColor = isDeactivated
    ? 'rgba(107,114,128,0.05)'
    : isDenied
    ? 'rgba(239,68,68,0.08)'
    : isError
    ? 'rgba(239,68,68,0.05)'
    : isPending
    ? 'rgba(214,122,82,0.05)'
    : 'rgba(0,0,0,0.15)';

  const resultStr = getResultString(toolCall);
  const files = parseGlobResult(resultStr);

  // Truncated pattern for header
  const truncatedPattern = pattern.length > 60 ? pattern.slice(0, 57) + '…' : pattern;

  return (
    <div
      className="rounded-2xl overflow-hidden my-1.5"
      style={{ border: `1px solid ${borderColor}`, background: bgColor }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors"
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <span className="flex-shrink-0" style={{ color: statusColor, display: 'inline-flex' }}>
          {statusIcon}
        </span>
        <span
          className="text-xs font-mono font-semibold flex-shrink-0"
          style={{ color: isDeactivated ? 'var(--color-text-muted)' : 'var(--color-text-secondary)' }}
        >
          glob
        </span>
        <span
          className="text-xs font-mono truncate flex-1 min-w-0"
          style={{ color: 'var(--color-text-primary)' }}
          title={pattern}
        >
          {truncatedPattern || (isPending ? '…' : '')}
        </span>
        {!isPending && files.length > 0 && (
          <span
            className="text-[10px] font-semibold flex-shrink-0 px-1.5 py-0.5 rounded"
            style={{ color: 'var(--color-text-secondary)', background: 'var(--color-bg-tertiary)' }}
          >
            {files.length} {files.length === 1 ? 'file' : 'files'}
          </span>
        )}
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

      {/* Expanded */}
      {expanded && (
        <div className="animate-fade-in" style={{ borderTop: '1px solid var(--color-border-secondary)' }}>
          {/* Params */}
          <div className="px-3 pt-2 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider font-medium w-14" style={{ color: 'var(--color-text-muted)' }}>
                Pattern
              </span>
              <span className="text-xs font-mono break-all" style={{ color: 'var(--color-text-primary)' }}>
                {pattern}
              </span>
            </div>
            {path && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider font-medium w-14" style={{ color: 'var(--color-text-muted)' }}>
                  Path
                </span>
                <span className="text-xs font-mono break-all" style={{ color: 'var(--color-text-secondary)' }}>
                  {path}
                </span>
              </div>
            )}
          </div>

          {/* Matched files list */}
          {files.length > 0 ? (
            <div className="px-3 py-2 mt-2" style={{ borderTop: '1px solid var(--color-border-secondary)' }}>
              <div className="text-[10px] uppercase tracking-wider font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                Matched Files
              </div>
              <div
                className="rounded-lg max-h-[300px] overflow-y-auto"
                style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-secondary)' }}
              >
                {files.map((f, i) => {
                  const parts = f.split('/');
                  const name = parts[parts.length - 1];
                  const dir = parts.length > 1 ? parts.slice(0, -1).join('/') + '/' : '';
                  return (
                    <div
                      key={`${f}-${i}`}
                      className="px-2 py-1 font-mono text-xs flex items-start gap-1"
                      style={{ borderBottom: i < files.length - 1 ? '1px solid var(--color-border-secondary)' : undefined }}
                      title={f}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--color-text-muted)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="flex-shrink-0 mt-0.5"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <span className="break-all min-w-0">
                        {dir && <span style={{ color: 'var(--color-text-muted)' }}>{dir}</span>}
                        <span style={{ color: 'var(--color-text-primary)' }}>{name}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            !isPending && resultStr && (
              <div className="px-3 py-2 mt-2" style={{ borderTop: '1px solid var(--color-border-secondary)' }}>
                <div className="text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
                  Output
                </div>
                <pre
                  className="text-xs font-mono whitespace-pre-wrap break-all rounded-lg p-2.5 max-h-[200px] overflow-y-auto"
                  style={{
                    background: isError || isDenied ? 'rgba(239,68,68,0.05)' : 'var(--color-bg-tertiary)',
                    color: isError || isDenied ? 'var(--color-error)' : 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border-secondary)',
                  }}
                >
                  {resultStr}
                </pre>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};

export default GlobToolCard;
