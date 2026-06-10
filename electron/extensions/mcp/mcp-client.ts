/**
 * OpenAgent-Desktop - MCP Client
 *
 * Full-featured MCP (Model Context Protocol) client for communicating with
 * external MCP servers. Implements JSON-RPC 2.0 over stdio with:
 *
 * - Initialize handshake and capability negotiation
 * - tools/list, tools/call
 * - resources/list, resources/read
 * - prompts/list, prompts/get
 * - Sampling support (transform MCP servers into intelligent agents)
 * - MCP-UI support (render interactive UIs)
 * - MCP Elicitation (request structured info from user)
 * - MCP Roots (share working directory)
 * - Auto-reconnect on crash
 * - Request timeout and retry logic
 * - Notification handling
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import {
  MCPRequest,
  MCPResponse,
  MCPNotification,
  MCPServerCapabilities,
  MCPClientCapabilities,
  MCPInitializeResult,
  MCPTool,
  MCPResource,
  MCPResourceContent,
  MCPPrompt,
  MCPPromptMessage,
  JSONSchema,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// MCP Client configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface MCPClientConfig {
  /** Command to spawn the MCP server (e.g., "npx", "uvx", "python") */
  command: string;
  /** Arguments to pass to the command */
  args: string[];
  /** Environment variables for the spawned process */
  env?: Record<string, string>;
  /** Request timeout in milliseconds (default: 30000) */
  requestTimeout?: number;
  /** Maximum number of reconnect attempts (default: 5) */
  maxReconnectAttempts?: number;
  /** Base delay between reconnect attempts in ms (default: 1000, uses exponential backoff) */
  reconnectBaseDelay?: number;
  /** Whether to auto-reconnect on server crash (default: true) */
  autoReconnect?: boolean;
  /** Working directory for the spawned process */
  cwd?: string;
  /** Protocol version to use (default: "2024-11-05") */
  protocolVersion?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sampling types
// ─────────────────────────────────────────────────────────────────────────────

export interface SamplingMessage {
  role: 'user' | 'assistant';
  content: SamplingContent;
}

export type SamplingContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

export interface SamplingParams {
  messages: SamplingMessage[];
  maxTokens?: number;
  systemPrompt?: string;
  temperature?: number;
  stopSequences?: string[];
  modelPreferences?: {
    hints?: Array<{ name?: string; provider?: string }>;
    costPriority?: number;
    speedPriority?: number;
    intelligencePriority?: number;
  };
}

export interface SamplingResult {
  role: 'assistant';
  content: SamplingContent;
  model: string;
  stopReason?: 'endTurn' | 'stopSequence' | 'maxTokens';
}

// ─────────────────────────────────────────────────────────────────────────────
// Elicitation types
// ─────────────────────────────────────────────────────────────────────────────

export interface ElicitationRequest {
  message: string;
  requestedSchema: JSONSchema;
}

