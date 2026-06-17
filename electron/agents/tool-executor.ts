/**
 * OpenAgent-Desktop - Agent Tool Executor
 *
 * Minimal tool execution for the agentic loop. Handles the core tools that
 * Build / Plan / Smart modes need:
 *   - bash      → sandboxManager.execute(command)
 *   - read      → fs.readFile (with path validation)
 *   - write     → fs.writeFile (with path validation)
 *   - edit      → read + string replace + write
 *   - glob      → simple glob matching via fs.readdir + minimatch-style pattern
 *   - grep      → simple content search via fs.readFile + regex
 *
 * Extension-registered tools (MCP tools, etc.) are NOT handled here — they
 * require the extension registry, which is wired separately. Unknown tools
 * return an error so the LLM can adapt.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ToolCallRequest, ToolCallResult } from './types';

export interface ExtensionRegistryLike {
  // Use `unknown` for parameters because the actual ExtensionRegistry returns
  // a stricter JSONSchema type — we want to be compatible without coupling.
  getAllTools(): Array<{ name: string; description: string; parameters: unknown; extensionId: string }>;
  executeTool(toolName: string, args: Record<string, unknown>): Promise<{ content: string; isError?: boolean }>;
}

export interface ToolExecutorDeps {
  sandboxManager: {
    execute: (command: string, options?: { cwd?: string; timeout?: number; stdin?: string }) => Promise<{ exitCode: number; stdout: string; stderr: string; duration: number; timedOut: boolean }>;
  };
  workingDirectory: string;
  /**
   * Optional ExtensionRegistry. When provided, any tool call whose name is not
   * one of the built-in tools (bash/read/write/edit/glob/grep) is routed here,
   * so MCP-server-registered tools and extension-registered tools are
   * callable from the agent loop.
   */
  extensionRegistry?: ExtensionRegistryLike;
}

/** Built-in tool names that the agent-tool-executor handles directly. */
export const BUILTIN_TOOL_NAMES = new Set(['bash', 'shell', 'execute', 'read', 'read_file', 'write', 'write_file', 'edit', 'edit_file', 'glob', 'list_files', 'grep', 'search']);

/**
 * List all tools available to the agent: built-in tools + extension-registered
 * (MCP) tools. Used by the agent loop to pass the tool catalog to the LLM so
 * it knows what it can call.
 */
export function listAvailableTools(deps: ToolExecutorDeps): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
  const builtin: Array<{ name: string; description: string; parameters: Record<string, unknown> }> = [
    {
      name: 'bash',
      description: 'Execute a shell command. Returns stdout, stderr, and exit code. Use for running tests, building code, git operations, etc.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
          cwd: { type: 'string', description: 'Working directory (defaults to session working dir)' },
          timeout: { type: 'number', description: 'Timeout in ms (default 30000)' },
        },
        required: ['command'],
      },
    },
    {
      name: 'read',
      description: 'Read the contents of a file. Path must be inside the working directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path (relative to working dir or absolute)' },
        },
        required: ['path'],
      },
    },
    {
      name: 'write',
      description: 'Write content to a file. Creates parent directories. Path must be inside the working directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'edit',
      description: 'Edit a file by replacing old_string with new_string. Fails if old_string is not found.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          old_string: { type: 'string', description: 'Exact string to find' },
          new_string: { type: 'string', description: 'Replacement string' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
    {
      name: 'glob',
      description: 'Find files matching a glob pattern. Supports * (within segment) and ** (across segments).',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern (e.g. "**/*.ts")' },
          path: { type: 'string', description: 'Base directory (defaults to working dir)' },
        },
        required: ['pattern'],
      },
    },
    {
      name: 'grep',
      description: 'Search file contents with a regex. Returns matching lines with file:line: prefix.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern' },
          path: { type: 'string', description: 'Base directory' },
          include: { type: 'string', description: 'File glob to include (e.g. "*.ts")' },
        },
        required: ['pattern'],
      },
    },
  ];

  // Merge in extension-registered (MCP) tools.
  const extensionTools: Array<{ name: string; description: string; parameters: Record<string, unknown> }> = [];
  if (deps.extensionRegistry) {
    try {
      for (const t of deps.extensionRegistry.getAllTools()) {
        extensionTools.push({
          name: t.name,
          description: t.description,
          parameters: (t.parameters as Record<string, unknown>) || { type: 'object', properties: {} },
        });
      }
    } catch {
      // Extension registry not ready — skip.
    }
  }

  // Deduplicate by name (built-in tools take precedence).
  const seen = new Set(builtin.map((t) => t.name));
  const merged = [...builtin];
  for (const t of extensionTools) {
    if (!seen.has(t.name)) {
      seen.add(t.name);
      merged.push(t);
    }
  }
  return merged;
}

