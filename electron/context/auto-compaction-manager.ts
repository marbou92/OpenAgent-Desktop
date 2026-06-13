/**
 * OpenAgent-Desktop - Auto-Compaction Manager
 *
 * Automatically triggers context compaction based on usage thresholds,
 * message count, or time-based triggers. Like Goose's auto-compaction.
 * Provides configurable strategies and user notifications.
 */

import { EventEmitter } from 'events';
import { ContextUsage, CompactionResult } from './types';
import { ContextCompactor } from './compactor';

// ─── Types ──────────────────────────────────────────────────────────────────

export type CompactionTrigger = 'threshold' | 'message_count' | 'time_based' | 'manual';

export interface AutoCompactionConfig {
  /** Whether auto-compaction is enabled */
  enabled: boolean;
  /** Token usage percentage that triggers compaction (0.0-1.0, default 0.8) */
  thresholdPercent: number;
  /** Number of messages that triggers compaction (default 100) */
  messageCountTrigger: number;
  /** Interval in ms for time-based compaction during active sessions (default 300000 = 5 min) */
  timeIntervalMs: number;
  /** Compaction strategy to use */
  strategy: 'tool-pair' | 'summary' | 'hybrid';
  /** Number of recent messages to preserve during compaction */
  preserveRecent: number;
  /** Whether to notify the user before compaction */
  notifyUser: boolean;
  /** Whether to auto-apply compaction without user confirmation */
  autoApply: boolean;
}

export interface CompactionEvent {
  /** Session ID where compaction occurred */
  sessionId: string;
  /** What triggered the compaction */
  trigger: CompactionTrigger;
  /** Token count before compaction */
  tokensBefore: number;
  /** Token count after compaction */
  tokensAfter: number;
  /** Number of tokens saved */
  savedTokens: number;
  /** Strategy used for compaction */
  strategy: 'tool-pair' | 'summary' | 'hybrid';
  /** When the compaction happened */
  timestamp: string;
}

export interface CompactionPreview {
  /** Messages that will be compacted */
  messagesToCompact: any[];
  /** Messages that will be preserved */
  messagesToPreserve: any[];
  /** Estimated token savings */
  estimatedSavings: number;
  /** Compaction strategy */
  strategy: 'tool-pair' | 'summary' | 'hybrid';
  /** Number of messages before compaction */
  beforeCount: number;
  /** Estimated number of messages after compaction */
  afterCount: number;
}

// ─── Per-Session State ─────────────────────────────────────────────────────

interface SessionCompactionState {
  /** Last compaction timestamp */
  lastCompactionAt: string | null;
  /** Number of compactions performed */
  compactionCount: number;
  /** Total tokens saved across all compactions */
  totalTokensSaved: number;
  /** Compaction history */
  history: CompactionEvent[];
  /** Per-session config overrides */
  configOverrides: Partial<AutoCompactionConfig> | null;
  /** Time-based compaction timer */
  timeIntervalTimer: NodeJS.Timeout | null;
  /** When the session became active */
  sessionActiveSince: string | null;
}

// ─── Auto-Compaction Manager ───────────────────────────────────────────────

const DEFAULT_CONFIG: AutoCompactionConfig = {
  enabled: true,
  thresholdPercent: 0.8,
  messageCountTrigger: 100,
  timeIntervalMs: 5 * 60 * 1000, // 5 minutes
  strategy: 'hybrid',
  preserveRecent: 4,
  notifyUser: true,
  autoApply: false,
};

export class AutoCompactionManager extends EventEmitter {
  private config: AutoCompactionConfig;
  private sessions: Map<string, SessionCompactionState> = new Map();
  private compactor: ContextCompactor;
  private globalStats = {
    totalCompactions: 0,
    totalTokensSaved: 0,
    savingsHistory: [] as number[],
  };

  constructor(config?: Partial<AutoCompactionConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.compactor = new ContextCompactor({
      threshold: this.config.thresholdPercent,
      strategy: this.config.strategy,
      preserveRecentMessages: this.config.preserveRecent,
    });
  }

  // ─── Configuration ──────────────────────────────────────────────────────

  /** Set compaction configuration */
  configure(config: Partial<AutoCompactionConfig>): void {
    this.config = { ...this.config, ...config };
    // Recreate compactor with new settings
    this.compactor = new ContextCompactor({
      threshold: this.config.thresholdPercent,
      strategy: this.config.strategy,
      preserveRecentMessages: this.config.preserveRecent,
    });
    this.emit('config:changed', this.config);
  }

  /** Set per-session configuration overrides */
  setSessionConfig(sessionId: string, overrides: Partial<AutoCompactionConfig>): void {
    const state = this.getOrCreateSession(sessionId);
    state.configOverrides = overrides;
    this.emit('session:config:changed', { sessionId, overrides });
  }

  /** Get the effective config for a session (global + session overrides) */
  getEffectiveConfig(sessionId: string): AutoCompactionConfig {
    const state = this.getOrCreateSession(sessionId);
    if (state.configOverrides) {
      return { ...this.config, ...state.configOverrides };
    }
    return { ...this.config };
  }

