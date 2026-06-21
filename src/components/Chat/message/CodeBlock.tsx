/**
 * CodeBlock — syntax-highlighted code with copy button (OpenCowork style)
 * Uses highlight.js for syntax highlighting.
 */
import React, { useState, useMemo, memo } from 'react';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const hljs = require('highlight.js');

function sanitizeHighlight(html: string): string {
  return html.replace(/<(?!\/?span(?:\s+class="hljs-[^"]*")?\s*\/?>)[^>]*>/g, (match: string) =>
    match.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  );
}

interface CodeBlockProps {
  language: string;
  children: string;
}

const CodeBlock = memo(function CodeBlock({ language, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const highlightedHtml = useMemo(() => {
    try {
      const lang = language.toLowerCase();
      let result: string;
      if (hljs.getLanguage(lang)) {
        result = hljs.highlight(children, { language: lang }).value;
      } else {
        result = hljs.highlightAuto(children).value;
      }
      return sanitizeHighlight(result);
    } catch {
      return null;
    }
  }, [children, language]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="relative group my-3">
      <div className="absolute top-2 right-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <span className="text-xs px-2 py-1 rounded" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}>{language}</span>
        <button onClick={handleCopy}
          className="w-7 h-7 flex items-center justify-center rounded transition-colors"
          style={{ background: 'var(--color-bg-tertiary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}>
          {copied ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
          )}
        </button>
      </div>
      <pre className="rounded-lg overflow-hidden" style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border-secondary)' }}>
        {highlightedHtml ? (
          <code className="hljs block p-3.5 text-xs font-mono overflow-x-auto" dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
        ) : (
          <code className="block p-3.5 text-xs font-mono overflow-x-auto" style={{ color: 'var(--color-text-primary)' }}>{children}</code>
        )}
      </pre>
    </div>
  );
});

export default CodeBlock;
