/**
 * OpenAgent-Desktop - Subagent Dashboard View Component
 *
 * React component for monitoring subagent tasks.
 * Features:
 * - Active subagents panel: cards showing running tasks with progress bars
 * - Progress per task: step count, percentage, current activity
 * - Resource usage: tokens used, tool calls count, files accessed
 * - Parent-child message log
 * - Concurrency visualization: parallel execution lanes
 * - Task history: completed/failed tasks with results
 * - Cancel button per task
 * - Aggregate stats: total tasks, total tokens, average duration
 * - Real-time updates (simulated with polling or event-based)
 * - Dark theme
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Toast } from "../../types";

const api = (window as any).openagent;

// ─── Types ─────────────────────────────────────────────────────────────────────

type SubagentStatusValue = "pending" | "running" | "completed" | "error" | "cancelled";

interface SubagentProgress {
  currentStep: number;
  totalSteps: number;
  percentComplete: number;
  currentActivity: string;
}

interface SubagentResourceUsage {
  tokensUsed: number;
  toolCallsCount: number;
  filesAccessed: string[];
}

interface SubagentStatus {
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

interface SubagentMessage {
  id: string;
  taskId: string;
  direction: "child_to_parent" | "parent_to_child";
  content: string;
  timestamp: string;
  type: "info" | "error" | "result" | "progress" | "command";
}

interface AggregateResourceUsage {
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

interface ConcurrencyLane {
  label: string;
  taskIds: string[];
  startTime: string;
  endTime?: string;
}

interface SubagentDashboardViewProps {
  tasks: SubagentStatus[];
  aggregate: AggregateResourceUsage;
  concurrencyLanes: ConcurrencyLane[];
  recentMessages: SubagentMessage[];
  onRefresh: () => Promise<void>;
  onCancelTask: (taskId: string) => Promise<void>;
  onSendMessage: (taskId: string, content: string) => void;
  addToast: (toast: Omit<Toast, "id">) => void;
}

// ─── Progress Bar ──────────────────────────────────────────────────────────────

const ProgressBar: React.FC<{ percent: number; status: SubagentStatusValue }> = ({ percent, status }) => {
  const getColor = () => {
    switch (status) {
      case "running": return "var(--color-accent)";
      case "completed": return "var(--color-success)";
      case "error": return "var(--color-error)";
      case "cancelled": return "var(--color-text-muted)";
      default: return "var(--color-text-tertiary)";
    }
  };

  return (
    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-bg-tertiary)" }}>
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%`, background: getColor() }}
      />
    </div>
  );
};

// ─── Duration Formatter ────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 60000) return "just now";
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
  return date.toLocaleDateString();
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────

const StatCard: React.FC<{ label: string; value: string | number; subtext?: string; color?: string }> = ({
  label,
  value,
  subtext,
  color,
}) => (
  <div className="p-3 rounded-lg border" style={{ background: "var(--color-bg-secondary)", borderColor: "var(--color-border-primary)" }}>
    <div className="text-xs mb-1" style={{ color: "var(--color-text-tertiary)" }}>{label}</div>
    <div className="text-lg font-bold" style={{ color: color || "var(--color-text-primary)" }}>{value}</div>
    {subtext && <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{subtext}</div>}
  </div>
);

// ─── Main Component ────────────────────────────────────────────────────────────

const SubagentDashboardView: React.FC<SubagentDashboardViewProps> = ({
  tasks,
  aggregate,
  concurrencyLanes,
  recentMessages,
  onRefresh,
  onCancelTask,
  onSendMessage,
  addToast,
}) => {
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [viewFilter, setViewFilter] = useState<"all" | "active" | "completed" | "error">("all");
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Auto-refresh every 3 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      onRefresh();
    }, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, onRefresh]);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    switch (viewFilter) {
      case "active": return tasks.filter((t) => t.status === "running" || t.status === "pending");
      case "completed": return tasks.filter((t) => t.status === "completed");
      case "error": return tasks.filter((t) => t.status === "error" || t.status === "cancelled");
      default: return tasks;
    }
  }, [tasks, viewFilter]);

  const activeTasks = tasks.filter((t) => t.status === "running" || t.status === "pending");
  const completedTasks = tasks.filter((t) => t.status === "completed");
  const failedTasks = tasks.filter((t) => t.status === "error" || t.status === "cancelled");
  const selectedTaskData = tasks.find((t) => t.taskId === selectedTask);

  const handleCancelTask = useCallback(async (taskId: string) => {
    try {
      await onCancelTask(taskId);
      addToast({ type: "success", title: "Task cancelled" });
      await onRefresh();
    } catch (err: any) {
      addToast({ type: "error", title: "Cancel failed", message: err.message });
    }
  }, [onCancelTask, onRefresh, addToast]);

  const handleSendMessage = useCallback(() => {
    if (!selectedTask || !messageInput.trim()) return;
    onSendMessage(selectedTask, messageInput.trim());
    setMessageInput("");
  }, [selectedTask, messageInput, onSendMessage]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--color-bg-primary)" }}>
      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: "var(--color-border-secondary)" }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>Subagent Dashboard</h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-tertiary)" }}>
              {activeTasks.length} active / {completedTasks.length} completed / {failedTasks.length} failed
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: "var(--color-text-secondary)" }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="accent-[var(--color-accent)]"
              />
              Auto-refresh
            </label>
            <button
              onClick={onRefresh}
              className="p-2 rounded-lg border"
              style={{ borderColor: "var(--color-border-primary)", color: "var(--color-text-secondary)" }}
              title="Refresh"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Aggregate Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatCard label="Total Tasks" value={aggregate.taskCount} />
          <StatCard label="Running" value={aggregate.runningCount} color="var(--color-accent)" />
          <StatCard label="Completed" value={aggregate.completedCount} color="var(--color-success)" />
          <StatCard label="Failed" value={aggregate.failedCount} color="var(--color-error)" />
          <StatCard label="Tokens Used" value={aggregate.totalTokensUsed > 1000 ? `${(aggregate.totalTokensUsed / 1000).toFixed(1)}k` : aggregate.totalTokensUsed} />
          <StatCard label="Avg Duration" value={aggregate.averageDuration > 0 ? formatDuration(aggregate.averageDuration) : "—"} />
        </div>

        {/* Concurrency Visualization */}
        {concurrencyLanes.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: "var(--color-text-tertiary)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              PARALLEL EXECUTION
            </h2>
            <div className="space-y-1.5">
              {concurrencyLanes.map((lane, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs w-12 text-right flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>
                    {lane.label}
                  </span>
                  <div className="flex-1 h-6 rounded relative" style={{ background: "var(--color-bg-tertiary)" }}>
                    {lane.taskIds.map((taskId, ti) => {
                      const task = tasks.find((t) => t.taskId === taskId);
                      const width = 100 / lane.taskIds.length;
                      return (
                        <div
                          key={taskId}
                          className="absolute top-0.5 bottom-0.5 rounded flex items-center justify-center text-xs font-mono truncate px-1"
                          style={{
                            left: `${ti * width}%`,
                            width: `${width}%`,
                            background: task?.status === "running" ? "var(--color-accent-soft)" :
                              task?.status === "completed" ? "rgba(34,197,94,0.15)" :
                              task?.status === "error" ? "rgba(239,68,68,0.15)" :
                              "var(--color-bg-secondary)",
                            color: task?.status === "running" ? "var(--color-accent)" :
                              task?.status === "completed" ? "var(--color-success)" :
                              task?.status === "error" ? "var(--color-error)" :
                              "var(--color-text-tertiary)",
                            border: `1px solid ${selectedTask === taskId ? "var(--color-accent)" : "transparent"}`,
                            cursor: "pointer",
                          }}
                          onClick={() => setSelectedTask(taskId)}
                        >
                          {taskId.slice(-6)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Subagents */}
        {activeTasks.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: "var(--color-accent)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              ACTIVE SUBAGENTS
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeTasks.map((task) => (
                <div
                  key={task.taskId}
                  className="rounded-xl border p-4 cursor-pointer transition-colors"
                  style={{
                    background: selectedTask === task.taskId ? "var(--color-accent-soft)" : "var(--color-bg-secondary)",
                    borderColor: selectedTask === task.taskId ? "var(--color-accent)" : "var(--color-border-primary)",
                  }}
                  onClick={() => setSelectedTask(selectedTask === task.taskId ? null : task.taskId)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
                      {task.taskId.slice(-8)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCancelTask(task.taskId);
                      }}
                      className="p-1 rounded text-xs"
                      style={{ color: "var(--color-error)" }}
                      title="Cancel"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>

                  {/* Activity */}
                  <div className="text-xs mb-2 truncate" style={{ color: "var(--color-text-secondary)" }}>
                    {task.progress.currentActivity}
                  </div>

                  {/* Progress */}
                  <ProgressBar percent={task.progress.percentComplete} status={task.status} />
                  <div className="flex justify-between mt-1">
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      Step {task.progress.currentStep}/{task.progress.totalSteps}
                    </span>
                    <span className="text-xs font-medium" style={{ color: "var(--color-accent)" }}>
                      {task.progress.percentComplete}%
                    </span>
                  </div>

                  {/* Resource Usage */}
                  <div className="flex gap-3 mt-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                    <span>{task.resourceUsage.tokensUsed.toLocaleString()} tokens</span>
                    <span>{task.resourceUsage.toolCallsCount} tools</span>
                    <span>{task.resourceUsage.filesAccessed.length} files</span>
                  </div>

                  {/* Running time */}
                  <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                    Running for {formatDuration(Date.now() - new Date(task.startedAt).getTime())}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Task History */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold" style={{ color: "var(--color-text-tertiary)" }}>TASK HISTORY</h2>
            <div className="flex gap-1">
              {(["all", "active", "completed", "error"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setViewFilter(filter)}
                  className="text-xs px-2 py-1 rounded font-medium"
                  style={{
                    background: viewFilter === filter ? "var(--color-accent-soft)" : "transparent",
                    color: viewFilter === filter ? "var(--color-accent)" : "var(--color-text-muted)",
                  }}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {filteredTasks.length === 0 ? (
            <div className="text-center py-8" style={{ color: "var(--color-text-muted)" }}>
              <p className="text-sm">No tasks to display</p>
            </div>
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {filteredTasks.map((task) => {
                const isActive = task.status === "running" || task.status === "pending";
                return (
                  <div
                    key={task.taskId}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors"
                    style={{
                      background: selectedTask === task.taskId ? "var(--color-accent-soft)" : "var(--color-bg-secondary)",
                    }}
                    onClick={() => setSelectedTask(selectedTask === task.taskId ? null : task.taskId)}
                  >
                    {/* Status indicator */}
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{
                        background:
                          task.status === "running" ? "var(--color-accent)" :
                          task.status === "completed" ? "var(--color-success)" :
                          task.status === "error" ? "var(--color-error)" :
                          task.status === "pending" ? "var(--color-warning)" :
                          "var(--color-text-muted)",
                        animation: isActive ? "pulse 2s infinite" : "none",
                      }}
                    />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono" style={{ color: "var(--color-text-primary)" }}>
                          {task.taskId.slice(-8)}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{
                          background:
                            task.status === "running" ? "var(--color-accent-soft)" :
                            task.status === "completed" ? "rgba(34,197,94,0.15)" :
                            task.status === "error" ? "rgba(239,68,68,0.15)" :
                            "var(--color-bg-tertiary)",
                          color:
                            task.status === "running" ? "var(--color-accent)" :
                            task.status === "completed" ? "var(--color-success)" :
                            task.status === "error" ? "var(--color-error)" :
                            "var(--color-text-muted)",
                        }}>
                          {task.status}
                        </span>
                      </div>
                      {task.progress.currentActivity && (
                        <div className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
                          {task.progress.currentActivity}
                        </div>
                      )}
                    </div>

                    {/* Progress / Duration */}
                    {isActive ? (
                      <div className="w-20 flex-shrink-0">
                        <ProgressBar percent={task.progress.percentComplete} status={task.status} />
                      </div>
                    ) : (
                      <span className="text-xs flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>
                        {task.completedAt ? formatDuration(new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()) : "—"}
                      </span>
                    )}

                    {/* Tokens */}
                    <span className="text-xs flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>
                      {task.resourceUsage.tokensUsed > 0 ? `${(task.resourceUsage.tokensUsed / 1000).toFixed(1)}k` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Task Detail */}
        {selectedTaskData && (
          <div className="rounded-xl border p-4" style={{ background: "var(--color-bg-secondary)", borderColor: "var(--color-accent)" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Task: {selectedTaskData.taskId}
              </h3>
              <button
                onClick={() => setSelectedTask(null)}
                className="p-1 rounded"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-3 text-xs">
              <div>
                <span style={{ color: "var(--color-text-muted)" }}>Session: </span>
                <span style={{ color: "var(--color-text-secondary)" }} className="font-mono">{selectedTaskData.parentSessionId.slice(-8)}</span>
              </div>
              <div>
                <span style={{ color: "var(--color-text-muted)" }}>Started: </span>
                <span style={{ color: "var(--color-text-secondary)" }}>{formatTimestamp(selectedTaskData.startedAt)}</span>
              </div>
              <div>
                <span style={{ color: "var(--color-text-muted)" }}>Progress: </span>
                <span style={{ color: "var(--color-text-secondary)" }}>{selectedTaskData.progress.currentStep}/{selectedTaskData.progress.totalSteps} ({selectedTaskData.progress.percentComplete}%)</span>
              </div>
              <div>
                <span style={{ color: "var(--color-text-muted)" }}>Tokens: </span>
                <span style={{ color: "var(--color-text-secondary)" }}>{selectedTaskData.resourceUsage.tokensUsed.toLocaleString()}</span>
              </div>
            </div>

            {/* Prompt */}
            {selectedTaskData.prompt && (
              <div className="mb-3">
                <div className="text-xs font-semibold mb-1" style={{ color: "var(--color-text-tertiary)" }}>PROMPT</div>
                <div
                  className="text-xs p-2 rounded font-mono whitespace-pre-wrap max-h-32 overflow-y-auto"
                  style={{ background: "var(--color-bg-tertiary)", color: "var(--color-text-secondary)" }}
                >
                  {selectedTaskData.prompt}
                </div>
              </div>
            )}

            {/* Error */}
            {selectedTaskData.error && (
              <div className="mb-3">
                <div className="text-xs font-semibold mb-1" style={{ color: "var(--color-error)" }}>ERROR</div>
                <div
                  className="text-xs p-2 rounded max-h-24 overflow-y-auto"
                  style={{ background: "rgba(239,68,68,0.1)", color: "var(--color-error)" }}
                >
                  {selectedTaskData.error}
                </div>
              </div>
            )}

            {/* Resource Usage */}
            <div className="mb-3">
              <div className="text-xs font-semibold mb-1" style={{ color: "var(--color-text-tertiary)" }}>RESOURCE USAGE</div>
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 rounded text-center" style={{ background: "var(--color-bg-tertiary)" }}>
                  <div className="text-sm font-bold" style={{ color: "var(--color-accent)" }}>
                    {selectedTaskData.resourceUsage.tokensUsed.toLocaleString()}
                  </div>
                  <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>Tokens</div>
                </div>
                <div className="p-2 rounded text-center" style={{ background: "var(--color-bg-tertiary)" }}>
                  <div className="text-sm font-bold" style={{ color: "var(--color-accent)" }}>
                    {selectedTaskData.resourceUsage.toolCallsCount}
                  </div>
                  <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>Tool Calls</div>
                </div>
                <div className="p-2 rounded text-center" style={{ background: "var(--color-bg-tertiary)" }}>
                  <div className="text-sm font-bold" style={{ color: "var(--color-accent)" }}>
                    {selectedTaskData.resourceUsage.filesAccessed.length}
                  </div>
                  <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>Files</div>
                </div>
              </div>
              {selectedTaskData.resourceUsage.filesAccessed.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {selectedTaskData.resourceUsage.filesAccessed.slice(0, 10).map((f) => (
                    <span key={f} className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: "var(--color-bg-tertiary)", color: "var(--color-text-muted)" }}>
                      {f.length > 30 ? `...${f.slice(-27)}` : f}
                    </span>
                  ))}
                  {selectedTaskData.resourceUsage.filesAccessed.length > 10 && (
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      +{selectedTaskData.resourceUsage.filesAccessed.length - 10} more
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Message Log */}
            <div className="mb-3">
              <div className="text-xs font-semibold mb-1" style={{ color: "var(--color-text-tertiary)" }}>MESSAGE LOG</div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {selectedTaskData.messages.length === 0 ? (
                  <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>No messages yet</div>
                ) : (
                  selectedTaskData.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className="text-xs px-2 py-1.5 rounded"
                      style={{
                        background: msg.direction === "child_to_parent" ? "var(--color-bg-tertiary)" : "var(--color-accent-soft)",
                        borderLeft: `2px solid ${msg.direction === "child_to_parent" ? "var(--color-text-muted)" : "var(--color-accent)"}`,
                      }}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span style={{ color: "var(--color-text-muted)" }}>{formatTimestamp(msg.timestamp)}</span>
                        <span style={{
                          color: msg.type === "error" ? "var(--color-error)" :
                            msg.type === "result" ? "var(--color-success)" :
                            msg.type === "progress" ? "var(--color-accent)" :
                            "var(--color-text-tertiary)",
                        }}>
                          {msg.direction === "child_to_parent" ? "↑" : "↓"} {msg.type}
                        </span>
                      </div>
                      <div style={{ color: "var(--color-text-secondary)" }}>{msg.content}</div>
                    </div>
                  ))
                )}
              </div>

              {/* Send message input */}
              {(selectedTaskData.status === "running" || selectedTaskData.status === "pending") && (
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                    placeholder="Send message to subagent..."
                    className="flex-1 px-2 py-1.5 rounded border text-xs"
                    style={{
                      background: "var(--color-bg-tertiary)",
                      borderColor: "var(--color-border-primary)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                  <button
                    onClick={handleSendMessage}
                    className="px-3 py-1.5 rounded text-xs font-medium"
                    style={{ background: "var(--color-accent)", color: "white" }}
                  >
                    Send
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recent Messages (Global) */}
        {recentMessages.length > 0 && !selectedTask && (
          <div>
            <h2 className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: "var(--color-text-tertiary)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              RECENT MESSAGES
            </h2>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {recentMessages.slice(-20).map((msg) => (
                <div
                  key={msg.id}
                  className="flex items-start gap-2 text-xs px-2 py-1.5 rounded cursor-pointer"
                  style={{
                    background: msg.direction === "child_to_parent" ? "var(--color-bg-secondary)" : "var(--color-accent-soft)",
                    borderLeft: `2px solid ${msg.direction === "child_to_parent" ? "var(--color-text-muted)" : "var(--color-accent)"}`,
                  }}
                  onClick={() => setSelectedTask(msg.taskId)}
                >
                  <span className="font-mono flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>
                    {msg.taskId.slice(-6)}
                  </span>
                  <span style={{
                    color: msg.type === "error" ? "var(--color-error)" :
                      msg.type === "result" ? "var(--color-success)" :
                      "var(--color-text-secondary)",
                  }}>
                    {msg.direction === "child_to_parent" ? "↑" : "↓"} {msg.content.substring(0, 100)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SubagentDashboardView;
