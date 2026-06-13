/**
 * OpenAgent-Desktop - Subagent Dashboard (Backend)
 *
 * Tracks subagent tasks, provides monitoring data for the UI.
 * Enhanced version of SubagentHandler with status reporting,
 * resource tracking, and parent-child communication.
 *
 * Features:
 * - Task registration and progress tracking
 * - Resource usage monitoring (tokens, tool calls, files)
 * - Parent-child message passing
 * - Concurrency visualization data
 * - Aggregate resource usage per session
 * - Events: task:progress, task:status, task:message
 */

import { EventEmitter } from "events";
import { SubagentTask } from "./subagent-handler";

// ─── Type Definitions ─────────────────────────────────────────────────────────

export interface SubagentProgress {
  currentStep: number;
  totalSteps: number;
  percentComplete: number;
  currentActivity: string;
}

export interface SubagentResourceUsage {
  tokensUsed: number;
  toolCallsCount: number;
  filesAccessed: string[];
}

export type SubagentStatusValue = "pending" | "running" | "completed" | "error" | "cancelled";

export interface SubagentStatus {
  taskId: string;
  parentSessionId: string;
  status: SubagentStatusValue;
  progress: SubagentProgress;
  startedAt: string;
  estimatedCompletion?: string;
  resourceUsage: SubagentResourceUsage;
  messages: SubagentMessage[];
  prompt?: string;
  error?: string;
  completedAt?: string;
}

export interface SubagentMessage {
  id: string;
  taskId: string;
  direction: "child_to_parent" | "parent_to_child";
  content: string;
  timestamp: string;
  type: "info" | "error" | "result" | "progress" | "command";
}

export interface AggregateResourceUsage {
  totalTokensUsed: number;
  totalToolCalls: number;
  totalFilesAccessed: number;
  uniqueFilesAccessed: string[];
  averageDuration: number;
  taskCount: number;
  completedCount: number;
  failedCount: number;
  runningCount: number;
}

export interface DashboardData {
  tasks: SubagentStatus[];
  aggregate: AggregateResourceUsage;
  concurrencyLanes: ConcurrencyLane[];
  recentMessages: SubagentMessage[];
  timestamp: string;
}

export interface ConcurrencyLane {
  label: string;
  taskIds: string[];
  startTime: string;
  endTime?: string;
}

// ─── Subagent Dashboard ──────────────────────────────────────────────────────

export class SubagentDashboard extends EventEmitter {
  private tasks: Map<string, SubagentStatus> = new Map();
  private messages: SubagentMessage[] = [];
  private maxMessages: number;
  private taskTimelines: Map<string, { startedAt: number; completedAt?: number }> = new Map();

  constructor(maxMessages: number = 500) {
    super();
    this.maxMessages = maxMessages;
  }

  // ─── Task Management ────────────────────────────────────────────────────

  /**
   * Register a new subagent task for monitoring
   */
  registerTask(task: SubagentTask): void {
    const status: SubagentStatus = {
      taskId: task.id,
      parentSessionId: task.parentSessionId,
      status: task.status,
      progress: {
        currentStep: 0,
        totalSteps: task.maxSteps || 50,
        percentComplete: 0,
        currentActivity: "Initializing",
      },
      startedAt: task.createdAt,
      resourceUsage: {
        tokensUsed: 0,
        toolCallsCount: 0,
        filesAccessed: [],
      },
      messages: [],
      prompt: task.prompt,
    };

    if (task.status === "running") {
      this.taskTimelines.set(task.id, { startedAt: Date.now() });
    }

    this.tasks.set(task.id, status);
    this.emit("task:status", status);
  }

  /**
   * Update task progress
   */
  updateProgress(taskId: string, progress: Partial<SubagentProgress>): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.progress = { ...task.progress, ...progress };

    // Auto-calculate percent if not provided
    if (progress.currentStep !== undefined || progress.totalSteps !== undefined) {
      const total = task.progress.totalSteps || 1;
      const current = task.progress.currentStep || 0;
      if (progress.percentComplete === undefined) {
        task.progress.percentComplete = Math.min(100, Math.round((current / total) * 100));
      }
    }

