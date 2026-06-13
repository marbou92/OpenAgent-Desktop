/**
 * OpenAgent-Desktop - Agent Runner
 * 
 * Core agent loop with mode-aware tool dispatch.
 * Handles the agentic loop: prompt → LLM → tool calls → tool results → repeat.
 * Supports steer/mid-flight correction via pending steers queue.
 */

import { EventEmitter } from 'events';
import { AgentDefinition, AgentStep, AgentRunContext, AgentRunResult, SteerMessage, ToolPermissionLevel } from './types';
import { PermissionEvaluator } from '../permissions/evaluator';

export interface AgentRunnerEvents {
  'step:start': (step: AgentStep) => void;
  'step:tool-call': (step: AgentStep) => void;
  'step:tool-result': (step: AgentStep) => void;
  'step:complete': (step: AgentStep) => void;
  'permission:request': (toolName: string, args: Record<string, unknown>, resolve: (level: ToolPermissionLevel) => void) => void;
  'steer:injected': (message: SteerMessage) => void;
  'run:complete': (result: AgentRunResult) => void;
  'run:error': (error: Error) => void;
}

export class AgentRunner extends EventEmitter {
  private agent: AgentDefinition;
  private context: AgentRunContext;
  private steps: AgentStep[] = [];
  private running = false;
  private aborted = false;
  private pendingSteers: SteerMessage[] = [];
  private permissionEvaluator: PermissionEvaluator;
  private stepCounter = 0;

  constructor(agent: AgentDefinition, context: AgentRunContext) {
    super();
    this.agent = agent;
    this.context = context;
    this.permissionEvaluator = new PermissionEvaluator(agent.permissions);
  }

  get isRunning(): boolean {
    return this.running;
  }

  get currentSteps(): AgentStep[] {
    return [...this.steps];
  }

  /**
   * Inject a steer message into the running agent loop.
   * Like Goose's mid-flight correction.
   */
  addSteer(content: string): void {
    const steer: SteerMessage = {
      id: `steer-${Date.now()}`,
      content,
      timestamp: new Date().toISOString(),
      injected: false,
    };
    this.pendingSteers.push(steer);
    this.emit('steer:injected', steer);
  }

  /**
   * Check if a tool call is permitted under the current agent's permission rules.
   */
  checkPermission(toolName: string, args: Record<string, unknown>): ToolPermissionLevel {
    return this.permissionEvaluator.evaluate(toolName, args);
  }

  /**
   * Execute a single agent step — decide whether to allow a tool call.
   * Returns true if the tool call should proceed, false if denied.
   */
  async authorizeToolCall(toolName: string, args: Record<string, unknown>): Promise<boolean> {
    const level = this.checkPermission(toolName, args);
    
    if (level === 'allow') {
      return true;
    }
    
    if (level === 'deny') {
      return false;
    }
    
    // 'ask' — need to request user permission
    return new Promise<boolean>((resolve) => {
      this.emit('permission:request', toolName, args, (response: ToolPermissionLevel) => {
        resolve(response === 'allow');
      });
    });
  }

  /**
   * Process pending steers — inject them into the conversation before the next step.
   */
  consumePendingSteers(): SteerMessage[] {
    const steers = this.pendingSteers.splice(0);
    for (const steer of steers) {
      steer.injected = true;
    }
    return steers;
  }

  /**
   * Record a step in the agent's execution.
   */
  recordStep(step: Omit<AgentStep, 'stepNumber' | 'timestamp'>): AgentStep {
    this.stepCounter++;
    const fullStep: AgentStep = {
      ...step,
      stepNumber: this.stepCounter,
      timestamp: new Date().toISOString(),
    };
    this.steps.push(fullStep);
    return fullStep;
  }

  /**
   * Check if the agent has reached its max steps limit.
   */
  hasReachedMaxSteps(): boolean {
    if (!this.agent.maxSteps) return false;
    return this.stepCounter >= this.agent.maxSteps;
  }

  /**
   * Get the system prompt for this agent, combining base prompt with context.
   */
  getSystemPrompt(): string {
    const parts: string[] = [];
    
    // Agent-specific prompt
    if (this.agent.prompt) {
      parts.push(this.agent.prompt);
    }
    
    // Mode context
    parts.push(`\nCurrent mode: ${this.agent.mode.toUpperCase()}`);
    
    // Working directory context
    if (this.context.workingDirectory) {
      parts.push(`Working directory: ${this.context.workingDirectory}`);
    }
    
    // Permission summary
    const permissionSummary = this.permissionEvaluator.getSummary();
    parts.push(`\nPermission summary:\n${permissionSummary}`);
    
    return parts.join('\n\n');
  }

  /**
   * Abort the current agent run.
   */
  abort(): void {
    this.aborted = true;
    this.running = false;
  }

  /**
   * Build the final result object.
   */
  buildResult(status: AgentRunResult['status'], error?: string): AgentRunResult {
    return {
      agentId: this.agent.id,
      sessionId: this.context.sessionId,
      steps: this.steps,
      totalSteps: this.stepCounter,
      completedAt: new Date().toISOString(),
      status,
      error,
    };
  }

  /**
   * Reset the runner for a new conversation turn.
   */
  reset(): void {
    this.steps = [];
    this.stepCounter = 0;
    this.aborted = false;
    this.pendingSteers = [];
  }
}
