/**
 * OpenAgent-Desktop - Steer Manager - Mid-Flight Correction System
 *
 * Manages steer messages that can be injected into running agent sessions.
 * Like Goose's steer/mid-flight correction feature.
 * Allows users to redirect agents mid-execution.
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SteerPriority = 'low' | 'normal' | 'high' | 'critical';
export type SteerType = 'redirect' | 'constraint' | 'clarification' | 'cancel' | 'pause';

export type SteerStatus = 'pending' | 'acknowledged' | 'completed' | 'cancelled';

export interface SteerMessage {
  id: string;
  content: string;
  priority: SteerPriority;
  type: SteerType;
  sessionId: string;
  injectedAt: string;
  acknowledgedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  status: SteerStatus;
  result?: SteerResult;
  metadata?: Record<string, unknown>;
}

export interface SteerResult {
  agentResponse: string;
  actionsTaken: string[];
  wasEffective: boolean;
  completedAt: string;
}

export interface AutoSteerConfig {
  enabled: boolean;
  /** Auto-redirect if agent calls same tool N+ times in a row */
  redirectOnRepeat: boolean;
  repeatThreshold: number;
  /** Auto-pause if error count exceeds threshold */
  pauseOnError: boolean;
  errorThreshold: number;
  /** Auto-constraint if token usage is high */
  constraintOnTokens: boolean;
  tokenThreshold: number;
}

export interface SteerHistoryEntry {
  steer: SteerMessage;
  sessionToolCalls: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_AUTO_STEER_CONFIG: AutoSteerConfig = {
  enabled: true,
  redirectOnRepeat: true,
  repeatThreshold: 3,
  pauseOnError: false,
  errorThreshold: 5,
  constraintOnTokens: false,
  tokenThreshold: 80000,
};

const MAX_STEERS_PER_MINUTE = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

const PRIORITY_ORDER: Record<SteerPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
  critical: 3,
};

// ─── SteerManager Class ──────────────────────────────────────────────────────

export class SteerManager extends EventEmitter {
  private pendingSteers: Map<string, SteerMessage[]> = new Map(); // sessionId -> steers
  private steerHistory: Map<string, SteerMessage[]> = new Map(); // sessionId -> history
  private rateLimitCounters: Map<string, number[]> = new Map(); // sessionId -> timestamps
  private sessionToolCallTracker: Map<string, string[]> = new Map(); // sessionId -> recent tool names
  private autoSteerConfig: AutoSteerConfig;
  private configDir: string;
  private initialized: boolean = false;

  constructor(config?: Partial<AutoSteerConfig>) {
    super();
    this.autoSteerConfig = { ...DEFAULT_AUTO_STEER_CONFIG, ...config };
    this.configDir = path.join(os.homedir(), '.openagent');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await fs.mkdir(this.configDir, { recursive: true });
    await this.loadHistory();

    this.initialized = true;
    this.emit('steer-manager:initialized');
  }

  // ─── Core Operations ──────────────────────────────────────────────────────

  /**
   * Inject a steer message into a running agent session.
   */
  inject(
    sessionId: string,
    content: string,
    options?: {
      priority?: SteerPriority;
      type?: SteerType;
      metadata?: Record<string, unknown>;
    },
  ): SteerMessage | null {
    // Rate limit check
    if (!this.checkRateLimit(sessionId)) {
      this.emit('steer:rate-limited', { sessionId });
      return null;
    }

    const steer: SteerMessage = {
      id: `steer-${crypto.randomUUID()}`,
      content,
      priority: options?.priority || 'normal',
      type: options?.type || 'redirect',
      sessionId,
      injectedAt: new Date().toISOString(),
      status: 'pending',
      metadata: options?.metadata,
    };

    // Add to pending queue (sorted by priority)
    const pending = this.pendingSteers.get(sessionId) || [];
    this.insertByPriority(pending, steer);
    this.pendingSteers.set(sessionId, pending);

    // Track for rate limiting
    this.recordRateLimitHit(sessionId);

    this.emit('steer:injected', steer);
    return steer;
  }

  /**
   * Get all pending steers for a session, ordered by priority (critical first).
   */
  getPendingSteers(sessionId: string): SteerMessage[] {
    const pending = this.pendingSteers.get(sessionId) || [];
    return [...pending]; // Return copy to prevent mutation
  }