    this.emit("task:progress", { taskId, progress: task.progress });
  }

  /**
   * Update task status
   */
  updateStatus(taskId: string, status: SubagentStatusValue): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const previousStatus = task.status;
    task.status = status;

    // Track timeline
    if (status === "running" && previousStatus === "pending") {
      this.taskTimelines.set(taskId, { startedAt: Date.now() });
    }

    if ((status === "completed" || status === "error" || status === "cancelled") && previousStatus === "running") {
      const timeline = this.taskTimelines.get(taskId);
      if (timeline) {
        timeline.completedAt = Date.now();
      }
      task.completedAt = new Date().toISOString();

      // Auto-set progress to 100% on completion
      if (status === "completed") {
        task.progress.percentComplete = 100;
        task.progress.currentActivity = "Completed";
      }
    }

    if (status === "error") {
      task.progress.currentActivity = "Failed";
    }

    if (status === "cancelled") {
      task.progress.currentActivity = "Cancelled";
    }

    this.emit("task:status", task);
  }

  /**
   * Add a message from subagent to parent or vice versa
   */
  addMessage(taskId: string, message: Omit<SubagentMessage, "id" | "taskId" | "timestamp">): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const fullMessage: SubagentMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      taskId,
      timestamp: new Date().toISOString(),
      ...message,
    };

    // Add to task messages
    task.messages.push(fullMessage);

    // Add to global message log
    this.messages.push(fullMessage);
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }

    this.emit("task:message", fullMessage);
  }

  /**
   * Update resource usage for a task
   */
  updateResourceUsage(taskId: string, usage: Partial<SubagentResourceUsage>): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    if (usage.tokensUsed !== undefined) {
      task.resourceUsage.tokensUsed += usage.tokensUsed;
    }
    if (usage.toolCallsCount !== undefined) {
      task.resourceUsage.toolCallsCount += usage.toolCallsCount;
    }
    if (usage.filesAccessed !== undefined) {
      // Merge unique files
      const existing = new Set(task.resourceUsage.filesAccessed);
      for (const f of usage.filesAccessed) {
        existing.add(f);
      }
      task.resourceUsage.filesAccessed = Array.from(existing);
    }
  }

  /**
   * Set error on a task
   */
  setTaskError(taskId: string, error: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.error = error;
    task.status = "error";
    task.progress.currentActivity = `Error: ${error.substring(0, 100)}`;
    task.completedAt = new Date().toISOString();

    const timeline = this.taskTimelines.get(taskId);
    if (timeline && !timeline.completedAt) {
      timeline.completedAt = Date.now();
    }

    this.emit("task:status", task);
  }

  // ─── Query Methods ──────────────────────────────────────────────────────

  /**
   * Get full dashboard data
   */
  getDashboard(): DashboardData {
    return {
      tasks: Array.from(this.tasks.values()),
      aggregate: this.getAggregateResourceUsage(),
      concurrencyLanes: this.getConcurrencyLanes(),
      recentMessages: this.getRecentMessages(50),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get all tasks for a specific session
   */
  getSessionTasks(sessionId: string): SubagentStatus[] {
    return Array.from(this.tasks.values()).filter(
      (t) => t.parentSessionId === sessionId
    );
  }

  /**
   * Get currently running tasks
   */
  getActiveTasks(): SubagentStatus[] {
    return Array.from(this.tasks.values()).filter(
      (t) => t.status === "running"
    );
  }

  /**
   * Get a specific task's status
   */
  getTaskStatus(taskId: string): SubagentStatus | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get aggregate resource usage for a session (or all sessions)
   */
  getAggregateResourceUsage(sessionId?: string): AggregateResourceUsage {
    const tasks = sessionId
      ? this.getSessionTasks(sessionId)
      : Array.from(this.tasks.values());

    let totalTokens = 0;
    let totalToolCalls = 0;
    const allFiles = new Set<string>();
    let totalDuration = 0;
    let durationCount = 0;
    let completedCount = 0;
    let failedCount = 0;
    let runningCount = 0;

    for (const task of tasks) {
      totalTokens += task.resourceUsage.tokensUsed;
      totalToolCalls += task.resourceUsage.toolCallsCount;
      for (const f of task.resourceUsage.filesAccessed) {
        allFiles.add(f);
      }

      const timeline = this.taskTimelines.get(task.taskId);
      if (timeline?.completedAt && timeline.startedAt) {
        totalDuration += timeline.completedAt - timeline.startedAt;
        durationCount++;
      }

      if (task.status === "completed") completedCount++;
      else if (task.status === "error" || task.status === "cancelled") failedCount++;
      else if (task.status === "running") runningCount++;
    }

    return {
      totalTokensUsed: totalTokens,
      totalToolCalls: totalToolCalls,
      totalFilesAccessed: allFiles.size,
      uniqueFilesAccessed: Array.from(allFiles),
      averageDuration: durationCount > 0 ? totalDuration / durationCount : 0,
      taskCount: tasks.length,
      completedCount,
      failedCount,
      runningCount,
    };
  }

  /**
   * Get recent messages
   */
  getRecentMessages(count: number = 20, taskId?: string): SubagentMessage[] {
    let msgs = taskId
      ? this.messages.filter((m) => m.taskId === taskId)
      : this.messages;
    return msgs.slice(-count);
  }

  /**
   * Get concurrency lanes for visualization
   * Groups tasks by overlapping time ranges to show parallel execution
   */
  getConcurrencyLanes(): ConcurrencyLane[] {
    const lanes: ConcurrencyLane[] = [];
    const runningByTime: Array<{
      taskId: string;
      startedAt: number;
      completedAt?: number;
    }> = [];

    for (const [taskId, timeline] of this.taskTimelines) {
      runningByTime.push({
        taskId,
        startedAt: timeline.startedAt,
        completedAt: timeline.completedAt,
      });
    }

    // Sort by start time
    runningByTime.sort((a, b) => a.startedAt - b.startedAt);

    // Simple lane assignment: put each task in the first lane where it doesn't overlap
    for (const entry of runningByTime) {
      let placed = false;
      for (const lane of lanes) {
        // Check if this task overlaps with any task already in this lane
        const hasOverlap = lane.taskIds.some((existingId) => {
          const existing = runningByTime.find((r) => r.taskId === existingId);
          if (!existing) return false;
          return this.timeRangesOverlap(
            entry.startedAt,
            entry.completedAt,
            existing.startedAt,
            existing.completedAt
          );
        });

        if (!hasOverlap) {
          lane.taskIds.push(entry.taskId);
          if (!lane.endTime) {
            lane.endTime = entry.completedAt
              ? new Date(entry.completedAt).toISOString()
              : undefined;
          }
          placed = true;
          break;
        }
      }

      if (!placed) {
        lanes.push({
          label: `Lane ${lanes.length + 1}`,
          taskIds: [entry.taskId],
          startTime: new Date(entry.startedAt).toISOString(),
          endTime: entry.completedAt
            ? new Date(entry.completedAt).toISOString()
            : undefined,
        });
      }
    }

    return lanes;
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId: string): void {
    this.updateStatus(taskId, "cancelled");
    this.addMessage(taskId, {
      direction: "parent_to_child",
      content: "Task cancelled by user",
      type: "command",
    });
  }

  /**
   * Send a message from parent to child task
   */
  sendToChild(taskId: string, content: string, type: SubagentMessage["type"] = "command"): void {
    this.addMessage(taskId, {
      direction: "parent_to_child",
      content,
      type,
    });
  }

  /**
   * Clear completed/failed tasks from the dashboard
   */
  clearCompleted(): number {
    let cleared = 0;
    for (const [taskId, task] of this.tasks) {
      if (task.status === "completed" || task.status === "error" || task.status === "cancelled") {
        this.tasks.delete(taskId);
        this.taskTimelines.delete(taskId);
        cleared++;
      }
    }
    return cleared;
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private timeRangesOverlap(
    start1: number,
    end1?: number,
    start2?: number,
    end2?: number
  ): boolean {
    if (!start2) return false;
    const actualEnd1 = end1 || Date.now();
    const actualEnd2 = end2 || Date.now();
    return start1 < actualEnd2 && start2 < actualEnd1;
  }
}