/**
 * Execute a tool call. Returns { content, isError }.
 * The content is always a string (JSON-stringified for structured results)
 * so it can be fed back to the LLM as a tool result message.
 *
 * Routing:
 *   1. Built-in tools (bash/read/write/edit/glob/grep) → handled inline.
 *   2. Anything else → extensionRegistry.executeTool(name, args) (MCP tools).
 *   3. If no extensionRegistry is configured OR the tool is not registered
 *      there either, return an error.
 */
export async function executeToolCall(
  toolCall: ToolCallRequest,
  deps: ToolExecutorDeps,
): Promise<ToolCallResult> {
  const { name, arguments: args } = toolCall;

  // Built-in tools
  if (BUILTIN_TOOL_NAMES.has(name)) {
    try {
      switch (name) {
        case 'bash':
        case 'shell':
        case 'execute':
          return await executeBash(args, deps);

        case 'read':
        case 'read_file':
          return await executeRead(args, deps);

        case 'write':
        case 'write_file':
          return await executeWrite(args, deps);

        case 'edit':
        case 'edit_file':
          return await executeEdit(args, deps);

        case 'glob':
        case 'list_files':
          return await executeGlob(args, deps);

        case 'grep':
        case 'search':
          return await executeGrep(args, deps);
      }
    } catch (err: any) {
      return {
        content: `Tool execution failed: ${err.message}`,
        isError: true,
      };
    }
  }

  // Extension-registered (MCP) tools
  if (deps.extensionRegistry) {
    try {
      const result = await deps.extensionRegistry.executeTool(name, args);
      return {
        content: result.content,
        isError: result.isError ?? false,
      };
    } catch (err: any) {
      return {
        content: `MCP tool '${name}' execution failed: ${err.message}`,
        isError: true,
      };
    }
  }

  return {
    content: `Tool '${name}' is not supported. Available built-in tools: bash, read, write, edit, glob, grep. MCP tools require an enabled extension.`,
    isError: true,
  };
}

// ─── Tool implementations ────────────────────────────────────────────────────

async function executeBash(args: Record<string, unknown>, deps: ToolExecutorDeps): Promise<ToolCallResult> {
  const command = String(args.command || args.cmd || '');
  if (!command) {
    return { content: 'bash: missing "command" argument', isError: true };
  }
  const cwd = args.cwd ? resolvePath(String(args.cwd), deps.workingDirectory) : deps.workingDirectory;
  const timeout = typeof args.timeout === 'number' ? args.timeout : 30000;

  const result = await deps.sandboxManager.execute(command, { cwd, timeout });
  const output = [
    result.stdout ? result.stdout : '',
    result.stderr ? `\n[stderr]\n${result.stderr}` : '',
    result.timedOut ? '\n[timed out]' : '',
  ].join('');
  return {
    content: output.trim() || `(command completed with exit code ${result.exitCode})`,
    isError: result.exitCode !== 0,
  };
}

async function executeRead(args: Record<string, unknown>, deps: ToolExecutorDeps): Promise<ToolCallResult> {
  const filePath = String(args.path || args.file_path || args.file || '');
  if (!filePath) {
    return { content: 'read: missing "path" argument', isError: true };
  }
  const resolved = resolvePath(filePath, deps.workingDirectory);
  if (!isPathSafe(resolved, deps.workingDirectory)) {
    return { content: `read: path '${filePath}' is outside the working directory`, isError: true };
  }
  const content = fs.readFileSync(resolved, 'utf-8');
  // Truncate very large files to avoid blowing the context window.
  const maxChars = 50000;
  if (content.length > maxChars) {
    return { content: content.slice(0, maxChars) + `\n\n[... truncated ${content.length - maxChars} chars ...]` };
  }
  return { content };
}

async function executeWrite(args: Record<string, unknown>, deps: ToolExecutorDeps): Promise<ToolCallResult> {
  const filePath = String(args.path || args.file_path || args.file || '');
  const content = String(args.content || '');
  if (!filePath) {
    return { content: 'write: missing "path" argument', isError: true };
  }
  const resolved = resolvePath(filePath, deps.workingDirectory);
  if (!isPathSafe(resolved, deps.workingDirectory)) {
    return { content: `write: path '${filePath}' is outside the working directory`, isError: true };
  }
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, 'utf-8');
  return { content: `Wrote ${content.length} bytes to ${filePath}` };
}

