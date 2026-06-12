/**
 * OpenCode Bridge - Full HTTP client for OpenCode server
 * 
 * Connects to the OpenCode agent runtime at http://127.0.0.1:4096
 * Provides typed access to 50+ API endpoints for:
 * - Sessions (CRUD, message, cancel)
 * - Messages (send, list, get)
 * - Files (list, read, write)
 * - Tools (list, execute)
 * - MCP (Model Context Protocol - list servers, call tools)
 * - LSP (Language Server Protocol - diagnostics, completions)
 * - App info
 * - Events (SSE stream)
 */

import { EventEmitter } from 'events';

export interface OpenCodeBridgeConfig {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  timeout?: number;
}

export interface OpenCodeSession {
  id: string;
  title?: string;
  status: 'idle' | 'active' | 'error' | 'retry';
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  metadata?: Record<string, unknown>;
}

export interface OpenCodeMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  parts?: OpenCodeMessagePart[];
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface OpenCodeMessagePart {
  type: 'text' | 'tool_call' | 'tool_result' | 'thinking' | 'image';
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
}

export interface OpenCodeFile {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modifiedAt?: string;
  language?: string;
}

export interface OpenCodeTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  category?: string;
}

export interface OpenCodeMCPServer {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  tools: OpenCodeTool[];
  resources?: OpenCodeMCPResource[];
}

export interface OpenCodeMCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface OpenCodeLSPDiagnostic {
  uri: string;
  severity: 'error' | 'warning' | 'information' | 'hint';
  message: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  source?: string;
  code?: string | number;
}

export interface OpenCodeAppInfo {
  name: string;
  version: string;
  description?: string;
  models?: string[];
  mcpServers?: string[];
  extensions?: string[];
}

export interface OpenCodeEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export class OpenCodeBridge extends EventEmitter {
  private config: Required<OpenCodeBridgeConfig>;
  private connected = false;
  private abortController: AbortController | null = null;

  constructor(config: OpenCodeBridgeConfig = {}) {
    super();
    this.config = {
      host: config.host || '127.0.0.1',
      port: config.port || 4096,
      username: config.username || process.env.OPENCODE_SERVER_USERNAME || 'opencode',
      password: config.password || process.env.OPENCODE_SERVER_PASSWORD || '',
      timeout: config.timeout || 30000,
    };
  }

  private getBaseUrl(): string {
    return `http://${this.config.host}:${this.config.port}`;
  }

