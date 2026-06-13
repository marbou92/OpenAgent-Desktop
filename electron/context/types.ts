/**
 * OpenAgent-Desktop - Context Management Types
 */

export interface ContextUsage {
  totalTokens: number;
  maxTokens: number;
  usagePercent: number;
  promptTokens: number;
  completionTokens: number;
  canCompact: boolean;
}

export interface CompactionResult {
  originalTokenCount: number;
  compactedTokenCount: number;
  savedTokens: number;
  compactedAt: string;
  strategy: 'tool-pair' | 'summary' | 'hybrid';
}

export interface ToolPairSummary {
  toolCallSummary: string;
  toolResultSummary: string;
  originalTokens: number;
  summaryTokens: number;
}

export interface CompactionConfig {
  threshold: number; // 0.0-1.0, default 0.8
  strategy: 'tool-pair' | 'summary' | 'hybrid';
  preserveRecentMessages: number; // Number of recent messages to keep intact
  maxCompactionAttempts: number;
}