  /** Get current global configuration */
  getConfig(): AutoCompactionConfig {
    return { ...this.config };
  }

  // ─── Core Compaction Logic ──────────────────────────────────────────────

  /** Check thresholds and compact if needed */
  async checkAndCompact(
    sessionId: string,
    usage: ContextUsage,
    messages: any[]
  ): Promise<CompactionResult | null> {
    if (!this.config.enabled) {
      return null;
    }

    const effectiveConfig = this.getEffectiveConfig(sessionId);
    const state = this.getOrCreateSession(sessionId);
    const trigger = this.evaluateTriggers(sessionId, usage, messages, effectiveConfig);

    if (!trigger) {
      return null;
    }

    // If user notification is required and auto-apply is off, emit a preview event
    if (effectiveConfig.notifyUser && !effectiveConfig.autoApply) {
      const preview = this.generatePreview(sessionId, messages, effectiveConfig);
      this.emit('compaction:preview', { sessionId, trigger, preview });
      return null;
    }

    // Perform the compaction
    return this.performCompaction(sessionId, messages, trigger, effectiveConfig);
  }

  /** Force compaction manually */
  async forceCompact(sessionId: string, messages: any[]): Promise<CompactionResult> {
    const effectiveConfig = this.getEffectiveConfig(sessionId);
    const result = await this.performCompaction(sessionId, messages, 'manual', effectiveConfig);
    return result;
  }

  /** Generate a preview of what compaction will do */
  generatePreview(sessionId: string, messages: any[], config?: AutoCompactionConfig): CompactionPreview {
    const effectiveConfig = config || this.getEffectiveConfig(sessionId);

    // Filter out error tool calls (smart compaction: preserve for debugging)
    const { compactable, preserved } = this.partitionMessages(messages, effectiveConfig.preserveRecent);

    const estimatedOriginalTokens = compactable.reduce((sum, m) => sum + this.estimateTokens(m), 0);
    const estimatedCompactTokens = Math.round(estimatedOriginalTokens * 0.3); // Rough 70% savings estimate

    let afterCount = preserved.length;
    if (effectiveConfig.strategy === 'tool-pair') {
      // Tool-pair compaction replaces pairs with single messages
      afterCount += Math.ceil(compactable.length * 0.6);
    } else if (effectiveConfig.strategy === 'summary') {
      afterCount += 1; // Summary message + remaining
    } else {
      // Hybrid: tool-pair first, then summary
      afterCount += Math.ceil(compactable.length * 0.3) + 1;
    }

    return {
      messagesToCompact: compactable,
      messagesToPreserve: preserved,
      estimatedSavings: estimatedOriginalTokens - estimatedCompactTokens,
      strategy: effectiveConfig.strategy,
      beforeCount: messages.length,
      afterCount,
    };
  }

  // ─── Session Management ─────────────────────────────────────────────────

  /** Mark a session as active (starts time-based compaction timer) */
  activateSession(sessionId: string): void {
    const state = this.getOrCreateSession(sessionId);
    state.sessionActiveSince = new Date().toISOString();

    const effectiveConfig = this.getEffectiveConfig(sessionId);
    if (effectiveConfig.enabled && effectiveConfig.timeIntervalMs > 0) {
      this.startTimeBasedTimer(sessionId, effectiveConfig.timeIntervalMs);
    }
  }