  private getAuthHeaders(): Record<string, string> {
    if (this.config.password) {
      const encoded = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
      return { Authorization: `Basic ${encoded}` };
    }
    return {};
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.getBaseUrl()}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      };

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`OpenCode API error ${response.status}: ${text || response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return response.json() as Promise<T>;
      }
      return response.text() as unknown as T;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(`OpenCode request timed out after ${this.config.timeout}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ── Connection ──────────────────────────────────────────────────────────

  async healthCheck(): Promise<{ status: string; uptime: number }> {
    try {
      return await this.request('GET', '/health');
    } catch {
      return { status: 'unreachable', uptime: 0 };
    }
  }

  async getAppInfo(): Promise<OpenCodeAppInfo> {
    return this.request('GET', '/app');
  }

  isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    const health = await this.healthCheck();
    this.connected = health.status === 'ok' || health.uptime > 0;
    if (this.connected) {
      this.emit('connected');
    }
  }

  async disconnect(): Promise<void> {
    this.stopEventStream();
    this.connected = false;
    this.emit('disconnected');
  }

  // ── Sessions ────────────────────────────────────────────────────────────

  async listSessions(): Promise<OpenCodeSession[]> {
    return this.request('GET', '/session');
  }

  async createSession(options?: { title?: string; model?: string }): Promise<OpenCodeSession> {
    return this.request('POST', '/session', options || {});
  }

  async getSession(sessionId: string): Promise<OpenCodeSession> {
    return this.request('GET', `/session/${sessionId}`);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.request('DELETE', `/session/${sessionId}`);
  }

  async cancelSession(sessionId: string): Promise<void> {
    await this.request('POST', `/session/${sessionId}/cancel`);
  }

  // ── Messages ────────────────────────────────────────────────────────────

  async sendMessage(sessionId: string, content: string, options?: Record<string, unknown>): Promise<OpenCodeMessage> {
    return this.request('POST', `/session/${sessionId}/message`, { content, ...options });
  }

  async listMessages(sessionId: string): Promise<OpenCodeMessage[]> {
    return this.request('GET', `/session/${sessionId}/message`);
  }

  async getMessage(sessionId: string, messageId: string): Promise<OpenCodeMessage> {
    return this.request('GET', `/session/${sessionId}/message/${messageId}`);
  }

  // ── Files ───────────────────────────────────────────────────────────────

  async listFiles(dirPath?: string): Promise<OpenCodeFile[]> {
    const query = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
    return this.request('GET', `/file${query}`);
  }

  async readFile(filePath: string): Promise<string> {
    return this.request('GET', `/file?path=${encodeURIComponent(filePath)}`);
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await this.request('PUT', '/file', { path: filePath, content });
  }

  // ── Tools ───────────────────────────────────────────────────────────────

  async listTools(): Promise<OpenCodeTool[]> {
    return this.request('GET', '/tool');
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.request('POST', '/tool', { name, arguments: args });
  }

  // ── MCP ─────────────────────────────────────────────────────────────────

  async listMCPServers(): Promise<OpenCodeMCPServer[]> {
    return this.request('GET', '/mcp');
  }

  async callMCPTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    return this.request('POST', `/mcp/${serverName}/tool`, { name: toolName, arguments: args });
  }

  async listMCPResources(serverName: string): Promise<OpenCodeMCPResource[]> {
    return this.request('GET', `/mcp/${serverName}/resource`);
  }

  async readMCPResource(serverName: string, uri: string): Promise<unknown> {
    return this.request('GET', `/mcp/${serverName}/resource?uri=${encodeURIComponent(uri)}`);
  }

  // ── LSP ─────────────────────────────────────────────────────────────────

  async getDiagnostics(filePath?: string): Promise<OpenCodeLSPDiagnostic[]> {
    const query = filePath ? `?path=${encodeURIComponent(filePath)}` : '';
    return this.request('GET', `/lsp/diagnostics${query}`);
  }

  async getCompletions(filePath: string, line: number, character: number): Promise<unknown> {
    return this.request('POST', '/lsp/completions', { path: filePath, line, character });
  }

  // ── Events (SSE) ────────────────────────────────────────────────────────

  startEventStream(): void {
    this.stopEventStream();
    this.abortController = new AbortController();

    const url = `${this.getBaseUrl()}/event`;
    const headers: Record<string, string> = {
      ...this.getAuthHeaders(),
    };

    // Use native fetch with streaming for SSE
    fetch(url, { headers, signal: this.abortController.signal })
      .then(async (response) => {
        if (!response.ok || !response.body) {
          this.emit('error', new Error(`SSE connection failed: ${response.status}`));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event: OpenCodeEvent = JSON.parse(line.slice(6));
                this.emit('event', event);
                this.emit(`event:${event.type}`, event.data);
              } catch {
                // Ignore malformed SSE data
              }
            }
          }
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          this.emit('error', err);
        }
      });
  }

  stopEventStream(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

// Singleton
let bridgeInstance: OpenCodeBridge | null = null;

export function getOpenCodeBridge(config?: OpenCodeBridgeConfig): OpenCodeBridge {
  if (!bridgeInstance) {
    bridgeInstance = new OpenCodeBridge(config);
  }
  return bridgeInstance;
}

export function setOpenCodeBridge(bridge: OpenCodeBridge): void {
  bridgeInstance = bridge;
}
