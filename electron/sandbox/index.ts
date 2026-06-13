/**
 * OpenAgent-Desktop - Sandbox System
 * Barrel export for all sandbox modules, plus facade SandboxManager
 */

import { EventEmitter } from "events";
import * as fs from "fs";

// ─── Re-export types from sandbox-strategies ──────────────────────────────────

export type {
  SandboxConfig,
  ExecuteOptions,
  ExecuteResult,
  FileInfo,
  SandboxStatus,
  ResourceUsage,
  SandboxType,
  SandboxInterface,
} from './sandbox-strategies';

export interface SandboxManagerOptions {
  sandboxDir: string;
  traceCollector?: any;
  hookManager?: any;
}

// ─── Sub-Modules ───────────────────────────────────────────────────────────────

import {
  SandboxInterface,
  SandboxType,
  SandboxStatus,
  ExecuteOptions,
  ExecuteResult,
  FileInfo,
  SandboxConfig,
} from './sandbox-strategies';
import { SandboxStrategies } from './sandbox-strategies';
import { SandboxResources } from './sandbox-resources';
import { SandboxIO } from './sandbox-io';

export { SandboxStrategies } from './sandbox-strategies';
export { SandboxResources } from './sandbox-resources';
export { SandboxIO } from './sandbox-io';

// ─── SandboxManager Facade ─────────────────────────────────────────────────────

export class SandboxManager extends EventEmitter {
  private sandbox?: SandboxInterface;
  private sandboxType: SandboxType = "unknown";
  private sandboxDir: string;
  private traceCollector?: any;
  private hookManager?: any;
  private restartAttempts = 0;
  private maxRestartAttempts = 3;
  private lastConfig?: SandboxConfig;

  // Sub-modules
  private strategies: SandboxStrategies;
  private io: SandboxIO;

  constructor(options: SandboxManagerOptions) {
    super();
    this.sandboxDir = options.sandboxDir;
    this.traceCollector = options.traceCollector;
    this.hookManager = options.hookManager;

    // Ensure sandbox directory exists
    if (!fs.existsSync(this.sandboxDir)) {
      fs.mkdirSync(this.sandboxDir, { recursive: true });
    }

    // Initialize sub-modules
    this.strategies = new SandboxStrategies(this.sandboxDir);
    this.io = new SandboxIO(() => this.sandbox);
  }

  /**
   * Detect the appropriate sandbox type for the current OS
   */
  detectSandboxType(): SandboxType {
    return this.strategies.detectSandboxType();
  }

  /**
   * Create a sandbox instance based on the detected type
   */
  private createSandbox(type: SandboxType): SandboxInterface {
    return this.strategies.createSandbox(type);
  }

  /**
   * Start the sandbox
   */
  async start(config?: SandboxConfig): Promise<void> {
    const sandboxConfig: SandboxConfig = SandboxResources.mergeWithDefaults(
      config,
      this.sandboxType || this.strategies.detectSandboxType()
    );

    this.lastConfig = sandboxConfig;

    // Detect and create the appropriate sandbox
    if (!this.sandbox) {
      this.sandboxType = this.strategies.detectSandboxType();
      this.sandbox = this.createSandbox(this.sandboxType);
    }

    // If already running, stop first
    const currentStatus = this.sandbox.getStatus();
    if (currentStatus.running) {
      await this.stop();
    }

    try {
      await this.sandbox.start(sandboxConfig);
      this.restartAttempts = 0;

      this.emit("status-changed", this.getStatus());

      await this.traceCollector?.addEntry("system", {
        type: "info",
        content: `Sandbox started (type: ${this.sandboxType})`,
        metadata: { config: sandboxConfig },
      });
    } catch (err: any) {
      this.emit("error", err);

      await this.traceCollector?.addEntry("system", {
        type: "error",
        content: `Sandbox start failed: ${err.message}`,
        metadata: { sandboxType: this.sandboxType },
      });

      throw err;
    }
  }

  /**
   * Stop the sandbox
   */
  async stop(): Promise<void> {
    if (!this.sandbox) return;

    try {
      await this.sandbox.stop();

      this.emit("status-changed", this.getStatus());

      await this.traceCollector?.addEntry("system", {
        type: "info",
        content: "Sandbox stopped",
        metadata: {},
      });
    } catch (err: any) {
      this.emit("error", err);
      throw err;
    }
  }

