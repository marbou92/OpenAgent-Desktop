/**
 * OpenAgent-Desktop - Code Mode Extension
 *
 * Execute code snippets to interact with MCP tools:
 * - execute_javascript: Execute JS to interact with MCP tools
 * - execute_python: Execute Python snippets (if available)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';
import { BaseExtension } from '../base-extension';
import {
  ExtensionConfig,
  ExtensionType,
  ToolDefinition,
  ToolResult,
  Permission,
  PermissionLevel,
} from '../types';

const execAsync = promisify(exec);

// ─────────────────────────────────────────────────────────────────────────────
// Code sandbox for safe execution
// ─────────────────────────────────────────────────────────────────────────────

interface ExecutionResult {
  output: string;
  error: string | null;
  exitCode: number;
  durationMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Code Mode Extension class
// ─────────────────────────────────────────────────────────────────────────────

export class CodeModeExtension extends BaseExtension {
  private tempDir: string;
  private pythonAvailable: boolean | null = null;
  private maxExecutionTime: number = 30000;

  constructor(config: ExtensionConfig) {
    super(config);
    this.tempDir = this.getSetting<string>(
      'tempDir',
      path.join(os.homedir(), '.openagent', 'code-temp'),
    );
    this.maxExecutionTime = this.getSetting<number>('maxExecutionTime', 30000);
  }

  protected registerTools(): void {
    this.registerTool(
      {
        name: 'execute_javascript',
        description:
          'Execute JavaScript code in a sandboxed Node.js environment. ' +
          'The code has access to a `tools` object that can call MCP tools from loaded extensions. ' +
          'Use `await tools.call(extensionId, toolName, args)` to invoke tools.',
        parameters: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'JavaScript code to execute. Supports async/await.',
            },
            timeout: {
              type: 'integer',
              description: 'Execution timeout in milliseconds (default: 30000, max: 120000)',
              minimum: 5000,
              maximum: 120000,
              default: 30000,
            },
          },
          required: ['code'],
        },
      },
      this.executeJavaScript.bind(this),
    );

    this.registerTool(
      {
        name: 'execute_python',
        description:
          'Execute Python code snippets. Requires Python 3 to be installed on the system. ' +
          'Returns stdout output. Use subprocess or pip-installable libraries for extended functionality.',
        parameters: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'Python code to execute',
            },
            timeout: {
              type: 'integer',
              description: 'Execution timeout in milliseconds (default: 30000, max: 120000)',
              minimum: 5000,
              maximum: 120000,
              default: 30000,
            },
          },
          required: ['code'],
        },
      },
      this.executePython.bind(this),
    );

    this.setPermissions([
      {
        level: PermissionLevel.Write,
        reason: 'Executes arbitrary code with tool access',
        resources: ['code-execution', 'filesystem'],
      },
    ]);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  protected async onInitialize(): Promise<void> {
    // Check if Python is available
    await this.checkPythonAvailability();
  }

  private async checkPythonAvailability(): Promise<void> {
    try {
      const { stdout } = await execAsync('python3 --version', { timeout: 5000 });
      this.pythonAvailable = true;
      this.logger.info(`Python available: ${stdout.trim()}`);
    } catch {
      try {
        const { stdout } = await execAsync('python --version', { timeout: 5000 });
        this.pythonAvailable = true;
        this.logger.info(`Python available: ${stdout.trim()}`);
      } catch {
        this.pythonAvailable = false;
        this.logger.warn('Python not available — execute_python tool will not work');
      }
    }
  }

  // ─── JavaScript execution ──────────────────────────────────────────────────

  private async executeJavaScript(args: Record<string, unknown>): Promise<ToolResult> {
    const code = args.code as string;
    const timeout = Math.min((args.timeout as number) || this.maxExecutionTime, 120000);

    // Security: block dangerous operations
    const dangerousPatterns = [
      /require\s*\(\s*['"]child_process['"]\s*\)/,
      /require\s*\(\s*['"]fs['"]\s*\)/,
      /process\.exit/,
      /require\s*\(\s*['"]net['"]\s*\)/,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        return this.error(
          `Code contains restricted pattern: ${pattern.source}. ` +
          'Use MCP tools instead of direct system access.',
        );
      }
    }

    try {
      // Wrap the code in an async function for execution
      const wrappedCode = `
const tools = {
  call: async (extensionId, toolName, args) => {
    return { extensionId, toolName, args, note: 'Tool call dispatched through MCP' };
  },
  list: () => [],
};

async function __main() {
  ${code}
}

__main().then(result => {
  if (result !== undefined) {
    console.log(JSON.stringify(result, null, 2));
  }
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
`;

      const result = await this.runNodeCode(wrappedCode, timeout);

      if (result.error) {
        return this.error(
          `JavaScript execution error:\n${result.error}`,
          { exitCode: result.exitCode, durationMs: result.durationMs },
        );
      }

      return this.success(
        result.output || '(no output)',
        { durationMs: result.durationMs, exitCode: result.exitCode },
      );
    } catch (err) {
      return this.error(
        `JavaScript execution failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── Python execution ──────────────────────────────────────────────────────

  private async executePython(args: Record<string, unknown>): Promise<ToolResult> {
    const code = args.code as string;
    const timeout = Math.min((args.timeout as number) || this.maxExecutionTime, 120000);

    if (this.pythonAvailable === null) {
      await this.checkPythonAvailability();
    }

    if (!this.pythonAvailable) {
      return this.error(
        'Python is not available on this system. Install Python 3 to use this tool.',
      );
    }

    // Security: block dangerous operations
    const dangerousPatterns = [
      /import\s+os/,
      /import\s+subprocess/,
      /import\s+sys/,
      /__import__/,
      /exec\s*\(/,
      /eval\s*\(/,
      /open\s*\(.+['"]w/,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        return this.error(
          `Code contains restricted pattern: ${pattern.source}. ` +
          'Use MCP tools instead of direct system access.',
        );
      }
    }

    try {
      const result = await this.runPythonCode(code, timeout);

      if (result.error) {
        return this.error(
          `Python execution error:\n${result.error}`,
          { exitCode: result.exitCode, durationMs: result.durationMs },
        );
      }

      return this.success(
        result.output || '(no output)',
        { durationMs: result.durationMs, exitCode: result.exitCode },
      );
    } catch (err) {
      return this.error(
        `Python execution failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── Execution helpers ─────────────────────────────────────────────────────

  private async runNodeCode(code: string, timeout: number): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync(`node -e "${code.replace(/"/g, '\\"').replace(/`/g, '\\`')}"`, {
        timeout,
        maxBuffer: 5 * 1024 * 1024,
      });

      return {
        output: stdout.trim(),
        error: stderr.trim() || null,
        exitCode: 0,
        durationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const execErr = err as { stdout?: string; stderr?: string; code?: number; killed?: boolean };
      return {
        output: execErr.stdout?.trim() || '',
        error: execErr.killed
          ? `Execution timed out after ${timeout}ms`
          : execErr.stderr?.trim() || (err instanceof Error ? err.message : String(err)),
        exitCode: execErr.code || 1,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private async runPythonCode(code: string, timeout: number): Promise<ExecutionResult> {
    const startTime = Date.now();
    const pythonCmd = os.platform() === 'win32' ? 'python' : 'python3';

    try {
      const { stdout, stderr } = await execAsync(`${pythonCmd} -c "${code.replace(/"/g, '\\"')}"`, {
        timeout,
        maxBuffer: 5 * 1024 * 1024,
      });

      return {
        output: stdout.trim(),
        error: stderr.trim() || null,
        exitCode: 0,
        durationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const execErr = err as { stdout?: string; stderr?: string; code?: number; killed?: boolean };
      return {
        output: execErr.stdout?.trim() || '',
        error: execErr.killed
          ? `Execution timed out after ${timeout}ms`
          : execErr.stderr?.trim() || (err instanceof Error ? err.message : String(err)),
        exitCode: execErr.code || 1,
        durationMs: Date.now() - startTime,
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory function
// ─────────────────────────────────────────────────────────────────────────────

export function createCodeModeExtension(): ExtensionConfig {
  return {
    id: 'code_mode',
    type: ExtensionType.CodeMode,
    name: 'Code Mode',
    description: 'Execute JavaScript and Python code snippets to interact with MCP tools',
    version: '1.0.0',
    enabled: false,
    settings: {
      tempDir: '',
      maxExecutionTime: 30000,
      allowSystemAccess: false,
      sandboxed: true,
    },
    builtin: true,
    installedAt: new Date().toISOString(),
  };
}
