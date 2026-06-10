

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
    sandboxStatusChanged: (callback: (status: SandboxStatus) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: SandboxStatus) => callback(data);
      ipcRenderer.on("sandbox:status-changed", handler);
      return () => ipcRenderer.removeListener("sandbox:status-changed", handler);
    },

    sandboxError: (callback: (error: { message: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { message: string }) => callback(data);
      ipcRenderer.on("sandbox:error", handler);
      return () => ipcRenderer.removeListener("sandbox:error", handler);
    },

    sandboxHealth: (callback: (health: Record<string, unknown>) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: Record<string, unknown>) => callback(data);
      ipcRenderer.on("sandbox:health", handler);
      return () => ipcRenderer.removeListener("sandbox:health", handler);
    },

    // Extension events
    extensionInstalled: (callback: (extension: ExtensionInfo) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: ExtensionInfo) => callback(data);
      ipcRenderer.on("extension:installed", handler);
      return () => ipcRenderer.removeListener("extension:installed", handler);
    },

    extensionUninstalled: (callback: (data: { extensionId: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { extensionId: string }) => callback(data);
      ipcRenderer.on("extension:uninstalled", handler);
      return () => ipcRenderer.removeListener("extension:uninstalled", handler);
    },

    extensionError: (callback: (error: { message: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { message: string }) => callback(data);
      ipcRenderer.on("extension:error", handler);
      return () => ipcRenderer.removeListener("extension:error", handler);
    },

    // ACP events
    acpConnected: (callback: (info: Record<string, unknown>) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: Record<string, unknown>) => callback(data);
      ipcRenderer.on("acp:connected", handler);
      return () => ipcRenderer.removeListener("acp:connected", handler);
    },

    acpDisconnected: (callback: () => void): (() => void) => {
      const handler = () => callback();
      ipcRenderer.on("acp:disconnected", handler);
      return () => ipcRenderer.removeListener("acp:disconnected", handler);
    },

    acpMessage: (callback: (message: Record<string, unknown>) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: Record<string, unknown>) => callback(data);
      ipcRenderer.on("acp:message", handler);
      return () => ipcRenderer.removeListener("acp:message", handler);
    },

    acpError: (callback: (error: { message: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { message: string }) => callback(data);
      ipcRenderer.on("acp:error", handler);
      return () => ipcRenderer.removeListener("acp:error", handler);
    },

    // Chat stream events
    chatStreamChunk: (callback: (data: { sessionId: string; chunk: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; chunk: string }) => callback(data);
      ipcRenderer.on("chat:stream-chunk", handler);
      return () => ipcRenderer.removeListener("chat:stream-chunk", handler);
    },

    chatStreamToolCall: (callback: (data: { sessionId: string; toolCall: Record<string, unknown> }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; toolCall: Record<string, unknown> }) => callback(data);
      ipcRenderer.on("chat:stream-tool-call", handler);
      return () => ipcRenderer.removeListener("chat:stream-tool-call", handler);
    },

    chatStreamToolResult: (callback: (data: { sessionId: string; toolResult: Record<string, unknown> }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; toolResult: Record<string, unknown> }) => callback(data);
      ipcRenderer.on("chat:stream-tool-result", handler);
      return () => ipcRenderer.removeListener("chat:stream-tool-result", handler);
    },

    chatStreamThinking: (callback: (data: { sessionId: string; thinking: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; thinking: string }) => callback(data);
      ipcRenderer.on("chat:stream-thinking", handler);
      return () => ipcRenderer.removeListener("chat:stream-thinking", handler);
    },

    chatStreamError: (callback: (data: { sessionId: string; error: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; error: string }) => callback(data);
      ipcRenderer.on("chat:stream-error", handler);
      return () => ipcRenderer.removeListener("chat:stream-error", handler);
    },

    chatStreamEnd: (callback: (data: { sessionId: string; content: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; content: string }) => callback(data);
      ipcRenderer.on("chat:stream-end", handler);
      return () => ipcRenderer.removeListener("chat:stream-end", handler);
    },

    chatStreamCancelled: (callback: (data: { sessionId: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string }) => callback(data);
      ipcRenderer.on("chat:stream-cancelled", handler);
      return () => ipcRenderer.removeListener("chat:stream-cancelled", handler);
    },

    // File events
    fileDropped: (callback: (files: DroppedFile[]) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: DroppedFile[]) => callback(data);
      ipcRenderer.on("file:dropped", handler);
      return () => ipcRenderer.removeListener("file:dropped", handler);
    },

    // Trace events
    traceEntry: (callback: (entry: TraceEntry) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: TraceEntry) => callback(data);
      ipcRenderer.on("trace:entry", handler);
      return () => ipcRenderer.removeListener("trace:entry", handler);
    },

    // Updater events
    updaterChecking: (callback: () => void): (() => void) => {
      const handler = () => callback();
      ipcRenderer.on("updater:checking", handler);
      return () => ipcRenderer.removeListener("updater:checking", handler);
    },

    updaterAvailable: (callback: (data: { version: string; releaseNotes?: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { version: string; releaseNotes?: string }) => callback(data);
      ipcRenderer.on("updater:available", handler);
      return () => ipcRenderer.removeListener("updater:available", handler);
    },

    updaterProgress: (callback: (data: { percent: number; transferred: number; total: number }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { percent: number; transferred: number; total: number }) => callback(data);
      ipcRenderer.on("updater:progress", handler);
      return () => ipcRenderer.removeListener("updater:progress", handler);
    },

    updaterDownloaded: (callback: (data: { version: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { version: string }) => callback(data);
      ipcRenderer.on("updater:downloaded", handler);
      return () => ipcRenderer.removeListener("updater:downloaded", handler);
    },

    updaterError: (callback: (data: { message: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { message: string }) => callback(data);
      ipcRenderer.on("updater:error", handler);
      return () => ipcRenderer.removeListener("updater:error", handler);
    },

    // App error
    appError: (callback: (data: { message: string; stack?: string }) => void): (() => void) => {
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
