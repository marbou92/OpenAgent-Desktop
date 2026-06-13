/**
 * OpenAgent-Desktop - Permission System Types
 * 
 * Granular permissions with wildcard patterns.
 * Like OpenCode: pattern-based allow/ask/deny with last-match-wins semantics.
 */

export type PermissionLevel = 'allow' | 'ask' | 'deny';

export interface PermissionRule {
  pattern: string;
  level: PermissionLevel;
  reason?: string;
  createdAt: string;
}

export interface PermissionSet {
  id: string;
  name: string;
  description?: string;
  rules: PermissionRule[];
  isBuiltIn?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionCheckResult {
  allowed: boolean;
  level: PermissionLevel;
  matchedPattern?: string;
  reason?: string;
}

export interface PermissionConfirmation {
  toolName: string;
  args: Record<string, unknown>;
  checkResult: PermissionCheckResult;
  userResponse: 'allow_once' | 'always_allow' | 'deny_once' | 'always_deny';
  timestamp: string;
}