async function executeEdit(args: Record<string, unknown>, deps: ToolExecutorDeps): Promise<ToolCallResult> {
  const filePath = String(args.path || args.file_path || args.file || '');
  const oldString = String(args.old_string || args.find || '');
  const newString = String(args.new_string || args.replace || '');
  if (!filePath || !oldString) {
    return { content: 'edit: missing "path" or "old_string" argument', isError: true };
  }
  const resolved = resolvePath(filePath, deps.workingDirectory);
  if (!isPathSafe(resolved, deps.workingDirectory)) {
    return { content: `edit: path '${filePath}' is outside the working directory`, isError: true };
  }
  const content = fs.readFileSync(resolved, 'utf-8');
  if (!content.includes(oldString)) {
    return { content: `edit: old_string not found in ${filePath}`, isError: true };
  }
  const updated = content.replace(oldString, newString);
  fs.writeFileSync(resolved, updated, 'utf-8');
  return { content: `Edited ${filePath}: replaced ${oldString.length} chars with ${newString.length} chars` };
}

async function executeGlob(args: Record<string, unknown>, deps: ToolExecutorDeps): Promise<ToolCallResult> {
  const pattern = String(args.pattern || args.glob || '**/*');
  const cwd = args.path ? resolvePath(String(args.path), deps.workingDirectory) : deps.workingDirectory;
  const maxResults = typeof args.max_results === 'number' ? args.max_results : 100;

  const results = await globFiles(cwd, pattern, maxResults);
  return {
    content: results.length > 0 ? results.join('\n') : '(no files matched)',
  };
}

async function executeGrep(args: Record<string, unknown>, deps: ToolExecutorDeps): Promise<ToolCallResult> {
  const pattern = String(args.pattern || args.regex || '');
  const cwd = args.path ? resolvePath(String(args.path), deps.workingDirectory) : deps.workingDirectory;
  const include = args.include ? String(args.include) : '*';
  if (!pattern) {
    return { content: 'grep: missing "pattern" argument', isError: true };
  }
  const maxResults = typeof args.max_results === 'number' ? args.max_results : 50;
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, 'i');
  } catch {
    regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  const files = await globFiles(cwd, include, 500);
  const matches: string[] = [];
  for (const file of files) {
    if (matches.length >= maxResults) break;
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          matches.push(`${path.relative(cwd, file)}:${i + 1}: ${lines[i].trim()}`);
          if (matches.length >= maxResults) break;
        }
      }
    } catch {
      // Skip unreadable files
    }
  }
  return {
    content: matches.length > 0 ? matches.join('\n') : '(no matches found)',
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolvePath(p: string, workingDir: string): string {
  if (path.isAbsolute(p)) return path.resolve(p);
  return path.resolve(workingDir, p);
}

function isPathSafe(resolved: string, workingDir: string): boolean {
  const safeWorkingDir = path.resolve(workingDir);
  return resolved === safeWorkingDir || resolved.startsWith(safeWorkingDir + path.sep);
}

/**
 * Simple recursive glob. Supports * (within a path segment) and ** (across
 * segments). Not a full minimatch implementation — enough for agent use.
 */
async function globFiles(rootDir: string, pattern: string, maxResults: number): Promise<string[]> {
  const results: string[] = [];
  const segments = pattern.split('/');

  async function walk(dir: string, segIdx: number): Promise<void> {
    if (results.length >= maxResults) return;
    if (segIdx >= segments.length) {
      results.push(dir);
      return;
    }
    const seg = segments[segIdx];
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (seg === '**') {
      // Match zero or more directories — recurse into all subdirs AND try matching the next segment at this level.
      await walk(dir, segIdx + 1);
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await walk(path.join(dir, entry.name), segIdx);
        }
      }
    } else if (seg.includes('*')) {
      const regex = new RegExp('^' + seg.replace(/\./g, '\\.').replace(/\*/g, '[^/]*') + '$');
      for (const entry of entries) {
        if (results.length >= maxResults) break;
        if (regex.test(entry.name)) {
          const fullPath = path.join(dir, entry.name);
          if (segIdx === segments.length - 1) {
            results.push(fullPath);
          } else if (entry.isDirectory()) {
            await walk(fullPath, segIdx + 1);
          }
        }
      }
    } else {
      const fullPath = path.join(dir, seg);
      try {
        const stat = await fs.promises.stat(fullPath);
        if (segIdx === segments.length - 1) {
          results.push(fullPath);
        } else if (stat.isDirectory()) {
          await walk(fullPath, segIdx + 1);
        }
      } catch {
        // Path doesn't exist — skip
      }
    }
  }

  await walk(rootDir, 0);
  return results.slice(0, maxResults);
}
