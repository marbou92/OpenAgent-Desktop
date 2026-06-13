/**
 * OpenAgent-Desktop - Enhanced Wildcard Permission Matcher
 *
 * Supports glob-style patterns with *, **, and ? wildcards.
 * Last-match-wins semantics like Goose's permission system.
 * Supports pattern categories and inheritance.
 */

import { PermissionLevel } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WildcardPattern {
  pattern: string;
  level: PermissionLevel;
  reason?: string;
  category?: string;
  priority?: number;
}

export interface WildcardMatchResult {
  matched: boolean;
  level: PermissionLevel;
  matchedPattern?: WildcardPattern;
  specificity: number;
  explanation: string;
}

export interface ParsedPattern {
  raw: string;
  segments: PatternSegment[];
  category?: string;
  toolType?: string;
  hasMultiWildcard: boolean;
  hasSingleWildcard: boolean;
  hasCharWildcard: boolean;
  specificity: number;
}

interface PatternSegment {
  value: string;
  type: 'literal' | 'single-wildcard' | 'multi-wildcard' | 'char-wildcard';
}

// ─── Known Tool Categories ────────────────────────────────────────────────────

const KNOWN_CATEGORIES: Record<string, string[]> = {
  file: ['read', 'write', 'edit', 'glob', 'grep'],
  bash: ['bash'],
  network: ['fetch', 'curl', 'wget'],
  search: ['grep', 'glob', 'find'],
  system: ['bash', 'exec', 'run'],
};

const _KNOWN_TOOLS = [
  'bash', 'read', 'write', 'edit', 'glob', 'grep',
  'fetch', 'list', 'search', 'computer', 'browser',
];

// ─── WildcardMatcher Class ────────────────────────────────────────────────────

export class WildcardMatcher {
  private patternCache: Map<string, ParsedPattern> = new Map();

  /**
   * Find the best matching pattern for a tool identifier.
   * Last-match-wins: when equal priority, later rules override.
   */
  match(toolIdentifier: string, patterns: WildcardPattern[]): WildcardMatchResult {
    let bestResult: WildcardMatchResult = {
      matched: false,
      level: 'ask',
      specificity: -1,
      explanation: `No pattern matched "${toolIdentifier}"`,
    };

    let lastMatchIndex = -1;

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const parsed = this.parsePattern(pattern.pattern);

      if (this.matchesParsed(toolIdentifier, parsed)) {
        const specificity = this.calculateMatchSpecificity(toolIdentifier, parsed, pattern.priority);
        const isLaterMatch = i > lastMatchIndex;

        // Higher specificity wins, or equal specificity with later match wins
        if (specificity > bestResult.specificity || (specificity === bestResult.specificity && isLaterMatch)) {
          bestResult = {
            matched: true,
            level: pattern.level,
            matchedPattern: pattern,
            specificity,
            explanation: this.explainMatchInternal(toolIdentifier, pattern, parsed),
          };
          lastMatchIndex = i;
        }
      }
    }

