/**
 * WriteToolCard — file write/create card.
 *
 * Collapsed: shows the file path being written/created.
 * Expanded: shows a preview of the content (first 10 lines).
 */
import React from 'react';
import { ToolRendererProps, getResultString, getToolVisual } from '../ToolRenderers';

const WriteToolCard: React.FC<ToolRendererProps> = ({ toolCall, expanded, onToggle }) => {
  const args = (toolCall.arguments || {}) as Record<string, unknown>;
  const filePath = typeof args.path === 'string' ? args.path : '';
  const content = typeof args.content === 'string' ? args.content : '';

  const status = toolCall.status;
  const visual = getToolVisual(toolCall.name);
  const isError = status === 'failed';
  const isDenied = status === 'denied';
  const isDeactivated = status === 'deactivated';
  const isPending = status === 'pending';

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

  // Preview = first 10 lines of content
  const allLines = content ? content.split(/\r?\n/) : [];
  const previewLines = allLines.slice(0, 10);
  const hasMore = allLines.length > 10;
  const totalLines = allLines.length;

  // Short path for header
  const shortPath = (() => {
    if (!filePath) return '';
    const parts = filePath.split('/');
    if (parts.length <= 3) return filePath;
    return '…/' + parts.slice(-2).join('/');
  })();

  const resultStr = getResultString(toolCall);

  return (
    <div
      className="rounded-2xl overflow-hidden my-1.5"
      style={{ border: '1px solid var(--color-border-secondary)', borderLeft: `3px solid ${leftBorderColor}`, background: tintBg }}
    >
      {/* Header */}
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
        <span
          className="text-xs font-mono font-semibold flex-shrink-0"
          style={{ color: isDeactivated ? 'var(--color-text-muted)' : 'var(--color-text-secondary)' }}
        >
          write
        </span>
        <span
          className="text-xs font-mono truncate flex-1 min-w-0"
          style={{ color: 'var(--color-text-primary)' }}
          title={filePath}
        >
          {shortPath || (isPending ? '…' : '')}
        </span>
        {!isPending && content && (
          <span
            className="text-[10px] font-semibold flex-shrink-0 px-1.5 py-0.5 rounded"
            style={{ color: 'var(--color-text-secondary)', background: 'var(--color-bg-tertiary)' }}
          >
            {totalLines} {totalLines === 1 ? 'line' : 'lines'}
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
          {/* Full path */}
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

          {/* Content preview */}
          {previewLines.length > 0 ? (
            <div className="px-3 py-2 mt-2" style={{ borderTop: '1px solid var(--color-border-secondary)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--color-text-muted)' }}>
                  Preview
                </span>
                {hasMore && (
                  <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                    first 10 of {totalLines} lines
                  </span>
                )}
              </div>
              <pre
                className="text-xs font-mono whitespace-pre-wrap break-all rounded-lg p-2.5 max-h-[300px] overflow-y-auto"
                style={{
                  background: 'var(--color-bg-tertiary)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border-secondary)',
                }}
              >
                {previewLines.join('\n')}
              </pre>
            </div>
          ) : (
            !isPending && (
              <div className="px-3 py-2 mt-2" style={{ borderTop: '1px solid var(--color-border-secondary)' }}>
                <span className="text-xs italic" style={{ color: 'var(--color-text-muted)' }}>
                  (empty content)
                </span>
              </div>
            )
          )}

          {/* Result message */}
          {resultStr && (
            <div className="px-3 pb-2" style={{ borderTop: '1px solid var(--color-border-secondary)' }}>
              <div className="text-[10px] uppercase tracking-wider font-medium mt-2 mb-1" style={{ color: 'var(--color-text-muted)' }}>
                {isError || isDenied ? 'Error' : 'Result'}
              </div>
              <pre
                className="text-xs font-mono whitespace-pre-wrap break-all rounded-lg p-2 max-h-[160px] overflow-y-auto"
                style={{
                  background: isError || isDenied ? 'rgba(239,68,68,0.05)' : 'var(--color-bg-tertiary)',
                  color: isError || isDenied ? 'var(--color-error)' : 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border-secondary)',
                }}
              >
                {resultStr}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WriteToolCard;
