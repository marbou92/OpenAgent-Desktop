/**
 * ThinkingBlock — OpenCowork-style collapsible thinking display
 * Brain icon, preview when collapsed, markdown content when expanded.
 */
import React, { useState, memo } from 'react';

interface ThinkingBlockProps {
  thinking: string;
  isStreaming?: boolean;
}

const ThinkingBlock = memo(function ThinkingBlock({ thinking, isStreaming }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const text = thinking || '';
  if (!text) return null;

  // Preview: first ~80 chars
  let preview = text.length > 80 ? text.substring(0, 77) + '...' : text;

  return (
    <div className="rounded-2xl overflow-hidden mb-1.5" style={{ border: '1px solid var(--color-border-secondary)', background: 'rgba(0,0,0,0.15)' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        {/* Brain icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
          <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2z" />
          <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2z" />
        </svg>
        <span className="text-xs font-medium flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
          {isStreaming ? 'Thinking…' : 'Thinking'}
        </span>
        {!expanded && (
          <span className="text-[11px] truncate flex-1 min-w-0 italic" style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>
            {preview}
          </span>
        )}
        {/* Chevron */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 ml-auto"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      {expanded && (
        <div className="px-4 py-3 animate-fade-in" style={{ borderTop: '1px solid var(--color-border-secondary)' }}>
          <div className="text-sm whitespace-pre-wrap max-w-none" style={{ color: 'var(--color-text-secondary)', lineHeight: '1.625', fontFamily: "'Source Serif 4', Georgia, serif" }}>
            {text}
          </div>
        </div>
      )}
    </div>
  );
});

export default ThinkingBlock;
