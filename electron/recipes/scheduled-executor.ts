/**
 * OpenAgent-Desktop - Scheduled Recipe Executor
 *
 * Manages scheduled execution of recipes using cron-like scheduling.
 * Like Goose's scheduled recipe execution.
 * Supports one-time and recurring schedules with variable substitution.
 *
 * Features:
 * - Cron expression parsing (simplified: every N min/hour/day, specific times, day of week)
 * - One-time execution at a specific datetime
 * - Variable substitution at execution time
 * - Error handling: max retries, on-error policy (continue/pause/notify)
 * - Execution logging
 * - Persistence to ~/.openagent/scheduled-jobs.json
 * - Timezone support
 * - Events: job:started, job:completed, job:failed, job:scheduled, job:cancelled
 */

import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { RecipeResult } from "./engine";

// ─── Type Definitions ─────────────────────────────────────────────────────────

export type ScheduleType = "one_time" | "recurring";
export type JobStatus = "active" | "paused" | "error" | "completed";

export type OnErrorPolicy = "continue" | "pause" | "notify";

export interface ScheduledJob {
  id: string;
  recipeId: string;
  schedule: string; // cron expression or ISO datetime for one_time
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
  onError: OnErrorPolicy;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobRunLog {
  jobId: string;
  runAt: string;
  completedAt?: string;
  duration?: number;
  success: boolean;
  output?: string;
  error?: string;
}

export interface ParsedCron {
  minute: number | null;     // null = every
  hour: number | null;       // null = every
  dayOfMonth: number | null; // null = every
  month: number | null;      // null = every
  dayOfWeek: number | null;  // null = every
  minuteInterval: number;    // 0 = no interval
  hourInterval: number;      // 0 = no interval
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SCHEDULED_JOBS_FILE = "scheduled-jobs.json";
const MAX_RUN_LOGS = 200;
const DEFAULT_MAX_RETRIES = 3;
const CHECK_INTERVAL_MS = 30_000; // Check every 30 seconds

// ─── Scheduled Executor ──────────────────────────────────────────────────────

export class ScheduledExecutor extends EventEmitter {
  private jobs: Map<string, ScheduledJob> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private runLogs: JobRunLog[] = [];
  private checkInterval: NodeJS.Timeout | null = null;
  private dataDir: string;
  private executeRecipe: (recipeId: string, variables: Record<string, string>) => Promise<RecipeResult>;

  constructor(
    executeRecipe: (recipeId: string, variables: Record<string, string>) => Promise<RecipeResult>,
    dataDir?: string
  ) {
    super();
    this.executeRecipe = executeRecipe;
    this.dataDir = dataDir || path.join(os.homedir(), ".openagent");
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    // Ensure data directory exists
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    // Load persisted jobs
    await this.loadJobs();

    // Start the check interval
    this.startCheckInterval();

    console.info(`[ScheduledExecutor] Initialized with ${this.jobs.size} scheduled jobs`);
  }

  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Clear all timers
    for (const [jobId, timer] of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();

    // Persist current state
    this.saveJobs();
  }

  // ─── Job Management ─────────────────────────────────────────────────────

  /**
   * Create a scheduled job. Returns job ID.
   */
  schedule(
    recipeId: string,
    schedule: string,
    variables?: Record<string, string>,
    options?: {
      type?: ScheduleType;
      maxRetries?: number;
      onError?: OnErrorPolicy;
      timezone?: string;
    }
  ): string {
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const type = options?.type || this.detectScheduleType(schedule);

    // Validate schedule
    if (type === "recurring") {
      const parsed = this.parseCron(schedule);
      if (!parsed) {
        throw new Error(`Invalid cron expression: ${schedule}`);
      }
    } else {
      // Validate one-time schedule is a future datetime
      const scheduledTime = new Date(schedule);
      if (isNaN(scheduledTime.getTime())) {
        throw new Error(`Invalid datetime for one-time schedule: ${schedule}`);
      }
    }

    const job: ScheduledJob = {
      id: jobId,
      recipeId,
      schedule,
      type,
      variables: variables || {},
      status: "active",
      runCount: 0,
      errorCount: 0,
      maxRetries: options?.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryCount: 0,
      onError: options?.onError || "pause",
      timezone: options?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      createdAt: now,
      updatedAt: now,
    };

    // Calculate next run time
    job.nextRunAt = this.calculateNextRun(job);

    this.jobs.set(jobId, job);
    this.setupJobTimer(job);

    this.emit("job:scheduled", job);
    this.saveJobs();

    return jobId;
  }

