/**
 * OpenAgent-Desktop - Base Extension
 *
 * Abstract base class implementing ExtensionInterface with:
 * - Lifecycle management (initialize, shutdown)
 * - Tool registration and dispatch
 * - MCP server communication (spawn process, JSON-RPC over stdio)
 * - Health checking and auto-restart
 * - Permission management
 * - Settings management
 * - Error handling and logging
 * - Status tracking
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import {
  ExtensionConfig,
  ExtensionInterface,
  ExtensionStatus,
  ToolDefinition,
  ToolResult,
  Permission,
  PermissionLevel,
  HealthCheckResult,
  MCPRequest,
  MCPResponse,
  MCPNotification,
  MCPServerCapabilities,
  MCPClientCapabilities,
  MCPInitializeResult,
  MCPTool,
  JSONSchema,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Logger — simple structured logger for extensions
// ─────────────────────────────────────────────────────────────────────────────

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  extensionId: string;
  message: string;
  data?: unknown;
}

export class ExtensionLogger {
  private extensionId: string;
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;
  private listeners: Array<(entry: LogEntry) => void> = [];

  constructor(extensionId: string) {
    this.extensionId = extensionId;
  }

  private log(level: LogEntry['level'], message: string, data?: unknown): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      extensionId: this.extensionId,
      message,
      data,
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // swallow listener errors
      }
    }
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.log('error', message, data);
  }

  getLogs(level?: LogEntry['level']): LogEntry[] {
    if (level) {
      return this.logs.filter((l) => l.level === level);
    }
    return [...this.logs];
  }

  onLog(listener: (entry: LogEntry) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Transport — handles JSON-RPC 2.0 over stdio
// ─────────────────────────────────────────────────────────────────────────────

interface PendingRequest {
  resolve: (response: MCPResponse) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class MCPTransport extends EventEmitter {
  private process: ChildProcess | null = null;
  private pendingRequests: Map<number | string, PendingRequest> = new Map();
  private buffer: string = '';
  private nextId: number = 1;
  private requestTimeoutMs: number;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelayMs: number = 1000;
  private shuttingDown: boolean = false;
  private command: string;
  private args: string[];
  private env: Record<string, string>;

  constructor(
    command: string,
    args: string[],
    env: Record<string, string>,
    requestTimeoutMs: number = 30000,
  ) {
    super();
    this.command = command;
    this.args = args;
    this.env = env;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  /** Spawn the MCP server process */
  async start(): Promise<void> {
    if (this.process) {
      throw new Error('MCP transport already started');
    }

    return new Promise((resolve, reject) => {
      const fullEnv: Record<string, string> = {
        ...process.env as Record<string, string>,
        ...this.env,
      };

      this.process = spawn(this.command, this.args, {
        env: fullEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });

      if (!this.process.stdin || !this.process.stdout || !this.process.stderr) {
        reject(new Error('Failed to create stdio streams for MCP server'));
        return;
      }

      this.process.on('error', (err: Error) => {
        this.emit('error', err);
        reject(err);
      });

      this.process.stdout.on('data', (data: Buffer) => {
        this.handleData(data.toString());
      });

      this.process.stderr.on('data', (data: Buffer) => {
        this.emit('stderr', data.toString());
      });

      this.process.on('exit', (code: number | null, signal: string | null) => {
        this.emit('exit', { code, signal });
        if (!this.shuttingDown) {
          this.handleUnexpectedExit(code, signal);
        }
      });

      resolve();
    });
  }

  /** Send a JSON-RPC request and wait for response */
  async sendRequest(method: string, params?: Record<string, unknown>): Promise<MCPResponse> {
    const id = this.nextId++;
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP request timeout: ${method} (id=${id})`));
      }, this.requestTimeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      const message = JSON.stringify(request) + '\n';
      if (!this.process?.stdin?.writable) {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(new Error('MCP server stdin not writable'));
        return;
      }

      this.process.stdin.write(message, (err) => {
        if (err) {
          clearTimeout(timeout);
          this.pendingRequests.delete(id);
          reject(new Error(`Failed to write to MCP server stdin: ${err.message}`));
        }
      });
    });
  }

  /** Send a JSON-RPC notification (no response expected) */
  sendNotification(method: string, params?: Record<string, unknown>): void {
    const notification: MCPNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const message = JSON.stringify(notification) + '\n';
    if (this.process?.stdin?.writable) {
      this.process.stdin.write(message);
    }
  }

  /** Handle incoming data from MCP server stdout */
  private handleData(data: string): void {
    this.buffer += data;

    while (true) {
      const newlineIdx = this.buffer.indexOf('\n');
      if (newlineIdx === -1) break;

      const line = this.buffer.substring(0, newlineIdx).trim();
      this.buffer = this.buffer.substring(newlineIdx + 1);

      if (!line) continue;

      try {
        const message = JSON.parse(line) as MCPResponse | MCPNotification;

        if ('id' in message && message.id !== null) {
          // This is a response
          const pending = this.pendingRequests.get(message.id);
          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(message.id);
            pending.resolve(message);
          }
        } else if ('method' in message) {
          // This is a notification from the server
          this.emit('notification', message);
        }
      } catch (err) {
        this.emit('parseError', { line, error: err });
      }
    }
  }

  /** Handle unexpected process exit — attempt reconnect */
  private handleUnexpectedExit(code: number | null, signal: string | null): void {
    this.process = null;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('reconnectFailed', { attempts: this.reconnectAttempts });
      return;
    }

    const delay = this.reconnectDelayMs * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    setTimeout(async () => {
      try {
        await this.start();
        this.reconnectAttempts = 0;
        this.emit('reconnected', { attempt: this.reconnectAttempts });
      } catch (err) {
        this.emit('reconnectError', { error: err, attempt: this.reconnectAttempts });
        this.handleUnexpectedExit(code, signal);
      }
    }, delay);
  }

  /** Gracefully stop the MCP server */
  async stop(): Promise<void> {
    this.shuttingDown = true;

    // Clear all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('MCP transport shutting down'));
    }
    this.pendingRequests.clear();

    if (this.process) {
      return new Promise((resolve) => {
        if (!this.process) {
          resolve();
          return;
        }

        const timeout = setTimeout(() => {
          if (this.process) {
            this.process.kill('SIGKILL');
          }
          resolve();
        }, 5000);

        this.process.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.process.kill('SIGTERM');
      });
    }
  }

  /** Check if the transport is connected */
  isConnected(): boolean {
    return this.process !== null && !this.process.killed;
  }

  /** Get the child process (for testing) */
  getProcess(): ChildProcess | null {
    return this.process;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Base Extension — abstract class all extensions extend
// ─────────────────────────────────────────────────────────────────────────────

export abstract class BaseExtension implements ExtensionInterface {
  id: string;
  config: ExtensionConfig;

  protected status: ExtensionStatus = 'uninitialized';
  protected tools: Map<string, ToolDefinition> = new Map();
  protected toolHandlers: Map<string, (args: Record<string, unknown>) => Promise<ToolResult>> = new Map();
  protected logger: ExtensionLogger;
  protected eventEmitter: EventEmitter = new EventEmitter();
  protected mcpTransport: MCPTransport | null = null;
  protected mcpCapabilities: MCPServerCapabilities | null = null;
  protected mcpServerInfo: { name: string; version: string } | null = null;
  protected permissions: Permission[] = [];
  protected healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  protected healthCheckIntervalMs: number = 60000;
  protected lastHealthCheck: HealthCheckResult | null = null;
  protected autoRestart: boolean = true;
  protected maxRestartAttempts: number = 3;
  protected restartAttempts: number = 0;
  protected initialized: boolean = false;
  protected shutdownRequested: boolean = false;

  constructor(config: ExtensionConfig) {
    this.id = config.id;
    this.config = config;
    this.logger = new ExtensionLogger(config.id);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.status === 'initializing' || this.status === 'ready') {
      this.logger.warn('Extension already initialized or initializing', { status: this.status });
      return;
    }

    this.setStatus('initializing');
    this.logger.info('Initializing extension');

    try {
      // Register tools defined by the subclass
      this.registerTools();

      // If extension has an MCP server, start it and perform handshake
      if (this.config.mcpServer) {
        await this.connectMCPServer();
      }

      // Let subclass perform custom initialization
      await this.onInitialize();

      // Start health monitoring
      this.startHealthMonitoring();

      this.initialized = true;
      this.restartAttempts = 0;
      this.setStatus('ready');
      this.logger.info('Extension initialized successfully');
    } catch (err) {
      this.logger.error('Failed to initialize extension', err);
      this.setStatus('error');
      throw err;
    }
  }

  async shutdown(): Promise<void> {
    if (this.status === 'shutdown' || this.status === 'uninitialized') {
      return;
    }

    this.shutdownRequested = true;
    this.logger.info('Shutting down extension');

    try {
      // Stop health monitoring
      this.stopHealthMonitoring();

      // Let subclass perform custom shutdown
      await this.onShutdown();

      // Disconnect MCP server
      if (this.mcpTransport) {
        await this.mcpTransport.stop();
        this.mcpTransport = null;
      }

      // Clear tool registrations
      this.tools.clear();
      this.toolHandlers.clear();

      this.initialized = false;
      this.setStatus('shutdown');
      this.logger.info('Extension shut down successfully');
    } catch (err) {
      this.logger.error('Error during shutdown', err);
      this.setStatus('error');
      throw err;
    }
  }

  // ─── Tool registration ─────────────────────────────────────────────────────

  /** Register a tool with its definition and handler */
  protected registerTool(
    definition: ToolDefinition,
    handler: (args: Record<string, unknown>) => Promise<ToolResult>,
  ): void {
    this.tools.set(definition.name, definition);
    this.toolHandlers.set(definition.name, handler);
    this.logger.debug(`Registered tool: ${definition.name}`);
  }

  /** Called during initialize() — subclass defines tools here */
  protected abstract registerTools(): void;

  /** List all tools exposed by this extension */
  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /** Execute a tool by name */
  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (this.status !== 'ready') {
      return {
        content: `Extension "${this.config.name}" is not ready (status: ${this.status})`,
        isError: true,
        metadata: { extensionStatus: this.status },
      };
    }

    const definition = this.tools.get(name);
    if (!definition) {
      return {
        content: `Tool "${name}" not found in extension "${this.config.name}"`,
        isError: true,
        metadata: { availableTools: Array.from(this.tools.keys()) },
      };
    }

    const handler = this.toolHandlers.get(name);
    if (!handler) {
      return {
        content: `No handler registered for tool "${name}"`,
        isError: true,
      };
    }

    // Validate parameters against schema
    const validationError = this.validateParameters(definition, args);
    if (validationError) {
      return {
        content: validationError,
        isError: true,
        metadata: { toolName: name, providedArgs: args },
      };
    }

    // Check permissions
    const permissionError = await this.checkPermissions(name, args);
    if (permissionError) {
      return {
        content: permissionError,
        isError: true,
        metadata: { toolName: name, permissionDenied: true },
      };
    }

    const startTime = Date.now();
    try {
      this.logger.debug(`Executing tool: ${name}`, args);
      const result = await handler(args);
      const durationMs = Date.now() - startTime;

      this.logger.debug(`Tool completed: ${name} (${durationMs}ms)`);
      this.emit('tool:completed', { toolName: name, durationMs, isError: result.isError });

      return {
        ...result,
        metadata: {
          ...result.metadata,
          durationMs,
          extensionId: this.id,
          toolName: name,
        },
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);

      this.logger.error(`Tool execution error: ${name}`, err);
      this.emit('tool:error', { toolName: name, durationMs, error: errorMessage });

      return {
        content: `Tool "${name}" execution failed: ${errorMessage}`,
        isError: true,
        metadata: { durationMs, extensionId: this.id, toolName: name },
      };
    }
  }

  // ─── Parameter validation ──────────────────────────────────────────────────

  /** Validate tool parameters against the JSON Schema definition */
  protected validateParameters(definition: ToolDefinition, args: Record<string, unknown>): string | null {
    const schema = definition.parameters;
    const required = schema.required || [];
    const properties = schema.properties || {};

    // Check required parameters
    for (const req of required) {
      if (!(req in args) || args[req] === undefined || args[req] === null) {
        return `Missing required parameter "${req}" for tool "${definition.name}"`;
      }
    }

    // Check types of provided parameters
    for (const [key, value] of Object.entries(args)) {
      const propSchema = properties[key];
      if (!propSchema) {
        // Extra parameters are allowed if additionalProperties is not false
        if (schema.additionalProperties === false) {
          return `Unknown parameter "${key}" for tool "${definition.name}"`;
        }
        continue;
      }

      const typeError = this.validateType(key, value, propSchema, definition.name);
      if (typeError) return typeError;
    }

    return null;
  }

  /** Validate a single parameter value against its schema */
  protected validateType(
    key: string,
    value: unknown,
    schema: JSONSchema,
    toolName: string,
  ): string | null {
    if (value === undefined || value === null) {
      if (schema.default !== undefined) return null;
      return null; // null values are handled by required check
    }

    const expectedType = schema.type;
    if (!expectedType) return null;

    const actualType = this.getJsonType(value);
    if (actualType !== expectedType) {
      // Allow integer as number
      if (expectedType === 'number' && actualType === 'integer') return null;
      return `Parameter "${key}" must be of type "${expectedType}", got "${actualType}" for tool "${toolName}"`;
    }

    // Validate enum
    if (schema.enum && !schema.enum.includes(value as string)) {
      return `Parameter "${key}" must be one of: ${schema.enum.join(', ')} for tool "${toolName}"`;
    }

    // Validate string constraints
    if (typeof value === 'string') {
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        return `Parameter "${key}" must be at least ${schema.minLength} characters for tool "${toolName}"`;
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        return `Parameter "${key}" must be at most ${schema.maxLength} characters for tool "${toolName}"`;
      }
      if (schema.pattern) {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(value)) {
          return `Parameter "${key}" must match pattern "${schema.pattern}" for tool "${toolName}"`;
        }
      }
    }

    // Validate number constraints
    if (typeof value === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) {
        return `Parameter "${key}" must be at least ${schema.minimum} for tool "${toolName}"`;
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        return `Parameter "${key}" must be at most ${schema.maximum} for tool "${toolName}"`;
      }
    }

    return null;
  }

  /** Map a JS value to its JSON Schema type name */
  protected getJsonType(value: unknown): string {
    if (value === null) return 'null';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'integer' : 'number';
    }
    if (typeof value === 'string') return 'string';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return 'unknown';
  }

  // ─── Permission management ─────────────────────────────────────────────────

  /** Set the permissions required by this extension */
  protected setPermissions(permissions: Permission[]): void {
    this.permissions = permissions;
  }

  /** Check if a tool call is permitted */
  protected async checkPermissions(
    _toolName: string,
    _args: Record<string, unknown>,
  ): Promise<string | null> {
    // Base implementation — subclasses can override for custom permission checks
    // In a full implementation, this would integrate with the app's permission system
    // and potentially prompt the user for elevated permissions
    return null;
  }

  /** Get the permissions required by this extension */
  getPermissions(): Permission[] {
    return [...this.permissions];
  }

  /** Check if the extension has a specific permission level */
  hasPermission(level: PermissionLevel): boolean {
    return this.permissions.some((p) => {
      const levels = [PermissionLevel.None, PermissionLevel.Read, PermissionLevel.Write, PermissionLevel.Admin];
      return levels.indexOf(p.level) >= levels.indexOf(level);
    });
  }

  // ─── Settings management ───────────────────────────────────────────────────

  /** Update a setting value */
  updateSetting(key: string, value: unknown): void {
    this.config.settings[key] = value;
    this.logger.info(`Setting updated: ${key}`);
    this.emit('setting:updated', { key, value });
  }

  /** Get a setting value */
  getSetting<T = unknown>(key: string, defaultValue?: T): T {
    if (key in this.config.settings) {
      return this.config.settings[key] as T;
    }
    return defaultValue as T;
  }

  /** Get all settings */
  getSettings(): Record<string, unknown> {
    return { ...this.config.settings };
  }

  /** Update multiple settings at once */
  updateSettings(settings: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(settings)) {
      this.config.settings[key] = value;
    }
    this.logger.info('Settings updated', settings);
    this.emit('settings:updated', settings);
  }

  // ─── MCP server communication ──────────────────────────────────────────────

  /** Connect to the MCP server and perform initialization handshake */
  protected async connectMCPServer(): Promise<void> {
    if (!this.config.mcpServer) {
      throw new Error('No MCP server configuration provided');
    }

    const { command, args, env } = this.config.mcpServer;

    this.mcpTransport = new MCPTransport(command, args, env);
    this.mcpTransport.on('error', (err: Error) => {
      this.logger.error('MCP transport error', err);
      this.handleMCPError(err);
    });

    this.mcpTransport.on('exit', (info: { code: number | null; signal: string | null }) => {
      this.logger.warn('MCP server process exited', info);
    });

    this.mcpTransport.on('notification', (notification: MCPNotification) => {
      this.handleMCPNotification(notification);
    });

    await this.mcpTransport.start();

    // Perform MCP initialize handshake
    const clientCapabilities: MCPClientCapabilities = {
      roots: { listChanged: true },
      sampling: {},
      elicitation: {},
    };

    const response = await this.mcpTransport.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: clientCapabilities,
      clientInfo: {
        name: 'OpenAgent-Desktop',
        version: '1.0.0',
      },
    });

    if (response.error) {
      throw new Error(`MCP initialization failed: ${response.error.message}`);
    }

    const initResult = response.result as MCPInitializeResult;
    this.mcpCapabilities = initResult.capabilities;
    this.mcpServerInfo = initResult.serverInfo;

    // Send initialized notification
    this.mcpTransport.sendNotification('notifications/initialized');

    this.logger.info('MCP server connected', {
      serverName: this.mcpServerInfo.name,
      serverVersion: this.mcpServerInfo.version,
      capabilities: Object.keys(this.mcpCapabilities),
    });

    // Load tools from MCP server
    await this.loadMCPTools();
  }

  /** Load tools from the connected MCP server */
  protected async loadMCPTools(): Promise<void> {
    if (!this.mcpTransport || !this.mcpCapabilities?.tools) {
      return;
    }

    const response = await this.mcpTransport.sendRequest('tools/list');

    if (response.error) {
      this.logger.error('Failed to list MCP tools', response.error);
      return;
    }

    const result = response.result as { tools: MCPTool[] };
    for (const tool of result.tools) {
      const definition: ToolDefinition = {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.inputSchema,
      };

      // Register MCP tool with a handler that proxies to the MCP server
      this.tools.set(tool.name, definition);
      this.toolHandlers.set(tool.name, async (args: Record<string, unknown>) => {
        return this.callMCPTool(tool.name, args);
      });

      this.logger.debug(`Loaded MCP tool: ${tool.name}`);
    }
  }

  /** Call a tool on the MCP server */
  protected async callMCPTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.mcpTransport) {
      return {
        content: 'MCP server not connected',
        isError: true,
      };
    }

    const response = await this.mcpTransport.sendRequest('tools/call', {
      name,
      arguments: args,
    });

    if (response.error) {
      return {
        content: `MCP tool error: ${response.error.message}`,
        isError: true,
        metadata: { code: response.error.code, data: response.error.data },
      };
    }

    const result = response.result as { content: Array<{ type: string; text?: string; data?: string }>; isError?: boolean };
    const textContent = result.content
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text)
      .join('\n');

    return {
      content: textContent,
      isError: result.isError ?? false,
      metadata: { rawResult: result },
    };
  }

  /** Handle MCP notification */
  protected handleMCPNotification(notification: MCPNotification): void {
    this.logger.debug('MCP notification received', notification);

    switch (notification.method) {
      case 'notifications/tools/list_changed':
        // Reload tools when the MCP server signals a change
        this.loadMCPTools().catch((err) => {
          this.logger.error('Failed to reload MCP tools after change notification', err);
        });
        break;
      case 'notifications/resources/list_changed':
        this.emit('resources:changed', notification.params);
        break;
      case 'notifications/prompts/list_changed':
        this.emit('prompts:changed', notification.params);
        break;
      default:
        this.logger.debug(`Unhandled MCP notification: ${notification.method}`);
    }
  }

  /** Handle MCP transport error */
  protected handleMCPError(err: Error): void {
    this.logger.error('MCP error occurred', err);
    this.setStatus('error');
    this.emit('error', err);

    if (this.autoRestart && this.restartAttempts < this.maxRestartAttempts) {
      this.attemptRestart();
    }
  }

  /** Attempt to restart the MCP server connection */
  protected async attemptRestart(): Promise<void> {
    this.restartAttempts++;
    this.logger.info(`Attempting restart (${this.restartAttempts}/${this.maxRestartAttempts})`);

    try {
      if (this.mcpTransport) {
        await this.mcpTransport.stop();
        this.mcpTransport = null;
      }

      this.mcpCapabilities = null;
      this.mcpServerInfo = null;

      // Clear MCP-registered tools (keep built-in ones)
      for (const [name, definition] of this.tools) {
        // If the tool handler was registered by the MCP loader, remove it
        // Built-in tools are registered in registerTools() so they won't be removed
        if (!this.isBuiltinTool(name)) {
          this.tools.delete(name);
          this.toolHandlers.delete(name);
        }
      }

      if (this.config.mcpServer) {
        await this.connectMCPServer();
      }

      this.restartAttempts = 0;
      this.setStatus('ready');
      this.logger.info('Restart successful');
    } catch (err) {
      this.logger.error('Restart attempt failed', err);
      if (this.restartAttempts >= this.maxRestartAttempts) {
        this.logger.error('Max restart attempts reached, giving up');
        this.setStatus('error');
      }
    }
  }

  /** Check if a tool is a built-in (registered in registerTools) vs MCP-loaded */
  protected isBuiltinTool(name: string): boolean {
    // Subclasses should override this if they have both built-in and MCP tools
    return true;
  }

  // ─── MCP Resource support ──────────────────────────────────────────────────

  /** List resources available from the MCP server */
  async listMCPResources(): Promise<Array<{ uri: string; name: string; description?: string; mimeType?: string }>> {
    if (!this.mcpTransport || !this.mcpCapabilities?.resources) {
      return [];
    }

    const response = await this.mcpTransport.sendRequest('resources/list');
    if (response.error) {
      this.logger.error('Failed to list MCP resources', response.error);
      return [];
    }

    const result = response.result as { resources: Array<{ uri: string; name: string; description?: string; mimeType?: string }> };
    return result.resources;
  }

  /** Read a specific resource from the MCP server */
  async readMCPResource(uri: string): Promise<{ contents: Array<{ uri: string; mimeType?: string; text?: string; blob?: string }> }> {
    if (!this.mcpTransport) {
      throw new Error('MCP server not connected');
    }

    const response = await this.mcpTransport.sendRequest('resources/read', { uri });
    if (response.error) {
      throw new Error(`Failed to read MCP resource: ${response.error.message}`);
    }

    return response.result as { contents: Array<{ uri: string; mimeType?: string; text?: string; blob?: string }> };
  }

  // ─── MCP Prompt support ────────────────────────────────────────────────────

  /** List prompts available from the MCP server */
  async listMCPPrompts(): Promise<Array<{ name: string; description?: string; arguments?: Array<{ name: string; description?: string; required?: boolean }> }>> {
    if (!this.mcpTransport || !this.mcpCapabilities?.prompts) {
      return [];
    }

    const response = await this.mcpTransport.sendRequest('prompts/list');
    if (response.error) {
      this.logger.error('Failed to list MCP prompts', response.error);
      return [];
    }

    const result = response.result as { prompts: Array<{ name: string; description?: string; arguments?: Array<{ name: string; description?: string; required?: boolean }> }> };
    return result.prompts;
  }

  /** Get a specific prompt from the MCP server */
  async getMCPPrompt(name: string, args?: Record<string, string>): Promise<{ messages: Array<{ role: string; content: { type: string; text?: string } }> }> {
    if (!this.mcpTransport) {
      throw new Error('MCP server not connected');
    }

    const response = await this.mcpTransport.sendRequest('prompts/get', { name, arguments: args });
    if (response.error) {
      throw new Error(`Failed to get MCP prompt: ${response.error.message}`);
    }

    return response.result as { messages: Array<{ role: string; content: { type: string; text?: string } }> };
  }

  // ─── MCP Sampling support ──────────────────────────────────────────────────

  /** Request sampling from the LLM via the MCP server */
  async requestMCPSampling(params: {
    messages: Array<{ role: 'user' | 'assistant'; content: { type: string; text?: string } }>;
    maxTokens?: number;
    systemPrompt?: string;
    temperature?: number;
  }): Promise<{ role: string; content: { type: string; text: string }; model: string }> {
    if (!this.mcpTransport || !this.mcpCapabilities?.sampling) {
      throw new Error('MCP server does not support sampling');
    }

    const response = await this.mcpTransport.sendRequest('sampling/createMessage', params);
    if (response.error) {
      throw new Error(`MCP sampling failed: ${response.error.message}`);
    }

    return response.result as { role: string; content: { type: string; text: string }; model: string };
  }

  // ─── Health monitoring ─────────────────────────────────────────────────────

  /** Start periodic health checking */
  protected startHealthMonitoring(): void {
    this.stopHealthMonitoring();
    this.healthCheckInterval = setInterval(async () => {
      try {
        const result = await this.performHealthCheck();
        this.lastHealthCheck = result;
        this.emit('health:check', result);

        if (!result.healthy && this.autoRestart && this.status === 'ready') {
          this.logger.warn('Health check failed, attempting restart', result);
          await this.attemptRestart();
        }
      } catch (err) {
        this.logger.error('Health check error', err);
      }
    }, this.healthCheckIntervalMs);
  }

  /** Stop health monitoring */
  protected stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /** Perform a health check */
  protected async performHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      if (this.config.mcpServer && this.mcpTransport) {
        if (!this.mcpTransport.isConnected()) {
          return {
            healthy: false,
            latencyMs: Date.now() - startTime,
            error: 'MCP server not connected',
            timestamp: new Date().toISOString(),
          };
        }

        // Ping the MCP server with a tools/list request
        const response = await this.mcpTransport.sendRequest('tools/list');
        if (response.error) {
          return {
            healthy: false,
            latencyMs: Date.now() - startTime,
            error: `MCP server error: ${response.error.message}`,
            timestamp: new Date().toISOString(),
          };
        }
      }

      // Custom health check from subclass
      await this.onHealthCheck();

      return {
        healthy: true,
        latencyMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      };
    }
  }

  /** Get the last health check result */
  getLastHealthCheck(): HealthCheckResult | null {
    return this.lastHealthCheck;
  }

  // ─── Status tracking ───────────────────────────────────────────────────────

  /** Get the current status */
  getStatus(): ExtensionStatus {
    return this.status;
  }

  /** Update the extension status and emit event */
  protected setStatus(status: ExtensionStatus): void {
    const oldStatus = this.status;
    this.status = status;
    if (oldStatus !== status) {
      this.logger.info(`Status changed: ${oldStatus} → ${status}`);
      this.emit('status:changed', { oldStatus, newStatus: status });
    }
  }

  /** Check if the extension is ready */
  isReady(): boolean {
    return this.status === 'ready';
  }

  /** Check if the extension is enabled */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  // ─── Event handling ────────────────────────────────────────────────────────

  /** Emit an event */
  protected emit(event: string, data?: unknown): boolean {
    return this.eventEmitter.emit(event, data);
  }

  /** Subscribe to an event */
  on(event: string, listener: (...args: unknown[]) => void): this {
    this.eventEmitter.on(event, listener);
    return this;
  }

  /** Subscribe to an event once */
  once(event: string, listener: (...args: unknown[]) => void): this {
    this.eventEmitter.once(event, listener);
    return this;
  }

  /** Unsubscribe from an event */
  off(event: string, listener: (...args: unknown[]) => void): this {
    this.eventEmitter.off(event, listener);
    return this;
  }

  // ─── Hooks for subclass customization ──────────────────────────────────────

  /** Called during initialization after tools are registered and MCP is connected */
  protected async onInitialize(): Promise<void> {
    // Override in subclass for custom initialization
  }

  /** Called during shutdown before MCP disconnection */
  protected async onShutdown(): Promise<void> {
    // Override in subclass for custom shutdown
  }

  /** Called during health check — subclass can add custom checks */
  protected async onHealthCheck(): Promise<void> {
    // Override in subclass for custom health checks
  }

  // ─── Utility ───────────────────────────────────────────────────────────────

  /** Create a success ToolResult */
  protected success(content: string, metadata?: Record<string, unknown>): ToolResult {
    return { content, isError: false, metadata };
  }

  /** Create an error ToolResult */
  protected error(content: string, metadata?: Record<string, unknown>): ToolResult {
    return { content, isError: true, metadata };
  }

  /** Get the extension logger */
  getLogger(): ExtensionLogger {
    return this.logger;
  }

  /** Get extension metadata for UI display */
  getMetadata(): {
    id: string;
    name: string;
    description: string;
    version: string;
    status: ExtensionStatus;
    toolCount: number;
    builtin: boolean;
    enabled: boolean;
    lastHealthCheck: HealthCheckResult | null;
    permissions: Permission[];
  } {
    return {
      id: this.id,
      name: this.config.name,
      description: this.config.description,
      version: this.config.version,
      status: this.status,
      toolCount: this.tools.size,
      builtin: this.config.builtin,
      enabled: this.config.enabled,
      lastHealthCheck: this.lastHealthCheck,
      permissions: this.permissions,
    };
  }
}