  /**
   * Mark a steer as acknowledged by the agent.
   */
  acknowledgeSteer(steerId: string): boolean {
    const steer = this.findSteer(steerId);
    if (!steer || steer.status !== 'pending') return false;

    steer.status = 'acknowledged';
    steer.acknowledgedAt = new Date().toISOString();

    // Move from pending to history
    this.moveToHistory(steer);

    this.emit('steer:acknowledged', steer);
    return true;
  }

  /**
   * Mark a steer as completed with a result.
   */
  completeSteer(steerId: string, result: SteerResult): boolean {
    const steer = this.findSteerInHistory(steerId) || this.findSteer(steerId);
    if (!steer) return false;

    steer.status = 'completed';
    steer.completedAt = new Date().toISOString();
    steer.result = result;

    // Remove from pending if still there
    this.removeFromPending(steer);

    this.emit('steer:completed', steer);
    return true;
  }

  /**
   * Cancel a pending steer.
   */
  cancelSteer(steerId: string): boolean {
    const steer = this.findSteer(steerId);
    if (!steer || (steer.status !== 'pending' && steer.status !== 'acknowledged')) return false;

    steer.status = 'cancelled';
    steer.cancelledAt = new Date().toISOString();

    // Move to history
    this.moveToHistory(steer);

    this.emit('steer:cancelled', steer);
    return true;
  }

  /**
   * Get the full steer history for a session.
   */
  getSteerHistory(sessionId: string): SteerMessage[] {
    return [...(this.steerHistory.get(sessionId) || [])];
  }

  /**
   * Clear all pending steers for a session.
   */
  clearPendingSteers(sessionId: string): void {
    const pending = this.pendingSteers.get(sessionId) || [];
    for (const steer of pending) {
      steer.status = 'cancelled';
      steer.cancelledAt = new Date().toISOString();
      this.emit('steer:cancelled', steer);
    }
    this.pendingSteers.set(sessionId, []);
  }

  // ─── Auto-Steer ───────────────────────────────────────────────────────────

  /**
   * Track a tool call for auto-steer detection.
   * Call this whenever a tool is invoked in a session.
   */
  trackToolCall(sessionId: string, toolName: string): SteerMessage | null {
    if (!this.autoSteerConfig.enabled) return null;

    const calls = this.sessionToolCallTracker.get(sessionId) || [];
    calls.push(toolName);

    // Keep only last 20 calls
    if (calls.length > 20) {
      calls.shift();
    }
    this.sessionToolCallTracker.set(sessionId, calls);

    // Check for repeated tool calls (going in circles)
    if (this.autoSteerConfig.redirectOnRepeat && this.detectRepeatedCalls(calls)) {
      const steer = this.inject(sessionId, `You've called "${toolName}" ${this.autoSteerConfig.repeatThreshold}+ times in a row. Consider a different approach or ask the user for guidance.`, {
        priority: 'high',
        type: 'redirect',
        metadata: { autoSteer: true, repeatedTool: toolName },
      });

      if (steer) {
        this.emit('steer:auto-redirect', { sessionId, toolName, steer });
      }

      return steer;
    }

    return null;
  }

  /**
   * Track errors for auto-pause detection.
   */
  trackError(sessionId: string, _error: string): SteerMessage | null {
    if (!this.autoSteerConfig.enabled || !this.autoSteerConfig.pauseOnError) return null;

    const calls = this.sessionToolCallTracker.get(sessionId) || [];
    // Count recent errors (stored as 'ERROR' in the tool call tracker)
    const errorCount = calls.filter((c) => c === '__ERROR__').length;

    if (errorCount >= this.autoSteerConfig.errorThreshold) {
      const steer = this.inject(sessionId, `Session has encountered ${errorCount} errors. Pausing for user guidance.`, {
        priority: 'critical',
        type: 'pause',
        metadata: { autoSteer: true, errorCount },
      });

      if (steer) {
        this.emit('steer:auto-pause', { sessionId, errorCount, steer });
      }

      return steer;
    }

    // Also record this error in the tracker
    calls.push('__ERROR__');
    this.sessionToolCallTracker.set(sessionId, calls);

    return null;
  }

  /**
   * Get/set auto-steer configuration.
   */
  getAutoSteerConfig(): AutoSteerConfig {
    return { ...this.autoSteerConfig };
  }

