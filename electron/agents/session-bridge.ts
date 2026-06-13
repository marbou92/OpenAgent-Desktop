/**
 * OpenAgent-Desktop - Agent-Session Bridge
 *
 * Connects the agent system with session management.
 * Handles agent mode switching within sessions, mode history tracking,
 * and real-time UI updates via EventEmitter.
 */

import { EventEmitter } from 'events';
import { AgentMode, AgentDefinition } from './types';
import { AutoModeDetector, ModeDetectionResult, getAutoModeDetector } from './auto-mode';
import { AgentRegistry, getAgentRegistry } from './registry';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface ModeHistoryEntry {
  sessionId: string;
  mode: AgentMode;
  agentId?: string;
  timestamp: string;
  source: 'manual' | 'auto' | 'suggestion' | 'preset';
  previousMode?: AgentMode;
}

export interface SessionModeState {
  sessionId: string;
  currentMode: AgentMode;
  currentAgentId: string;
  modeHistory: ModeHistoryEntry[];
  lastAutoSuggestion?: ModeDetectionResult;
}

export interface AgentSessionBridgeEvents {
  'mode:switched': (data: { sessionId: string; from: AgentMode; to: AgentMode; source: ModeHistoryEntry['source'] }) => void;
  'mode:suggested': (data: { sessionId: string; suggestion: ModeDetectionResult }) => void;
  'mode:accepted': (data: { sessionId: string; mode: AgentMode }) => void;
  'mode:dismissed': (data: { sessionId: string; mode: AgentMode }) => void;
  'agent:changed': (data: { sessionId: string; agentId: string; agent: AgentDefinition }) => void;
  'history:updated': (data: { sessionId: string; history: ModeHistoryEntry[] }) => void;
}

// ─── Agent-Session Bridge ───────────────────────────────────────────────────────

export class AgentSessionBridge extends EventEmitter {
  private sessionStates: Map<string, SessionModeState> = new Map();
  private autoDetector: AutoModeDetector;
  private registry: AgentRegistry;
  private maxHistoryPerSession = 100;

  constructor(autoDetector?: AutoModeDetector, registry?: AgentRegistry) {
    super();
    this.autoDetector = autoDetector || getAutoModeDetector();
    this.registry = registry || getAgentRegistry();
  }

  /**
   * Initialize or get the mode state for a session.
   */
  private ensureSession(sessionId: string): SessionModeState {
    let state = this.sessionStates.get(sessionId);
    if (!state) {
      const activeAgent = this.registry.getActive();
      state = {
        sessionId,
        currentMode: activeAgent.mode,
        currentAgentId: activeAgent.id,
        modeHistory: [],
      };
      this.sessionStates.set(sessionId, state);
    }
    return state;
  }

  /**
   * Switch the agent mode for a given session.
   *
   * @param sessionId - The session ID
   * @param mode - The target agent mode
   * @param source - How the switch was triggered (manual, auto, suggestion, preset)
   * @param agentId - Optional specific agent ID to use within that mode
   */
  switchMode(
    sessionId: string,
    mode: AgentMode,
    source: ModeHistoryEntry['source'] = 'manual',
    agentId?: string,
  ): void {
    const state = this.ensureSession(sessionId);
    const previousMode = state.currentMode;

    // Determine the agent for this mode
    let targetAgentId = agentId;
    if (!targetAgentId) {
      const defaultAgent = this.registry.getDefaultForMode(mode);
      targetAgentId = defaultAgent.id;
    }

    // Create history entry
    const entry: ModeHistoryEntry = {
      sessionId,
      mode,
      agentId: targetAgentId,
      timestamp: new Date().toISOString(),
      source,
      previousMode,
    };

    // Update state
    state.currentMode = mode;
    state.currentAgentId = targetAgentId;
    state.modeHistory.push(entry);

    // Trim history if it exceeds max
    if (state.modeHistory.length > this.maxHistoryPerSession) {
      state.modeHistory = state.modeHistory.slice(-this.maxHistoryPerSession);
    }

    // Try to update the registry's active agent
    try {
      this.registry.setActive(targetAgentId);
    } catch {
      // Agent might not exist in registry — try setting by mode default
      try {
        const defaultAgent = this.registry.getDefaultForMode(mode);
        this.registry.setActive(defaultAgent.id);
        state.currentAgentId = defaultAgent.id;
      } catch {
        // Registry not fully initialized — that's okay, state is tracked here
      }
    }

    // Emit events
    this.emit('mode:switched', {
      sessionId,
      from: previousMode,
      to: mode,
      source,
    });

    this.emit('history:updated', {
      sessionId,
      history: state.modeHistory,
    });

    // If auto-detected, also emit accepted event
    if (source === 'auto') {
      this.emit('mode:accepted', { sessionId, mode });
    }
  }

  /**
   * Suggest a mode for the given prompt using auto-detection.
   * Does NOT switch the mode — just returns the suggestion.
   */
  suggestMode(sessionId: string, prompt: string): ModeDetectionResult {
    const suggestion = this.autoDetector.detectMode(prompt);

    const state = this.ensureSession(sessionId);
    state.lastAutoSuggestion = suggestion;

    this.emit('mode:suggested', { sessionId, suggestion });

    return suggestion;
  }

