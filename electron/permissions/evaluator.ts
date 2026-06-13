/**
 * OpenAgent-Desktop - Permission Evaluator
 * 
 * Evaluates tool calls against permission rules with wildcard matching.
 * Last-match-wins semantics like OpenCode.
 * Supports glob-style patterns for tool names and arguments
 */

import { PermissionLevel, PermissionRule, PermissionCheckResult } from './types';

// ToolPermissions is a simple map of pattern -> permission level
export type ToolPermissions = Record<string, PermissionLevel>;

export class PermissionEvaluator {
  private rules: PermissionRule[];

  constructor(permissions: ToolPermissions) {
    this.rules = this.parsePermissions(permissions);
  }

  private parsePermissions(permissions: ToolPermissions): PermissionRule[] {
    const rules: PermissionRule[] = [];
    
    for (const [pattern, level] of Object.entries(permissions)) {
      rules.push({
        pattern,
        level: level as PermissionLevel,
        createdAt: new Date().toISOString(),
      });
    }

    // Sort rules by specificity (more specific patterns last = last-match-wins)
    rules.sort((a, b) => {
      const aSpecificity = this.getPatternSpecificity(a.pattern);
      const bSpecificity = this.getPatternSpecificity(b.pattern);
      return aSpecificity - bSpecificity;
    });

    return rules;
  }

  evaluate(toolName: string, args: Record<string, unknown>): PermissionLevel {
    let result: PermissionLevel = 'ask'; // Default
    let matchedPattern: string | undefined;

    // Build the full tool identifier (e.g., "bash:git commit", "edit:src/file.ts")
    const toolId = this.buildToolIdentifier(toolName, args);

    for (const rule of this.rules) {
      if (this.matchesPattern(toolId, rule.pattern) || this.matchesPattern(toolName, rule.pattern)) {
        result = rule.level;
        matchedPattern = rule.pattern;
      }
    }

    return result;
  }

  check(toolName: string, args: Record<string, unknown>): PermissionCheckResult {
    const level = this.evaluate(toolName, args);
    let matchedPattern: string | undefined;
    
    const toolId = this.buildToolIdentifier(toolName, args);
    for (const rule of this.rules) {
      if (this.matchesPattern(toolId, rule.pattern) || this.matchesPattern(toolName, rule.pattern)) {
        matchedPattern = rule.pattern;
      }
    }

    return {
      allowed: level === 'allow',
      level,
      matchedPattern,
    };
  }

  getSummary(): string {
    const allowCount = this.rules.filter((r) => r.level === 'allow').length;
    const askCount = this.rules.filter((r) => r.level === 'ask').length;
    const denyCount = this.rules.filter((r) => r.level === 'deny').length;
    return `${allowCount} auto-allowed, ${askCount} require confirmation, ${denyCount} denied`;
  }

  private buildToolIdentifier(toolName: string, args: Record<string, unknown>): string {
    // For bash tools, include the command
    if (toolName === 'bash' && args.command) {
      const cmd = String(args.command).trim();
      return `bash:${cmd}`;
    }
    // For edit/write tools, include the file path
    if ((toolName === 'edit' || toolName === 'write') && args.path) {
      return `${toolName}:${args.path}`;
    }
    if ((toolName === 'edit' || toolName === 'write') && args.file_path) {
      return `${toolName}:${args.file_path}`;
    }
    // For read tools
    if (toolName === 'read' && args.path) {
      return `read:${args.path}`;
    }
    return toolName;
  }

  private matchesPattern(toolId: string, pattern: string): boolean {
    // Exact match
    if (pattern === toolId) return true;
    
    // Wildcard match
    if (pattern.includes('*')) {
      const regex = this.patternToRegex(pattern);
      return regex.test(toolId);
    }

    // Prefix match for tool type (e.g., "bash" matches "bash:git commit")
    if (!pattern.includes(':') && toolId.startsWith(pattern + ':')) {
      return true;
    }

    // Check if toolId's tool type matches the pattern's prefix
    const patternParts = pattern.split(':');
    const toolParts = toolId.split(':');
    if (patternParts.length <= toolParts.length && patternParts[0] === toolParts[0]) {
      if (patternParts.length === 1) return true;
    }

    return false;
  }

  private patternToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'i');
  }

  private getPatternSpecificity(pattern: string): number {
    let specificity = 0;
    
    // More colons = more specific
    specificity += (pattern.match(/:/g) || []).length * 10;
    
    // Fewer wildcards = more specific
    specificity -= (pattern.match(/\*/g) || []).length * 5;
    
    // Longer patterns = more specific
    specificity += pattern.length;
    
    return specificity;
  }
}
