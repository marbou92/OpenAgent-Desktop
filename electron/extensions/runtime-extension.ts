/**
 * OpenAgent-Desktop - Agent Runtime Extension Interface
 * 
 * Lifecycle hooks for extending agent behavior.
 * Like OpenCowork's AgentRuntimeExtension system.
 */

import { ToolDefinition } from './types';

export interface BeforeSessionRunContext {
  sessionId: string;
  workingDirectory: string;
  model: string;
  agentMode: string;
  messages: { role: string; content: string }[];
}

export interface BeforeSessionRunResult {
  promptPrefix?: string;
  additionalTools?: ToolDefinition[];
  modifiedMessages?: { role: string; content: string }[];
  cancel?: boolean;
  reason?: string;
}

export interface AfterSessionRunContext {
  sessionId: string;
  workingDirectory: string;
  model: string;
  agentMode: string;
  totalSteps: number;
  status: 'completed' | 'stopped' | 'error';
  error?: string;
}

export interface SessionDeletedContext {
  sessionId: string;
}

export interface AgentRuntimeExtension {
  name: string;
  description?: string;
  
  beforeSessionRun?(context: BeforeSessionRunContext): Promise<BeforeSessionRunResult>;
  afterSessionRun?(context: AfterSessionRunContext): Promise<void>;
  onSessionDeleted?(context: SessionDeletedContext): Promise<void>;
}

export class AgentRuntimeExtensionManager {
  private extensions: Map<string, AgentRuntimeExtension> = new Map();

  register(extension: AgentRuntimeExtension): void {
    this.extensions.set(extension.name, extension);
  }

  unregister(name: string): void {
    this.extensions.delete(name);
  }

  list(): AgentRuntimeExtension[] {
    return Array.from(this.extensions.values());
  }

  async runBeforeSessionRun(context: BeforeSessionRunContext): Promise<BeforeSessionRunResult> {
    const result: BeforeSessionRunResult = {};
    const allTools: ToolDefinition[] = [];

    for (const extension of this.extensions.values()) {
      if (extension.beforeSessionRun) {
        try {
          const extResult = await extension.beforeSessionRun(context);
          if (extResult.promptPrefix) {
            result.promptPrefix = (result.promptPrefix || '') + extResult.promptPrefix + '\n';
          }
          if (extResult.additionalTools) {
            allTools.push(...extResult.additionalTools);
          }
          if (extResult.modifiedMessages) {
            result.modifiedMessages = extResult.modifiedMessages;
          }
          if (extResult.cancel) {
            result.cancel = true;
            result.reason = extResult.reason;
            break;
          }
        } catch (err) {
          console.error(`Runtime extension ${extension.name} beforeSessionRun error:`, err);
        }
      }
    }

    if (allTools.length > 0) {
      result.additionalTools = allTools;
    }

    return result;
  }

  async runAfterSessionRun(context: AfterSessionRunContext): Promise<void> {
    for (const extension of this.extensions.values()) {
      if (extension.afterSessionRun) {
        try {
          await extension.afterSessionRun(context);
        } catch (err) {
          console.error(`Runtime extension ${extension.name} afterSessionRun error:`, err);
        }
      }
    }
  }

  async runOnSessionDeleted(context: SessionDeletedContext): Promise<void> {
    for (const extension of this.extensions.values()) {
      if (extension.onSessionDeleted) {
        try {
          await extension.onSessionDeleted(context);
        } catch (err) {
          console.error(`Runtime extension ${extension.name} onSessionDeleted error:`, err);
        }
      }
    }
  }
}