  /**
   * Accept the last auto-detected mode suggestion for a session.
   */
  acceptSuggestion(sessionId: string): void {
    const state = this.ensureSession(sessionId);
    if (state.lastAutoSuggestion) {
      this.switchMode(sessionId, state.lastAutoSuggestion.mode, 'suggestion');
      state.lastAutoSuggestion = undefined;
    }
  }

  /**
   * Dismiss the last auto-detected mode suggestion for a session.
   */
  dismissSuggestion(sessionId: string): void {
    const state = this.ensureSession(sessionId);
    if (state.lastAutoSuggestion) {
      const dismissedMode = state.lastAutoSuggestion.mode;
      state.lastAutoSuggestion = undefined;
      this.emit('mode:dismissed', { sessionId, mode: dismissedMode });
    }
  }

  /**
   * Get the mode switch history for a session.
   */
  getModeHistory(sessionId: string): ModeHistoryEntry[] {
    const state = this.sessionStates.get(sessionId);
    return state ? [...state.modeHistory] : [];
  }

  /**
   * Get the current mode state for a session.
   */
  getSessionState(sessionId: string): SessionModeState | undefined {
    return this.sessionStates.get(sessionId);
  }

  /**
   * Get the current mode for a session.
   */
  getCurrentMode(sessionId: string): AgentMode {
    const state = this.sessionStates.get(sessionId);
    return state?.currentMode ?? this.registry.getActive().mode;
  }

  /**
   * Get the current agent ID for a session.
   */
  getCurrentAgentId(sessionId: string): string {
    const state = this.sessionStates.get(sessionId);
    return state?.currentAgentId ?? this.registry.getActiveId();
  }

  /**
   * Get the last auto-suggestion for a session.
   */
  getLastSuggestion(sessionId: string): ModeDetectionResult | undefined {
    const state = this.sessionStates.get(sessionId);
    return state?.lastAutoSuggestion;
  }

  /**
   * Switch to a specific agent within a session.
   */
  switchAgent(sessionId: string, agentId: string): void {
    const agent = this.registry.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    this.switchMode(sessionId, agent.mode, 'manual', agentId);
    this.emit('agent:changed', { sessionId, agentId, agent });
  }

  /**
   * Apply a preset to a session — creates an agent from the preset and switches to it.
   */
  applyPreset(sessionId: string, presetAgent: AgentDefinition): void {
    const state = this.ensureSession(sessionId);

    // Create or get the agent from the registry
    let agentId = presetAgent.id;
    try {
      this.registry.create(presetAgent);
    } catch {
      // Agent might already exist — that's fine
    }

    // Switch to the preset's mode
    this.switchMode(sessionId, presetAgent.mode, 'preset', agentId);
    this.emit('agent:changed', { sessionId, agentId, agent: presetAgent });
  }

  /**
   * Clean up session state when a session is deleted.
   */
  removeSession(sessionId: string): void {
    this.sessionStates.delete(sessionId);
  }

  /**
   * Get all active session IDs.
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessionStates.keys());
  }

  /**
   * Get a summary of mode usage across all sessions.
   */
  getModeUsageSummary(): Record<AgentMode, number> {
    const summary: Record<AgentMode, number> = {
      [AgentMode.build]: 0,
      [AgentMode.plan]: 0,
      [AgentMode.chat]: 0,
      [AgentMode.smart]: 0,
    };

    for (const state of this.sessionStates.values()) {
      summary[state.currentMode]++;
    }

    return summary;
  }

  /**
   * Get the most frequently used mode across all sessions.
   */
  getMostUsedMode(): AgentMode {
    const summary = this.getModeUsageSummary();
    let best: AgentMode = AgentMode.chat;
    let bestCount = 0;

    for (const [mode, count] of Object.entries(summary)) {
      if (count > bestCount) {
        bestCount = count;
        best = mode as AgentMode;
      }
    }

    return best;
  }

  /**
   * Export session mode states for persistence.
   */
  exportStates(): Array<{ sessionId: string; currentMode: AgentMode; currentAgentId: string; modeHistory: ModeHistoryEntry[] }> {
    return Array.from(this.sessionStates.values()).map((state) => ({
      sessionId: state.sessionId,
      currentMode: state.currentMode,
      currentAgentId: state.currentAgentId,
      modeHistory: state.modeHistory.slice(-20), // Keep last 20 entries
    }));
  }

  /**
   * Import session mode states.
   */
  importStates(states: Array<{ sessionId: string; currentMode: AgentMode; currentAgentId: string; modeHistory: ModeHistoryEntry[] }>): void {
    for (const stateData of states) {
      this.sessionStates.set(stateData.sessionId, {
        sessionId: stateData.sessionId,
        currentMode: stateData.currentMode,
        currentAgentId: stateData.currentAgentId,
        modeHistory: stateData.modeHistory || [],
      });
    }
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────────

let bridgeInstance: AgentSessionBridge | null = null;

export function getAgentSessionBridge(): AgentSessionBridge {
  if (!bridgeInstance) {
    bridgeInstance = new AgentSessionBridge();
  }
  return bridgeInstance;
}

export function setAgentSessionBridge(bridge: AgentSessionBridge): void {
  bridgeInstance = bridge;
}
