/**
 * OpenAgent-Desktop - Agent Runner
 * 
 * Core agent loop with mode-aware tool dispatch.
 * Handles the agentic loop: prompt → LLM → tool calls → tool results → repeat.
 * Supports steer/mid-flight correction via pending steers queue.
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import { AgentDefinition, AgentStep, AgentRunContext, AgentRunResult, SteerMessage, ToolPermissionLevel, ChatMessage, ToolCallRequest, ToolCallResult, AgentLoopStep, AgentLoopResult } from './types';
import { PermissionEvaluator } from '../permissions/evaluator';
import { PermissionPolicyEngine } from '../permissions/policy-engine';
import { ProviderManager } from '../providers/manager';
import { ChatRequest, ChatResponse } from '../providers/types';

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
  private providerManager: ProviderManager | null = null;

  constructor(agent: AgentDefinition, context: AgentRunContext) {
    super();
    this.agent = agent;
    this.context = context;
    this.permissionEvaluator = new PermissionEvaluator(agent.permissions);
    // Set the agent mode on the permission evaluator for policy engine delegation
    this.permissionEvaluator.setAgentMode(agent.mode as any);
  }

  /**
   * Set the provider manager for LLM calls in the agentic loop.
   */
  setProviderManager(manager: ProviderManager): void {
    this.providerManager = manager;
  }

  /**
   * Set the policy engine on the permission evaluator.
   * When set, policies take precedence over simple rules.
   */
  setPolicyEngine(engine: PermissionPolicyEngine): void {
    this.permissionEvaluator.setPolicyEngine(engine);
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

  // ─── Agentic Loop ────────────────────────────────────────────────────────────

  /**
   * Consume steer messages for injection into the conversation.
   */
  private consumeSteer(): SteerMessage[] {
    return this.consumePendingSteers();
  }

  /**
   * Request user permission for a tool call that requires confirmation.
   */
  private async requestPermission(toolCall: ToolCallRequest): Promise<{ approved: boolean }> {
    return new Promise<{ approved: boolean }>((resolve) => {
      this.emit('permission:request', toolCall.name, toolCall.arguments, (response: ToolPermissionLevel) => {
        resolve({ approved: response === 'allow' });
      });
    });
  }

  /**
   * Execute a tool call. Override or provide via onToolCall callback.
   */
  private async executeToolCall(toolCall: ToolCallRequest): Promise<ToolCallResult> {
    // Default implementation emits an event for external execution
    return new Promise<ToolCallResult>((resolve) => {
      this.emit('tool:execute', toolCall, (result: ToolCallResult) => {
        resolve(result);
      });
    });
  }

  /**
   * Run the agentic loop: call LLM, process tool calls, repeat until done.
   * This is the main execution method for agent-based interactions.
   */
  async run(
    messages: ChatMessage[],
    options: {
      maxSteps?: number;
      systemPrompt?: string;
      onStep?: (step: AgentLoopStep) => void;
      onToolCall?: (toolCall: ToolCallRequest) => Promise<ToolCallResult>;
      onStreamChunk?: (chunk: string) => void;
      signal?: AbortSignal;
    } = {}
  ): Promise<AgentLoopResult> {
    const maxSteps = options.maxSteps ?? this.agent.maxSteps ?? 100;
    const loopSteps: AgentLoopStep[] = [];
    let currentMessages = [...messages];
    let totalTokens = { prompt: 0, completion: 0 };

    this.running = true;
    this.aborted = false;

    try {
      for (let step = 0; step < maxSteps; step++) {
        if (options.signal?.aborted || this.aborted) {
          return { steps: loopSteps, status: 'cancelled', totalTokens };
        }

        // Check for steer messages
        const steerMessages = this.consumeSteer();
        if (steerMessages.length > 0) {
          currentMessages.push(...steerMessages.map(s => ({
            id: crypto.randomUUID(),
            role: 'user' as const,
            content: s.content,
            timestamp: s.timestamp,
          })));
        }

        // Call LLM
        const response = await this.callLLM(currentMessages, {
          systemPrompt: options.systemPrompt,
          onStreamChunk: options.onStreamChunk,
        });

        totalTokens.prompt += response.usage?.promptTokens ?? 0;
        totalTokens.completion += response.usage?.completionTokens ?? 0;

        // Add assistant message
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response.message.content,
          thinking: response.thinking,
          toolCalls: response.message.toolCalls?.map(tc => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
          })),
          timestamp: new Date().toISOString(),
        };
        currentMessages.push(assistantMessage);

        const stepRecord: AgentLoopStep = {
          index: step,
          message: assistantMessage,
          timestamp: new Date().toISOString(),
        };
        loopSteps.push(stepRecord);
        options.onStep?.(stepRecord);

        // If no tool calls, we're done
        if (!response.message.toolCalls || response.message.toolCalls.length === 0) {
          return { steps: loopSteps, status: 'completed', totalTokens, finalMessage: assistantMessage };
        }

        // Process tool calls
        for (const toolCall of response.message.toolCalls) {
          const tcRequest: ToolCallRequest = {
            id: toolCall.id,
            name: toolCall.name,
            arguments: toolCall.arguments,
          };

          // Authorize tool call
          const permission = this.checkPermission(toolCall.name, toolCall.arguments);

          if (permission === 'deny') {
            currentMessages.push({
              id: crypto.randomUUID(),
              role: 'tool',
              content: JSON.stringify({ error: 'Permission denied', toolName: toolCall.name }),
              toolCallId: toolCall.id,
              timestamp: new Date().toISOString(),
            });
            continue;
          }

          if (permission === 'ask') {
            // Request user confirmation
            const userResponse = await this.requestPermission(tcRequest);
            if (!userResponse.approved) {
              currentMessages.push({
                id: crypto.randomUUID(),
                role: 'tool',
                content: JSON.stringify({ error: 'User denied permission', toolName: toolCall.name }),
                toolCallId: toolCall.id,
                timestamp: new Date().toISOString(),
              });
              continue;
            }
          }

          // Execute tool call
          try {
            const result = options.onToolCall
              ? await options.onToolCall(tcRequest)
              : await this.executeToolCall(tcRequest);

            currentMessages.push({
              id: crypto.randomUUID(),
              role: 'tool',
              content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
              toolCallId: toolCall.id,
              timestamp: new Date().toISOString(),
            });
          } catch (error: any) {
            currentMessages.push({
              id: crypto.randomUUID(),
              role: 'tool',
              content: JSON.stringify({ error: error.message }),
              toolCallId: toolCall.id,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }

      return { steps: loopSteps, status: 'max_steps_reached', totalTokens };
    } catch (error: any) {
      return { steps: loopSteps, status: 'error', totalTokens, error: error.message };
    } finally {
      this.running = false;
    }
  }

  /**
   * Call the LLM via the provider manager.
   */
  private async callLLM(
    messages: ChatMessage[],
    options: { systemPrompt?: string; onStreamChunk?: (chunk: string) => void }
  ): Promise<ChatResponse> {
    if (!this.providerManager) {
      throw new Error('ProviderManager not set on AgentRunner. Call setProviderManager() before run().');
    }

    const chatMessages = messages.map(m => ({
      role: m.role as 'system' | 'user' | 'assistant' | 'tool',
      content: m.content ?? '',
      ...(m.toolCallId ? { toolCallId: m.toolCallId } : {}),
    }));

    // Prepend system prompt if provided
    if (options.systemPrompt) {
      chatMessages.unshift({
        role: 'system',
        content: options.systemPrompt,
      });
    }

    return this.providerManager.chat(this.context.providerId, {
      messages: chatMessages,
      model: this.agent.model || this.context.model,
      temperature: this.agent.temperature,
      stream: false,
    });
  }
}