export interface ElicitationResponse {
  action: 'accept' | 'decline' | 'cancel';
  content?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP-UI types
// ─────────────────────────────────────────────────────────────────────────────

export interface MCPUIPayload {
  type: 'chart' | 'diagram' | 'table' | 'form' | 'custom';
  render: {
    library?: string;
    version?: string;
  };
  payload: Record<string, unknown>;
  interaction?: {
    events: string[];
    handler: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Roots types
// ─────────────────────────────────────────────────────────────────────────────

export interface MCPRoot {
  uri: string;
  name: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pending request tracker
// ─────────────────────────────────────────────────────────────────────────────

interface PendingRequest {
  resolve: (response: MCPResponse) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  method: string;
  createdAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Client class
// ─────────────────────────────────────────────────────────────────────────────

export class MCPClient extends EventEmitter {
  private config: MCPClientConfig;
  private process: ChildProcess | null = null;
  private pendingRequests: Map<number | string, PendingRequest> = new Map();
  private buffer: string = '';
  private nextId: number = 1;
  private connected: boolean = false;
  private initialized: boolean = false;
  private shuttingDown: boolean = false;
  private reconnectAttempts: number = 0;

  // Server info
  private serverCapabilities: MCPServerCapabilities | null = null;
  private serverInfo: { name: string; version: string } | null = null;
  private protocolVersion: string;

  // Roots
  private roots: MCPRoot[] = [];

  // Sampling handler
  private samplingHandler: ((params: SamplingParams) => Promise<SamplingResult>) | null = null;

  // Elicitation handler
  private elicitationHandler: ((request: ElicitationRequest) => Promise<ElicitationResponse>) | null = null;

  constructor(config: MCPClientConfig) {
    super();
    this.config = config;
    this.protocolVersion = config.protocolVersion || '2024-11-05';
  }

  // ─── Connection management ─────────────────────────────────────────────────

  /** Connect to the MCP server and perform initialization handshake */
  async connect(): Promise<void> {
    if (this.connected) {
      throw new Error('MCP client is already connected');
    }

    await this.spawnProcess();
    await this.performHandshake();

    this.connected = true;
    this.reconnectAttempts = 0;
    this.emit('connected', { serverInfo: this.serverInfo });
  }

  /** Disconnect from the MCP server */
  async disconnect(): Promise<void> {
    this.shuttingDown = true;
    this.connected = false;
    this.initialized = false;

    // Clear pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('MCP client disconnecting'));
    }
    this.pendingRequests.clear();

    // Kill the process
    if (this.process) {
      await this.killProcess();
    }

    this.emit('disconnected');
  }

  /** Check if the client is connected and initialized */
  isConnected(): boolean {
    return this.connected && this.initialized;
  }

  /** Get the server capabilities */
  getServerCapabilities(): MCPServerCapabilities | null {
    return this.serverCapabilities;
  }

  /** Get the server info */
  getServerInfo(): { name: string; version: string } | null {
    return this.serverInfo;
  }

  // ─── Process management ────────────────────────────────────────────────────

  private async spawnProcess(): Promise<void> {
    return new Promise((resolve, reject) => {
      const env: Record<string, string> = {
        ...(process.env as Record<string, string>),
        ...(this.config.env || {}),
      };

      this.process = spawn(this.config.command, this.config.args, {
        env,
        cwd: this.config.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });

      if (!this.process.stdin || !this.process.stdout || !this.process.stderr) {
        reject(new Error('Failed to create stdio streams for MCP server'));
        return;
      }

      this.process.on('error', (err: Error) => {
        this.emit('error', err);
        if (!this.connected) reject(err);
      });

      this.process.stdout.on('data', (data: Buffer) => {
        this.handleData(data.toString());
      });

      this.process.stderr.on('data', (data: Buffer) => {
        this.emit('stderr', data.toString());
      });

      this.process.on('exit', (code: number | null, signal: string | null) => {
        this.emit('exit', { code, signal });
        this.handleProcessExit(code, signal);
      });

      resolve();
    });
  }

  private async killProcess(): Promise<void> {
    if (!this.process) return;

    return new Promise((resolve) => {
      const proc = this.process;
      if (!proc) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL');
        }
        resolve();
      }, 5000);

      proc.on('exit', () => {
        clearTimeout(timeout);
        this.process = null;
        resolve();
      });

      proc.kill('SIGTERM');
    });
  }

  // ─── Initialization handshake ──────────────────────────────────────────────

  private async performHandshake(): Promise<void> {
    const clientCapabilities: MCPClientCapabilities = {
      roots: { listChanged: true },
      sampling: {},
      elicitation: {},
      experimental: {},
    };

    const response = await this.sendRequest('initialize', {
      protocolVersion: this.protocolVersion,
      capabilities: clientCapabilities,
      clientInfo: {
        name: 'OpenAgent-Desktop',
        version: '1.0.0',
      },
    });

    if (response.error) {
      throw new Error(`MCP initialization failed: ${response.error.message} (code: ${response.error.code})`);
    }

    const result = response.result as MCPInitializeResult;
    this.serverCapabilities = result.capabilities;
    this.serverInfo = result.serverInfo;

    // Send initialized notification
    this.sendNotification('notifications/initialized');

    this.initialized = true;
    this.emit('initialized', { serverInfo: this.serverInfo, capabilities: this.serverCapabilities });
  }

  // ─── JSON-RPC communication ────────────────────────────────────────────────

