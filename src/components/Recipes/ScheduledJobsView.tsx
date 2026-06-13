/**
 * OpenAgent-Desktop - Scheduled Jobs View Component
 *
 * React component for managing scheduled recipe executions.
 * Features:
 * - List of scheduled jobs with status badges (active/paused/error/completed)
 * - Next run countdown timer for each job
 * - Run history: timestamp, duration, result (success/failure), output preview
 * - Actions: Pause/Resume, Run Now, Cancel, Edit Schedule
 * - Add new scheduled job: select recipe, set schedule (cron or one-time), set variables
 * - Cron expression helper: visual builder for common patterns
 * - Timezone selector
 * - Error log with retry button
 * - "Upcoming" section showing next 5 scheduled runs
 * - Dark theme
 */

import React, { useState, useEffect, useCallback } from "react";
import { RecipeInfo, Toast } from "../../types";
import { humanizeCron } from "../../utils/cron-humanizer";

const api = (window as any).openagent;

// ─── Types ─────────────────────────────────────────────────────────────────────

type JobStatus = "active" | "paused" | "error" | "completed";
type ScheduleType = "one_time" | "recurring";

interface ScheduledJob {
  id: string;
  recipeId: string;
  recipeName?: string;
  schedule: string;
  type: ScheduleType;
  variables: Record<string, string>;
  lastRunAt?: string;
  nextRunAt?: string;
  status: JobStatus;
  runCount: number;
  errorCount: number;
  lastError?: string;
  maxRetries: number;
  retryCount: number;
  onError: "continue" | "pause" | "notify";
  timezone: string;
  createdAt: string;
}

interface RunLog {
  jobId: string;
  runAt: string;
  completedAt?: string;
  duration?: number;
  success: boolean;
  output?: string;
  error?: string;
}

interface ScheduledJobsViewProps {
  recipes: RecipeInfo[];
  jobs: ScheduledJob[];
  runLogs: RunLog[];
  onRefresh: () => Promise<void>;
  onJobAction: (jobId: string, action: "pause" | "resume" | "cancel" | "runNow" | "retry") => Promise<void>;
  onCreateJob: (job: { recipeId: string; schedule: string; type: ScheduleType; variables: Record<string, string>; timezone?: string }) => Promise<void>;
  addToast: (toast: Omit<Toast, "id">) => void;
}

// ─── Status Badge ──────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: JobStatus }> = ({ status }) => {
  const colors: Record<JobStatus, { bg: string; text: string }> = {
    active: { bg: "rgba(34,197,94,0.15)", text: "var(--color-success)" },
    paused: { bg: "rgba(245,158,11,0.15)", text: "var(--color-warning)" },
    error: { bg: "rgba(239,68,68,0.15)", text: "var(--color-error)" },
    completed: { bg: "rgba(107,114,128,0.15)", text: "var(--color-text-muted)" },
  };
  const c = colors[status];
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: c.bg, color: c.text }}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

// ─── Countdown Timer ───────────────────────────────────────────────────────────

