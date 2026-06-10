/**
 * OpenAgent Desktop - Hook Manager
 *
 * Implements lifecycle hooks for the OpenAgent Desktop application.
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
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    // Load persisted hooks
    this.loadHooks();

    this.initialized = true;
    console.log(`[HookManager] Initialized with ${this.hooks.size} hooks`);
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

    for (const hook of hooks) {
      // Skip disabled hooks
      if (!hook.enabled) continue;

      // Check conditions
      if (!this.matchesConditions(hook, enrichedContext)) continue;

      // Execute the hook
      const result = await this.executeHook(hook, enrichedContext);
      results.push(result);

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
   * Execute a single hook command
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

      // Execute the shell command with context as stdin
      const execResult = await this.execCommand(hook.command, contextJson, timeout);

      result.success = execResult.exitCode === 0;
      result.output = this.truncateOutput(execResult.stdout);
      result.duration = Date.now() - startTime;

      if (execResult.exitCode !== 0) {
        result.error = this.truncateOutput(execResult.stderr || `Exit code: ${execResult.exitCode}`);
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
        },
      });
    } catch (err: any) {
      result.success = false;
      result.error = err.message;
      result.duration = Date.now() - startTime;

      // Timeout or execution error on pre-hooks means deny
      if (hook.type === "PreToolUse" || hook.type === "UserPromptSubmit") {
        result.deny = false; // Don't deny on execution errors, just log them
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
   * Execute a shell command with stdin
   */
  private execCommand(
    command: string,
    stdin: string,
    timeout: number
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const proc = child_process.exec(command, {
        encoding: "utf-8",
        timeout,
        maxBuffer: 1024 * 1024, // 1MB
        env: { ...process.env },
        shell: true,
      }, (error, stdout, stderr) => {
        if (error) {
          resolve({
            exitCode: error.killed ? -1 : (error.code as number) || 1,
            stdout: stdout || "",
            stderr: stderr || error.message,
          });
        } else {
          resolve({
            exitCode: 0,
            stdout: stdout || "",
            stderr: stderr || "",
          });
        }
      });

      // Write context to stdin
      if (proc.stdin) {
        proc.stdin.write(stdin);
        proc.stdin.end();
      }
    });
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
        console.warn(`[HookManager] Invalid regex pattern: ${conditions.pattern}`);
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
          throw new Error(`Invalid regex pattern in conditions: ${hook.conditions.pattern}`);
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
        console.warn(
          `[HookManager] WARNING: Hook "${hook.name}" contains potentially dangerous command: ${hook.command}`
        );
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
        this.hooks.set(hook.id, hook);
      }

      console.log(`[HookManager] Loaded ${hooksArray.length} hooks`);
    } catch (err) {
      console.error("[HookManager] Error loading hooks:", err);
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
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write atomically
    const tmpPath = this.configPath + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmpPath, this.configPath);
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