  /** Send a JSON-RPC request and wait for the response */
  async sendRequest(method: string, params?: Record<string, unknown>): Promise<MCPResponse> {
    if (!this.process?.stdin?.writable) {
      throw new Error('MCP server process is not running');
    }

    const id = this.nextId++;
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeoutMs = this.config.requestTimeout || 30000;
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP request timeout: ${method} (id=${id}, timeout=${timeoutMs}ms)`));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeout,
        method,
        createdAt: Date.now(),
      });

      const message = JSON.stringify(request) + '\n';
      this.process!.stdin!.write(message, (err) => {
        if (err) {
          clearTimeout(timeout);
          this.pendingRequests.delete(id);
          reject(new Error(`Failed to write to MCP server: ${err.message}`));
        }
      });
    });
  }

  /** Send a JSON-RPC notification (no response expected) */
  sendNotification(method: string, params?: Record<string, unknown>): void {
    if (!this.process?.stdin?.writable) return;

    const notification: MCPNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const message = JSON.stringify(notification) + '\n';
    this.process.stdin.write(message);
  }

  /** Handle incoming data from the MCP server stdout */
  private handleData(data: string): void {
    this.buffer += data;

    while (true) {
      const newlineIdx = this.buffer.indexOf('\n');
      if (newlineIdx === -1) break;

      const line = this.buffer.substring(0, newlineIdx).trim();
      this.buffer = this.buffer.substring(newlineIdx + 1);

      if (!line) continue;

      try {
        const message = JSON.parse(line);

        if ('id' in message && message.id !== null) {
          // This is a response
          this.handleResponse(message as MCPResponse);
        } else if ('method' in message) {
          // This is a notification or request from the server
          this.handleIncomingMessage(message);
        }
      } catch (err) {
        this.emit('parseError', { line, error: err });
      }
    }
  }

  /** Handle a response message */
  private handleResponse(response: MCPResponse): void {
    if (response.id === null || response.id === undefined) {
      this.emit('unexpectedResponse', response);
      return;
    }
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      this.emit('unexpectedResponse', response);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.id);
    pending.resolve(response);
  }

  /** Handle incoming notifications and requests from the server */
  private handleIncomingMessage(message: MCPNotification & { id?: number | string; params?: Record<string, unknown> }): void {
    // Server-to-client requests (have an id)
    if (message.id !== undefined && message.id !== null) {
      this.handleServerRequest({
        ...message,
        id: message.id,
      }).catch((err) => {
        this.emit('error', err);
      });
      return;
    }

    // Notifications
    switch (message.method) {
      case 'notifications/tools/list_changed':
        this.emit('toolsChanged');
        break;
      case 'notifications/resources/list_changed':
        this.emit('resourcesChanged');
        break;
      case 'notifications/prompts/list_changed':
        this.emit('promptsChanged');
        break;
      case 'notifications/progress':
        this.emit('progress', message.params);
        break;
      case 'notifications/message':
        this.emit('samplingMessage', message.params);
        break;
      default:
        this.emit('notification', message);
    }
  }

  /** Handle a request from the server (sampling, elicitation, etc.) */
  private async handleServerRequest(message: MCPNotification & { id: number | string; params?: Record<string, unknown> }): Promise<void> {
    switch (message.method) {
      case 'sampling/createMessage': {
        if (this.samplingHandler) {
          try {
            const result = await this.samplingHandler(message.params as unknown as SamplingParams);
            this.sendResponse(message.id, result);
          } catch (err) {
            this.sendError(message.id, -32603, err instanceof Error ? err.message : String(err));
          }
        } else {
          this.sendError(message.id, -32601, 'Sampling not supported by client');
        }
        break;
      }

      case 'elicitation/create': {
        if (this.elicitationHandler) {
          try {
            const result = await this.elicitationHandler(message.params as unknown as ElicitationRequest);
            this.sendResponse(message.id, result);
          } catch (err) {
            this.sendError(message.id, -32603, err instanceof Error ? err.message : String(err));
          }
        } else {
          this.sendError(message.id, -32601, 'Elicitation not supported by client');
        }
        break;
      }

      case 'roots/list': {
        this.sendResponse(message.id, { roots: this.roots });
        break;
      }

      default:
        this.sendError(message.id, -32601, `Method not found: ${message.method}`);
    }
  }

  /** Send a JSON-RPC response to a server request */
  private sendResponse(id: number | string, result: unknown): void {
    if (!this.process?.stdin?.writable) return;

    const response = {
      jsonrpc: '2.0',
      id,
      result,
    };

    this.process.stdin.write(JSON.stringify(response) + '\n');
  }

  /** Send a JSON-RPC error response */
  private sendError(id: number | string, code: number, message: string): void {
    if (!this.process?.stdin?.writable) return;

    const response = {
      jsonrpc: '2.0',
      id,
      error: { code, message },
    };

    this.process.stdin.write(JSON.stringify(response) + '\n');
  }

  // ─── Process exit handling ─────────────────────────────────────────────────

  private handleProcessExit(code: number | null, signal: string | null): void {
    this.connected = false;
    this.initialized = false;
    this.process = null;

    if (this.shuttingDown) return;

    this.emit('unexpectedExit', { code, signal });

    if (this.config.autoReconnect !== false) {
      this.attemptReconnect();
    }
  }

  private async attemptReconnect(): Promise<void> {
    const maxAttempts = this.config.maxReconnectAttempts || 5;
    if (this.reconnectAttempts >= maxAttempts) {
      this.emit('reconnectFailed', { attempts: this.reconnectAttempts });
      return;
    }

    const baseDelay = this.config.reconnectBaseDelay || 1000;
    const delay = baseDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });

    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      await this.connect();
      this.emit('reconnected', { attempt: this.reconnectAttempts });
    } catch (err) {
      this.emit('reconnectError', { attempt: this.reconnectAttempts, error: err });
      this.attemptReconnect();
    }
  }

  // ─── Tools API ─────────────────────────────────────────────────────────────

  /** List all tools available on the MCP server */
  async listTools(): Promise<MCPTool[]> {
    const response = await this.sendRequest('tools/list');
    if (response.error) {
      throw new Error(`Failed to list tools: ${response.error.message}`);
    }
    const result = response.result as { tools: MCPTool[] };
    return result.tools;
  }

  /** Call a tool on the MCP server */
  async callTool(name: string, args: Record<string, unknown>): Promise<{
    content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
    isError?: boolean;
  }> {
    const response = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });

    if (response.error) {
      throw new Error(`Tool call failed: ${response.error.message}`);
    }

    return response.result as {
      content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
      isError?: boolean;
    };
  }

  // ─── Resources API ─────────────────────────────────────────────────────────

  /** List all resources available on the MCP server */
  async listResources(): Promise<MCPResource[]> {
    if (!this.serverCapabilities?.resources) {
      throw new Error('Server does not support resources');
    }

    const response = await this.sendRequest('resources/list');
    if (response.error) {
      throw new Error(`Failed to list resources: ${response.error.message}`);
    }
    const result = response.result as { resources: MCPResource[] };
    return result.resources;
  }

  /** Read a specific resource */
  async readResource(uri: string): Promise<{ contents: MCPResourceContent[] }> {
    const response = await this.sendRequest('resources/read', { uri });
    if (response.error) {
      throw new Error(`Failed to read resource: ${response.error.message}`);
    }
    return response.result as { contents: MCPResourceContent[] };
  }

  /** Subscribe to resource updates */
  async subscribeResource(uri: string): Promise<void> {
    if (!this.serverCapabilities?.resources?.subscribe) {
      throw new Error('Server does not support resource subscriptions');
    }

    const response = await this.sendRequest('resources/subscribe', { uri });
    if (response.error) {
      throw new Error(`Failed to subscribe to resource: ${response.error.message}`);
    }
  }

  /** Unsubscribe from resource updates */
  async unsubscribeResource(uri: string): Promise<void> {
    const response = await this.sendRequest('resources/unsubscribe', { uri });
    if (response.error) {
      throw new Error(`Failed to unsubscribe from resource: ${response.error.message}`);
    }
  }

  // ─── Prompts API ───────────────────────────────────────────────────────────

  /** List all prompts available on the MCP server */
  async listPrompts(): Promise<MCPPrompt[]> {
    if (!this.serverCapabilities?.prompts) {
      throw new Error('Server does not support prompts');
    }

    const response = await this.sendRequest('prompts/list');
    if (response.error) {
      throw new Error(`Failed to list prompts: ${response.error.message}`);
    }
    const result = response.result as { prompts: MCPPrompt[] };
    return result.prompts;
  }

  /** Get a specific prompt */
  async getPrompt(name: string, args?: Record<string, string>): Promise<{
    description?: string;
    messages: MCPPromptMessage[];
  }> {
    const response = await this.sendRequest('prompts/get', {
      name,
      arguments: args,
    });
    if (response.error) {
      throw new Error(`Failed to get prompt: ${response.error.message}`);
    }
    return response.result as { description?: string; messages: MCPPromptMessage[] };
  }

  // ─── Sampling API ──────────────────────────────────────────────────────────

  /** Set the sampling handler — called when the MCP server requests LLM sampling */
  setSamplingHandler(handler: (params: SamplingParams) => Promise<SamplingResult>): void {
    this.samplingHandler = handler;
  }

  // ─── Elicitation API ───────────────────────────────────────────────────────

  /** Set the elicitation handler — called when the MCP server needs user input */
  setElicitationHandler(handler: (request: ElicitationRequest) => Promise<ElicitationResponse>): void {
    this.elicitationHandler = handler;
  }

  // ─── Roots API ─────────────────────────────────────────────────────────────

  /** Set the roots (working directories) shared with the MCP server */
  setRoots(roots: MCPRoot[]): void {
    this.roots = roots;
    // Notify the server if roots have changed
    if (this.connected && this.initialized) {
      this.sendNotification('notifications/roots/list_changed');
    }
  }

  /** Add a root */
  addRoot(root: MCPRoot): void {
    this.roots.push(root);
    if (this.connected && this.initialized) {
      this.sendNotification('notifications/roots/list_changed');
    }
  }

  /** Remove a root by URI */
  removeRoot(uri: string): void {
    this.roots = this.roots.filter((r) => r.uri !== uri);
    if (this.connected && this.initialized) {
      this.sendNotification('notifications/roots/list_changed');
    }
  }

  // ─── Logging ───────────────────────────────────────────────────────────────

  /** Set the logging level on the MCP server */
  async setLoggingLevel(level: 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency'): Promise<void> {
    const response = await this.sendRequest('logging/setLevel', { level });
    if (response.error) {
      throw new Error(`Failed to set logging level: ${response.error.message}`);
    }
  }

  // ─── Completion ────────────────────────────────────────────────────────────

  /** Request completion suggestions for a prompt argument */
  async complete(ref: { type: 'ref/prompt'; name: string } | { type: 'ref/resource'; uri: string }, argument: { name: string; value: string }): Promise<{
    values: string[];
    total?: number;
    hasMore?: boolean;
  }> {
    const response = await this.sendRequest('completion/complete', { ref, argument });
    if (response.error) {
      throw new Error(`Completion failed: ${response.error.message}`);
    }
    return response.result as { values: string[]; total?: number; hasMore?: boolean };
  }

  // ─── Ping ──────────────────────────────────────────────────────────────────

  /** Ping the MCP server to check if it's alive */
  async ping(): Promise<{ latencyMs: number }> {
    const start = Date.now();
    const response = await this.sendRequest('ping');
    if (response.error) {
      throw new Error(`Ping failed: ${response.error.message}`);
    }
    return { latencyMs: Date.now() - start };
  }

  // ─── Utility ───────────────────────────────────────────────────────────────

  /** Get pending request count */
  getPendingRequestCount(): number {
    return this.pendingRequests.size;
  }

  /** Get connection stats */
  getStats(): {
    connected: boolean;
    initialized: boolean;
    serverName: string | null;
    serverVersion: string | null;
    pendingRequests: number;
    reconnectAttempts: number;
  } {
    return {
      connected: this.connected,
      initialized: this.initialized,
      serverName: this.serverInfo?.name ?? null,
      serverVersion: this.serverInfo?.version ?? null,
      pendingRequests: this.pendingRequests.size,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}