const CountdownTimer: React.FC<{ targetDate: string }> = ({ targetDate }) => {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    const update = () => {
      const target = new Date(targetDate).getTime();
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0) {
        setRemaining("Due now");
        return;
      }

      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      if (hours > 24) {
        const days = Math.floor(hours / 24);
        setRemaining(`${days}d ${hours % 24}h`);
      } else if (hours > 0) {
        setRemaining(`${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setRemaining(`${minutes}m ${seconds}s`);
      } else {
        setRemaining(`${seconds}s`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return <span style={{ color: "var(--color-accent)", fontSize: "12px" }}>{remaining}</span>;
};

// ─── Duration Formatter ────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// ─── Main Component ────────────────────────────────────────────────────────────

const ScheduledJobsView: React.FC<ScheduledJobsViewProps> = ({
  recipes,
  jobs,
  runLogs,
  onRefresh,
  onJobAction,
  onCreateJob,
  addToast,
}) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedJob, setSelectedJob] = useState<ScheduledJob | null>(null);
  const [showRunHistory, setShowRunHistory] = useState<string | null>(null);

  // Create form state
  const [newRecipeId, setNewRecipeId] = useState("");
  const [newScheduleType, setNewScheduleType] = useState<ScheduleType>("recurring");
  const [newCron, setNewCron] = useState("0 9 * * *");
  const [newOneTimeDate, setNewOneTimeDate] = useState("");
  const [newTimezone, setNewTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [newVariables, setNewVariables] = useState<Record<string, string>>({});

  // Derived data
  const upcomingJobs = jobs
    .filter((j) => j.status === "active" && j.nextRunAt)
    .sort((a, b) => new Date(a.nextRunAt!).getTime() - new Date(b.nextRunAt!).getTime())
    .slice(0, 5);

  const selectedRecipe = recipes.find((r) => r.id === newRecipeId);

  // Handlers
  const handleCreateJob = useCallback(async () => {
    if (!newRecipeId) {
      addToast({ type: "warning", title: "Select a recipe" });
      return;
    }

    const schedule = newScheduleType === "recurring" ? newCron : newOneTimeDate;
    if (!schedule.trim()) {
      addToast({ type: "warning", title: "Set a schedule" });
      return;
    }

    try {
      await onCreateJob({
        recipeId: newRecipeId,
        schedule,
        type: newScheduleType,
        variables: newVariables,
        timezone: newTimezone,
      });
      setShowCreateForm(false);
      setNewRecipeId("");
      setNewVariables({});
      addToast({ type: "success", title: "Scheduled job created" });
      await onRefresh();
    } catch (err: any) {
      addToast({ type: "error", title: "Failed to create job", message: err.message });
    }
  }, [newRecipeId, newScheduleType, newCron, newOneTimeDate, newTimezone, newVariables, onCreateJob, onRefresh, addToast]);

  const handleAction = useCallback(async (jobId: string, action: "pause" | "resume" | "cancel" | "runNow" | "retry") => {
    try {
      await onJobAction(jobId, action);
      addToast({ type: "success", title: `Job ${action} successful` });
      await onRefresh();
    } catch (err: any) {
      addToast({ type: "error", title: `Failed to ${action} job`, message: err.message });
    }
  }, [onJobAction, onRefresh, addToast]);

  // ─── Common Styles ────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    background: "var(--color-bg-tertiary)",
    borderColor: "var(--color-border-primary)",
    color: "var(--color-text-primary)",
    borderRadius: "var(--border-radius-base)",
  };

  const labelStyle: React.CSSProperties = {
    color: "var(--color-text-tertiary)",
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex" style={{ background: "var(--color-bg-primary)" }}>
      {/* Main List */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="p-4 border-b" style={{ borderColor: "var(--color-border-secondary)" }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>Scheduled Jobs</h1>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-text-tertiary)" }}>
                {jobs.filter((j) => j.status === "active").length} active / {jobs.length} total
              </p>
            </div>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: "var(--color-accent)", color: "white" }}
            >
              + Schedule Job
            </button>
          </div>

          {/* Create Form */}
          {showCreateForm && (
            <div
              className="p-4 rounded-xl border space-y-3 mb-3"
              style={{ background: "var(--color-bg-secondary)", borderColor: "var(--color-border-primary)" }}
            >
              <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>New Scheduled Job</h3>

              {/* Recipe Selector */}
              <div>
                <label style={labelStyle}>Recipe</label>
                <select
                  value={newRecipeId}
                  onChange={(e) => {
                    setNewRecipeId(e.target.value);
                    setNewVariables({});
                  }}
                  className="w-full px-3 py-2 rounded-lg border text-sm mt-1"
                  style={inputStyle}
                >
                  <option value="">Select recipe...</option>
                  {recipes.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              {/* Schedule Type */}
              <div className="flex gap-3">
                <button
                  onClick={() => setNewScheduleType("recurring")}
                  className="flex-1 py-2 rounded-lg text-xs font-medium border"
                  style={{
                    background: newScheduleType === "recurring" ? "var(--color-accent)" : "var(--color-bg-tertiary)",
                    borderColor: newScheduleType === "recurring" ? "var(--color-accent)" : "var(--color-border-primary)",
                    color: newScheduleType === "recurring" ? "white" : "var(--color-text-secondary)",
                  }}
                >
                  Recurring
                </button>
                <button
                  onClick={() => setNewScheduleType("one_time")}
                  className="flex-1 py-2 rounded-lg text-xs font-medium border"
                  style={{
                    background: newScheduleType === "one_time" ? "var(--color-accent)" : "var(--color-bg-tertiary)",
                    borderColor: newScheduleType === "one_time" ? "var(--color-accent)" : "var(--color-border-primary)",
                    color: newScheduleType === "one_time" ? "white" : "var(--color-text-secondary)",
                  }}
                >
                  One-Time
                </button>
              </div>

              {/* Schedule Input */}
              {newScheduleType === "recurring" ? (
                <div>
                  <label style={labelStyle}>Cron Expression</label>
                  <input
                    type="text"
                    value={newCron}
                    onChange={(e) => setNewCron(e.target.value)}
                    placeholder="0 9 * * *"
                    className="w-full px-3 py-2 rounded-lg border text-sm font-mono mt-1"
                    style={inputStyle}
                  />
                  <div className="text-xs mt-1" style={{ color: "var(--color-accent)" }}>
                    {humanizeCron(newCron)}
                  </div>

                  {/* Common patterns */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {[
                      { label: "Hourly", cron: "0 * * * *" },
                      { label: "Every 30m", cron: "*/30 * * * *" },
                      { label: "Daily 9am", cron: "0 9 * * *" },
                      { label: "Weekdays 9am", cron: "0 9 * * 1-5" },
                      { label: "Weekly Mon", cron: "0 10 * * 1" },
                      { label: "6 hours", cron: "0 */6 * * *" },
                    ].map((p) => (
                      <button
                        key={p.cron}
                        onClick={() => setNewCron(p.cron)}
                        className="text-xs px-2 py-1 rounded border transition-colors"
                        style={{
                          background: newCron === p.cron ? "var(--color-accent-soft)" : "var(--color-bg-tertiary)",
                          borderColor: newCron === p.cron ? "var(--color-accent)" : "var(--color-border-primary)",
                          color: newCron === p.cron ? "var(--color-accent)" : "var(--color-text-tertiary)",
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <label style={labelStyle}>Run At</label>
                  <input
                    type="datetime-local"
                    value={newOneTimeDate}
                    onChange={(e) => setNewOneTimeDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm mt-1"
                    style={inputStyle}
                  />
                </div>
              )}

              {/* Timezone */}
              <div>
                <label style={labelStyle}>Timezone</label>
                <select
                  value={newTimezone}
                  onChange={(e) => setNewTimezone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-sm mt-1"
                  style={inputStyle}
                >
                  {["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Tokyo", "Asia/Shanghai", "Australia/Sydney", Intl.DateTimeFormat().resolvedOptions().timeZone]
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                </select>
              </div>

              {/* Variable Overrides */}
              {selectedRecipe && selectedRecipe.variables.length > 0 && (
                <div>
                  <label style={labelStyle}>Variables</label>
                  <div className="space-y-2 mt-1">
                    {selectedRecipe.variables.map((v) => (
                      <div key={v.name}>
                        <label className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                          {v.name} {v.required && <span style={{ color: "var(--color-error)" }}>*</span>}
                        </label>
                        {v.type === "select" && v.options ? (
                          <select
                            value={newVariables[v.name] || v.defaultValue || ""}
                            onChange={(e) => setNewVariables((prev) => ({ ...prev, [v.name]: e.target.value }))}
                            className="w-full px-2 py-1.5 rounded border text-xs"
                            style={inputStyle}
                          >
                            <option value="">Default: {v.defaultValue || "Select..."}</option>
                            {v.options.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={v.type === "number" ? "number" : "text"}
                            value={newVariables[v.name] || v.defaultValue || ""}
                            onChange={(e) => setNewVariables((prev) => ({ ...prev, [v.name]: e.target.value }))}
                            placeholder={v.description}
                            className="w-full px-2 py-1.5 rounded border text-xs"
                            style={inputStyle}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCreateJob}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: "var(--color-accent)", color: "white" }}
                >
                  Create Job
                </button>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium border"
                  style={{ borderColor: "var(--color-border-primary)", color: "var(--color-text-secondary)" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Upcoming Runs */}
          {upcomingJobs.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: "var(--color-text-tertiary)" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                UPCOMING RUNS
              </h2>
              <div className="space-y-1.5">
                {upcomingJobs.map((job) => {
                  const recipe = recipes.find((r) => r.id === job.recipeId);
                  return (
                    <div
                      key={job.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg"
                      style={{ background: "var(--color-bg-secondary)" }}
                    >
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "var(--color-success)" }} />
                      <span className="text-xs font-medium flex-1" style={{ color: "var(--color-text-primary)" }}>
                        {recipe?.name || job.recipeId}
                      </span>
                      <CountdownTimer targetDate={job.nextRunAt!} />
                      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {job.type === "recurring" ? humanizeCron(job.schedule) : "One-time"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* All Jobs */}
          <div>
            <h2 className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-tertiary)" }}>ALL JOBS</h2>
            {jobs.length === 0 ? (
              <div className="text-center py-12" style={{ color: "var(--color-text-muted)" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                <p className="text-sm">No scheduled jobs</p>
                <p className="text-xs mt-1">Click "Schedule Job" to create one</p>
              </div>
            ) : (
              <div className="space-y-2">
                {jobs.map((job) => {
                  const recipe = recipes.find((r) => r.id === job.recipeId);
                  return (
                    <div
                      key={job.id}
                      className="rounded-xl border p-4 cursor-pointer transition-colors"
                      style={{
                        background: selectedJob?.id === job.id ? "var(--color-accent-soft)" : "var(--color-bg-secondary)",
                        borderColor: selectedJob?.id === job.id ? "var(--color-accent)" : "var(--color-border-primary)",
                      }}
                      onClick={() => setSelectedJob(selectedJob?.id === job.id ? null : job)}
                    >
                      <div className="flex items-center gap-3">
                        {/* Status indicator */}
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{
                            background:
                              job.status === "active" ? "rgba(34,197,94,0.15)" :
                              job.status === "paused" ? "rgba(245,158,11,0.15)" :
                              job.status === "error" ? "rgba(239,68,68,0.15)" :
                              "rgba(107,114,128,0.15)",
                          }}
                        >
                          {job.status === "active" ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                            </svg>
                          ) : job.status === "paused" ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                            </svg>
                          ) : job.status === "error" ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                              {recipe?.name || job.recipeId}
                            </span>
                            <StatusBadge status={job.status} />
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: "var(--color-text-tertiary)" }}>
                            {job.type === "recurring" ? humanizeCron(job.schedule) : `One-time: ${new Date(job.schedule).toLocaleString()}`}
                            {job.timezone && ` (${job.timezone})`}
                          </div>
                          {job.nextRunAt && job.status === "active" && (
                            <div className="text-xs mt-0.5">
                              <span style={{ color: "var(--color-text-muted)" }}>Next: </span>
                              <CountdownTimer targetDate={job.nextRunAt} />
                            </div>
                          )}
                          {job.lastError && (
                            <div className="text-xs mt-0.5 truncate" style={{ color: "var(--color-error)" }}>
                              {job.lastError}
                            </div>
                          )}
                        </div>

                        {/* Stats */}
                        <div className="text-right flex-shrink-0">
                          <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                            {job.runCount} run{job.runCount !== 1 ? "s" : ""}
                          </div>
                          {job.errorCount > 0 && (
                            <div className="text-xs" style={{ color: "var(--color-error)" }}>
                              {job.errorCount} error{job.errorCount !== 1 ? "s" : ""}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-1 flex-shrink-0">
                          {job.status === "active" && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleAction(job.id, "runNow"); }}
                                className="p-1.5 rounded-lg text-xs border"
                                style={{ borderColor: "var(--color-border-primary)", color: "var(--color-text-secondary)" }}
                                title="Run Now"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                  <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleAction(job.id, "pause"); }}
                                className="p-1.5 rounded-lg text-xs border"
                                style={{ borderColor: "var(--color-border-primary)", color: "var(--color-warning)" }}
                                title="Pause"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                                </svg>
                              </button>
                            </>
                          )}
                          {job.status === "paused" && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleAction(job.id, "resume"); }}
                              className="p-1.5 rounded-lg text-xs border"
                              style={{ borderColor: "var(--color-border-primary)", color: "var(--color-success)" }}
                              title="Resume"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                <polygon points="5 3 19 12 5 21 5 3" />
                              </svg>
                            </button>
                          )}
                          {job.status === "error" && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleAction(job.id, "retry"); }}
                              className="p-1.5 rounded-lg text-xs border"
                              style={{ borderColor: "var(--color-border-primary)", color: "var(--color-accent)" }}
                              title="Retry"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAction(job.id, "cancel"); }}
                            className="p-1.5 rounded-lg text-xs border"
                            style={{ borderColor: "var(--color-border-primary)", color: "var(--color-error)" }}
                            title="Cancel"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Expanded: Run History */}
                      {selectedJob?.id === job.id && (
                        <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--color-border-primary)" }}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold" style={{ color: "var(--color-text-tertiary)" }}>RUN HISTORY</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowRunHistory(showRunHistory === job.id ? null : job.id);
                              }}
                              className="text-xs px-2 py-1 rounded"
                              style={{ color: "var(--color-accent)" }}
                            >
                              {showRunHistory === job.id ? "Hide" : "Show All"}
                            </button>
                          </div>

                          {(() => {
                            const logs = runLogs.filter((l) => l.jobId === job.id).slice(-(showRunHistory === job.id ? 50 : 3)).reverse();
                            if (logs.length === 0) {
                              return <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>No run history yet</div>;
                            }
                            return (
                              <div className="space-y-1">
                                {logs.map((log, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center gap-2 text-xs px-2 py-1.5 rounded"
                                    style={{ background: "var(--color-bg-tertiary)" }}
                                  >
                                    <span
                                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                      style={{ background: log.success ? "var(--color-success)" : "var(--color-error)" }}
                                    />
                                    <span style={{ color: "var(--color-text-secondary)" }}>
                                      {new Date(log.runAt).toLocaleString()}
                                    </span>
                                    {log.duration && (
                                      <span style={{ color: "var(--color-text-muted)" }}>
                                        {formatDuration(log.duration)}
                                      </span>
                                    )}
                                    {log.error && (
                                      <span className="truncate flex-1" style={{ color: "var(--color-error)" }}>
                                        {log.error.substring(0, 80)}
                                      </span>
                                    )}
                                    {log.output && !log.error && (
                                      <span className="truncate flex-1" style={{ color: "var(--color-text-muted)" }}>
                                        {log.output.substring(0, 80)}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            );
                          })()}

                          {/* Job Details */}
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span style={{ color: "var(--color-text-muted)" }}>Job ID: </span>
                              <span style={{ color: "var(--color-text-secondary)" }} className="font-mono">{job.id}</span>
                            </div>
                            <div>
                              <span style={{ color: "var(--color-text-muted)" }}>Created: </span>
                              <span style={{ color: "var(--color-text-secondary)" }}>{new Date(job.createdAt).toLocaleString()}</span>
                            </div>
                            <div>
                              <span style={{ color: "var(--color-text-muted)" }}>On Error: </span>
                              <span style={{ color: "var(--color-text-secondary)" }}>{job.onError}</span>
                            </div>
                            <div>
                              <span style={{ color: "var(--color-text-muted)" }}>Max Retries: </span>
                              <span style={{ color: "var(--color-text-secondary)" }}>{job.maxRetries}</span>
                            </div>
                          </div>

                          {Object.keys(job.variables).length > 0 && (
                            <div className="mt-2">
                              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Variables: </span>
                              {Object.entries(job.variables).map(([k, v]) => (
                                <span key={k} className="text-xs px-1.5 py-0.5 rounded mr-1" style={{ background: "var(--color-bg-tertiary)", color: "var(--color-text-secondary)" }}>
                                  {k}={v}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScheduledJobsView;
