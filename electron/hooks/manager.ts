/**
 * OpenAgent-Desktop - Hook Manager
 *
 * Implements lifecycle hooks for the OpenAgent-Desktop application.
 * Hooks are shell commands that run at specific points in the agent's
 * lifecycle, allowing users to customize behavior, add validations,
 * or integrate with external tools.
 *
 * Hook Types:
 * - PreToolUse: Runs before a tool is executed. Can deny the tool call.
 * - PostToolUse: Runs after a tool has been executed.
 * - UserPromptSubmit: Runs when a user submits a prompt. Can deny the submission.
 * - PreSession: Runs before a session starts.
 * - PostSession: Runs after a session ends.
 *
 * Features:
 * - Shell command execution with context as stdin
 * - PreToolUse hooks can deny tool calls (return deny=true)
 * - Conditional hook execution based on tool name, extension ID, or pattern
 * - Hook configuration persistence
 * - Async execution with timeout support
 */

import { EventEmitter } from "events";
import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { logger } from "../utils/logger";
import { createError, ErrorCode } from "../utils/structured-errors";

// ─── Type Definitions ─────────────────────────────────────────────────────────

export type HookType =
  | "PreToolUse"
  | "PostToolUse"
  | "UserPromptSubmit"
  | "PreSession"
  | "PostSession";

export interface HookConditions {
  toolName?: string;
  extensionId?: string;
  pattern?: string;
}

export interface Hook {
  id: string;
  name: string;
  type: HookType;
  command: string;
  enabled: boolean;
  conditions: HookConditions;
  timeout?: number; // milliseconds
  createdAt: string;
  updatedAt: string;
}

export interface HookResult {
  hookId: string;
  hookName: string;
  success: boolean;
  output?: string;
  error?: string;
  deny?: boolean;
  reason?: string;
  duration: number;
}

export interface HookContext {
  // Common fields
  sessionId?: string;
  timestamp?: string;

  // PreToolUse / PostToolUse fields
  toolName?: string;
  toolArguments?: Record<string, unknown>;
  toolResult?: unknown;
  extensionId?: string;

  // UserPromptSubmit fields
  message?: string;

  // PreSession / PostSession fields
  response?: string;
  providerId?: string;
  model?: string;

  // Additional context
  [key: string]: unknown;
}

export interface HookManagerOptions {
  configDir: string;
  traceCollector?: any;
  defaultTimeout?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HOOKS_CONFIG_FILE = "hooks.json";
const DEFAULT_HOOK_TIMEOUT = 30000; // 30 seconds
const MAX_HOOK_OUTPUT_LENGTH = 10000;

// ─── HookManager ──────────────────────────────────────────────────────────────

export class HookManager extends EventEmitter {
  private configDir: string;
  private traceCollector?: any;
  private defaultTimeout: number;

  private hooks: Map<string, Hook> = new Map();
  private configPath: string;
  private initialized = false;

  constructor(options: HookManagerOptions) {
    super();

    this.configDir = options.configDir;
    this.traceCollector = options.traceCollector;
    this.defaultTimeout = options.defaultTimeout || DEFAULT_HOOK_TIMEOUT;

    this.configPath = path.join(this.configDir, HOOKS_CONFIG_FILE);
  }

