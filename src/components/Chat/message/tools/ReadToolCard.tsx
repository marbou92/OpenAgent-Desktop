/**
 * ReadToolCard — file read card.
 *
 * Collapsed: shows the file path being read.
 * Expanded: shows the file content with line numbers (parses the result
 * string — which already may contain line-number prefixes from the tool,
 * or raw content; we number lines ourselves when not already numbered).
 */
import React from 'react';
import { ToolRendererProps, getResultString, getToolVisual } from '../ToolRenderers';

const ReadToolCard: React.FC<ToolRendererProps> = ({ toolCall, expanded, onToggle }) => {
  const args = (toolCall.arguments || {}) as Record<string, unknown>;
  const filePath = typeof args.path === 'string' ? args.path : '';
  const offset = typeof args.offset === 'number' ? args.offset : undefined;
  const limit = typeof args.limit === 'number' ? args.limit : undefined;

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

  const resultStr = getResultString(toolCall);

  // Short path for header
  const shortPath = (() => {
    if (!filePath) return '';
    const parts = filePath.split('/');
    if (parts.length <= 3) return filePath;
    return '…/' + parts.slice(-2).join('/');
  })();

  // Parse lines from the result. Many tools already return content with
  // `     N\tcontent` line-number prefixes (cat -n style). Detect that
  // pattern; if present, preserve the numbers. Otherwise, add our own.
  const parsedLines = (() => {
    if (!resultStr) return [] as { num: string; content: string }[];
    const rawLines = resultStr.split(/\r?\n/);
    // Heuristic: at least 70% of non-empty lines match `^\s*\d+\s+(.*)$`.
    const catNRegex = /^\s*(\d+)\s+(.*)$/;
    let catNCount = 0;
    let nonEmptyCount = 0;
    for (const l of rawLines) {
      if (l.trim() === '') continue;
      nonEmptyCount++;
      if (catNRegex.test(l)) catNCount++;
    }
    const isCatN = nonEmptyCount > 0 && catNCount / nonEmptyCount >= 0.7;
    if (isCatN) {
      return rawLines.map((l) => {
        const m = l.match(catNRegex);
        if (m) return { num: m[1], content: m[2] };
        return { num: '', content: l };
      });
    }
    // No cat -n: number lines ourselves, starting at offset (if provided).
    const start = offset && offset > 0 ? offset : 1;
    return rawLines.map((l, i) => ({ num: String(start + i), content: l }));
  })();

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
          read
        </span>
        <span
          className="text-xs font-mono truncate flex-1 min-w-0"
          style={{ color: 'var(--color-text-primary)' }}
          title={filePath}
        >
          {shortPath || (isPending ? '…' : '')}
        </span>
        {!isPending && parsedLines.length > 0 && (
          <span
            className="text-[10px] font-semibold flex-shrink-0 px-1.5 py-0.5 rounded"
            style={{ color: 'var(--color-text-secondary)', background: 'var(--color-bg-tertiary)' }}
          >
            {parsedLines.length} lines
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
          {/* Full path + params */}
          {filePath && (
            <div className="px-3 pt-2 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider font-medium w-14" style={{ color: 'var(--color-text-muted)' }}>
                  File
                </span>
                <span className="text-xs font-mono break-all" style={{ color: 'var(--color-text-secondary)' }}>
                  {filePath}
                </span>
              </div>
              {(offset !== undefined || limit !== undefined) && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider font-medium w-14" style={{ color: 'var(--color-text-muted)' }}>
                    Range
                  </span>
                  <span className="text-xs font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                    {offset !== undefined ? `offset=${offset}` : 'offset=1'}
                    {limit !== undefined ? ` limit=${limit}` : ''}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Content with line numbers */}
          {parsedLines.length > 0 ? (
            <div className="px-3 py-2 mt-2" style={{ borderTop: '1px solid var(--color-border-secondary)' }}>
              <div className="text-[10px] uppercase tracking-wider font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                Content
              </div>
              <div
                className="rounded-lg max-h-[400px] overflow-y-auto font-mono text-xs"
                style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-secondary)' }}
              >
                {parsedLines.map((l, i) => (
                  <div
                    key={i}
                    className="flex items-start px-2 py-0.5"
                    style={{ borderBottom: i < parsedLines.length - 1 ? '1px solid var(--color-border-secondary)' : undefined }}
                  >
                    <span
                      className="flex-shrink-0 select-none text-right pr-3"
                      style={{ color: 'var(--color-text-muted)', minWidth: '3rem' }}
                    >
                      {l.num}
                    </span>
                    <span
                      className="whitespace-pre-wrap break-all flex-1 min-w-0"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {l.content || ' '}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            !isPending && resultStr && (
              <div className="px-3 py-2 mt-2" style={{ borderTop: '1px solid var(--color-border-secondary)' }}>
                <pre
                  className="text-xs font-mono whitespace-pre-wrap break-all rounded-lg p-2.5 max-h-[300px] overflow-y-auto"
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

export default ReadToolCard;
