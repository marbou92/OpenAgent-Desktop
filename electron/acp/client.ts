/**
 * OpenAgent-Desktop - ACP (Agent Client Protocol) Client
 *
 * Implements the Agent Client Protocol for connecting to
 * ACP-compliant agent servers (such as Claude ACP, Codex ACP, etc.).
 *
 * ACP enables OpenAgent-Desktop to:
 * - Connect to external ACP-compliant agent servers
 * - Manage sessions via ACP
 * - Stream responses from ACP agents
 * - Pass extensions as MCP servers to ACP agents
 * - Handle tool calls and results via ACP
 *
 * Transport: HTTP/WebSocket
 * Message Types: create_session, send_message, stream_response,
 *                tool_call, tool_result, cancel
 */

import { EventEmitter } from "events";
import * as http from "http";
import * as https from "https";
import * as crypto from "crypto";
import { URL } from "url";

// ─── Type Definitions ─────────────────────────────────────────────────────────

export interface ACPConnectionOptions {
  serverUrl: string;
  apiKey?: string;
  headers?: Record<string, string>;
  timeout?: number;
  extensionsAsMCP?: boolean;
}

export interface ACPSessionOptions {
  model?: string;
  systemPrompt?: string;
  extensions?: string[];
  tools?: ACPTool[];
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
}

export interface ACPSession {
  id: string;
  serverUrl: string;
  model?: string;
  createdAt: string;
  status: "active" | "closed" | "error";
  metadata?: Record<string, unknown>;
}

export interface ACPMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  toolCalls?: ACPToolCall[];
  metadata?: Record<string, unknown>;
}

export interface ACPToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: "pending" | "completed" | "failed";
}

export interface ACPToolResult {
  toolCallId: string;
  content: unknown;
  isError: boolean;
}

export interface ACPTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler?: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface ACPStreamChunk {
  sessionId: string;
  type: "text" | "tool_call" | "tool_result" | "thinking" | "error" | "done";
  content?: string;
  toolCall?: ACPToolCall;
  toolResult?: ACPToolResult;
  thinking?: string;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ACPStatus {
  connected: boolean;
  serverUrl?: string;
  sessions: ACPSession[];
  agentInfo?: ACPAgentInfo;
}

export interface ACPAgentInfo {
  name: string;
  version: string;
  capabilities: string[];
  models: string[];
  protocols: string[];
}

export interface ACPClientOptions {
  traceCollector?: any;
  extensionRegistry?: any;
  sandboxManager?: any;
  defaultTimeout?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

// ─── ACP Protocol Message Types ───────────────────────────────────────────────

interface ACPRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

interface ACPResponse {
  jsonrpc: "2.0";
  id: string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface ACPNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACP_PROTOCOL_VERSION = "1.0.0";
const DEFAULT_TIMEOUT = 60000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
const WS_RECONNECT_DELAY_MS = 3000;

// ─── ACPClient ────────────────────────────────────────────────────────────────

export class ACPClient extends EventEmitter {
  private traceCollector?: any;
  private extensionRegistry?: any;
  private sandboxManager?: any;
  private defaultTimeout: number;
  private maxRetries: number;
  private retryDelayMs: number;

  private connected = false;
  private serverUrl?: string;
  private apiKey?: string;
  private customHeaders: Record<string, string> = {};
  private agentInfo?: ACPAgentInfo;

  private sessions: Map<string, ACPSession> = new Map();
  private localTools: Map<string, ACPTool> = new Map();
  private pendingRequests: Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason: unknown) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  > = new Map();

  private ws: any = null; // WebSocket instance
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private shouldReconnect = false;

  private initialized = false;

  constructor(options: ACPClientOptions) {
    super();

    this.traceCollector = options.traceCollector;
    this.extensionRegistry = options.extensionRegistry;
    this.sandboxManager = options.sandboxManager;
    this.defaultTimeout = options.defaultTimeout || DEFAULT_TIMEOUT;
    this.maxRetries = options.maxRetries || DEFAULT_MAX_RETRIES;
    this.retryDelayMs = options.retryDelayMs || DEFAULT_RETRY_DELAY_MS;
  }

