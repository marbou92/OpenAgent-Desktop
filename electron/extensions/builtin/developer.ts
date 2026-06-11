/**
 * OpenAgent-Desktop - Developer Extension
 *
 * Built-in extension enabled by default providing core development tools:
 * - shell: Execute shell commands
 * - text_editor: File editing (view, create, edit, insert, undo)
 * - analyze: Codebase analysis (structure, semantic, focus modes)
 * - screen_capture: Capture screen
 * - image_processor: Image processing
 */

import { exec, ExecOptions } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
// screenshot-desktop is replaced with native system screenshot commands
// to avoid Vite bundling issues with native modules.
import { BaseExtension } from '../base-extension';
import {
  ExtensionConfig,
  ExtensionType,
  ToolResult,
  PermissionLevel,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// File edit history for undo support
// ─────────────────────────────────────────────────────────────────────────────

interface FileEditRecord {
  filePath: string;
  originalContent: string;
  timestamp: string;
  operation: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Developer Extension class
// ─────────────────────────────────────────────────────────────────────────────

export class DeveloperExtension extends BaseExtension {
  private editHistory: FileEditRecord[] = [];
  private maxEditHistory = 100;
  private allowedDirectories: string[] = [];
  private blockedCommands: string[] = [
    'rm -rf /',
    'mkfs',
    'dd if=',
    ':(){:|:&};:',
    'format c:',
    'del /f /s /q c:\\',
  ];

  constructor(config: ExtensionConfig) {
    super(config);
    this.allowedDirectories = this.getSetting<string[]>('allowedDirectories', [
      os.homedir(),
      process.cwd(),
    ]);
  }

  // ─── Tool registration ─────────────────────────────────────────────────────

  protected registerTools(): void {
    this.registerTool(
      {
        name: 'shell',
        description:
          'Execute a shell command and return the output. Supports timeout, custom working directory, and environment variables.',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The shell command to execute',
            },
            cwd: {
              type: 'string',
              description: 'Working directory for the command (defaults to current directory)',
            },
            timeout: {
              type: 'integer',
              description: 'Timeout in milliseconds (default: 30000, max: 300000)',
              minimum: 1000,
              maximum: 300000,
              default: 30000,
            },
            env: {
              type: 'object',
              description: 'Additional environment variables for the command',
              additionalProperties: { type: 'string' },
            },
          },
          required: ['command'],
        },
      },
      this.executeShell.bind(this),
    );

    this.registerTool(
      {
        name: 'text_editor',
        description:
          'Edit text files with multiple operations: view, create, edit (find/replace), insert (add lines), and undo. ' +
          'For editing, provide old_string and new_string for precise find-and-replace.',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The editor command to execute',
              enum: ['view', 'create', 'edit', 'insert', 'undo'],
            },
            path: {
              type: 'string',
              description: 'Path to the file to operate on',
            },
            content: {
              type: 'string',
              description: 'File content for create command, or view range indicator',
            },
            insert_line: {
              type: 'integer',
              description: 'Line number to insert content at (for insert command)',
              minimum: 0,
            },
            old_string: {
              type: 'string',
              description: 'Text to find and replace (for edit command)',
            },
            new_string: {
              type: 'string',
              description: 'Replacement text (for edit command)',
            },
          },
          required: ['command', 'path'],
        },
      },
      this.executeTextEditor.bind(this),
    );

    this.registerTool(
      {
        name: 'analyze',
        description:
          'Analyze codebase or specific files. Supports three modes: ' +
          '"structure" (file tree and code structure), "semantic" (symbol analysis and relationships), ' +
          '"focus" (deep analysis of a specific area).',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to file or directory to analyze',
            },
            mode: {
              type: 'string',
              description: 'Analysis mode',
              enum: ['structure', 'semantic', 'focus'],
              default: 'structure',
            },
            follow_depth: {
              type: 'integer',
              description: 'How deep to follow imports/references (default: 2)',
              minimum: 0,
              maximum: 10,
              default: 2,
            },
            max_depth: {
              type: 'integer',
              description: 'Maximum directory traversal depth (default: 5)',
              minimum: 1,
              maximum: 20,
              default: 5,
            },
          },
          required: ['path'],
        },
      },
      this.executeAnalyze.bind(this),
    );

    this.registerTool(
      {
        name: 'screen_capture',
        description: 'Capture the current screen and return a base64-encoded image.',
        parameters: {
          type: 'object',
          properties: {
            display: {
              type: 'integer',
              description: 'Display number to capture (default: primary display)',
              minimum: 0,
            },
          },
        },
      },
      this.executeScreenCapture.bind(this),
    );

    this.registerTool(
      {
        name: 'image_processor',
        description:
          'Process images with various operations: resize, convert, rotate, crop, grayscale, thumbnail, metadata.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the image file to process',
            },
            operation: {
              type: 'string',
              description: 'The operation to perform',
              enum: ['resize', 'convert', 'rotate', 'crop', 'grayscale', 'thumbnail', 'metadata'],
            },
            params: {
              type: 'object',
              description: 'Operation-specific parameters',
              properties: {
                width: { type: 'integer', description: 'Target width for resize/thumbnail' },
                height: { type: 'integer', description: 'Target height for resize/thumbnail' },
                format: { type: 'string', description: 'Target format for convert (png, jpg, webp, gif)' },
                degrees: { type: 'integer', description: 'Rotation degrees for rotate' },
                x: { type: 'integer', description: 'Crop start X' },
                y: { type: 'integer', description: 'Crop start Y' },
                output_path: { type: 'string', description: 'Output file path' },
              },
            },
          },
          required: ['path', 'operation'],
        },
      },
      this.executeImageProcessor.bind(this),
    );

    // Set permissions
    this.setPermissions([
      { level: PermissionLevel.Write, reason: 'Shell execution and file editing capabilities', resources: ['filesystem', 'process'] },
    ]);
  }

  // ─── Shell execution ───────────────────────────────────────────────────────

  private async executeShell(args: Record<string, unknown>): Promise<ToolResult> {
    const command = args.command as string;
    const cwd = (args.cwd as string) || process.cwd();
    const timeout = Math.min((args.timeout as number) || 30000, 300000);
    const extraEnv = (args.env as Record<string, string>) || {};

    // Security check — block dangerous commands
    const commandLower = command.toLowerCase().trim();
    for (const blocked of this.blockedCommands) {
      if (commandLower.includes(blocked.toLowerCase())) {
        return this.error(`Command blocked for safety: contains dangerous pattern "${blocked}"`);
      }
    }

    // Verify working directory exists
    try {
      await fs.access(cwd);
    } catch {
      return this.error(`Working directory does not exist: ${cwd}`);
    }

    const options: ExecOptions = {
      cwd,
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      env: { ...process.env, ...extraEnv } as Record<string, string>,
      shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
    };

    return new Promise((resolve) => {
      exec(command, options, (error, stdout, stderr) => {
        const metadata: Record<string, unknown> = {
          command,
          cwd,
          timeout,
          exitCode: error ? error.code || 1 : 0,
        };

        let output = '';
        if (stdout) {
          output += stdout;
        }
        if (stderr) {
          if (output) output += '\n';
          output += stderr;
        }

        if (error) {
          if (error.killed) {
            resolve(
              this.error(`Command timed out after ${timeout}ms: ${command}`, {
                ...metadata,
                timedOut: true,
              }),
            );
          } else {
            resolve(
              this.error(`Command failed with exit code ${error.code}: ${output}`, metadata),
            );
          }
        } else {
          resolve(this.success(output || '(no output)', metadata));
        }
      });
    });
  }

  // ─── Text editor ───────────────────────────────────────────────────────────

  private async executeTextEditor(args: Record<string, unknown>): Promise<ToolResult> {
    const command = args.command as string;
    const filePath = args.path as string;

    // Resolve and validate path
    const resolvedPath = path.resolve(filePath);

    switch (command) {
      case 'view':
        return this.editorView(resolvedPath, args.content as string | undefined);
      case 'create':
        return this.editorCreate(resolvedPath, args.content as string);
      case 'edit':
        return this.editorEdit(
          resolvedPath,
          args.old_string as string,
          args.new_string as string,
        );
      case 'insert':
        return this.editorInsert(
          resolvedPath,
          args.content as string,
          args.insert_line as number,
        );
      case 'undo':
        return this.editorUndo(resolvedPath);
      default:
        return this.error(`Unknown text_editor command: ${command}`);
    }
  }

  /** View a file's contents */
  private async editorView(filePath: string, range?: string): Promise<ToolResult> {
    try {
      const stat = await fs.stat(filePath);

      if (stat.isDirectory()) {
        const entries = await fs.readdir(filePath, { withFileTypes: true });
        const listing = entries
          .map((entry) => {
            const prefix = entry.isDirectory() ? '📁 ' : entry.isSymbolicLink() ? '🔗 ' : '📄 ';
            return prefix + entry.name;
          })
          .join('\n');
        return this.success(`Directory listing of ${filePath}:\n${listing}`, {
          path: filePath,
          type: 'directory',
          entryCount: entries.length,
        });
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const lineCount = lines.length;
      const fileSize = stat.size;

      // Handle range specification (e.g., "1-50" or "50")
      let startLine = 1;
      let endLine = lineCount;

      if (range) {
        const rangeMatch = range.match(/^(\d+)(?:-(\d+))?$/);
        if (rangeMatch) {
          startLine = parseInt(rangeMatch[1], 10);
          endLine = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : startLine;
        }
      }

      // Limit output to 500 lines max
      if (endLine - startLine > 500) {
        endLine = startLine + 499;
      }

      startLine = Math.max(1, Math.min(startLine, lineCount));
      endLine = Math.max(startLine, Math.min(endLine, lineCount));

      const selectedLines = lines.slice(startLine - 1, endLine);
      const numberedOutput = selectedLines
        .map((line, idx) => {
          const lineNum = startLine + idx;
          const lineNumStr = lineNum.toString().padStart(6, ' ');
          return `${lineNumStr}│ ${line}`;
        })
        .join('\n');

      const header = `File: ${filePath} (${lineCount} lines, ${this.formatBytes(fileSize)})`;
      const rangeInfo = startLine > 1 || endLine < lineCount
        ? ` [lines ${startLine}-${endLine} of ${lineCount}]`
        : '';

      return this.success(`${header}${rangeInfo}\n${numberedOutput}`, {
        path: filePath,
        type: 'file',
        lineCount,
        fileSize,
        range: { start: startLine, end: endLine },
      });
    } catch (err) {
      return this.error(
        `Failed to view "${filePath}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Create a new file with content */
  private async editorCreate(filePath: string, content: string): Promise<ToolResult> {
    try {
      // Ensure parent directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      // Check if file already exists
      let exists = false;
      try {
        await fs.access(filePath);
        exists = true;
      } catch {
        // File doesn't exist, which is what we want
      }

      if (exists) {
        return this.error(`File already exists: ${filePath}. Use "edit" command instead.`);
      }

      await fs.writeFile(filePath, content, 'utf-8');

      return this.success(`File created successfully: ${filePath}`, {
        path: filePath,
        operation: 'create',
        size: Buffer.byteLength(content, 'utf-8'),
      });
    } catch (err) {
      return this.error(
        `Failed to create file "${filePath}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Edit a file with find and replace */
  private async editorEdit(
    filePath: string,
    oldString: string,
    newString: string,
  ): Promise<ToolResult> {
    if (!oldString) {
      return this.error('old_string is required for edit command');
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Save to edit history for undo
      this.pushEditHistory(filePath, content, 'edit');

      // Count occurrences
      const occurrences = content.split(oldString).length - 1;
      if (occurrences === 0) {
        return this.error(
          `old_string not found in ${filePath}. Make sure the string matches exactly, including whitespace and indentation.`,
        );
      }

      if (occurrences > 1) {
        return this.error(
          `old_string found ${occurrences} times in ${filePath}. Please provide more context to make the match unique.`,
        );
      }

      const newContent = content.replace(oldString, newString);
      await fs.writeFile(filePath, newContent, 'utf-8');

      return this.success(
        `Successfully edited ${filePath} (1 replacement made)`,
        {
          path: filePath,
          operation: 'edit',
          replacements: 1,
        },
      );
    } catch (err) {
      return this.error(
        `Failed to edit "${filePath}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Insert content at a specific line */
  private async editorInsert(
    filePath: string,
    content: string,
    insertLine: number,
  ): Promise<ToolResult> {
    if (insertLine === undefined || insertLine === null) {
      return this.error('insert_line is required for insert command');
    }

    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');

      // Save to edit history for undo
      this.pushEditHistory(filePath, fileContent, 'insert');

      const lines = fileContent.split('\n');
      const lineIndex = Math.max(0, Math.min(insertLine, lines.length));

      lines.splice(lineIndex, 0, content);
      const newContent = lines.join('\n');

      await fs.writeFile(filePath, newContent, 'utf-8');

      return this.success(
        `Content inserted at line ${lineIndex} in ${filePath}`,
        {
          path: filePath,
          operation: 'insert',
          insertLine: lineIndex,
        },
      );
    } catch (err) {
      return this.error(
        `Failed to insert in "${filePath}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Undo the last edit to a file */
  private async editorUndo(filePath: string): Promise<ToolResult> {
    // Find the most recent edit for this file
    const editIndex = this.editHistory.findLastIndex(
      (record: FileEditRecord) => record.filePath === filePath,
    );

    if (editIndex === -1) {
      return this.error(`No edit history found for ${filePath}`);
    }

    const record = this.editHistory[editIndex];

    try {
      await fs.writeFile(filePath, record.originalContent, 'utf-8');
      this.editHistory.splice(editIndex, 1);

      return this.success(
        `Undid ${record.operation} on ${filePath} (restored to state from ${record.timestamp})`,
        {
          path: filePath,
          operation: 'undo',
          undoneOperation: record.operation,
        },
      );
    } catch (err) {
      return this.error(
        `Failed to undo on "${filePath}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Push an edit record to history */
  private pushEditHistory(filePath: string, originalContent: string, operation: string): void {
    this.editHistory.push({
      filePath,
      originalContent,
      timestamp: new Date().toISOString(),
      operation,
    });

    // Trim history if it exceeds the max
    if (this.editHistory.length > this.maxEditHistory) {
      this.editHistory.shift();
    }
  }

  // ─── Codebase analysis ─────────────────────────────────────────────────────

  private async executeAnalyze(args: Record<string, unknown>): Promise<ToolResult> {
    const targetPath = path.resolve(args.path as string);
    const mode = (args.mode as string) || 'structure';
    const followDepth = (args.follow_depth as number) || 2;
    const maxDepth = (args.max_depth as number) || 5;

    try {
      const stat = await fs.stat(targetPath);

      switch (mode) {
        case 'structure':
          if (stat.isDirectory()) {
            return this.analyzeStructure(targetPath, maxDepth);
          }
          return this.analyzeFileStructure(targetPath);

        case 'semantic':
          return this.analyzeSemantic(targetPath, followDepth);

        case 'focus':
          return this.analyzeFocus(targetPath, followDepth);

        default:
          return this.error(`Unknown analysis mode: ${mode}`);
      }
    } catch (err) {
      return this.error(
        `Failed to analyze "${targetPath}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Analyze directory structure */
  private async analyzeStructure(dirPath: string, maxDepth: number): Promise<ToolResult> {
    const result: string[] = [];
    const fileStats = { directories: 0, files: 0, totalSize: 0 };
    const ignorePatterns = [
      'node_modules', '.git', '.svn', '.hg', '__pycache__', '.DS_Store',
      'dist', 'build', '.next', '.cache', 'coverage', '.turbo',
    ];

    const buildTree = async (currentPath: string, prefix: string, depth: number): Promise<void> => {
      if (depth > maxDepth) {
        result.push(`${prefix}... (max depth reached)`);
        return;
      }

      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      const filtered = entries.filter(
        (e) => !ignorePatterns.includes(e.name) && !e.name.startsWith('.'),
      );

      for (let i = 0; i < filtered.length; i++) {
        const entry = filtered[i];
        const isLast = i === filtered.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const childPrefix = isLast ? '    ' : '│   ';

        if (entry.isDirectory()) {
          fileStats.directories++;
          result.push(`${prefix}${connector}📁 ${entry.name}/`);
          await buildTree(
            path.join(currentPath, entry.name),
            prefix + childPrefix,
            depth + 1,
          );
        } else {
          try {
            const stat = await fs.stat(path.join(currentPath, entry.name));
            fileStats.files++;
            fileStats.totalSize += stat.size;
            const sizeInfo = this.formatBytes(stat.size);
            result.push(`${prefix}${connector}📄 ${entry.name} (${sizeInfo})`);
          } catch {
            result.push(`${prefix}${connector}📄 ${entry.name}`);
          }
        }
      }
    };

    result.push(`Structure analysis of: ${dirPath}`);
    result.push('─'.repeat(60));
    await buildTree(dirPath, '', 0);
    result.push('─'.repeat(60));
    result.push(
      `Summary: ${fileStats.directories} directories, ${fileStats.files} files, ${this.formatBytes(fileStats.totalSize)}`,
    );

    return this.success(result.join('\n'), {
      path: dirPath,
      mode: 'structure',
      ...fileStats,
    });
  }

  /** Analyze a single file's structure */
  private async analyzeFileStructure(filePath: string): Promise<ToolResult> {
    const content = await fs.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();
    const lines = content.split('\n');

    const result: string[] = [];
    result.push(`File analysis: ${filePath}`);
    result.push(`Lines: ${lines.length}, Size: ${this.formatBytes(Buffer.byteLength(content, 'utf-8'))}`);
    result.push('─'.repeat(60));

    // Extract symbols based on file type
    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      this.extractJSSymbols(content, result);
    } else if (['.py'].includes(ext)) {
      this.extractPythonSymbols(content, result);
    } else {
      result.push('No symbol extraction available for this file type.');
    }

    return this.success(result.join('\n'), {
      path: filePath,
      mode: 'structure',
      lineCount: lines.length,
    });
  }

  /** Extract JavaScript/TypeScript symbols */
  private extractJSSymbols(content: string, result: string[]): void {
    const patterns = [
      { regex: /export\s+default\s+function\s+(\w+)/g, type: 'Function (default export)' },
      { regex: /export\s+function\s+(\w+)/g, type: 'Function (export)' },
      { regex: /function\s+(\w+)/g, type: 'Function' },
      { regex: /export\s+const\s+(\w+)/g, type: 'Constant (export)' },
      { regex: /const\s+(\w+)/g, type: 'Constant' },
      { regex: /export\s+class\s+(\w+)/g, type: 'Class (export)' },
      { regex: /class\s+(\w+)/g, type: 'Class' },
      { regex: /export\s+interface\s+(\w+)/g, type: 'Interface (export)' },
      { regex: /interface\s+(\w+)/g, type: 'Interface' },
      { regex: /export\s+type\s+(\w+)/g, type: 'Type (export)' },
      { regex: /export\s+enum\s+(\w+)/g, type: 'Enum (export)' },
    ];

    for (const { regex, type } of patterns) {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        const line = content.substring(0, match.index).split('\n').length;
        result.push(`  L${line}: ${type} — ${match[1]}`);
      }
    }
  }

  /** Extract Python symbols */
  private extractPythonSymbols(content: string, result: string[]): void {
    const patterns = [
      { regex: /^class\s+(\w+)/gm, type: 'Class' },
      { regex: /^def\s+(\w+)/gm, type: 'Function' },
      { regex: /^async\s+def\s+(\w+)/gm, type: 'Async Function' },
    ];

    for (const { regex, type } of patterns) {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        const line = content.substring(0, match.index).split('\n').length;
        result.push(`  L${line}: ${type} — ${match[1]}`);
      }
    }
  }

  /** Semantic analysis — symbol relationships */
  private async analyzeSemantic(targetPath: string, followDepth: number): Promise<ToolResult> {
    const result: string[] = [];
    result.push(`Semantic analysis of: ${targetPath}`);
    result.push('─'.repeat(60));

    try {
      const stat = await fs.stat(targetPath);

      if (stat.isFile()) {
        const content = await fs.readFile(targetPath, 'utf-8');
        const ext = path.extname(targetPath).toLowerCase();

        // Extract imports and exports
        if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
          const imports: string[] = [];
          const exports: string[] = [];

          const importRegex = /import\s+.*?from\s+['"](.+?)['"]/g;
          const exportRegex = /export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g;

          let match: RegExpExecArray | null;
          while ((match = importRegex.exec(content)) !== null) {
            imports.push(match[1]);
          }
          while ((match = exportRegex.exec(content)) !== null) {
            exports.push(match[1]);
          }

          result.push(`Imports (${imports.length}):`);
          imports.forEach((imp) => result.push(`  ← ${imp}`));
          result.push('');
          result.push(`Exports (${exports.length}):`);
          exports.forEach((exp) => result.push(`  → ${exp}`));
        } else if (ext === '.py') {
          const imports: string[] = [];
          const importRegex = /^(?:from\s+(\S+)\s+)?import\s+(.+)/gm;

          let match: RegExpExecArray | null;
          while ((match = importRegex.exec(content)) !== null) {
            imports.push(match[1] ? `${match[1]}.${match[2]}` : match[2]);
          }

          result.push(`Imports (${imports.length}):`);
          imports.forEach((imp) => result.push(`  ← ${imp}`));
        } else {
          result.push('Semantic analysis not supported for this file type.');
        }
      } else {
        // Directory — find all importable modules
        result.push('Directory-level semantic analysis:');
        result.push('  Use "focus" mode with a specific file for deeper analysis.');
      }

      return this.success(result.join('\n'), {
        path: targetPath,
        mode: 'semantic',
        followDepth,
      });
    } catch (err) {
      return this.error(
        `Semantic analysis failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Focus analysis — deep dive into a specific file or area */
  private async analyzeFocus(targetPath: string, followDepth: number): Promise<ToolResult> {
    const result: string[] = [];
    result.push(`Focus analysis of: ${targetPath}`);
    result.push('─'.repeat(60));

    try {
      const stat = await fs.stat(targetPath);
      if (!stat.isFile()) {
        return this.error('Focus mode requires a file path, not a directory.');
      }

      const content = await fs.readFile(targetPath, 'utf-8');
      const lines = content.split('\n');

      // Detailed file analysis
      result.push(`File: ${path.basename(targetPath)}`);
      result.push(`Path: ${targetPath}`);
      result.push(`Lines: ${lines.length}`);
      result.push(`Size: ${this.formatBytes(stat.size)}`);
      result.push('');

      // Code complexity indicators
      const codeLines = lines.filter((l) => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('#')).length;
      const commentLines = lines.filter((l) => l.trim().startsWith('//') || l.trim().startsWith('#') || l.trim().startsWith('/*') || l.trim().startsWith('*')).length;
      const blankLines = lines.length - codeLines - commentLines;

      result.push('Code Metrics:');
      result.push(`  Code lines: ${codeLines}`);
      result.push(`  Comment lines: ${commentLines}`);
      result.push(`  Blank lines: ${blankLines}`);
      result.push(`  Comment ratio: ${((commentLines / (codeLines + commentLines)) * 100).toFixed(1)}%`);

      // TODO/FIXME/HACK markers
      const markers: Array<{ type: string; line: number; text: string }> = [];
      lines.forEach((line, idx) => {
        const upper = line.toUpperCase();
        if (upper.includes('TODO')) markers.push({ type: 'TODO', line: idx + 1, text: line.trim() });
        if (upper.includes('FIXME')) markers.push({ type: 'FIXME', line: idx + 1, text: line.trim() });
        if (upper.includes('HACK')) markers.push({ type: 'HACK', line: idx + 1, text: line.trim() });
      });

      if (markers.length > 0) {
        result.push('');
        result.push(`Markers (${markers.length}):`);
        markers.forEach((m) => result.push(`  L${m.line}: [${m.type}] ${m.text.substring(0, 80)}`));
      }

      return this.success(result.join('\n'), {
        path: targetPath,
        mode: 'focus',
        followDepth,
        codeLines,
        commentLines,
        markers: markers.length,
      });
    } catch (err) {
      return this.error(
        `Focus analysis failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── Screen capture ────────────────────────────────────────────────────────

  private async executeScreenCapture(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const platform = process.platform;
      const _display = args.display as number | undefined;
      let command: string;

      // Use native system screenshot commands instead of screenshot-desktop npm package
      if (platform === 'darwin') {
        // macOS: use screencapture
        command = 'screencapture -x -t png /tmp/openagent-screenshot.png';
      } else if (platform === 'win32') {
        // Windows: use PowerShell
        command =
          'powershell -Command "Add-Type -AssemblyName System.Windows.Forms; ' +
          '$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; ' +
          '$bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height); ' +
          '$graphics = [System.Drawing.Graphics]::FromImage($bitmap); ' +
          '$graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size); ' +
          '$bitmap.Save("C:\\Temp\\openagent-screenshot.png"); ' +
          '$graphics.Dispose(); $bitmap.Dispose()"';
      } else {
        // Linux: try scrot, then gnome-screenshot, then import (ImageMagick)
        command =
          '(which scrot && scrot /tmp/openagent-screenshot.png) || ' +
          '(which gnome-screenshot && gnome-screenshot -f /tmp/openagent-screenshot.png) || ' +
          '(which import && import -window root /tmp/openagent-screenshot.png)';
      }

      await new Promise<void>((resolve, reject) => {
        exec(command, { timeout: 10000 }, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      // Read the captured screenshot
      const screenshotPath = platform === 'win32'
        ? 'C:\\Temp\\openagent-screenshot.png'
        : '/tmp/openagent-screenshot.png';
      const imgBuffer = await fs.readFile(screenshotPath);
      const base64 = imgBuffer.toString('base64');

      // Clean up temp file
      try { await fs.unlink(screenshotPath); } catch { /* ignore */ }

      return this.success(
        `Screen captured successfully (${this.formatBytes(base64.length)} base64 encoded)`,
        {
          type: 'screen_capture',
          format: 'png',
          base64,
          sizeBytes: imgBuffer.length,
        },
      );
    } catch (err) {
      return this.error(
        `Screen capture failed: ${err instanceof Error ? err.message : String(err)}. ` +
        'Ensure your system supports screen capture (screencapture on macOS, scrot/gnome-screenshot on Linux, PowerShell on Windows).',
      );
    }
  }

  // ─── Image processor ───────────────────────────────────────────────────────

  private async executeImageProcessor(args: Record<string, unknown>): Promise<ToolResult> {
    const imagePath = path.resolve(args.path as string);
    const operation = args.operation as string;
    const params = (args.params as Record<string, unknown>) || {};

    try {
      // Verify the file exists
      await fs.access(imagePath);
    } catch {
      return this.error(`Image file not found: ${imagePath}`);
    }

    try {
      const ext = path.extname(imagePath).toLowerCase();

      switch (operation) {
        case 'metadata': {
          const stat = await fs.stat(imagePath);
          return this.success(
            JSON.stringify(
              {
                path: imagePath,
                size: this.formatBytes(stat.size),
                sizeBytes: stat.size,
                modified: stat.mtime.toISOString(),
                extension: ext,
              },
              null,
              2,
            ),
            { operation: 'metadata' },
          );
        }

        case 'resize': {
          const width = params.width as number;
          const height = params.height as number;
          if (!width && !height) {
            return this.error('resize requires at least width or height parameter');
          }

          // Use sharp if available, otherwise fall back to ImageMagick
          const outputPath = (params.output_path as string) || imagePath.replace(ext, `_resized${ext}`);

          try {
            const sharp = require('sharp');
            let pipeline = sharp(imagePath);
            if (width && height) {
              pipeline = pipeline.resize(width, height);
            } else if (width) {
              pipeline = pipeline.resize(width);
            } else {
              pipeline = pipeline.resize(null, height);
            }
            await pipeline.toFile(outputPath);

            return this.success(
              `Image resized to ${width || 'auto'}x${height || 'auto'}: ${outputPath}`,
              { operation: 'resize', outputPath, width, height },
            );
          } catch {
            // Fallback to ImageMagick
            return this.executeImageMagick(
              `convert "${imagePath}" -resize ${width || ''}x${height || ''} "${outputPath}"`,
              outputPath,
              'resize',
            );
          }
        }

        case 'convert': {
          const format = params.format as string;
          if (!format) {
            return this.error('convert requires format parameter (png, jpg, webp, gif)');
          }

          const outputPath = (params.output_path as string) || imagePath.replace(ext, `.${format}`);

          try {
            const sharp = require('sharp');
            await sharp(imagePath).toFormat(format as 'png' | 'jpg' | 'webp' | 'gif').toFile(outputPath);
            return this.success(
              `Image converted to ${format}: ${outputPath}`,
              { operation: 'convert', outputPath, format },
            );
          } catch {
            return this.executeImageMagick(
              `convert "${imagePath}" "${outputPath}"`,
              outputPath,
              'convert',
            );
          }
        }

        case 'rotate': {
          const degrees = params.degrees as number;
          if (degrees === undefined) {
            return this.error('rotate requires degrees parameter');
          }

          const outputPath = (params.output_path as string) || imagePath.replace(ext, `_rotated${ext}`);

          try {
            const sharp = require('sharp');
            await sharp(imagePath).rotate(degrees).toFile(outputPath);
            return this.success(
              `Image rotated ${degrees}°: ${outputPath}`,
              { operation: 'rotate', outputPath, degrees },
            );
          } catch {
            return this.executeImageMagick(
              `convert "${imagePath}" -rotate ${degrees} "${outputPath}"`,
              outputPath,
              'rotate',
            );
          }
        }

        case 'crop': {
          const x = params.x as number;
          const y = params.y as number;
          const width = params.width as number;
          const height = params.height as number;
          if (x === undefined || y === undefined || !width || !height) {
            return this.error('crop requires x, y, width, and height parameters');
          }

          const outputPath = (params.output_path as string) || imagePath.replace(ext, `_cropped${ext}`);

          try {
            const sharp = require('sharp');
            await sharp(imagePath).extract({ left: x, top: y, width, height }).toFile(outputPath);
            return this.success(
              `Image cropped to ${width}x${height} at (${x},${y}): ${outputPath}`,
              { operation: 'crop', outputPath, x, y, width, height },
            );
          } catch {
            return this.executeImageMagick(
              `convert "${imagePath}" -crop ${width}x${height}+${x}+${y} "${outputPath}"`,
              outputPath,
              'crop',
            );
          }
        }

        case 'grayscale': {
          const outputPath = (params.output_path as string) || imagePath.replace(ext, `_grayscale${ext}`);

          try {
            const sharp = require('sharp');
            await sharp(imagePath).grayscale().toFile(outputPath);
            return this.success(
              `Image converted to grayscale: ${outputPath}`,
              { operation: 'grayscale', outputPath },
            );
          } catch {
            return this.executeImageMagick(
              `convert "${imagePath}" -colorspace Gray "${outputPath}"`,
              outputPath,
              'grayscale',
            );
          }
        }

        case 'thumbnail': {
          const width = (params.width as number) || 200;
          const height = (params.height as number) || 200;
          const outputPath = (params.output_path as string) || imagePath.replace(ext, `_thumb${ext}`);

          try {
            const sharp = require('sharp');
            await sharp(imagePath).resize(width, height, { fit: 'cover' }).toFile(outputPath);
            return this.success(
              `Thumbnail created (${width}x${height}): ${outputPath}`,
              { operation: 'thumbnail', outputPath, width, height },
            );
          } catch {
            return this.executeImageMagick(
              `convert "${imagePath}" -thumbnail ${width}x${height} "${outputPath}"`,
              outputPath,
              'thumbnail',
            );
          }
        }

        default:
          return this.error(`Unknown image operation: ${operation}`);
      }
    } catch (err) {
      return this.error(
        `Image processing failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Execute an ImageMagick command as fallback */
  private async executeImageMagick(
    command: string,
    outputPath: string,
    operation: string,
  ): Promise<ToolResult> {
    return new Promise((resolve) => {
      exec(command, { timeout: 30000 }, (error, _stdout, _stderr) => {
        if (error) {
          resolve(
            this.error(
              `ImageMagick ${operation} failed: ${error.message}. Install ImageMagick or sharp for image processing.`,
            ),
          );
        } else {
          resolve(
            this.success(`Image ${operation} completed: ${outputPath}`, {
              operation,
              outputPath,
              backend: 'imagemagick',
            }),
          );
        }
      });
    });
  }

  // ─── Utility ───────────────────────────────────────────────────────────────

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory function
// ─────────────────────────────────────────────────────────────────────────────

export function createDeveloperExtension(): ExtensionConfig {
  return {
    id: 'developer',
    type: ExtensionType.Developer,
    name: 'Developer',
    description: 'Core development tools: shell, file editing, code analysis, screen capture, and image processing',
    version: '1.0.0',
    enabled: true,
    settings: {
      allowedDirectories: [],
      blockedCommands: [],
      maxShellTimeout: 300000,
    },
    builtin: true,
    installedAt: new Date().toISOString(),
  };
}
