/**
 * EditToolCard — file edit card with a simple inline diff view.
 *
 * Collapsed: shows the file path being edited.
 * Expanded: shows old_string (red, `-`) and new_string (green, `+`) side-by-side.
 */
import React from 'react';
import { ToolRendererProps, getStatusIcon, getResultString } from '../ToolRenderers';

const EditToolCard: React.FC<ToolRendererProps> = ({ toolCall, expanded, onToggle }) => {
  const args = (toolCall.arguments || {}) as Record<string, unknown>;
  const filePath = typeof args.path === 'string' ? args.path : '';
  const oldString = typeof args.old_string === 'string' ? args.old_string : '';
  const newString = typeof args.new_string === 'string' ? args.new_string : '';
  const replaceAll = Boolean(args.replace_all);

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

  // Truncated path for the header (keep the basename visible)
  const shortPath = (() => {
    if (!filePath) return '';
    const parts = filePath.split('/');
    if (parts.length <= 3) return filePath;
    return '…/' + parts.slice(-2).join('/');
  })();

  // Split old/new into lines for the diff
  const oldLines = oldString.split(/\r?\n/);
  const newLines = newString.split(/\r?\n/);

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
          edit
        </span>
        <span
          className="text-xs font-mono truncate flex-1 min-w-0"
          style={{ color: 'var(--color-text-primary)' }}
          title={filePath}
        >
          {shortPath || (isPending ? '…' : '')}
        </span>
        {replaceAll && (
          <span
            className="text-[10px] font-semibold flex-shrink-0 px-1.5 py-0.5 rounded"
            style={{ color: 'var(--color-accent)', background: 'rgba(214,122,82,0.1)' }}
          >
            all
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

      {/* Expanded diff view */}
      {expanded && (
        <div className="animate-fade-in" style={{ borderTop: '1px solid var(--color-border-secondary)' }}>
          {/* Full file path */}
          {filePath && (
            <div className="px-3 pt-2">
              <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--color-text-muted)' }}>
                File
              </span>
              <p className="text-xs font-mono mt-0.5 break-all" style={{ color: 'var(--color-text-secondary)' }}>
                {filePath}
              </p>
            </div>
          )}

          {/* Diff */}
          <div className="px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Diff
            </div>
            <div
              className="rounded-lg overflow-hidden"
              style={{ border: '1px solid var(--color-border-secondary)' }}
            >
              {/* Removed lines (old) */}
              {oldString.length > 0 && (
                <div style={{ background: 'rgba(239,68,68,0.06)' }}>
                  {oldLines.map((line, i) => (
                    <div
                      key={`o-${i}`}
                      className="flex items-start font-mono text-xs px-2 py-0.5"
                      style={{ borderBottom: i < oldLines.length - 1 ? '1px solid var(--color-border-secondary)' : undefined }}
                    >
                      <span className="flex-shrink-0 w-4 select-none" style={{ color: '#ef4444' }}>-</span>
                      <span className="whitespace-pre-wrap break-all" style={{ color: '#ef4444' }}>
                        {line || ' '}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {/* Added lines (new) */}
              {newString.length > 0 && (
                <div style={{ background: 'rgba(34,197,94,0.06)' }}>
                  {newLines.map((line, i) => (
                    <div
                      key={`n-${i}`}
                      className="flex items-start font-mono text-xs px-2 py-0.5"
                      style={{ borderBottom: i < newLines.length - 1 ? '1px solid var(--color-border-secondary)' : undefined }}
                    >
                      <span className="flex-shrink-0 w-4 select-none" style={{ color: 'var(--color-success)' }}>+</span>
                      <span className="whitespace-pre-wrap break-all" style={{ color: 'var(--color-success)' }}>
                        {line || ' '}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {oldString.length === 0 && newString.length === 0 && (
                <div className="px-2 py-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  (empty)
                </div>
              )}
            </div>
          </div>

          {/* Result message */}
          {(() => {
            const r = getResultString(toolCall);
            if (!r) return null;
            return (
              <div
                className="px-3 pb-2"
                style={{ borderTop: '1px solid var(--color-border-secondary)' }}
              >
                <div
                  className="text-[10px] uppercase tracking-wider font-medium mt-2 mb-1"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {isError || isDenied ? 'Error' : 'Result'}
                </div>
                <pre
                  className="text-xs font-mono whitespace-pre-wrap break-all rounded-lg p-2 max-h-[200px] overflow-y-auto"
                  style={{
                    background: isError || isDenied ? 'rgba(239,68,68,0.05)' : 'var(--color-bg-tertiary)',
                    color: isError || isDenied ? 'var(--color-error)' : 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border-secondary)',
                  }}
                >
                  {r}
                </pre>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default EditToolCard;