  // ─── Initialization ──────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Register built-in tools
    this.registerBuiltInTools();

    this.initialized = true;
    console.info("[ACPClient] Initialized");
  }

  // ─── Connection Management ───────────────────────────────────────────────

  /**
   * Connect to an ACP-compliant agent server
   */
  async connect(
    serverUrl: string,
    options?: Record<string, unknown>
  ): Promise<void> {
    this.ensureInitialized();

    if (this.connected) {
      await this.disconnect();
    }

    this.serverUrl = serverUrl;
    this.apiKey = (options?.apiKey as string) || undefined;
    this.customHeaders = (options?.headers as Record<string, string>) || {};
    this.shouldReconnect = true;

    try {
      // First, perform HTTP handshake to get agent info
      const info = await this.handshake();
      this.agentInfo = info;

      // Then establish WebSocket connection for streaming
      await this.connectWebSocket();

      this.connected = true;
      this.reconnectAttempts = 0;

      this.emit("connected", {
        serverUrl,
        agentInfo: this.agentInfo,
      });

      await this.traceCollector?.addEntry("system", {
        type: "info",
        content: `ACP connected to ${serverUrl}`,
        metadata: { serverUrl, agentInfo: this.agentInfo },
      });

      // If extensions should be passed as MCP servers, register them
      if (options?.extensionsAsMCP && this.extensionRegistry) {
        await this.registerExtensionsAsMCP();
      }
    } catch (err: any) {
      this.connected = false;

      await this.traceCollector?.addEntry("system", {
        type: "error",
        content: `ACP connection failed: ${err.message}`,
        metadata: { serverUrl },
      });

      this.emit("error", err);
      throw err;
    }
  }

  /**
   * Disconnect from the ACP server
   */
  async disconnect(): Promise<void> {
    this.shouldReconnect = false;

    // Cancel reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Close all sessions
    for (const [sessionId, _session] of this.sessions) {
      try {
        await this.closeACPSession(sessionId);
      } catch {
        // Ignore errors during cleanup
      }
    }
    this.sessions.clear();

    // Close WebSocket
    if (this.ws) {
      try {
        this.ws.close(1000, "Client disconnecting");
      } catch {
        // Ignore
      }
      this.ws = null;
    }

    // Cancel pending requests
    for (const [_id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Connection closed"));
    }
    this.pendingRequests.clear();

    this.connected = false;
    this.serverUrl = undefined;

    this.emit("disconnected");

    await this.traceCollector?.addEntry("system", {
      type: "info",
      content: "ACP disconnected",
      metadata: {},
    });
  }

  /**
   * Get the current ACP connection status
   */
  getStatus(): ACPStatus {
    return {
      connected: this.connected,
      serverUrl: this.serverUrl,
      sessions: Array.from(this.sessions.values()),
      agentInfo: this.agentInfo,
    };
  }

  // ─── Session Management ──────────────────────────────────────────────────

  /**
   * Create a new ACP session
   */
  async createSession(options?: ACPSessionOptions): Promise<ACPSession> {
    this.ensureConnected();

    const sessionId = crypto.randomUUID();

    const request: ACPRequest = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "acp/create_session",
      params: {
        sessionId,
        model: options?.model,
        systemPrompt: options?.systemPrompt,
        extensions: options?.extensions,
        tools: options?.tools?.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        metadata: options?.metadata,
      },
    };

    try {
      const result = (await this.sendRequest(request)) as Record<string, unknown>;

      const session: ACPSession = {
        id: sessionId,
        serverUrl: this.serverUrl!,
        model: options?.model,
        createdAt: new Date().toISOString(),
        status: "active",
        metadata: result.metadata as Record<string, unknown>,
      };

      this.sessions.set(sessionId, session);

      await this.traceCollector?.addEntry("system", {
        type: "info",
        content: `ACP session created: ${sessionId}`,
        metadata: { sessionId, model: options?.model },
      });

      return session;
    } catch (err: any) {
      await this.traceCollector?.addEntry("system", {
        type: "error",
        content: `ACP session creation failed: ${err.message}`,
        metadata: { sessionId },
      });
      throw err;
    }
  }