  setAutoSteerConfig(config: Partial<AutoSteerConfig>): void {
    this.autoSteerConfig = { ...this.autoSteerConfig, ...config };
    this.emit('steer:config-updated', this.autoSteerConfig);
  }

  // ─── Quick Steer Presets ──────────────────────────────────────────────────

  quickSteerStop(sessionId: string): SteerMessage | null {
    return this.inject(sessionId, 'Stop what you are doing and wait for further instructions.', {
      priority: 'critical',
      type: 'cancel',
    });
  }

  quickSteerSlowDown(sessionId: string): SteerMessage | null {
    return this.inject(sessionId, 'Slow down and be more careful. Review your actions before proceeding.', {
      priority: 'high',
      type: 'constraint',
    });
  }

  quickSteerBeCareful(sessionId: string): SteerMessage | null {
    return this.inject(sessionId, 'Be more careful with your actions. Double-check before making changes.', {
      priority: 'normal',
      type: 'constraint',
    });
  }

  quickSteerFocusOn(sessionId: string, focus: string): SteerMessage | null {
    return this.inject(sessionId, `Focus on: ${focus}. Redirect your attention to this specific task.`, {
      priority: 'high',
      type: 'redirect',
      metadata: { focusTarget: focus },
    });
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  private async loadHistory(): Promise<void> {
    try {
      const filePath = path.join(this.configDir, 'steer-history.json');
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      for (const [sessionId, steers] of Object.entries(data)) {
        this.steerHistory.set(sessionId, steers as SteerMessage[]);
      }
    } catch {
      // No history file
    }
  }

  private async saveHistory(): Promise<void> {
    try {
      const filePath = path.join(this.configDir, 'steer-history.json');
      const data = Object.fromEntries(this.steerHistory);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      // Silently fail — history saving is best-effort
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private insertByPriority(pending: SteerMessage[], steer: SteerMessage): void {
    const priorityValue = PRIORITY_ORDER[steer.priority];
    let inserted = false;

    for (let i = 0; i < pending.length; i++) {
      if (PRIORITY_ORDER[pending[i].priority] < priorityValue) {
        pending.splice(i, 0, steer);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      pending.push(steer);
    }
  }

  private findSteer(steerId: string): SteerMessage | null {
    for (const [, steers] of this.pendingSteers) {
      const found = steers.find((s) => s.id === steerId);
      if (found) return found;
    }
    return null;
  }

  private findSteerInHistory(steerId: string): SteerMessage | null {
    for (const [, steers] of this.steerHistory) {
      const found = steers.find((s) => s.id === steerId);
      if (found) return found;
    }
    return null;
  }

  private moveToHistory(steer: SteerMessage): void {
    // Remove from pending
    this.removeFromPending(steer);

    // Add to history
    const history = this.steerHistory.get(steer.sessionId) || [];
    history.push(steer);

    // Keep only last 100 steers per session
    if (history.length > 100) {
      history.shift();
    }

    this.steerHistory.set(steer.sessionId, history);

    // Save history (fire-and-forget)
    this.saveHistory();
  }

  private removeFromPending(steer: SteerMessage): void {
    const pending = this.pendingSteers.get(steer.sessionId);
    if (pending) {
      const index = pending.findIndex((s) => s.id === steer.id);
      if (index >= 0) {
        pending.splice(index, 1);
      }
    }
  }

  private checkRateLimit(sessionId: string): boolean {
    const now = Date.now();
    const timestamps = this.rateLimitCounters.get(sessionId) || [];

    // Remove timestamps outside the window
    const recentTimestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

    if (recentTimestamps.length >= MAX_STEERS_PER_MINUTE) {
      return false;
    }

    return true;
  }

  private recordRateLimitHit(sessionId: string): void {
    const now = Date.now();
    const timestamps = this.rateLimitCounters.get(sessionId) || [];
    timestamps.push(now);
    this.rateLimitCounters.set(sessionId, timestamps);
  }

  private detectRepeatedCalls(calls: string[]): boolean {
    if (calls.length < this.autoSteerConfig.repeatThreshold) return false;

    const threshold = this.autoSteerConfig.repeatThreshold;
    const recentCalls = calls.slice(-threshold);

    // Check if the last N calls are the same tool
    const firstTool = recentCalls[0];
    if (firstTool === '__ERROR__') return false; // Don't auto-redirect on errors

    return recentCalls.every((c) => c === firstTool);
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const steerManager = new SteerManager();
