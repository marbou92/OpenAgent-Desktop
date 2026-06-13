/**
 * OpenAgent-Desktop - Agent System
 */

export { AgentRegistry, getAgentRegistry, setAgentRegistry } from './registry';
export { AgentRunner } from './agent-runner';
export { AutoModeDetector, getAutoModeDetector, setAutoModeDetector } from './auto-mode';
export type { ModeDetectionResult } from './auto-mode';
export { AgentPresetManager, getAgentPresetManager, setAgentPresetManager } from './agent-presets';
export type { AgentPreset } from './agent-presets';
export { AgentSessionBridge, getAgentSessionBridge, setAgentSessionBridge } from './session-bridge';
export type { ModeHistoryEntry, SessionModeState, AgentSessionBridgeEvents } from './session-bridge';
export * from './types';
