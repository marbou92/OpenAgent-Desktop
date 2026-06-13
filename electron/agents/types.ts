/**
 * OpenAgent-Desktop - Agent Mode System Types
 * 
 * Defines agent modes (Build, Plan, Chat, Smart Approve),
 * agent configurations, and tool permission levels.
 */

export enum AgentMode {
  build = 'build',
  plan = 'plan', 
  chat = 'chat',
  smart = 'smart',
}

export type ToolPermissionLevel = 'allow' | 'ask' | 'deny';

export interface ToolPermissions {
  [toolPattern: string]: ToolPermissionLevel;
}

export interface AgentDefinition {
  id: string;
  name: string;
  mode: AgentMode;
  description: string;
  prompt?: string;
  model?: string;
  permissions: ToolPermissions;
  maxSteps?: number;
  temperature?: number;
  topP?: number;
  color?: string;
  hidden?: boolean;
  isBuiltIn?: boolean;
}

export interface AgentRunContext {
  agentId: string;
  sessionId: string;
  workingDirectory: string;
  extensions: string[];
  model: string;
  providerId: string;
}

export interface AgentStep {
  stepNumber: number;
  toolCall?: {
    name: string;
    arguments: Record<string, unknown>;
  };
  toolResult?: {
    content: string;
    isError: boolean;
  };
  thinking?: string;
  message?: string;
  timestamp: string;
}

export interface AgentRunResult {
  agentId: string;
  sessionId: string;
  steps: AgentStep[];
  totalSteps: number;
  totalTokensUsed?: number;
  completedAt: string;
  status: 'completed' | 'stopped' | 'error' | 'max_steps_reached';
  error?: string;
}

export interface SteerMessage {
  id: string;
  content: string;
  timestamp: string;
  injected: boolean;
}

// Default permissions per mode
export const DEFAULT_BUILD_PERMISSIONS: ToolPermissions = {
  '*': 'allow',
  'bash:rm -rf *': 'ask',
  'bash:sudo *': 'ask',
  'bash:shutdown*': 'deny',
  'bash:reboot*': 'deny',
  'edit:/etc/*': 'ask',
  'edit:/system/*': 'deny',
};

export const DEFAULT_PLAN_PERMISSIONS: ToolPermissions = {
  '*': 'deny',
  'read': 'allow',
  'glob': 'allow',
  'grep': 'allow',
  'bash:git *': 'allow',
  'bash:ls *': 'allow',
  'bash:cat *': 'allow',
  'bash:find *': 'allow',
  'bash:head *': 'allow',
  'bash:tail *': 'allow',
  'bash:wc *': 'allow',
  'bash:tree *': 'allow',
  'edit': 'ask',
  'write': 'ask',
  'bash': 'ask',
};

export const DEFAULT_CHAT_PERMISSIONS: ToolPermissions = {
  '*': 'deny',
};

export const DEFAULT_SMART_PERMISSIONS: ToolPermissions = {
  '*': 'ask',
  'read': 'allow',
  'glob': 'allow',
  'grep': 'allow',
  'bash:git status*': 'allow',
  'bash:git diff*': 'allow',
  'bash:git log*': 'allow',
  'bash:ls *': 'allow',
  'bash:cat *': 'allow',
  'bash:node --version*': 'allow',
  'bash:python --version*': 'allow',
  'edit': 'ask',
  'write': 'ask',
  'bash': 'ask',
};
