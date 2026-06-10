/**
 * OpenAgent-Desktop - Electron Preload Script
 *
 * This script runs in the renderer's preload context and exposes
 * a safe, controlled API to the renderer process via contextBridge.
 * It provides type-safe wrappers around IPC calls to the main process.
 */

import { contextBridge, ipcRenderer } from "electron";

// ─── Type Definitions ─────────────────────────────────────────────────────────

interface ProviderConfig {
  id?: string;
  name: string;
  type: string;
  apiKey?: string;
  baseUrl?: string;
  models?: string[];
  settings?: Record<string, unknown>;
}

interface ProviderInfo {
  id: string;
  name: string;
  type: string;
  models: string[];
  isDefault: boolean;
  configured: boolean;
}

interface ExtensionInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  enabled: boolean;
  installed: boolean;
  config?: Record<string, unknown>;
  capabilities?: string[];
}

interface SessionInfo {
  id: string;
  name: string;
  providerId: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  metadata?: Record<string, unknown>;
}

interface SessionData {
  id: string;
  name: string;
  providerId: string;
  model: string;
  messages: SessionMessage[];
  extensions: string[];
  recipes: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

interface SessionMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  toolCalls?: ToolCall[];
}

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

interface RecipeInfo {
  id: string;
  name: string;
  description: string;
  variables: RecipeVariable[];
  subRecipes: string[];
  extensions: string[];
  slashCommand?: string;
}

interface RecipeVariable {
  name: string;
  description: string;
  defaultValue?: string;
  required: boolean;
}

interface RecipeResult {
  recipeId: string;
  success: boolean;
  output: string;
  duration: number;
  subResults?: RecipeResult[];
}

interface SandboxStatus {
  running: boolean;
  type: string;
  startedAt?: string;
  health: "healthy" | "degraded" | "unhealthy" | "stopped";
  resourceUsage?: {
    cpuPercent: number;
    memoryUsedMB: number;
    memoryLimitMB: number;
    diskUsedMB: number;
    diskLimitMB: number;
  };
}

interface ExecuteResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  timedOut: boolean;
}

interface HookInfo {
  id: string;
  name: string;
  type: "PreToolUse" | "PostToolUse" | "UserPromptSubmit" | "PreSession" | "PostSession";
  command: string;
  enabled: boolean;
  conditions: HookConditions;
}

interface HookConditions {
  toolName?: string;
  extensionId?: string;
  pattern?: string;
}

interface HookResult {
  hookId: string;
  success: boolean;
  output?: string;
  deny?: boolean;
  reason?: string;
  duration: number;
}

interface ACPStatus {
  connected: boolean;
  serverUrl?: string;
  sessionId?: string;
  agentInfo?: Record<string, unknown>;
}

interface TraceEntry {
  id: string;
  sessionId: string;
  timestamp: string;
  type: "thinking" | "action" | "tool_call" | "tool_result" | "error" | "info";
  content: string;
  metadata?: Record<string, unknown>;
}

interface DroppedFile {
  path: string;
  name: string;
  size: number;
  type: string;
}

interface IPCResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── Helper: Type-safe IPC invoke wrapper ─────────────────────────────────────

async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const result: IPCResult<T> = await ipcRenderer.invoke(channel, ...args);
  if (!result.success) {
    throw new Error(result.error || `IPC call failed: ${channel}`);
  }
  return result.data as T;
}

// ─── API Object Construction ──────────────────────────────────────────────────

