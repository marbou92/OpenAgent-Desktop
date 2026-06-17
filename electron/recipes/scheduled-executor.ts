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
    for (const [_jobId, timer] of this.timers) {
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
  getUpcoming(count = 5): ScheduledJob[] {
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
   *
   * BUGFIX: previously this only supported STAR, STAR-slash-N, and bare
   * integers - so "0 9 * * MON" parsed MON as NaN -> null -> "every",
   * meaning the job fired every minute of every hour of every day. We now
   * also support:
   *   - comma-separated lists (1,30)
   *   - ranges (1-5)
   *   - day/month names (MON, JAN)
   *   - ranges with step (1-10/2)
   * Anything we still can't parse returns null (caller falls back to "every").
   */
  parseCron(expression: string): ParsedCron | null {
    if (!expression || typeof expression !== "string") return null;

    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) return null;

    // Expand a single field into a list of matching integers.
    // Returns null if the field is invalid.
    const expandField = (field: string, min: number, max: number, names?: Record<string, number>): number[] | null => {
      if (field === "*") {
        // All values in range.
        const out: number[] = [];
        for (let i = min; i <= max; i++) out.push(i);
        return out;
      }
      // Handle */N
      const everyN = field.match(/^\*\/(\d+)$/);
      if (everyN) {
        const step = parseInt(everyN[1], 10);
        if (isNaN(step) || step <= 0) return null;
        const out: number[] = [];
        for (let i = min; i <= max; i += step) out.push(i);
        return out;
      }
      // Handle comma-separated list of values/ranges
      const out: number[] = [];
      for (const piece of field.split(",")) {
        // Range with optional step: `1-5` or `1-10/2`
        const rangeStep = piece.match(/^(\d+)-(\d+)\/(\d+)$/);
        if (rangeStep) {
          const lo = parseInt(rangeStep[1], 10);
          const hi = parseInt(rangeStep[2], 10);
          const step = parseInt(rangeStep[3], 10);
          if (isNaN(lo) || isNaN(hi) || isNaN(step) || step <= 0 || lo < min || hi > max || lo > hi) return null;
          for (let i = lo; i <= hi; i += step) out.push(i);
          continue;
        }
        // Plain range: `1-5`
        const range = piece.match(/^(\d+)-(\d+)$/);
        if (range) {
          const lo = parseInt(range[1], 10);
          const hi = parseInt(range[2], 10);
          if (isNaN(lo) || isNaN(hi) || lo < min || hi > max || lo > hi) return null;
          for (let i = lo; i <= hi; i++) out.push(i);
          continue;
        }
        // Named value (e.g. MON, JAN)
        if (names) {
          const upper = piece.toUpperCase();
          if (upper in names) {
            out.push(names[upper]);
            continue;
          }
        }
        // Plain integer
        const val = parseInt(piece, 10);
        if (isNaN(val) || val < min || val > max) return null;
        out.push(val);
      }
      return out.length > 0 ? out : null;
    };

    const DOW_NAMES: Record<string, number> = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
    const MONTH_NAMES: Record<string, number> = {
      JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
      JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
    };

    const minutes = expandField(parts[0], 0, 59);
    const hours = expandField(parts[1], 0, 23);
    const doms = expandField(parts[2], 1, 31);
    const months = expandField(parts[3], 1, 12, MONTH_NAMES);
    const dows = expandField(parts[4], 0, 6, DOW_NAMES);
    if (!minutes || !hours || !doms || !months || !dows) return null;

    return {
      minute: minutes[0], // first value (used for the old API)
      hour: hours[0],
      dayOfMonth: doms[0],
      month: months[0],
      dayOfWeek: dows[0],
      minuteInterval: 0,
      hourInterval: 0,
      // Stash the full lists for cronMatches to use.
      _minutes: minutes,
      _hours: hours,
      _doms: doms,
      _months: months,
      _dows: dows,
    } as ParsedCron & { _minutes: number[]; _hours: number[]; _doms: number[]; _months: number[]; _dows: number[] };
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
    const initialDelay = nextRun - Date.now();

    if (initialDelay <= 0) {
      // Already due, will be picked up by checkInterval
      return;
    }

    // BUGFIX: previously the delay was capped at 24h, so a job scheduled
    // >24h out would fire at 24h — running the recipe a day early. We now
    // schedule a recursive re-arm at 24h intervals (only re-arming, never
    // executing) until the real nextRunAt is within reach.
    const MAX_TIMER_MS = 24 * 60 * 60 * 1000;
    const arm = (): void => {
      const remaining = new Date(job.nextRunAt!).getTime() - Date.now();
      if (remaining <= 0) {
        // Due now — execute.
        this.executeJob(job).catch((err) => {
          console.error(`[ScheduledExecutor] Error executing job ${job.id}:`, err);
        });
        return;
      }
      const wait = Math.min(remaining, MAX_TIMER_MS);
      const timer = setTimeout(() => {
        // Re-evaluate remaining at fire time. If still > MAX_TIMER_MS,
        // re-arm without executing.
        const stillRemaining = new Date(job.nextRunAt!).getTime() - Date.now();
        if (stillRemaining > MAX_TIMER_MS) {
          arm();
          return;
        }
        if (stillRemaining <= 0) {
          // Already past due — execute.
          this.executeJob(job).catch((err) => {
            console.error(`[ScheduledExecutor] Error executing job ${job.id}:`, err);
          });
          return;
        }
        // Final short stretch — wait it out, then execute.
        const finalTimer = setTimeout(() => {
          this.executeJob(job).catch((err) => {
            console.error(`[ScheduledExecutor] Error executing job ${job.id}:`, err);
          });
        }, stillRemaining);
        this.timers.set(job.id, finalTimer);
      }, wait);
      this.timers.set(job.id, timer);
    };
    arm();
  }

  /**
   * Calculate the next run time for a job.
   * BUGFIX: previously the cron matcher used local time exclusively, ignoring
   * `job.timezone`. We now compute matches in the configured timezone by
   * formatting the candidate date via `Intl.DateTimeFormat` with `timeZone`
   * and extracting the parts. Falls back to local time if the timezone is
   * invalid or unsupported.
   */
  private calculateNextRun(job: ScheduledJob): string {
    if (job.type === "one_time") {
      return job.schedule;
    }

    const cron = this.parseCron(job.schedule);
    if (!cron) {
      return new Date(Date.now() + 60_000).toISOString();
    }

    // Resolve the timezone once. If invalid, fall back to local.
    let tz: string | undefined;
    try {
      if (job.timezone) {
        // Probe by formatting a known date; throws if tz is invalid.
        new Intl.DateTimeFormat('en-US', { timeZone: job.timezone }).format(new Date());
        tz = job.timezone;
      }
    } catch {
      console.warn(`[ScheduledExecutor] Invalid timezone '${job.timezone}', falling back to local time`);
      tz = undefined;
    }

    const partsInTz = (d: Date): { minute: number; hour: number; dom: number; month: number; dow: number } => {
      if (!tz) {
        return {
          minute: d.getMinutes(),
          hour: d.getHours(),
          dom: d.getDate(),
          month: d.getMonth() + 1,
          dow: d.getDay(),
        };
      }
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        minute: '2-digit', hour: '2-digit',
        day: '2-digit', month: '2-digit',
        weekday: 'short', hour12: false,
      });
      const parts = fmt.formatToParts(d);
      const get = (t: string): string => {
        const p = parts.find(p => p.type === t);
        return p ? p.value : '';
      };
      const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      return {
        minute: parseInt(get('minute'), 10) % 60,
        hour: parseInt(get('hour'), 10) % 24,
        dom: parseInt(get('day'), 10),
        month: parseInt(get('month'), 10),
        dow: weekdayMap[get('weekday')] ?? 0,
      };
    };

    const now = new Date();
    const candidate = new Date(now);
    candidate.setSeconds(0, 0);
    candidate.setMinutes(candidate.getMinutes() + 1);

    const maxIterations = 525600; // minutes in a year
    for (let i = 0; i < maxIterations; i++) {
      if (this.cronMatchesTz(cron, partsInTz(candidate))) {
        return candidate.toISOString();
      }
      candidate.setMinutes(candidate.getMinutes() + 1);
    }

    return new Date(Date.now() + 3600_000).toISOString();
  }

  /**
   * Check if a parsed cron expression matches the date parts.
   * BUGFIX: previously this used the old single-value ParsedCron fields, which
   * meant `0 9 * * MON` only ever matched `dow === 1` (the first list entry);
   * any other valid dow value was rejected. We now check membership in the
   * expanded lists stored on the parsed cron.
   */
  private cronMatchesTz(
    cron: ParsedCron & { _minutes?: number[]; _hours?: number[]; _doms?: number[]; _months?: number[]; _dows?: number[] },
    parts: { minute: number; hour: number; dom: number; month: number; dow: number }
  ): boolean {
    const mins = cron._minutes ?? (cron.minute !== null ? [cron.minute] : []);
    const hrs = cron._hours ?? (cron.hour !== null ? [cron.hour] : []);
    const doms = cron._doms ?? (cron.dayOfMonth !== null ? [cron.dayOfMonth] : []);
    const months = cron._months ?? (cron.month !== null ? [cron.month] : []);
    const dows = cron._dows ?? (cron.dayOfWeek !== null ? [cron.dayOfWeek] : []);

    if (mins.length && !mins.includes(parts.minute)) return false;
    if (hrs.length && !hrs.includes(parts.hour)) return false;
    if (doms.length && !doms.includes(parts.dom)) return false;
    if (months.length && !months.includes(parts.month)) return false;
    if (dows.length && !dows.includes(parts.dow)) return false;
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
    const tmpPath = filePath + '.tmp';

    try {
      const data = {
        jobs: Array.from(this.jobs.values()),
        runLogs: this.runLogs.slice(-MAX_RUN_LOGS),
      };
      // BUGFIX: previously this used direct fs.writeFileSync, so a crash
      // mid-write would truncate the file and lose all jobs on next startup.
      // Now we write to a .tmp file and rename atomically.
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, filePath);
    } catch (err) {
      console.error('[ScheduledExecutor] Failed to save jobs:', err);
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    }
  }

  private addRunLog(log: JobRunLog): void {
    this.runLogs.push(log);
    if (this.runLogs.length > MAX_RUN_LOGS) {
      this.runLogs = this.runLogs.slice(-MAX_RUN_LOGS);
    }
  }
}
