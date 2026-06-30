/**
 * GrepToolCard — content search results card.
 *
 * Collapsed: shows the search pattern.
 * Expanded: parses the result for `file:line:content` matches and renders
 * them with file paths highlighted and line numbers in muted color.
 */
import React from 'react';
import { ToolRendererProps, getResultString, getToolVisual } from '../ToolRenderers';

interface GrepMatch {
  file: string;
  line: string;
  content: string;
}

function parseGrepResult(raw: string): GrepMatch[] {
  const matches: GrepMatch[] = [];
  if (!raw) return matches;
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    // Match `path:line:content` — path may contain colons on Windows (C:\...),
    // so we split greedily from the right: last colon separates content,
    // second-to-last colon separates line number.
    const m = line.match(/^(.*?):(\d+):(.*)$/);
    if (m) {
      matches.push({ file: m[1], line: m[2], content: m[3] });
      continue;
    }
    // Match `path:line` (no content — e.g. files-with-matches mode)
    const m2 = line.match(/^(.*?):(\d+)$/);
    if (m2) {
      matches.push({ file: m2[1], line: m2[2], content: '' });
      continue;
    }
    // Match `path:content` (no line number)
    const m3 = line.match(/^(.*?):(.*)$/);
    if (m3) {
      matches.push({ file: m3[1], line: '', content: m3[2] });
      continue;
    }
    // Plain file path
    matches.push({ file: line, line: '', content: '' });
  }
  return matches;
}

const GrepToolCard: React.FC<ToolRendererProps> = ({ toolCall, expanded, onToggle }) => {
  const args = (toolCall.arguments || {}) as Record<string, unknown>;
  const pattern = typeof args.pattern === 'string' ? args.pattern : '';
  const path = typeof args.path === 'string' ? args.path : '';
  const include = typeof args.include === 'string' ? args.include : '';
  const outputOnly = Boolean(args.output_only);

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
  const matches = parseGrepResult(resultStr);
  const matchCount = matches.length;

  // Truncated pattern for header
  const truncatedPattern = pattern.length > 60 ? pattern.slice(0, 57) + '…' : pattern;

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
          grep
        </span>
        <span
          className="text-xs font-mono truncate flex-1 min-w-0"
          style={{ color: 'var(--color-text-primary)' }}
          title={pattern}
        >
          {truncatedPattern || (isPending ? '…' : '')}
        </span>
        {!isPending && matchCount > 0 && (
          <span
            className="text-[10px] font-semibold flex-shrink-0 px-1.5 py-0.5 rounded"
            style={{ color: 'var(--color-text-secondary)', background: 'var(--color-bg-tertiary)' }}
          >
            {matchCount} {matchCount === 1 ? 'match' : 'matches'}
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
          {/* Search params */}
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
            {include && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider font-medium w-14" style={{ color: 'var(--color-text-muted)' }}>
                  Include
                </span>
                <span className="text-xs font-mono break-all" style={{ color: 'var(--color-text-secondary)' }}>
                  {include}
                </span>
              </div>
            )}
            {outputOnly && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider font-medium w-14" style={{ color: 'var(--color-text-muted)' }}>
                  Mode
                </span>
                <span className="text-xs font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                  output_only
                </span>
              </div>
            )}
          </div>

          {/* Matches */}
          {matches.length > 0 ? (
            <div className="px-3 py-2 mt-2" style={{ borderTop: '1px solid var(--color-border-secondary)' }}>
              <div className="text-[10px] uppercase tracking-wider font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                Matches
              </div>
              <div
                className="rounded-lg max-h-[300px] overflow-y-auto"
                style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-secondary)' }}
              >
                {matches.map((m, i) => (
                  <div
                    key={`${m.file}:${m.line}:${i}`}
                    className="px-2 py-1 font-mono text-xs flex items-start gap-1.5"
                    style={{ borderBottom: i < matches.length - 1 ? '1px solid var(--color-border-secondary)' : undefined }}
                  >
                    <span className="flex-shrink-0 break-all" style={{ color: 'var(--color-text-primary)' }} title={m.file}>
                      {m.file}
                    </span>
                    {m.line && (
                      <span className="flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                        :{m.line}:
                      </span>
                    )}
                    {m.content && (
                      <span className="whitespace-pre-wrap break-all flex-1 min-w-0" style={{ color: 'var(--color-text-secondary)' }}>
                        {m.content}
                      </span>
                    )}
                  </div>
                ))}
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

export default GrepToolCard;