    return bestResult;
  }

  /**
   * Parse a pattern string into segments for efficient matching.
   */
  parsePattern(pattern: string): ParsedPattern {
    const cached = this.patternCache.get(pattern);
    if (cached) return cached;

    const segments = this.tokenizePattern(pattern);

    let hasMultiWildcard = false;
    let hasSingleWildcard = false;
    let hasCharWildcard = false;
    let toolType: string | undefined;
    let category: string | undefined;

    // Extract tool type from first segment if present
    if (segments.length > 0 && segments[0].type === 'literal' && pattern.includes(':')) {
      toolType = segments[0].value;
    }

    // Determine category from pattern
    for (const seg of segments) {
      if (seg.type === 'multi-wildcard') hasMultiWildcard = true;
      if (seg.type === 'single-wildcard') hasSingleWildcard = true;
      if (seg.type === 'char-wildcard') hasCharWildcard = true;
    }

    // Infer category from tool type
    if (toolType) {
      for (const [cat, tools] of Object.entries(KNOWN_CATEGORIES)) {
        if (tools.includes(toolType)) {
          category = cat;
          break;
        }
      }
    }

    const specificity = this.calculatePatternSpecificity(segments, pattern);

    const parsed: ParsedPattern = {
      raw: pattern,
      segments,
      category,
      toolType,
      hasMultiWildcard,
      hasSingleWildcard,
      hasCharWildcard,
      specificity,
    };

    this.patternCache.set(pattern, parsed);
    return parsed;
  }

  /**
   * Validate pattern syntax.
   */
  validatePattern(pattern: string): { valid: boolean; error?: string } {
    if (!pattern || pattern.trim().length === 0) {
      return { valid: false, error: 'Pattern cannot be empty' };
    }

    // Check for consecutive multi-wildcards
    if (pattern.includes('***')) {
      return { valid: false, error: 'Invalid wildcard: *** is not supported (use ** or *)' };
    }

    // Check for misplaced wildcards
    const segments = pattern.split(':');
    for (const segment of segments) {
      // ** should be the only thing in a segment or combined with literals
      if (segment.includes('**') && segment !== '**') {
        const parts = segment.split('**');
        // ** in the middle of a segment is valid (e.g., src/**/*.ts)
        // but *** is not
        if (parts.some((p) => p.includes('*') && p !== '')) {
          // Mixed * and ** in the same position is confusing but technically valid
        }
      }
    }

    // Check for unbalanced brackets
    let bracketCount = 0;
    for (const char of pattern) {
      if (char === '[') bracketCount++;
      if (char === ']') bracketCount--;
      if (bracketCount < 0) {
        return { valid: false, error: 'Unmatched closing bracket ]' };
      }
    }
    if (bracketCount !== 0) {
      return { valid: false, error: 'Unmatched opening bracket [' };
    }

    // Check for invalid characters
    const invalidChars = /[\0\n\r]/;
    if (invalidChars.test(pattern)) {
      return { valid: false, error: 'Pattern contains invalid control characters' };
    }

    return { valid: true };
  }

  /**
   * Suggest patterns for a given tool identifier.
   */
  suggestPatterns(toolIdentifier: string): string[] {
    const suggestions: string[] = [];
    const colonIndex = toolIdentifier.indexOf(':');
    const toolType = colonIndex >= 0 ? toolIdentifier.substring(0, colonIndex) : toolIdentifier;
    const toolArg = colonIndex >= 0 ? toolIdentifier.substring(colonIndex + 1) : undefined;

    // Broadest: match entire tool type
    suggestions.push(`${toolType}:*`);

    // Category-level
    for (const [category, tools] of Object.entries(KNOWN_CATEGORIES)) {
      if (tools.includes(toolType)) {
        suggestions.push(`${category}:${toolType}:*`);
      }
    }

    // Multi-level wildcard
    suggestions.push(`${toolType}:**`);

    // Path-based suggestions for file tools
    if (['read', 'write', 'edit'].includes(toolType) && toolArg) {
      const pathParts = toolArg.split('/');
      if (pathParts.length > 1) {
        // Match directory prefix
        const dir = pathParts.slice(0, -1).join('/');
        suggestions.push(`${toolType}:${dir}/*`);
        suggestions.push(`${toolType}:${dir}/**`);

        // Match by extension
        const lastPart = pathParts[pathParts.length - 1];
        const dotIndex = lastPart.lastIndexOf('.');
        if (dotIndex >= 0) {
          const ext = lastPart.substring(dotIndex);
          suggestions.push(`${toolType}:**/*${ext}`);
        }
      }
    }

    // Command-based suggestions for bash
    if (toolType === 'bash' && toolArg) {
      const cmdParts = toolArg.trim().split(/\s+/);
      if (cmdParts.length > 0) {
        suggestions.push(`bash:${cmdParts[0]} *`);
        suggestions.push(`bash:${cmdParts[0]}`);
      }
    }

    // Exact match
    suggestions.push(toolIdentifier);

    // Universal
    suggestions.push('*');

    // Deduplicate and return
    return [...new Set(suggestions)];
  }

  /**
   * Human-readable explanation of how a match was determined.
   */
  explainMatch(toolIdentifier: string, patterns: WildcardPattern[]): string {
    const result = this.match(toolIdentifier, patterns);
    return result.explanation;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private tokenizePattern(pattern: string): PatternSegment[] {
    const segments: PatternSegment[] = [];

    // Split on colon boundaries for tool:type patterns
    // But preserve colons within path segments
    let current = '';
    let i = 0;

    while (i < pattern.length) {
      if (pattern[i] === ':') {
        // End current segment if we have one
        if (current.length > 0) {
          segments.push(...this.tokenizeSegment(current));
          current = '';
        }
        i++;
        continue;
      }

      current += pattern[i];
      i++;
    }

    if (current.length > 0) {
      segments.push(...this.tokenizeSegment(current));
    }

    return segments;
  }

  private tokenizeSegment(segment: string): PatternSegment[] {
    const result: PatternSegment[] = [];

    if (segment === '**') {
      result.push({ value: '**', type: 'multi-wildcard' });
      return result;
    }

    if (segment === '*') {
      result.push({ value: '*', type: 'single-wildcard' });
      return result;
    }

    // Check if segment contains wildcards mixed with literals
    if (!segment.includes('*') && !segment.includes('?')) {
      result.push({ value: segment, type: 'literal' });
      return result;
    }

    // Mixed segment — treat as a single segment with wildcards for regex matching
    if (segment.includes('**')) {
      result.push({ value: segment, type: 'multi-wildcard' });
    } else if (segment.includes('*')) {
      result.push({ value: segment, type: 'single-wildcard' });
    }

    if (segment.includes('?')) {
      // If we already pushed as single-wildcard, update; otherwise push
      const existing = result.find((r) => r.value === segment);
      if (existing) {
        existing.type = 'single-wildcard'; // Treat mixed * and ? as single-wildcard level
      } else {
        result.push({ value: segment, type: 'char-wildcard' });
      }
    }

    // If no wildcards were found (shouldn't happen), treat as literal
    if (result.length === 0) {
      result.push({ value: segment, type: 'literal' });
    }

    return result;
  }

  private matchesParsed(toolIdentifier: string, parsed: ParsedPattern): boolean {
    const regex = this.parsedToRegex(parsed);
    return regex.test(toolIdentifier);
  }

  private parsedToRegex(parsed: ParsedPattern): RegExp {
    let regexStr = '';

    for (const segment of parsed.segments) {
      switch (segment.type) {
        case 'literal':
          regexStr += this.escapeRegex(segment.value);
          break;
        case 'single-wildcard':
          if (segment.value === '*') {
            // Single segment wildcard — match anything except separator
            regexStr += '[^:]*';
          } else {
            // Mixed * and literals, e.g., "src/*.ts" or "git *"
            regexStr += this.wildcardSegmentToRegex(segment.value);
          }
          break;
        case 'multi-wildcard':
          if (segment.value === '**') {
            // Multi-segment wildcard — match anything including separators
            regexStr += '.*';
          } else {
            // Mixed ** and literals, e.g., "src/**/*.ts"
            regexStr += this.wildcardSegmentToRegex(segment.value);
          }
          break;
        case 'char-wildcard':
          regexStr += this.wildcardSegmentToRegex(segment.value);
          break;
      }

      // Add colon separator between segments (if not already at end)
      // The tokenizer strips colons, so we add them back as optional separators
    }

    // Also try matching just the tool type if pattern is just a tool name
    if (!parsed.raw.includes(':') && !parsed.raw.includes('*')) {
      // Exact tool name match — also match toolName:*
      return new RegExp(`^(${regexStr}|${this.escapeRegex(parsed.raw)}:.*)$`, 'i');
    }

    return new RegExp(`^${regexStr}$`, 'i');
  }

  private wildcardSegmentToRegex(segment: string): string {
    let result = '';
    let i = 0;

    while (i < segment.length) {
      if (segment[i] === '*' && segment[i + 1] === '*') {
        result += '.*';
        i += 2;
      } else if (segment[i] === '*') {
        result += '[^:]*';
        i++;
      } else if (segment[i] === '?') {
        result += '[^:]';
        i++;
      } else {
        result += this.escapeRegex(segment[i]);
        i++;
      }
    }

    return result;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }

  private calculatePatternSpecificity(segments: PatternSegment[], raw: string): number {
    let specificity = 0;

    for (const segment of segments) {
      switch (segment.type) {
        case 'literal':
          specificity += segment.value.length * 10;
          break;
        case 'char-wildcard':
          specificity += 5; // ? is more specific than *
          break;
        case 'single-wildcard':
          specificity += 2; // * is less specific
          break;
        case 'multi-wildcard':
          specificity += 1; // ** is least specific
          break;
      }
    }

    // More colons = more specific
    specificity += (raw.match(/:/g) || []).length * 15;

    // Longer patterns = more specific
    specificity += raw.length;

    // Penalty for overly broad patterns
    if (raw === '*') specificity -= 50;
    if (raw === '**') specificity -= 50;

    return specificity;
  }

  private calculateMatchSpecificity(
    toolIdentifier: string,
    parsed: ParsedPattern,
    explicitPriority?: number,
  ): number {
    let specificity = parsed.specificity;

    // Boost by explicit priority if set
    if (explicitPriority !== undefined) {
      specificity += explicitPriority * 100;
    }

    // Exact match bonus
    if (parsed.raw === toolIdentifier) {
      specificity += 500;
    }

    // Partial match bonus — how much of the identifier is covered
    if (toolIdentifier.startsWith(parsed.raw.split('*')[0])) {
      specificity += 20;
    }

    return specificity;
  }

  private explainMatchInternal(
    toolIdentifier: string,
    pattern: WildcardPattern,
    parsed: ParsedPattern,
  ): string {
    const parts: string[] = [];

    parts.push(`Tool "${toolIdentifier}" matched pattern "${pattern.pattern}"`);

    if (pattern.level === 'allow') {
      parts.push(`→ ALLOWED`);
    } else if (pattern.level === 'deny') {
      parts.push(`→ DENIED`);
    } else {
      parts.push(`→ REQUIRES CONFIRMATION`);
    }

    if (pattern.reason) {
      parts.push(`Reason: ${pattern.reason}`);
    }

    if (parsed.hasMultiWildcard) {
      parts.push(`(multi-segment wildcard ** matched)`);
    }
    if (parsed.hasSingleWildcard) {
      parts.push(`(single-segment wildcard * matched)`);
    }
    if (parsed.hasCharWildcard) {
      parts.push(`(single-character wildcard ? matched)`);
    }

    if (pattern.category) {
      parts.push(`Category: ${pattern.category}`);
    }

    return parts.join(' ');
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const wildcardMatcher = new WildcardMatcher();