const electronAPI = {
  // ── Providers ──────────────────────────────────────────────────────────────

  providers: {
    list: (): Promise<ProviderInfo[]> => invoke<ProviderInfo[]>("provider:list"),

    add: (config: ProviderConfig): Promise<ProviderInfo> =>
      invoke<ProviderInfo>("provider:add", config),

    remove: (providerId: string): Promise<void> =>
      invoke<void>("provider:remove", providerId),

    test: (providerId: string): Promise<{ working: boolean; latency: number; models: string[] }> =>
      invoke<{ working: boolean; latency: number; models: string[] }>("provider:test", providerId),

    setDefault: (providerId: string, model: string): Promise<void> =>
      invoke<void>("provider:setDefault", providerId, model),
  },

  // ── Extensions ─────────────────────────────────────────────────────────────

  extensions: {
    list: (): Promise<ExtensionInfo[]> => invoke<ExtensionInfo[]>("extension:list"),

    enable: (extensionId: string): Promise<void> =>
      invoke<void>("extension:enable", extensionId),

    disable: (extensionId: string): Promise<void> =>
      invoke<void>("extension:disable", extensionId),

    install: (source: string, options?: Record<string, unknown>): Promise<ExtensionInfo> =>
      invoke<ExtensionInfo>("extension:install", source, options),

    configure: (extensionId: string, config: Record<string, unknown>): Promise<void> =>
      invoke<void>("extension:configure", extensionId, config),
  },

  // ── Sessions ───────────────────────────────────────────────────────────────

  sessions: {
    list: (): Promise<SessionInfo[]> => invoke<SessionInfo[]>("session:list"),

    create: (options?: { name?: string; providerId?: string; model?: string; templateId?: string }): Promise<SessionData> =>
      invoke<SessionData>("session:create", options),

    load: (sessionId: string): Promise<SessionData> =>
      invoke<SessionData>("session:load", sessionId),

    save: (sessionId: string, data: Partial<SessionData>): Promise<void> =>
      invoke<void>("session:save", sessionId, data),

    delete: (sessionId: string): Promise<void> =>
      invoke<void>("session:delete", sessionId),

    export: (sessionId: string, format: "json" | "markdown"): Promise<string> =>
      invoke<string>("session:export", sessionId, format),
  },

  // ── Recipes ────────────────────────────────────────────────────────────────

  recipes: {
    list: (): Promise<RecipeInfo[]> => invoke<RecipeInfo[]>("recipe:list"),

    create: (recipeData: Partial<RecipeInfo> & { prompt: string }): Promise<RecipeInfo> =>
      invoke<RecipeInfo>("recipe:create", recipeData),

    run: (recipeId: string, variables?: Record<string, string>): Promise<RecipeResult> =>
      invoke<RecipeResult>("recipe:run", recipeId, variables),

    delete: (recipeId: string): Promise<void> =>
      invoke<void>("recipe:delete", recipeId),

    import: (source: string, format?: string): Promise<RecipeInfo> =>
      invoke<RecipeInfo>("recipe:import", source, format),
  },

  // ── Sandbox ────────────────────────────────────────────────────────────────

  sandbox: {
    status: (): Promise<SandboxStatus> => invoke<SandboxStatus>("sandbox:status"),

    start: (config?: { cpuLimit?: number; memoryLimitMB?: number; diskLimitMB?: number; networkIsolation?: boolean; allowedPaths?: string[] }): Promise<void> =>
      invoke<void>("sandbox:start", config),

    stop: (): Promise<void> => invoke<void>("sandbox:stop"),

    execute: (command: string, options?: { cwd?: string; timeout?: number; env?: Record<string, string> }): Promise<ExecuteResult> =>
      invoke<ExecuteResult>("sandbox:execute", command, options),
  },

  // ── Hooks ──────────────────────────────────────────────────────────────────

  hooks: {
    list: (): Promise<HookInfo[]> => invoke<HookInfo[]>("hooks:list"),

    add: (config: Omit<HookInfo, "id">): Promise<HookInfo> =>
      invoke<HookInfo>("hooks:add", config),

    remove: (hookId: string): Promise<void> =>
      invoke<void>("hooks:remove", hookId),

    trigger: (hookType: HookInfo["type"], context: Record<string, unknown>): Promise<HookResult[]> =>
      invoke<HookResult[]>("hooks:trigger", hookType, context),
  },

  // ── ACP (Agent Client Protocol) ────────────────────────────────────────────

  acp: {
    connect: (serverUrl: string, options?: Record<string, unknown>): Promise<void> =>
      invoke<void>("acp:connect", serverUrl, options),

    disconnect: (): Promise<void> => invoke<void>("acp:disconnect"),

    status: (): Promise<ACPStatus> => invoke<ACPStatus>("acp:status"),
  },

  // ── Chat ───────────────────────────────────────────────────────────────────

  chat: {
    send: (
      sessionId: string,
      message: string,
      options?: Record<string, unknown>
    ): Promise<{ content: string; model: string; usage?: Record<string, number> }> =>
      invoke("chat:send", sessionId, message, options),

    stream: (
      sessionId: string,
      message: string,
      options?: Record<string, unknown>
    ): Promise<{ streaming: boolean }> =>
      invoke("chat:stream", sessionId, message, options),

    cancel: (sessionId: string): Promise<void> =>
      invoke<void>("chat:cancel", sessionId),
  },

  // ── Files ──────────────────────────────────────────────────────────────────

  files: {
    drop: (filePaths: string[]): Promise<DroppedFile[]> =>
      invoke<DroppedFile[]>("file:drop", filePaths),

    open: (filePath: string, options?: Record<string, unknown>): Promise<void> =>
      invoke<void>("file:open", filePath, options),
  },

  // ── Trace ──────────────────────────────────────────────────────────────────

  trace: {
    start: (sessionId: string): Promise<void> =>
      invoke<void>("trace:start", sessionId),

    stop: (sessionId: string): Promise<void> =>
      invoke<void>("trace:stop", sessionId),

    get: (
      sessionId: string,
      options?: { type?: TraceEntry["type"]; limit?: number; offset?: number }
    ): Promise<TraceEntry[]> => invoke<TraceEntry[]>("trace:get", sessionId, options),
  },

  // ── OpenCode ───────────────────────────────────────────────────────────────

  opencode: {
    init: (): Promise<Record<string, unknown>> =>
      invoke<Record<string, unknown>>("opencode:init"),

    status: (): Promise<{
      initialized: boolean;
      config?: Record<string, unknown>;
      sandboxRunning?: boolean;
      sandboxType?: string;
      activeExtensions?: number;
      totalExtensions?: number;
    }> => invoke("opencode:status"),
  },

  // ── Platform ───────────────────────────────────────────────────────────────

  platform: {
    getOS: (): NodeJS.Platform => process.platform,

    isMac: (): boolean => process.platform === "darwin",

    isWindows: (): boolean => process.platform === "win32",

    isLinux: (): boolean => process.platform === "linux",
  },

  // ── App ────────────────────────────────────────────────────────────────────

  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke("app:getVersion"),

    quit: (): Promise<void> => ipcRenderer.invoke("app:quit"),

    minimize: (): Promise<void> => ipcRenderer.invoke("window:minimize"),

    maximize: (): Promise<void> => ipcRenderer.invoke("window:maximize"),
  },

  // ── Event Listeners ────────────────────────────────────────────────────────

  on: {
    // Sandbox events
    sandboxStatusChanged: (callback: (status: SandboxStatus) => void): () => {
      const handler = (_event: Electron.IpcRendererEvent, data: SandboxStatus) => callback(data);
      ipcRenderer.on("sandbox:status-changed", handler);
      return () => ipcRenderer.removeListener("sandbox:status-changed", handler);
    },

    sandboxError: (callback: (error: { message: string }) => void): () => {
      const handler = (_event: Electron.IpcRendererEvent, data: { message: string }) => callback(data);
      ipcRenderer.on("sandbox:error", handler);
      return () => ipcRenderer.removeListener("sandbox:error", handler);
    },

    sandboxHealth: (callback: (health: Record<string, unknown>) => void): () => {
      const handler = (_event: Electron.IpcRendererEvent, data: Record<string, unknown>) => callback(data);
      ipcRenderer.on("sandbox:health", handler);
      return () => ipcRenderer.removeListener("sandbox:health", handler);
    },

    // Extension events
    extensionInstalled: (callback: (extension: ExtensionInfo) => void): () => {
      const handler = (_event: Electron.IpcRendererEvent, data: ExtensionInfo) => callback(data);
      ipcRenderer.on("extension:installed", handler);
      return () => ipcRenderer.removeListener("extension:installed", handler);
    },

    extensionUninstalled: (callback: (data: { extensionId: string }) => void): () => {
      const handler = (_event: Electron.IpcRendererEvent, data: { extensionId: string }) => callback(data);
      ipcRenderer.on("extension:uninstalled", handler);
      return () => ipcRenderer.removeListener("extension:uninstalled", handler);
    },

    extensionError: (callback: (error: { message: string }) => void): () => {
      const handler = (_event: Electron.IpcRendererEvent, data: { message: string }) => callback(data);
      ipcRenderer.on("extension:error", handler);
      return () => ipcRenderer.removeListener("extension:error", handler);
    },

    // ACP events
    acpConnected: (callback: (info: Record<string, unknown>) => void): () => {
      const handler = (_event: Electron.IpcRendererEvent, data: Record<string, unknown>) => callback(data);
      ipcRenderer.on("acp:connected", handler);
      return () => ipcRenderer.removeListener("acp:connected", handler);
    },

    acpDisconnected: (callback: () => void): () => {
      const handler = () => callback();
      ipcRenderer.on("acp:disconnected", handler);
      return () => ipcRenderer.removeListener("acp:disconnected", handler);
    },

    acpMessage: (callback: (message: Record<string, unknown>) => void): () => {
      const handler = (_event: Electron.IpcRendererEvent, data: Record<string, unknown>) => callback(data);
      ipcRenderer.on("acp:message", handler);
      return () => ipcRenderer.removeListener("acp:message", handler);
    },

    acpError: (callback: (error: { message: string }) => void): () => {
      const handler = (_event: Electron.IpcRendererEvent, data: { message: string }) => callback(data);
      ipcRenderer.on("acp:error", handler);
      return () => ipcRenderer.removeListener("acp:error", handler);
    },

    // Chat stream events
    chatStreamChunk: (callback: (data: { sessionId: string; chunk: string }) => void): () => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; chunk: string }) => callback(data);
      ipcRenderer.on("chat:stream-chunk", handler);
      return () => ipcRenderer.removeListener("chat:stream-chunk", handler);
    },

    chatStreamToolCall: (callback: (data: { sessionId: string; toolCall: Record<string, unknown> }) => void): () => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; toolCall: Record<string, unknown> }) => callback(data);
      ipcRenderer.on("chat:stream-tool-call", handler);
      return () => ipcRenderer.removeListener("chat:stream-tool-call", handler);
    },

    chatStreamToolResult: (callback: (data: { sessionId: string; toolResult: Record<string, unknown> }) => void): () => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; toolResult: Record<string, unknown> }) => callback(data);
      ipcRenderer.on("chat:stream-tool-result", handler);
      return () => ipcRenderer.removeListener("chat:stream-tool-result", handler);
    },

    chatStreamThinking: (callback: (data: { sessionId: string; thinking: string }) => void): () => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; thinking: string }) => callback(data);
      ipcRenderer.on("chat:stream-thinking", handler);
      return () => ipcRenderer.removeListener("chat:stream-thinking", handler);
    },

    chatStreamError: (callback: (data: { sessionId: string; error: string }) => void): () => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; error: string }) => callback(data);
      ipcRenderer.on("chat:stream-error", handler);
      return () => ipcRenderer.removeListener("chat:stream-error", handler);
    },

    chatStreamEnd: (callback: (data: { sessionId: string; content: string }) => void): () => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; content: string }) => callback(data);
      ipcRenderer.on("chat:stream-end", handler);
      return () => ipcRenderer.removeListener("chat:stream-end", handler);
    },

    chatStreamCancelled: (callback: (data: { sessionId: string }) => void): () => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string }) => callback(data);
      ipcRenderer.on("chat:stream-cancelled", handler);
      return () => ipcRenderer.removeListener("chat:stream-cancelled", handler);
    },

    // File events
    fileDropped: (callback: (files: DroppedFile[]) => void): () => {
      const handler = (_event: Electron.IpcRendererEvent, data: DroppedFile[]) => callback(data);
      ipcRenderer.on("file:dropped", handler);
      return () => ipcRenderer.removeListener("file:dropped", handler);
    },

    // Trace events
    traceEntry: (callback: (entry: TraceEntry) => void): () => {
      const handler = (_event: Electron.IpcRendererEvent, data: TraceEntry) => callback(data);
      ipcRenderer.on("trace:entry", handler);
      return () => ipcRenderer.removeListener("trace:entry", handler);
    },

    // Updater events
    updaterChecking: (callback: () => void): () => {
      const handler = () => callback();
      ipcRenderer.on("updater:checking", handler);
      return () => ipcRenderer.removeListener("updater:checking", handler);
    },

    updaterAvailable: (callback: (data: { version: string; releaseNotes?: string }) => void): () => {
      const handler = (_event: Electron.IpcRendererEvent, data: { version: string; releaseNotes?: string }) => callback(data);
      ipcRenderer.on("updater:available", handler);
      return () => ipcRenderer.removeListener("updater:available", handler);
    },

    updaterProgress: (callback: (data: { percent: number; transferred: number; total: number }) => void): () => {
      const handler = (_event: Electron.IpcRendererEvent, data: { percent: number; transferred: number; total: number }) => callback(data);
      ipcRenderer.on("updater:progress", handler);
      return () => ipcRenderer.removeListener("updater:progress", handler);
    },

    updaterDownloaded: (callback: (data: { version: string }) => void): () => {
      const handler = (_event: Electron.IpcRendererEvent, data: { version: string }) => callback(data);
      ipcRenderer.on("updater:downloaded", handler);
      return () => ipcRenderer.removeListener("updater:downloaded", handler);
    },

    updaterError: (callback: (data: { message: string }) => void): () => {
      const handler = (_event: Electron.IpcRendererEvent, data: { message: string }) => callback(data);
      ipcRenderer.on("updater:error", handler);
      return () => ipcRenderer.removeListener("updater:error", handler);
    },

    // App error
    appError: (callback: (data: { message: string; stack?: string }) => void): () => {
      const handler = (_event: Electron.IpcRendererEvent, data: { message: string; stack?: string }) => callback(data);
      ipcRenderer.on("app:error", handler);
      return () => ipcRenderer.removeListener("app:error", handler);
    },
  },
};

// ─── Expose API to Renderer ───────────────────────────────────────────────────

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

// Export the type for use in the renderer process
export type ElectronAPI = typeof electronAPI;
