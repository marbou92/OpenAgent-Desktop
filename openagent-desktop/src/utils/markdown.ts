/**
 * OpenAgent-Desktop - Markdown Utilities
 *
 * Custom markdown-to-HTML renderer with no external dependencies.
 * Supports headers, bold, italic, strikethrough, code blocks,
 * lists, links, blockquotes, tables, and horizontal rules.
 */

interface MarkdownToken {
  type: 'heading' | 'paragraph' | 'code_block' | 'list' | 'blockquote' | 'table' | 'hr' | 'html';
  content: string;
  level?: number;
  language?: string;
  ordered?: boolean;
  items?: string[];
  rows?: string[][];
  headerRow?: string[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseInline(text: string): string {
  let result = text;

  // Inline code (must be processed first to avoid conflicts)
  result = result.replace(/`([^`]+)`/g, (_match, code) => {
    return `<code>${escapeHtml(code)}</code>`;
  });

  // Bold + Italic (***text***)
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');

  // Bold (**text** or __text__)
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic (*text* or _text_)
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  result = result.replace(/(?<!\w)_(.+?)_(?!\w)/g, '<em>$1</em>');

  // Strikethrough (~~text~~)
  result = result.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Images ![alt](url)
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:8px;" />');

  // Links [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Auto-links <url>
  result = result.replace(/&lt;(https?:\/\/[^&]+)&gt;/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

  return result;
}

function tokenize(markdown: string): MarkdownToken[] {
  const lines = markdown.split('\n');
  const tokens: MarkdownToken[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      tokens.push({ type: 'hr', content: '' });
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      tokens.push({
        type: 'heading',
        content: headingMatch[2],
        level: headingMatch[1].length,
      });
      i++;
      continue;
    }

    // Fenced code block
    const codeMatch = line.match(/^```(\w*)/);
    if (codeMatch) {
      const language = codeMatch[1] || '';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      tokens.push({
        type: 'code_block',
        content: codeLines.join('\n'),
        language,
      });
      continue;
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length && /^\|?\s*[-:]+[-|\s:]*$/.test(lines[i + 1])) {
      const headerCells = line.split('|').map(c => c.trim()).filter(c => c !== '');
      i++; // skip header
      i++; // skip separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|')) {
        const rowCells = lines[i].split('|').map(c => c.trim()).filter(c => c !== '');
        rows.push(rowCells);
        i++;
      }
      tokens.push({
        type: 'table',
        content: '',
        headerRow: headerCells,
        rows,
      });
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      tokens.push({
        type: 'blockquote',
        content: quoteLines.join('\n'),
      });
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s+/, ''));
        i++;
      }
      tokens.push({
        type: 'list',
        content: '',
        ordered: false,
        items,
      });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''));
        i++;
      }
      tokens.push({
        type: 'list',
        content: '',
        ordered: true,
        items,
      });
      continue;
    }

    // Paragraph - collect consecutive non-empty, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('#') &&
      !lines[i].startsWith('```') &&
      !lines[i].startsWith('> ') &&
      !/^[-*+]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      tokens.push({
        type: 'paragraph',
        content: paraLines.join('\n'),
      });
    }
  }

  return tokens;
}

function renderToken(token: MarkdownToken): string {
  switch (token.type) {
    case 'heading':
      return `<h${token.level}>${parseInline(token.content)}</h${token.level}>`;

    case 'paragraph':
      return `<p>${parseInline(token.content)}</p>`;

    case 'code_block': {
      const escaped = escapeHtml(token.content);
      const langAttr = token.language ? ` class="language-${token.language}"` : '';
      const langLabel = token.language
        ? `<div class="code-block-header"><span>${token.language}</span><button class="copy-code-btn" onclick="navigator.clipboard.writeText(this.closest('pre').querySelector('code').textContent)" title="Copy code">Copy</button></div>`
        : '';
      return `<pre>${langLabel}<code${langAttr}>${escaped}</code></pre>`;
    }

    case 'list': {
      const tag = token.ordered ? 'ol' : 'ul';
      const items = (token.items || [])
        .map(item => `<li>${parseInline(item)}</li>`)
        .join('');
      return `<${tag}>${items}</${tag}>`;
    }

    case 'blockquote':
      return `<blockquote>${renderMarkdown(token.content)}</blockquote>`;

    case 'table': {
      const headerCells = (token.headerRow || [])
        .map(cell => `<th>${parseInline(cell)}</th>`)
        .join('');
      const bodyRows = (token.rows || [])
        .map(row => {
          const cells = row.map(cell => `<td>${parseInline(cell)}</td>`).join('');
          return `<tr>${cells}</tr>`;
        })
        .join('');
      return `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
    }

    case 'hr':
      return '<hr />';

    default:
      return '';
  }
}

export function renderMarkdown(markdown: string): string {
  if (!markdown) return '';
  const tokens = tokenize(markdown);
  return tokens.map(renderToken).join('\n');
}

/**
 * Extract code blocks from markdown content.
 * Returns an array of { language, code } objects.
 */
export function extractCodeBlocks(markdown: string): { language: string; code: string }[] {
  const blocks: { language: string; code: string }[] = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    blocks.push({
      language: match[1] || 'text',
      code: match[2],
    });
  }
  return blocks;
}

/**
 * Sanitize HTML content by removing potentially dangerous elements.
 * Basic sanitization for rendered markdown output.
 */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

/**
 * Truncate markdown content to a maximum length,
 * keeping it valid (not cutting in the middle of code blocks).
 */
export function truncateMarkdown(markdown: string, maxLength: number): string {
  if (markdown.length <= maxLength) return markdown;

  let truncated = markdown.substring(0, maxLength);

  // Check if we're in the middle of a code block
  const openCodeBlocks = (truncated.match(/```/g) || []).length;
  if (openCodeBlocks % 2 !== 0) {
    // Find the last opening ``` and cut before it
    const lastOpen = truncated.lastIndexOf('```');
    truncated = truncated.substring(0, lastOpen);
  }

  return truncated + '...';
}