  /**
   * Execute a command in the sandbox
   */
  async execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult> {
    if (!this.sandbox) {
      throw new Error("Sandbox not initialized");
    }

    const status = this.sandbox.getStatus();
    if (!status.running) {
      throw new Error("Sandbox is not running");
    }

    // Run PreToolUse hooks
    if (this.hookManager) {
      try {
        const hookResults = await this.hookManager.trigger("PreToolUse", {
          toolName: "sandbox_execute",
          command,
          options,
        });

        const denied = hookResults.find((r: any) => r.deny === true);
        if (denied) {
          throw new Error(
            `Command denied by hook: ${denied.reason || "No reason provided"}`
          );
        }
      } catch (err: any) {
        if (err.message.includes("denied by hook")) {
          throw err;
        }
        console.warn("[SandboxManager] Hook execution error:", err);
      }
    }

    // Trace the command
    await this.traceCollector?.addEntry("system", {
      type: "action",
      content: `Executing: ${command.substring(0, 200)}`,
      metadata: { command, options, sandboxType: this.sandboxType },
    });

    const _startTime = Date.now();

    try {
      const result = await this.sandbox.execute(command, options);

      // Trace the result
      await this.traceCollector?.addEntry("system", {
        type: result.exitCode === 0 ? "tool_result" : "error",
        content: `Command exited with code ${result.exitCode} in ${result.duration}ms`,
        metadata: {
          exitCode: result.exitCode,
          duration: result.duration,
          timedOut: result.timedOut,
          stdoutLength: result.stdout.length,
          stderrLength: result.stderr.length,
        },
      });

      // Run PostToolUse hooks
      if (this.hookManager) {
        try {
          await this.hookManager.trigger("PostToolUse", {
            toolName: "sandbox_execute",
            command,
            result,
          });
        } catch {
          // Non-fatal
        }
      }

      return result;
    } catch (err: any) {
      await this.traceCollector?.addEntry("system", {
        type: "error",
        content: `Sandbox execute error: ${err.message}`,
        metadata: { command },
      });
      throw err;
    }
  }

  /**
   * Get a file from the sandbox (delegated to SandboxIO)
   */
  async getFile(filePath: string): Promise<Buffer> {
    return this.io.getFile(filePath);
  }

  /**
   * Put a file into the sandbox (delegated to SandboxIO)
   */
  async putFile(filePath: string, content: Buffer): Promise<void> {
    return this.io.putFile(filePath, content);
  }

  /**
   * List files in a directory within the sandbox (delegated to SandboxIO)
   */
  async listFiles(dir: string): Promise<FileInfo[]> {
    return this.io.listFiles(dir);
  }

  /**
   * Get the current sandbox status
   */
  getStatus(): SandboxStatus {
    if (!this.sandbox) {
      return {
        running: false,
        type: this.sandboxType || "unknown",
        health: "stopped",
        resourceUsage: SandboxResources.emptyResourceUsage(),
        config: this.lastConfig || {},
      };
    }

    return this.sandbox.getStatus();
  }

  /**
   * Get the type of sandbox being used
   */
  getSandboxType(): SandboxType {
    return this.sandboxType;
  }

  /**
   * Restart the sandbox (useful after crash or config change)
   */
  async restart(): Promise<void> {
    await this.stop();
    if (this.lastConfig) {
      await this.start(this.lastConfig);
    }
  }

  /**
   * Attempt to auto-restart the sandbox after a crash
   */
  async attemptAutoRestart(): Promise<boolean> {
    if (this.restartAttempts >= this.maxRestartAttempts) {
      this.emit("error", new Error(
        `Sandbox auto-restart failed after ${this.maxRestartAttempts} attempts`
      ));
      return false;
    }

    this.restartAttempts++;
    console.info(
      `[SandboxManager] Auto-restart attempt ${this.restartAttempts}/${this.maxRestartAttempts}`
    );

    try {
      // Recreate the sandbox instance (in case of corruption)
      this.sandboxType = this.strategies.detectSandboxType();
      this.sandbox = this.createSandbox(this.sandboxType);

      if (this.lastConfig) {
        await this.start(this.lastConfig);
      }

      this.restartAttempts = 0;
      this.emit("status-changed", this.getStatus());
      return true;
    } catch (err) {
      this.emit("error", err);
      return false;
    }
  }
}