  // ─── Initialization ──────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure config directory exists
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
        logger.info('HookManager', `Created config directory: ${this.configDir}`);
      }
    } catch (err: any) {
      const structErr = createError(ErrorCode.DIR_CREATE_FAILED, `Failed to create config directory: ${this.configDir}`, {
        dir: this.configDir,
        systemError: err.code,
      });
      logger.error('HookManager', structErr.message, err);
      // Continue anyway — loadHooks will handle missing files gracefully
    }

    // Load persisted hooks
    this.loadHooks();

    this.initialized = true;
    logger.info('HookManager', `Initialized with ${this.hooks.size} hooks`);
  }

  // ─── CRUD Operations ─────────────────────────────────────────────────────

  /**
   * List all hooks
   */
  list(): Hook[] {
    return Array.from(this.hooks.values());
  }

  /**
   * Get a specific hook by ID
   */
  get(hookId: string): Hook | undefined {
    return this.hooks.get(hookId);
  }

  /**
   * List hooks by type
   */
  listByType(type: HookType): Hook[] {
    return Array.from(this.hooks.values()).filter((h) => h.type === type);
  }

  /**
   * Add a new hook
   */
  async add(config: Omit<Hook, "id" | "createdAt" | "updatedAt">): Promise<Hook> {
    this.ensureInitialized();

    const now = new Date().toISOString();

    const hook: Hook = {
      id: crypto.randomUUID(),
      name: config.name,
      type: config.type,
      command: config.command,
      enabled: config.enabled !== undefined ? config.enabled : true,
      conditions: config.conditions || {},
      timeout: config.timeout || this.defaultTimeout,
      createdAt: now,
      updatedAt: now,
    };

    // Validate the hook
    this.validateHook(hook);

    this.hooks.set(hook.id, hook);
    this.persistHooks();

    await this.traceCollector?.addEntry("system", {
      type: "info",
      content: `Hook added: ${hook.name} (${hook.type})`,
      metadata: { hookId: hook.id, hookType: hook.type, command: hook.command },
    });

    this.emit("hook:added", hook);

    return hook;
  }

  /**
   * Update an existing hook
   */
  async update(
    hookId: string,
    updates: Partial<Omit<Hook, "id" | "createdAt">>
  ): Promise<Hook> {
    this.ensureInitialized();

    const existing = this.hooks.get(hookId);
    if (!existing) {
      throw new Error(`Hook not found: ${hookId}`);
    }

    const updated: Hook = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    // Validate the updated hook
    this.validateHook(updated);

    this.hooks.set(hookId, updated);
    this.persistHooks();

    await this.traceCollector?.addEntry("system", {
      type: "info",
      content: `Hook updated: ${updated.name}`,
      metadata: { hookId, updates },
    });

    this.emit("hook:updated", updated);

    return updated;
  }

  /**
   * Remove a hook
   */
  async remove(hookId: string): Promise<void> {
    this.ensureInitialized();

    const hook = this.hooks.get(hookId);
    if (!hook) {
      throw new Error(`Hook not found: ${hookId}`);
    }

    this.hooks.delete(hookId);
    this.persistHooks();

    await this.traceCollector?.addEntry("system", {
      type: "info",
      content: `Hook removed: ${hook.name}`,
      metadata: { hookId },
    });

    this.emit("hook:removed", hookId);
  }

  /**
   * Enable a hook
   */
  async enable(hookId: string): Promise<void> {
    await this.update(hookId, { enabled: true });
  }

  /**
   * Disable a hook
   */
  async disable(hookId: string): Promise<void> {
    await this.update(hookId, { enabled: false });
  }

  // ─── Hook Execution ──────────────────────────────────────────────────────

  /**
   * Trigger all hooks of a given type with the provided context.
   * Returns an array of results from all executed hooks.
   */
  async trigger(type: HookType, context: HookContext): Promise<HookResult[]> {
    this.ensureInitialized();

    const hooks = this.listByType(type);
    const results: HookResult[] = [];

    // Add timestamp to context
    const enrichedContext: HookContext = {
      ...context,
      timestamp: new Date().toISOString(),
      hookType: type,
    };

    logger.debug('HookManager', `Triggering ${hooks.filter(h => h.enabled).length} enabled hooks of type ${type}`);

    for (const hook of hooks) {
      // Skip disabled hooks
      if (!hook.enabled) continue;

      // Check conditions
      if (!this.matchesConditions(hook, enrichedContext)) continue;

      // Execute the hook with timeout and error handling
      const result = await this.executeHook(hook, enrichedContext);
      results.push(result);

      // Log execution result
      if (result.success) {
        logger.info('HookManager', `Hook "${hook.name}" completed successfully in ${result.duration}ms`);
      } else if (result.deny) {
        logger.warn('HookManager', `Hook "${hook.name}" denied action: ${result.reason || 'No reason'}`);
      } else {
        logger.warn('HookManager', `Hook "${hook.name}" failed: ${result.error || 'Unknown error'}`);
      }

      // If a PreToolUse hook denies, stop processing further hooks
      if (result.deny) {
        await this.traceCollector?.addEntry(context.sessionId || "system", {
          type: "action",
          content: `Hook denied: ${hook.name} - ${result.reason || "No reason"}`,
          metadata: {
            hookId: hook.id,
            hookName: hook.name,
            hookType: type,
            deny: true,
            reason: result.reason,
          },
        });
        break;
      }
    }

    return results;
  }

  /**
   * Execute a single hook command with robust error handling and timeout.
   */
  private async executeHook(
    hook: Hook,
    context: HookContext
  ): Promise<HookResult> {
    const startTime = Date.now();
    const timeout = hook.timeout || this.defaultTimeout;

    const result: HookResult = {
      hookId: hook.id,
      hookName: hook.name,
      success: false,
      duration: 0,
    };

    try {
      // Prepare the context as JSON for stdin
      const contextJson = JSON.stringify(context, null, 2);

      // Execute the shell command with timeout
      const execResult = await this.execCommandWithTimeout(hook.command, contextJson, timeout);

      result.success = execResult.exitCode === 0;
      result.output = this.truncateOutput(execResult.stdout);
      result.duration = Date.now() - startTime;

      if (execResult.exitCode !== 0) {
        result.error = this.truncateOutput(execResult.stderr || `Exit code: ${execResult.exitCode}`);
      }

      // Check if execution was timed out
      if (execResult.timedOut) {
        result.success = false;
        result.error = `Hook timed out after ${timeout}ms`;
        result.duration = Date.now() - startTime;
        logger.warn('HookManager', `Hook "${hook.name}" timed out after ${timeout}ms`, {
          hookId: hook.id,
          command: hook.command,
          timeout,
        });

        // Create structured error for timeout
        const structErr = createError(ErrorCode.PROVIDER_TIMEOUT, `Hook "${hook.name}" timed out`, {
          hookId: hook.id,
          timeout,
        });
        logger.warn('HookManager', structErr.message);
      }

      // Parse the output for deny signals
      if (hook.type === "PreToolUse" || hook.type === "UserPromptSubmit") {
        const denyInfo = this.parseDenySignal(execResult.stdout);
        if (denyInfo) {
          result.deny = true;
          result.reason = denyInfo.reason;
        } else if (execResult.exitCode !== 0) {
          // Non-zero exit code also means deny for pre-hooks
          result.deny = true;
          result.reason = result.error || "Hook returned non-zero exit code";
        }
      }

      await this.traceCollector?.addEntry(context.sessionId || "system", {
        type: "action",
        content: `Hook executed: ${hook.name} (${result.success ? "success" : "failed"})`,
        metadata: {
          hookId: hook.id,
          hookName: hook.name,
          command: hook.command,
          exitCode: execResult.exitCode,
          duration: result.duration,
          deny: result.deny,
          timedOut: execResult.timedOut,
        },
      });
    } catch (err: any) {
      result.success = false;
      result.error = err.message;
      result.duration = Date.now() - startTime;

      // Log structured error for the execution failure
      const structErr = createError(ErrorCode.EXTENSION_LOAD_ERROR, `Hook "${hook.name}" execution failed: ${err.message}`, {
        hookId: hook.id,
        command: hook.command,
        errorMessage: err.message,
      });
      logger.error('HookManager', structErr.message, err);

      // Timeout or execution error on pre-hooks — don't deny, just log
      if (hook.type === "PreToolUse" || hook.type === "UserPromptSubmit") {
        result.deny = false;
      }

      await this.traceCollector?.addEntry(context.sessionId || "system", {
        type: "error",
        content: `Hook execution error: ${hook.name} - ${err.message}`,
        metadata: {
          hookId: hook.id,
          hookName: hook.name,
          command: hook.command,
          error: err.message,
        },
      });
    }

    return result;
  }

  /**
   * Execute a shell command with stdin and explicit timeout handling.
   * Returns a result object that includes a timedOut flag for better
   * error reporting on Windows 7 where child_process timeout may be
   * unreliable.
   */
  private execCommandWithTimeout(
    command: string,
    stdin: string,
    timeout: number
  ): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }> {
    return new Promise((resolve) => {
      let timedOut = false;
      let settled = false;

      const proc = child_process.exec(command, {
        encoding: "utf-8",
        timeout,
        maxBuffer: 1024 * 1024, // 1MB
        env: { ...process.env },
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
      }, (error: child_process.ExecException | null, stdout: string, stderr: string) => {
        if (settled) return; // Prevent double resolve
        settled = true;

        if (error) {
          resolve({
            exitCode: error.killed ? -1 : (typeof error.code === 'number' ? error.code : 1),
            stdout: stdout || "",
            stderr: stderr || error.message,
            timedOut,
          });
        } else {
          resolve({
            exitCode: 0,
            stdout: stdout || "",
            stderr: stderr || "",
            timedOut: false,
          });
        }
      });

      // Write context to stdin
      try {
        if (proc.stdin) {
          proc.stdin.write(stdin);
          proc.stdin.end();
        }
      } catch (err: any) {
        logger.warn('HookManager', `Failed to write to stdin for command: ${command}`, err);
      }

      // Explicit timeout as a safety net (important for Windows 7)
      setTimeout(() => {
        if (!settled) {
          timedOut = true;
          settled = true;
          try {
            proc.kill();
          } catch {
            // Process may have already exited
          }
          resolve({
            exitCode: -1,
            stdout: "",
            stderr: `Hook timed out after ${timeout}ms`,
            timedOut: true,
          });
        }
      }, timeout + 1000); // 1 second grace period beyond child_process timeout
    });
  }

  /**
   * @deprecated Use execCommandWithTimeout instead.
   * Kept for backward compatibility.
   */
  private execCommand(
    command: string,
    stdin: string,
    timeout: number
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return this.execCommandWithTimeout(command, stdin, timeout).then(
      ({ exitCode, stdout, stderr }) => ({ exitCode, stdout, stderr })
    );
  }

  // ─── Condition Matching ──────────────────────────────────────────────────

  /**
   * Check if a hook's conditions match the given context
   */
  private matchesConditions(hook: Hook, context: HookContext): boolean {
    const conditions = hook.conditions;

    // No conditions means always match
    if (!conditions || Object.keys(conditions).length === 0) {
      return true;
    }

    // Check toolName condition
    if (conditions.toolName) {
      if (context.toolName !== conditions.toolName) {
        return false;
      }
    }

    // Check extensionId condition
    if (conditions.extensionId) {
      if (context.extensionId !== conditions.extensionId) {
        return false;
      }
    }

    // Check pattern condition (regex match against context)
    if (conditions.pattern) {
      try {
        const regex = new RegExp(conditions.pattern, "i");
        const contextStr = JSON.stringify(context);
        if (!regex.test(contextStr)) {
          return false;
        }
      } catch {
        // Invalid regex, skip pattern matching
        logger.warn('HookManager', `Invalid regex pattern: ${conditions.pattern}`);
      }
    }

    return true;
  }

  // ─── Deny Signal Parsing ─────────────────────────────────────────────────

  /**
   * Parse the hook output for deny signals.
   *
   * A hook can deny an action by outputting JSON with deny=true:
   *   {"deny": true, "reason": "Explanation"}
   *
   * Or by outputting a plain text line starting with DENY:
   *   DENY: Explanation
   */
  private parseDenySignal(
    output: string
  ): { deny: boolean; reason?: string } | null {
    if (!output || output.trim().length === 0) {
      return null;
    }

    // Try JSON format
    try {
      const parsed = JSON.parse(output.trim());
      if (parsed.deny === true) {
        return {
          deny: true,
          reason: parsed.reason || parsed.message || "Denied by hook",
        };
      }
      return null;
    } catch {
      // Not JSON, try plain text format
    }

    // Try DENY: format
    const lines = output.trim().split("\n");
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith("DENY:")) {
        return {
          deny: true,
          reason: trimmedLine.substring(5).trim() || "Denied by hook",
        };
      }
      if (trimmedLine.toUpperCase() === "DENY") {
        return {
          deny: true,
          reason: "Denied by hook",
        };
      }
    }

    return null;
  }

  // ─── Validation ──────────────────────────────────────────────────────────

  private validateHook(hook: Hook): void {
    if (!hook.name || hook.name.trim().length === 0) {
      throw new Error("Hook name is required");
    }

    if (!hook.command || hook.command.trim().length === 0) {
      throw new Error("Hook command is required");
    }

    const validTypes: HookType[] = [
      "PreToolUse",
      "PostToolUse",
      "UserPromptSubmit",
      "PreSession",
      "PostSession",
    ];
    if (!validTypes.includes(hook.type)) {
      throw new Error(`Invalid hook type: ${hook.type}. Must be one of: ${validTypes.join(", ")}`);
    }

    // Validate conditions
    if (hook.conditions) {
      if (hook.conditions.pattern) {
        try {
          new RegExp(hook.conditions.pattern);
        } catch {
          const structErr = createError(ErrorCode.CONFIG_VALIDATION_FAILED, `Invalid regex pattern in conditions: ${hook.conditions.pattern}`, {
            pattern: hook.conditions.pattern,
            hookId: hook.id,
          });
          throw new Error(structErr.message);
        }
      }
    }

    // Security: warn about dangerous commands
    const dangerousPatterns = [
      /rm\s+-rf\s+\//,
      /:\(\)\{.*;\}\s*:/, // fork bomb
      /dd\s+if=/,
      /mkfs\./,
      />\s*\/dev\/sd/,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(hook.command)) {
        logger.warn('HookManager', `Hook "${hook.name}" contains potentially dangerous command: ${hook.command}`);
      }
    }
  }

  // ─── Persistence ─────────────────────────────────────────────────────────

  private loadHooks(): void {
    if (!fs.existsSync(this.configPath)) return;

    try {
      const content = fs.readFileSync(this.configPath, "utf-8");
      const data = JSON.parse(content);
      const hooksArray: Hook[] = data.hooks || [];

      for (const hook of hooksArray) {
        try {
          this.validateHook(hook);
          this.hooks.set(hook.id, hook);
        } catch (validationErr: any) {
          logger.warn('HookManager', `Skipping invalid hook "${hook.name || hook.id}": ${validationErr.message}`);
        }
      }

      logger.info('HookManager', `Loaded ${hooksArray.length} hooks (${this.hooks.size} valid)`);
    } catch (err: any) {
      const structErr = createError(ErrorCode.PERSIST_CORRUPT_DATA, `Error loading hooks from ${this.configPath}`, {
        path: this.configPath,
        errorMessage: err.message,
      });
      logger.error('HookManager', structErr.message, err);
      // Start with empty hooks
      this.hooks.clear();
    }
  }

  private persistHooks(): void {
    const data = {
      version: "1.0.0",
      hooks: Array.from(this.hooks.values()),
      updatedAt: new Date().toISOString(),
    };

    // Ensure directory exists
    const dir = path.dirname(this.configPath);
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (err: any) {
      logger.error('HookManager', `Failed to create directory for hooks config: ${dir}`, err);
      return;
    }

    // Write atomically
    const tmpPath = this.configPath + ".tmp";
    try {
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
      fs.renameSync(tmpPath, this.configPath);
      logger.debug('HookManager', `Persisted ${this.hooks.size} hooks to ${this.configPath}`);
    } catch (err: any) {
      const structErr = createError(ErrorCode.PERSIST_WRITE_FAILED, `Failed to persist hooks to ${this.configPath}`, {
        path: this.configPath,
        errorMessage: err.message,
      });
      logger.error('HookManager', structErr.message, err);
      // Clean up temp file
      try {
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  // ─── Utility ─────────────────────────────────────────────────────────────

  private truncateOutput(output: string): string {
    if (!output) return "";
    if (output.length <= MAX_HOOK_OUTPUT_LENGTH) return output;
    return output.substring(0, MAX_HOOK_OUTPUT_LENGTH) + "... [truncated]";
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("HookManager is not initialized. Call initialize() first.");
    }
  }

  /**
   * Get statistics about hooks
   */
  getStats(): {
    totalHooks: number;
    enabledHooks: number;
    disabledHooks: number;
    hooksByType: Record<HookType, number>;
  } {
    const hooks = Array.from(this.hooks.values());
    const hooksByType: Record<HookType, number> = {
      PreToolUse: 0,
      PostToolUse: 0,
      UserPromptSubmit: 0,
      PreSession: 0,
      PostSession: 0,
    };

    for (const hook of hooks) {
      hooksByType[hook.type] = (hooksByType[hook.type] || 0) + 1;
    }

    return {
      totalHooks: hooks.length,
      enabledHooks: hooks.filter((h) => h.enabled).length,
      disabledHooks: hooks.filter((h) => !h.enabled).length,
      hooksByType,
    };
  }

  /**
   * Import hooks from a JSON string
   */
  async importHooks(jsonString: string): Promise<Hook[]> {
    let data: { hooks?: Partial<Hook>[] };

    try {
      data = JSON.parse(jsonString);
    } catch {
      throw new Error("Invalid JSON format for hook import");
    }

    if (!data.hooks || !Array.isArray(data.hooks)) {
      throw new Error("Hook import requires a 'hooks' array");
    }

    const imported: Hook[] = [];

    for (const hookData of data.hooks) {
      const hook = await this.add({
        name: hookData.name || "Imported Hook",
        type: hookData.type || "PreToolUse",
        command: hookData.command || "",
        enabled: hookData.enabled !== undefined ? hookData.enabled : true,
        conditions: hookData.conditions || {},
        timeout: hookData.timeout,
      });
      imported.push(hook);
    }

    return imported;
  }

  /**
   * Export all hooks as a JSON string
   */
  exportHooks(): string {
    return JSON.stringify(
      {
        version: "1.0.0",
        hooks: Array.from(this.hooks.values()),
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
  }
}
