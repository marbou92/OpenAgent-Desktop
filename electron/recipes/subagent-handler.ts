/**
 * OpenAgent-Desktop - Subagent Handler
 * 
 * Spawns child agents for delegated tasks.
 * Like Goose: parent agent can spawn sub-agents with specific configs.
 */

import { EventEmitter } from 'events';
import { AgentDefinition, AgentRunResult } from '../agents/types';

export interface SubagentTask {
  id: string;
  parentSessionId: string;
  prompt: string;
  agent?: AgentDefinition;
  maxSteps?: number;
  workingDirectory?: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  result?: AgentRunResult;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export class SubagentHandler extends EventEmitter {
  private tasks: Map<string, SubagentTask> = new Map();
  private maxConcurrentSubagents: number;
  private runningCount: number = 0;

  constructor(maxConcurrent: number = 3) {
    super();
    this.maxConcurrentSubagents = maxConcurrent;
  }

  canSpawn(): boolean {
    return this.runningCount < this.maxConcurrentSubagents;
  }

  createTask(
    parentSessionId: string,
    prompt: string,
    options?: { agent?: AgentDefinition; maxSteps?: number; workingDirectory?: string }
  ): SubagentTask {
    const task: SubagentTask = {
      id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      parentSessionId,
      prompt,
      agent: options?.agent,
      maxSteps: options?.maxSteps || 50,
      workingDirectory: options?.workingDirectory,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.tasks.set(task.id, task);
    this.emit('subagent:created', task);
    return task;
  }

  async runTask(taskId: string, execute: (task: SubagentTask) => Promise<AgentRunResult>): Promise<AgentRunResult> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Subagent task not found: ${taskId}`);

    task.status = 'running';
    this.runningCount++;
    this.emit('subagent:started', task);

    try {
      const result = await execute(task);
      task.status = 'completed';
      task.result = result;
      task.completedAt = new Date().toISOString();
      this.emit('subagent:completed', task);
      return result;
    } catch (err: any) {
      task.status = 'error';
      task.error = err.message;
      task.completedAt = new Date().toISOString();
      this.emit('subagent:error', { task, error: err });
      throw err;
    } finally {
      this.runningCount--;
    }
  }

  getTask(taskId: string): SubagentTask | undefined {
    return this.tasks.get(taskId);
  }

  getTasksByParent(parentSessionId: string): SubagentTask[] {
    return Array.from(this.tasks.values()).filter((t) => t.parentSessionId === parentSessionId);
  }

  listActive(): SubagentTask[] {
    return Array.from(this.tasks.values()).filter((t) => t.status === 'running');
  }

  cancelTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task && task.status === 'running') {
      task.status = 'error';
      task.error = 'Cancelled by user';
      task.completedAt = new Date().toISOString();
      this.runningCount--;
      this.emit('subagent:cancelled', task);
    }
  }
}