  /** Mark a session as inactive (stops time-based compaction timer) */
  deactivateSession(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.sessionActiveSince = null;
      if (state.timeIntervalTimer) {
        clearInterval(state.timeIntervalTimer);
        state.timeIntervalTimer = null;
      }
    }
  }

  /** Clean up session state */
  removeSession(sessionId: string): void {
    this.deactivateSession(sessionId);
    this.sessions.delete(sessionId);
  }

  // ─── History & Stats ────────────────────────────────────────────────────

  /** Get compaction history for a session */
  getCompactionHistory(sessionId: string): CompactionEvent[] {
    const state = this.sessions.get(sessionId);
    return state?.history.slice() || [];
  }

  /** Get global compaction statistics */
  getStats(): { totalCompactions: number; totalTokensSaved: number; averageSavings: number } {
    const avg =
      this.globalStats.savingsHistory.length > 0
        ? this.globalStats.savingsHistory.reduce((a, b) => a + b, 0) /
          this.globalStats.savingsHistory.length
        : 0;

    return {
      totalCompactions: this.globalStats.totalCompactions,
      totalTokensSaved: this.globalStats.totalTokensSaved,
      averageSavings: Math.round(avg),
    };
  }

  /** Get stats for a specific session */
  getSessionStats(sessionId: string): {
    compactionCount: number;
    totalTokensSaved: number;
    lastCompactionAt: string | null;
  } {
    const state = this.sessions.get(sessionId);
    return {
      compactionCount: state?.compactionCount || 0,
      totalTokensSaved: state?.totalTokensSaved || 0,
      lastCompactionAt: state?.lastCompactionAt || null,
    };
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private getOrCreateSession(sessionId: string): SessionCompactionState {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        lastCompactionAt: null,
        compactionCount: 0,
        totalTokensSaved: 0,
        history: [],
        configOverrides: null,
        timeIntervalTimer: null,
        sessionActiveSince: null,
      });
    }
    return this.sessions.get(sessionId)!;
  }

  private evaluateTriggers(
    sessionId: string,
    usage: ContextUsage,
    messages: any[],
    config: AutoCompactionConfig
  ): CompactionTrigger | null {
    // Threshold-based trigger (default 80%)
    if (usage.usagePercent >= config.thresholdPercent && usage.canCompact) {
      return 'threshold';
    }

    // Message count trigger
    if (messages.length >= config.messageCountTrigger) {
      return 'message_count';
    }

    return null;
  }

  private async performCompaction(
    sessionId: string,
    messages: any[],
    trigger: CompactionTrigger,
    config: AutoCompactionConfig
  ): Promise<CompactionResult> {
    const tokensBefore = messages.reduce((sum, m) => sum + this.estimateTokens(m), 0);

    // Use the existing ContextCompactor for the actual compaction
    const compactor = new ContextCompactor({
      threshold: config.thresholdPercent,
      strategy: config.strategy,
      preserveRecentMessages: config.preserveRecent,
    });

    // Smart compaction: preserve messages with tool errors for debugging
    const smartMessages = this.markErrorToolCalls(messages);

    const usage: ContextUsage = {
      totalTokens: tokensBefore,
      maxTokens: Math.round(tokensBefore / config.thresholdPercent),
      usagePercent: config.thresholdPercent,
      promptTokens: tokensBefore,
      completionTokens: 0,
      canCompact: true,
    };

    const { result } = compactor.compact(smartMessages, usage);

    // Update session state
    const state = this.getOrCreateSession(sessionId);
    const event: CompactionEvent = {
      sessionId,
      trigger,
      tokensBefore,
      tokensAfter: result.compactedTokenCount,
      savedTokens: result.savedTokens,
      strategy: result.strategy,
      timestamp: result.compactedAt,
    };

    state.history.push(event);
    state.compactionCount++;
    state.totalTokensSaved += result.savedTokens;
    state.lastCompactionAt = result.compactedAt;

    // Update global stats
    this.globalStats.totalCompactions++;
    this.globalStats.totalTokensSaved += result.savedTokens;
    this.globalStats.savingsHistory.push(result.savedTokens);

    // Emit events
    this.emit('compaction:completed', event);
    this.emit('compaction:completed:' + sessionId, event);

    return result;
  }

  /**
   * Smart compaction: partition messages into compactable vs. preserved.
   * Preserves recent messages AND messages with tool errors (for debugging).
   */
  private partitionMessages(
    messages: any[],
    preserveRecent: number
  ): { compactable: any[]; preserved: any[] } {
    const recent = messages.slice(-preserveRecent);
    const older = messages.slice(0, -preserveRecent);

    // Among older messages, identify ones with tool errors
    const compactable: any[] = [];
    const preserved: any[] = [...recent];

    for (let i = 0; i < older.length; i++) {
      const msg = older[i];
      if (this.hasToolError(msg, older, i)) {
        preserved.push(msg); // Preserve error tool calls for debugging
      } else {
        compactable.push(msg);
      }
    }

    return { compactable, preserved };
  }

  /** Check if a message is part of a tool call that resulted in an error */
  private hasToolError(msg: any, messages: any[], index: number): boolean {
    // Check if this is a tool result with an error
    if (msg.role === 'tool' && msg.content) {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      if (
        content.toLowerCase().includes('error') ||
        content.toLowerCase().includes('failed') ||
        content.toLowerCase().includes('exception')
      ) {
        return true;
      }
    }

    // Check if the next message after this assistant tool call is an error
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      const nextMsg = messages[index + 1];
      if (nextMsg && nextMsg.role === 'tool') {
        const content =
          typeof nextMsg.content === 'string' ? nextMsg.content : JSON.stringify(nextMsg.content);
        if (
          content.toLowerCase().includes('error') ||
          content.toLowerCase().includes('failed') ||
          content.toLowerCase().includes('exception')
        ) {
          return true;
        }
      }
    }

    return false;
  }

  /** Mark messages that contain tool errors so the compactor can preserve them */
  private markErrorToolCalls(messages: any[]): any[] {
    return messages.map((msg, i) => {
      if (this.hasToolError(msg, messages, i)) {
        return { ...msg, _preserveForDebug: true };
      }
      return msg;
    });
  }

  /** Start time-based compaction timer for a session */
  private startTimeBasedTimer(sessionId: string, intervalMs: number): void {
    const state = this.getOrCreateSession(sessionId);

    // Clear existing timer
    if (state.timeIntervalTimer) {
      clearInterval(state.timeIntervalTimer);
    }

    state.timeIntervalTimer = setInterval(() => {
      if (state.sessionActiveSince) {
        this.emit('compaction:time-trigger', { sessionId, intervalMs });
      }
    }, intervalMs);
  }

  /** Estimate token count for a message (~4 chars per token) */
  private estimateTokens(msg: any): number {
    const content = typeof msg?.content === 'string' ? msg.content : JSON.stringify(msg?.content || '');
    return Math.ceil(content.length / 4);
  }
}