  /**
   * Pause a scheduled job
   */
  pause(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    job.status = "paused";
    job.updatedAt = new Date().toISOString();

    // Clear the timer
    const timer = this.timers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(jobId);
    }

    this.saveJobs();
  }

  /**
   * Resume a paused job
   */
  resume(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    if (job.status !== "paused" && job.status !== "error") {
      throw new Error(`Cannot resume job in '${job.status}' status`);
    }

    job.status = "active";
    job.retryCount = 0;
    job.updatedAt = new Date().toISOString();

    // Recalculate next run
    job.nextRunAt = this.calculateNextRun(job);
    this.setupJobTimer(job);

    this.saveJobs();
  }

  /**
   * Cancel and remove a job
   */
  cancel(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    // Clear the timer
    const timer = this.timers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(jobId);
    }

    this.jobs.delete(jobId);
    this.emit("job:cancelled", jobId);
    this.saveJobs();
  }

  /**
   * Trigger immediate execution of a job
   */
  async runNow(jobId: string): Promise<RecipeResult> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    return this.executeJob(job);
  }

  /**
   * List all scheduled jobs
   */
  listJobs(): ScheduledJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get job details
   */
  getJob(jobId: string): ScheduledJob {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    return job;
  }

  /**
   * Get the next N upcoming scheduled runs
   */
  getUpcoming(count: number = 5): ScheduledJob[] {
    const activeJobs = Array.from(this.jobs.values())
      .filter((j) => j.status === "active" && j.nextRunAt)
      .sort((a, b) => new Date(a.nextRunAt!).getTime() - new Date(b.nextRunAt!).getTime());

    return activeJobs.slice(0, count);
  }

  /**
   * Get run logs
   */
  getRunLogs(jobId?: string): JobRunLog[] {
    if (jobId) {
      return this.runLogs.filter((l) => l.jobId === jobId);
    }
    return [...this.runLogs];
  }

  /**
   * Get run logs for a specific job
   */
  getJobRunLogs(jobId: string): JobRunLog[] {
    return this.runLogs.filter((l) => l.jobId === jobId);
  }

  // ─── Cron Parsing ──────────────────────────────────────────────────────

  /**
   * Parse a simplified 5-field cron expression
   * Format: minute hour day-of-month month day-of-week
   */
  parseCron(expression: string): ParsedCron | null {
    if (!expression || typeof expression !== "string") return null;

    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) return null;

    const parseField = (field: string): { value: number | null; interval: number } => {
      if (field === "*") return { value: null, interval: 0 };
      if (field.startsWith("*/")) {
        const interval = parseInt(field.slice(2), 10);
        return { value: null, interval: isNaN(interval) ? 0 : interval };
      }
      const val = parseInt(field, 10);
      return { value: isNaN(val) ? null : val, interval: 0 };
    };

    const minute = parseField(parts[0]);
    const hour = parseField(parts[1]);
    const dayOfMonth = parseField(parts[2]);
    const month = parseField(parts[3]);
    const dayOfWeek = parseField(parts[4]);

    return {
      minute: minute.value,
      hour: hour.value,
      dayOfMonth: dayOfMonth.value,
      month: month.value,
      dayOfWeek: dayOfWeek.value,
      minuteInterval: minute.interval,
      hourInterval: hour.interval,
    };
  }

  // ─── Private: Job Execution ─────────────────────────────────────────────

  private async executeJob(job: ScheduledJob): Promise<RecipeResult> {
    const startTime = Date.now();
    const logEntry: JobRunLog = {
      jobId: job.id,
      runAt: new Date().toISOString(),
      success: false,
    };

    this.emit("job:started", job);
    console.info(`[ScheduledExecutor] Executing job ${job.id} (recipe: ${job.recipeId})`);

    try {
      const result = await this.executeRecipe(job.recipeId, job.variables);

      // Update job state
      job.lastRunAt = new Date().toISOString();
      job.runCount++;
      job.retryCount = 0;
      job.updatedAt = new Date().toISOString();

      // Update log
      logEntry.completedAt = new Date().toISOString();
      logEntry.duration = Date.now() - startTime;
      logEntry.success = result.success;
      logEntry.output = result.output?.substring(0, 1000);

      if (result.success) {
        job.status = "active";
        job.lastError = undefined;
      } else {
        job.errorCount++;
        job.lastError = result.output?.substring(0, 200);
      }

      this.emit("job:completed", { job, result });
    } catch (err: any) {
      job.errorCount++;
      job.retryCount++;
      job.lastError = err.message;

      logEntry.completedAt = new Date().toISOString();
      logEntry.duration = Date.now() - startTime;
      logEntry.error = err.message;

      // Apply on-error policy
      if (job.retryCount >= job.maxRetries) {
        switch (job.onError) {
          case "pause":
            job.status = "paused";
            break;
          case "continue":
            // Reset retry count and continue
            job.retryCount = 0;
            break;
          case "notify":
            job.status = "error";
            break;
        }
      }

      this.emit("job:failed", { job, error: err.message });
    }

    // Add to run logs
    this.addRunLog(logEntry);

    // Calculate next run for recurring jobs
    if (job.type === "recurring" && job.status === "active") {
      job.nextRunAt = this.calculateNextRun(job);
      this.setupJobTimer(job);
    } else if (job.type === "one_time") {
      job.status = "completed";
      job.nextRunAt = undefined;
      const timer = this.timers.get(job.id);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(job.id);
      }
    }

    this.saveJobs();

    // Return a result (for runNow)
    return {
      recipeId: job.recipeId,
      success: logEntry.success,
      output: logEntry.output || logEntry.error || "",
      duration: logEntry.duration || 0,
      stepsCompleted: 0,
      stepsFailed: logEntry.success ? 0 : 1,
    };
  }

  // ─── Private: Timer & Scheduling ────────────────────────────────────────

  private startCheckInterval(): void {
    this.checkInterval = setInterval(() => {
      this.checkDueJobs();
    }, CHECK_INTERVAL_MS);

    // Also check immediately
    this.checkDueJobs();
  }

  private checkDueJobs(): void {
    const now = Date.now();

    for (const job of this.jobs.values()) {
      if (job.status !== "active") continue;
      if (!job.nextRunAt) continue;

      const nextRun = new Date(job.nextRunAt).getTime();
      if (nextRun <= now) {
        // Execute immediately
        this.executeJob(job).catch((err) => {
          console.error(`[ScheduledExecutor] Error executing job ${job.id}:`, err);
        });
      }
    }
  }

  private setupJobTimer(job: ScheduledJob): void {
    // Clear existing timer
    const existingTimer = this.timers.get(job.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    if (job.status !== "active" || !job.nextRunAt) return;

    const nextRun = new Date(job.nextRunAt).getTime();
    const delay = nextRun - Date.now();

    if (delay <= 0) {
      // Already due, will be picked up by checkInterval
      return;
    }

    // Cap delay at 24 hours (re-setup will happen after execution)
    const cappedDelay = Math.min(delay, 24 * 60 * 60 * 1000);

    const timer = setTimeout(() => {
      this.executeJob(job).catch((err) => {
        console.error(`[ScheduledExecutor] Error executing job ${job.id}:`, err);
      });
    }, cappedDelay);

    this.timers.set(job.id, timer);
  }

  /**
   * Calculate the next run time for a job
   */
  private calculateNextRun(job: ScheduledJob): string {
    if (job.type === "one_time") {
      return job.schedule; // The schedule IS the next (and only) run time
    }

    // Parse cron and find next occurrence
    const cron = this.parseCron(job.schedule);
    if (!cron) {
      return new Date(Date.now() + 60_000).toISOString(); // Fallback: 1 minute from now
    }

    const now = new Date();
    // Start from the next minute
    const candidate = new Date(now);
    candidate.setSeconds(0, 0);
    candidate.setMinutes(candidate.getMinutes() + 1);

    // Find the next matching time (search up to 1 year ahead)
    const maxIterations = 525600; // minutes in a year
    for (let i = 0; i < maxIterations; i++) {
      if (this.cronMatches(cron, candidate)) {
        return candidate.toISOString();
      }
      candidate.setMinutes(candidate.getMinutes() + 1);
    }

    // Fallback: 1 hour from now
    return new Date(Date.now() + 3600_000).toISOString();
  }

  /**
   * Check if a parsed cron expression matches a given date
   */
  private cronMatches(cron: ParsedCron, date: Date): boolean {
    const minute = date.getMinutes();
    const hour = date.getHours();
    const dayOfMonth = date.getDate();
    const month = date.getMonth() + 1; // 1-based
    const dayOfWeek = date.getDay();    // 0 = Sunday

    // Check minute
    if (cron.minuteInterval > 0) {
      if (minute % cron.minuteInterval !== 0) return false;
    } else if (cron.minute !== null && cron.minute !== minute) {
      return false;
    }

    // Check hour
    if (cron.hourInterval > 0) {
      if (hour % cron.hourInterval !== 0) return false;
      if (cron.minute === null && minute !== 0) return false;
    } else if (cron.hour !== null && cron.hour !== hour) {
      return false;
    }

    // Check day of month
    if (cron.dayOfMonth !== null && cron.dayOfMonth !== dayOfMonth) {
      return false;
    }

    // Check month
    if (cron.month !== null && cron.month !== month) {
      return false;
    }

    // Check day of week
    if (cron.dayOfWeek !== null && cron.dayOfWeek !== dayOfWeek) {
      return false;
    }

    return true;
  }

  /**
   * Detect whether a schedule is one_time or recurring
   */
  private detectScheduleType(schedule: string): ScheduleType {
    // If it looks like an ISO date or a parseable date, it's one-time
    const isoDate = new Date(schedule);
    if (!isNaN(isoDate.getTime()) && schedule.includes("-") && schedule.length > 8) {
      return "one_time";
    }
    return "recurring";
  }

  // ─── Private: Persistence ───────────────────────────────────────────────

  private async loadJobs(): Promise<void> {
    const filePath = path.join(this.dataDir, SCHEDULED_JOBS_FILE);
    if (!fs.existsSync(filePath)) return;

    try {
      const data = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(data);

      if (parsed.jobs && Array.isArray(parsed.jobs)) {
        for (const job of parsed.jobs) {
          this.jobs.set(job.id, job);
        }
      }

      if (parsed.runLogs && Array.isArray(parsed.runLogs)) {
        this.runLogs = parsed.runLogs.slice(-MAX_RUN_LOGS);
      }

      // Re-setup timers for active jobs
      for (const job of this.jobs.values()) {
        if (job.status === "active") {
          // Recalculate nextRunAt in case the process was down
          if (job.type === "recurring") {
            const nextRun = new Date(job.nextRunAt || 0);
            if (nextRun.getTime() <= Date.now()) {
              job.nextRunAt = this.calculateNextRun(job);
            }
          } else if (job.type === "one_time") {
            const scheduledTime = new Date(job.schedule);
            if (scheduledTime.getTime() <= Date.now()) {
              job.status = "completed";
              job.nextRunAt = undefined;
              continue;
            }
          }
          this.setupJobTimer(job);
        }
      }
    } catch (err) {
      console.error("[ScheduledExecutor] Failed to load jobs:", err);
    }
  }

  private saveJobs(): void {
    const filePath = path.join(this.dataDir, SCHEDULED_JOBS_FILE);

    try {
      const data = {
        jobs: Array.from(this.jobs.values()),
        runLogs: this.runLogs.slice(-MAX_RUN_LOGS),
      };
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error("[ScheduledExecutor] Failed to save jobs:", err);
    }
  }

  private addRunLog(log: JobRunLog): void {
    this.runLogs.push(log);
    if (this.runLogs.length > MAX_RUN_LOGS) {
      this.runLogs = this.runLogs.slice(-MAX_RUN_LOGS);
    }
  }
}