  /**
   * Close an ACP session
   */
  async closeACPSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const request: ACPRequest = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "acp/close_session",
      params: { sessionId },
    };

    try {
      await this.sendRequest(request);
    } catch (err) {
      // Best effort close
      console.warn(`[ACPClient] Error closing session ${sessionId}:`, err);
    }

    session.status = "closed";
    this.sessions.delete(sessionId);
  }

  // ─── Messaging ───────────────────────────────────────────────────────────

  /**
   * Send a message to an ACP session (non-streaming)
   */
  async sendMessage(
    sessionId: string,
    message: string,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<ACPMessage> {
    this.ensureConnected();

    const request: ACPRequest = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "acp/send_message",
      params: {
        sessionId,
        message,
        model: options?.model,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
      },
    };

    try {
      const result = (await this.sendRequest(request)) as Record<string, unknown>;

      const responseMessage: ACPMessage = {
        id: (result.messageId as string) || crypto.randomUUID(),
        sessionId,
        role: "assistant",
        content: (result.content as string) || "",
        timestamp: new Date().toISOString(),
        toolCalls: result.toolCalls as ACPToolCall[],
        metadata: result.metadata as Record<string, unknown>,
      };

      await this.traceCollector?.addEntry(sessionId, {
        type: "info",
        content: `ACP message sent and response received`,
        metadata: {
          sessionId,
          messageLength: message.length,
          responseLength: responseMessage.content.length,
          toolCallCount: responseMessage.toolCalls?.length || 0,
        },
      });

      return responseMessage;
    } catch (err: any) {
      await this.traceCollector?.addEntry(sessionId, {
        type: "error",
        content: `ACP send_message failed: ${err.message}`,
        metadata: { sessionId },
      });
      throw err;
    }
  }

  /**
   * Stream a response from an ACP session
   * Returns an EventEmitter that emits stream chunks
   */
  async streamMessage(
    sessionId: string,
    message: string,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<EventEmitter> {
    this.ensureConnected();

    const stream = new EventEmitter();

    const request: ACPRequest = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "acp/stream_message",
      params: {
        sessionId,
        message,
        stream: true,
        model: options?.model,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
      },
    };

    // For streaming, we use the WebSocket to receive chunks
    const requestId = request.id;

    // Set up a listener for stream chunks related to this request
    const chunkHandler = (notification: ACPNotification) => {
      if (
        notification.method === "acp/stream_chunk" &&
        (notification.params?.requestId as string) === requestId
      ) {
        const params = notification.params as Record<string, unknown>;
        const chunk: ACPStreamChunk = {
          sessionId: params.sessionId as string,
          type: params.type as ACPStreamChunk["type"],
          content: params.content as string,
          toolCall: params.toolCall as ACPToolCall,
          toolResult: params.toolResult as ACPToolResult,
          thinking: params.thinking as string,
          error: params.error as string,
          usage: params.usage as { promptTokens: number; completionTokens: number; totalTokens: number },
        };

        stream.emit("chunk", chunk);

        // Handle specific chunk types
        switch (chunk.type) {
          case "text":
            stream.emit("data", chunk.content || "");
            break;
          case "tool_call":
            stream.emit("tool_call", chunk.toolCall);
            break;
          case "tool_result":
            stream.emit("tool_result", chunk.toolResult);
            break;
          case "thinking":
            stream.emit("thinking", chunk.thinking || "");
            break;
          case "error":
            stream.emit("error", new Error(chunk.error || "Stream error"));
            break;
          case "done":
            stream.emit("end", chunk.content || "");
            // Remove the listener
            this.removeListener("ws:notification", chunkHandler);
            break;
        }
      }
    };

    this.on("ws:notification", chunkHandler);

    // Send the stream request via WebSocket
    try {
      if (this.ws && this.ws.readyState === 1 /* OPEN */) {
        this.ws.send(JSON.stringify(request));
      } else {
        // Fallback to HTTP with SSE-like polling
        this.streamViaHTTP(requestId, sessionId, message, options, stream);
      }
    } catch (err: any) {
      stream.emit("error", err);
      this.removeListener("ws:notification", chunkHandler);
    }

    return stream;
  }

  /**
   * Cancel an ongoing stream
   */
  async cancelStream(sessionId: string, requestId?: string): Promise<void> {
    const request: ACPRequest = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "acp/cancel",
      params: {
        sessionId,
        requestId,
      },
    };

    try {
      if (this.ws && this.ws.readyState === 1) {
        this.ws.send(JSON.stringify(request));
      } else {
        await this.sendHTTPRequest(request);
      }
    } catch (err) {
      console.warn("[ACPClient] Error cancelling stream:", err);
    }
  }

  // ─── Tool Handling ───────────────────────────────────────────────────────

  /**
   * Register a local tool that the ACP agent can call
   */
  registerTool(tool: ACPTool): void {
    this.localTools.set(tool.name, tool);
  }

  /**
   * Unregister a local tool
   */
  unregisterTool(toolName: string): void {
    this.localTools.delete(toolName);
  }

  /**
   * Handle a tool call from the ACP agent
   */
  private async handleToolCall(
    sessionId: string,
    toolCall: ACPToolCall
  ): Promise<ACPToolResult> {
    const tool = this.localTools.get(toolCall.name);

    if (!tool) {
      return {
        toolCallId: toolCall.id,
        content: `Unknown tool: ${toolCall.name}`,
        isError: true,
      };
    }

    try {
      // Execute the tool handler
      let result: unknown;

      if (tool.handler) {
        result = await tool.handler(toolCall.arguments);
      } else if (this.sandboxManager) {
        // Execute as a sandbox command if no handler
        const command = this.buildToolCommand(tool.name, toolCall.arguments);
        const execResult = await this.sandboxManager.execute(command);
        result = execResult.stdout;
        if (execResult.exitCode !== 0) {
          return {
            toolCallId: toolCall.id,
            content: execResult.stderr || `Tool exited with code ${execResult.exitCode}`,
            isError: true,
          };
        }
      } else {
        return {
          toolCallId: toolCall.id,
          content: `No handler for tool: ${toolCall.name}`,
          isError: true,
        };
      }

      await this.traceCollector?.addEntry(sessionId, {
        type: "tool_result",
        content: `Tool ${toolCall.name} completed`,
        metadata: {
          toolName: toolCall.name,
          toolCallId: toolCall.id,
          success: true,
        },
      });

      return {
        toolCallId: toolCall.id,
        content: result,
        isError: false,
      };
    } catch (err: any) {
      await this.traceCollector?.addEntry(sessionId, {
        type: "error",
        content: `Tool ${toolCall.name} failed: ${err.message}`,
        metadata: {
          toolName: toolCall.name,
          toolCallId: toolCall.id,
          error: err.message,
        },
      });

      return {
        toolCallId: toolCall.id,
        content: err.message,
        isError: true,
      };
    }
  }

  /**
   * Send a tool result back to the ACP agent
   */
  async sendToolResult(
    sessionId: string,
    toolResult: ACPToolResult
  ): Promise<void> {
    this.ensureConnected();

    const request: ACPRequest = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "acp/tool_result",
      params: {
        sessionId,
        toolCallId: toolResult.toolCallId,
        content: toolResult.content,
        isError: toolResult.isError,
      },
    };

    try {
      if (this.ws && this.ws.readyState === 1) {
        this.ws.send(JSON.stringify(request));
      } else {
        await this.sendHTTPRequest(request);
      }
    } catch (err) {
      console.error("[ACPClient] Error sending tool result:", err);
      throw err;
    }
  }

  // ─── HTTP Transport ──────────────────────────────────────────────────────

  /**
   * Perform initial HTTP handshake with the ACP server
   */
  private async handshake(): Promise<ACPAgentInfo> {
    const request: ACPRequest = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "acp/handshake",
      params: {
        protocolVersion: ACP_PROTOCOL_VERSION,
        clientName: "OpenAgent-Desktop",
        clientVersion: "1.0.0",
        capabilities: ["streaming", "tools", "sessions"],
      },
    };

    const result = (await this.sendHTTPRequest(request)) as Record<string, unknown>;

    return {
      name: (result.agentName as string) || "Unknown ACP Agent",
      version: (result.agentVersion as string) || "0.0.0",
      capabilities: (result.capabilities as string[]) || [],
      models: (result.models as string[]) || [],
      protocols: (result.protocols as string[]) || [ACP_PROTOCOL_VERSION],
    };
  }

  /**
   * Send an HTTP request to the ACP server
   */
  private sendHTTPRequest(request: ACPRequest): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.serverUrl) {
        reject(new Error("Not connected to ACP server"));
        return;
      }

      const url = new URL(this.serverUrl);
      const postData = JSON.stringify(request);

      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + (url.pathname.endsWith("/") ? "rpc" : "/rpc"),
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
          "User-Agent": "OpenAgent-Desktop/1.0.0",
          ...this.authHeaders(),
          ...this.customHeaders,
        },
        timeout: this.defaultTimeout,
      };

      const requestModule = url.protocol === "https:" ? https : http;

      const req = requestModule.request(options, (res) => {
        let body = "";

        res.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });

        res.on("end", () => {
          try {
            const response: ACPResponse = JSON.parse(body);

            if (response.error) {
              reject(
                new Error(
                  `ACP error ${response.error.code}: ${response.error.message}`
                )
              );
              return;
            }

            resolve(response.result);
          } catch (err) {
            reject(new Error(`Invalid ACP response: ${body.substring(0, 500)}`));
          }
        });
      });

      req.on("error", (err) => {
        reject(new Error(`ACP HTTP error: ${err.message}`));
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error("ACP request timed out"));
      });

      req.write(postData);
      req.end();
    });
  }

  // ─── WebSocket Transport ─────────────────────────────────────────────────

  /**
   * Establish WebSocket connection for streaming
   */
  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.serverUrl) {
        reject(new Error("Server URL not set"));
        return;
      }

      // Convert HTTP URL to WS URL
      const wsUrl = this.serverUrl
        .replace("https://", "wss://")
        .replace("http://", "ws://");

      try {
        // Dynamic import of ws module
        const WebSocket = require("ws");

        this.ws = new WebSocket(wsUrl, {
          headers: {
            ...this.authHeaders(),
            ...this.customHeaders,
          },
        });

        this.ws.on("open", () => {
          console.info("[ACPClient] WebSocket connected");
          resolve();
        });

        this.ws.on("message", (data: Buffer) => {
          this.handleWebSocketMessage(data);
        });

        this.ws.on("close", (code: number, reason: Buffer) => {
          console.info(`[ACPClient] WebSocket closed: ${code} ${reason.toString()}`);
          this.handleWebSocketClose(code, reason.toString());
        });

        this.ws.on("error", (err: Error) => {
          console.error("[ACPClient] WebSocket error:", err);
          this.emit("error", err);
          reject(err);
        });

        // Timeout for connection
        setTimeout(() => {
          if (this.ws && this.ws.readyState !== 1) {
            reject(new Error("WebSocket connection timeout"));
          }
        }, 10000);
      } catch (err) {
        // ws module not available, fall back to HTTP-only mode
        console.warn("[ACPClient] WebSocket module not available, using HTTP-only mode");
        resolve();
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleWebSocketMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());

      // Handle responses to our requests
      if (message.id && this.pendingRequests.has(message.id)) {
        const pending = this.pendingRequests.get(message.id)!;
        clearTimeout(pending.timer);
        this.pendingRequests.delete(message.id);

        if (message.error) {
          pending.reject(
            new Error(`ACP error ${message.error.code}: ${message.error.message}`)
          );
        } else {
          pending.resolve(message.result);
        }
        return;
      }

      // Handle notifications (streaming chunks, tool calls, etc.)
      if (message.method) {
        const notification: ACPNotification = {
          jsonrpc: "2.0",
          method: message.method,
          params: message.params,
        };

        // Handle specific notification types
        switch (message.method) {
          case "acp/stream_chunk":
            this.emit("ws:notification", notification);
            break;

          case "acp/tool_call":
            this.handleRemoteToolCall(notification);
            break;

          case "acp/session_closed":
            this.handleSessionClosed(notification);
            break;

          default:
            this.emit("ws:notification", notification);
            this.emit("message", notification);
        }
      }
    } catch (err) {
      console.error("[ACPClient] Error parsing WebSocket message:", err);
    }
  }

  /**
   * Handle WebSocket close event
   */
  private handleWebSocketClose(code: number, reason: string): void {
    this.connected = false;

    // Cancel all pending requests
    for (const [_id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`Connection closed: ${reason}`));
    }
    this.pendingRequests.clear();

    // Attempt reconnection
    if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.info(
        `[ACPClient] Attempting reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
      );

      this.reconnectTimer = setTimeout(async () => {
        try {
          await this.connectWebSocket();
          this.connected = true;
          this.reconnectAttempts = 0;
          this.emit("connected", { serverUrl: this.serverUrl, agentInfo: this.agentInfo });
        } catch {
          this.handleWebSocketClose(code, "Reconnection failed");
        }
      }, WS_RECONNECT_DELAY_MS * this.reconnectAttempts);
    }
  }

  /**
   * Send a request via WebSocket or HTTP
   */
  private async sendRequest(request: ACPRequest): Promise<unknown> {
    // If WebSocket is available, use it
    if (this.ws && this.ws.readyState === 1) {
      return this.sendWSRequest(request);
    }

    // Fall back to HTTP
    return this.sendHTTPRequest(request);
  }

  /**
   * Send a request via WebSocket
   */
  private sendWSRequest(request: ACPRequest): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new Error("Request timed out"));
      }, this.defaultTimeout);

      this.pendingRequests.set(request.id, { resolve, reject, timer });

      try {
        this.ws.send(JSON.stringify(request));
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(request.id);
        reject(err);
      }
    });
  }

  /**
   * Stream via HTTP (fallback when WebSocket is not available)
   */
  private async streamViaHTTP(
    requestId: string,
    sessionId: string,
    message: string,
    options: Record<string, unknown> | undefined,
    stream: EventEmitter
  ): Promise<void> {
    try {
      // Send the initial request
      const result = await this.sendMessage(sessionId, message, options as any);

      // Simulate streaming by emitting the full response
      stream.emit("data", result.content);
      stream.emit("end", result.content);

      if (result.toolCalls && result.toolCalls.length > 0) {
        for (const tc of result.toolCalls) {
          stream.emit("tool_call", tc);
        }
      }
    } catch (err: any) {
      stream.emit("error", err);
    }
  }

  // ─── Remote Tool Call Handling ───────────────────────────────────────────

  private async handleRemoteToolCall(notification: ACPNotification): Promise<void> {
    const params = notification.params as Record<string, unknown>;
    const sessionId = params.sessionId as string;
    const toolCall = params.toolCall as ACPToolCall;

    if (!toolCall) return;

    await this.traceCollector?.addEntry(sessionId, {
      type: "tool_call",
      content: `ACP tool call: ${toolCall.name}`,
      metadata: {
        toolName: toolCall.name,
        toolCallId: toolCall.id,
        arguments: toolCall.arguments,
      },
    });

    // Handle the tool call
    const result = await this.handleToolCall(sessionId, toolCall);

    // Send the result back
    await this.sendToolResult(sessionId, result);
  }

  private handleSessionClosed(notification: ACPNotification): void {
    const params = notification.params as Record<string, unknown>;
    const sessionId = params.sessionId as string;

    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = "closed";
      this.sessions.delete(sessionId);
    }
  }

  // ─── Extension Integration ───────────────────────────────────────────────

  /**
   * Register all enabled extensions as MCP servers with the ACP agent
   */
  private async registerExtensionsAsMCP(): Promise<void> {
    if (!this.extensionRegistry) return;

    try {
      const extensions = await this.extensionRegistry.list();
      const enabledExtensions = extensions.filter((e: any) => e.enabled);

      for (const extension of enabledExtensions) {
        try {
          // Get MCP server configuration from the extension
          const mcpConfig = extension.mcpConfig || {
            name: extension.name,
            description: extension.description,
            tools: extension.capabilities || [],
          };

          const request: ACPRequest = {
            jsonrpc: "2.0",
            id: crypto.randomUUID(),
            method: "acp/register_mcp_server",
            params: {
              sessionId: this.sessions.keys().next().value,
              mcpServer: mcpConfig,
            },
          };

          await this.sendRequest(request);
        } catch (err) {
          console.warn(
            `[ACPClient] Failed to register extension ${extension.name} as MCP:`,
            err
          );
        }
      }
    } catch (err) {
      console.warn("[ACPClient] Failed to register extensions as MCP:", err);
    }
  }

  // ─── Built-in Tools ─────────────────────────────────────────────────────

  private registerBuiltInTools(): void {
    // Read file tool
    this.registerTool({
      name: "read_file",
      description: "Read the contents of a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the file" },
        },
        required: ["path"],
      },
      handler: async (args) => {
        if (!this.sandboxManager) {
          throw new Error("Sandbox not available");
        }
        const content = await this.sandboxManager.getFile(args.path as string);
        return content.toString("utf-8");
      },
    });

    // Write file tool
    this.registerTool({
      name: "write_file",
      description: "Write content to a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the file" },
          content: { type: "string", description: "Content to write" },
        },
        required: ["path", "content"],
      },
      handler: async (args) => {
        if (!this.sandboxManager) {
          throw new Error("Sandbox not available");
        }
        await this.sandboxManager.putFile(
          args.path as string,
          Buffer.from(args.content as string, "utf-8")
        );
        return "File written successfully";
      },
    });

    // Execute command tool
    this.registerTool({
      name: "execute_command",
      description: "Execute a shell command in the sandbox",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Command to execute" },
          cwd: { type: "string", description: "Working directory" },
          timeout: { type: "number", description: "Timeout in milliseconds" },
        },
        required: ["command"],
      },
      handler: async (args) => {
        if (!this.sandboxManager) {
          throw new Error("Sandbox not available");
        }
        const result = await this.sandboxManager.execute(
          args.command as string,
          {
            cwd: args.cwd as string,
            timeout: args.timeout as number,
          }
        );
        return {
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        };
      },
    });

    // List files tool
    this.registerTool({
      name: "list_files",
      description: "List files in a directory",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path" },
        },
        required: ["path"],
      },
      handler: async (args) => {
        if (!this.sandboxManager) {
          throw new Error("Sandbox not available");
        }
        const files = await this.sandboxManager.listFiles(args.path as string);
        return files.map((f: any) => ({
          name: f.name,
          path: f.path,
          isDirectory: f.isDirectory,
          size: f.size,
        }));
      },
    });
  }

  // ─── Utility Methods ─────────────────────────────────────────────────────

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private buildToolCommand(
    toolName: string,
    args: Record<string, unknown>
  ): string {
    // Build a shell command from a tool name and arguments
    const argsStr = Object.entries(args)
      .map(([key, value]) => {
        const strValue =
          typeof value === "string" ? value : JSON.stringify(value);
        return `--${key} "${strValue.replace(/"/g, '\\"')}"`;
      })
      .join(" ");

    return `${toolName} ${argsStr}`;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("ACPClient is not initialized. Call initialize() first.");
    }
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error("Not connected to ACP server. Call connect() first.");
    }
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    await this.disconnect();
    this.localTools.clear();
    this.initialized = false;
    console.info("[ACPClient] Shut down");
  }
}
