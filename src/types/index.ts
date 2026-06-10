/**
 * OpenAgent-Desktop - Complete TypeScript Types for the Renderer
 *
 * All types matching the Electron API, plus UI-specific types
 * for the renderer process.
 */

// ─── Provider Types ────────────────────────────────────────────────────────────

export type ProviderType =
  | 'anthropic'
  | 'openai'
  | 'openrouter'
  | 'azure_openai'
  | 'gemini'
  | 'gcp_vertex'
  | 'amazon_bedrock'
  | 'groq'
  | 'mistral'
  | 'ollama'
  | 'lm_studio'
  | 'litellm'
  | 'databricks'
  | 'perplexity'
  | 'xai'
  | 'github_copilot'
  | 'cerebras'
  | 'novita'
  | 'venice'
  | 'opencode'
  | 'custom_openai';

export interface ProviderConfig {
  id?: string;
  name: string;
  type: ProviderType;
  apiKey?: string;
  apiHost?: string;
  apiBasePath?: string;
  organization?: string;
  region?: string;
  profile?: string;
  deploymentName?: string;
  projectId?: string;
  customHeaders?: Record<string, string>;
  models?: string[];
  settings?: Record<string, unknown>;
}

export interface ProviderInfo {
  id: string;
  name: string;
  type: ProviderType;
  models: string[];
  isDefault: boolean;
  configured: boolean;
}

export interface ProviderTestResult {
  working: boolean;
  latency: number;
  models: string[];
}

export interface ProviderMetadata {
  type: ProviderType;
  displayName: string;
  description: string;
  requiresApiKey: boolean;
  defaultHost: string;
  defaultBasePath: string;
  defaultModels: string[];
  supportsStreaming: boolean;
  supportsToolUse: boolean;
  supportsThinking: boolean;
  envVarApiKey: string;
  envVarHost: string;
  icon?: string;
  website: string;
}

// ─── Extension Types ───────────────────────────────────────────────────────────

export type ExtensionCategory =
  | 'development'
  | 'productivity'
  | 'browser'
  | 'cloud'
  | 'database'
  | 'communication'
  | 'design'
  | 'media'
  | 'search'
  | 'memory'
  | 'system'
  | 'document_generation'
  | 'automation'
  | 'data';

export interface ExtensionInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  enabled: boolean;
  installed: boolean;
  config?: Record<string, unknown>;
  capabilities?: string[];
  category?: ExtensionCategory;
  builtin?: boolean;
  trusted?: boolean;
}

export interface ExtensionConfig {
  id: string;
  type: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  builtin: boolean;
  installedAt: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  content: string;
  isError: boolean;
  metadata?: Record<string, unknown>;
}

export type ExtensionStatus =
  | 'uninitialized'
  | 'initializing'
  | 'ready'
  | 'error'
  | 'shutdown';

// ─── Session Types ─────────────────────────────────────────────────────────────

export interface SessionInfo {
  id: string;
  name: string;
  providerId: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  metadata?: Record<string, unknown>;
}

export interface SessionData {
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

export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
  thinking?: string;
  error?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'completed' | 'failed';
}

export interface SessionTemplate {
  id: string;
  name: string;
  description: string;
  providerId: string;
  model: string;
  systemPrompt?: string;
  extensions: string[];
  recipes: string[];
}

// ─── Recipe Types ──────────────────────────────────────────────────────────────

export interface RecipeInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  extensions: string[];
  variables: RecipeVariable[];
  subRecipes: SubRecipeRef[];
  slashCommand?: string;
  schedule?: RecipeSchedule;
  tags?: string[];
  isBuiltin?: boolean;
  source?: string;
}

export interface RecipeVariable {
  name: string;
  description: string;
  defaultValue?: string;
  required: boolean;
  type?: 'string' | 'number' | 'boolean' | 'file' | 'select';
  options?: string[];
}

export interface SubRecipeRef {
  id: string;
  recipeId: string;
  name: string;
  variableOverrides?: Record<string, string>;
  condition?: string;
  onSuccess?: 'continue' | 'stop' | 'retry';
  onFailure?: 'continue' | 'stop' | 'retry';
}

export interface RecipeSchedule {
  enabled: boolean;
  cron: string;
  variables?: Record<string, string>;
  timezone?: string;
  lastRunAt?: string;
  nextRunAt?: string;
}

export interface RecipeResult {
  recipeId: string;
  success: boolean;
  output: string;
  duration: number;
  stepsCompleted?: number;
  stepsFailed?: number;
  subResults?: RecipeResult[];
}

// ─── Hook Types ────────────────────────────────────────────────────────────────

export type HookType =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'UserPromptSubmit'
  | 'PreSession'
  | 'PostSession';

export interface HookInfo {
  id: string;
  name: string;
  type: HookType;
  command: string;
  enabled: boolean;
  conditions: HookConditions;
  timeout?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface HookConditions {
  toolName?: string;
  extensionId?: string;
  pattern?: string;
}

export interface HookResult {
  hookId: string;
  hookName?: string;
  success: boolean;
  output?: string;
  error?: string;
  deny?: boolean;
  reason?: string;
  duration: number;
}

// ─── Sandbox Types ─────────────────────────────────────────────────────────────

export interface SandboxStatus {
  running: boolean;
  type: string;
  startedAt?: string;
  health: 'healthy' | 'degraded' | 'unhealthy' | 'stopped';
  resourceUsage?: {
    cpuPercent: number;
    memoryUsedMB: number;
    memoryLimitMB: number;
    diskUsedMB: number;
    diskLimitMB: number;
  };
}

export interface ExecuteResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  timedOut: boolean;
}

// ─── ACP Types ─────────────────────────────────────────────────────────────────

export interface ACPStatus {
  connected: boolean;
  serverUrl?: string;
  sessionId?: string;
  agentInfo?: Record<string, unknown>;
}

// ─── Trace Types ───────────────────────────────────────────────────────────────

export interface TraceEntry {
  id: string;
  sessionId: string;
  timestamp: string;
  type: 'thinking' | 'action' | 'tool_call' | 'tool_result' | 'error' | 'info';
  content: string;
  metadata?: Record<string, unknown>;
}

// ─── Chat Types ────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
  thinking?: string;
  error?: string;
  files?: AttachedFile[];
}

export interface AttachedFile {
  name: string;
  path: string;
  size: number;
  type: string;
}

export interface ChatState {
  isStreaming: boolean;
  error: string | null;
  messages: ChatMessage[];
}

// ─── File Types ────────────────────────────────────────────────────────────────

export interface DroppedFile {
  path: string;
  name: string;
  size: number;
  type: string;
}

// ─── UI-Specific Types ─────────────────────────────────────────────────────────

export type ViewType =
  | 'chat'
  | 'extensions'
  | 'recipes'
  | 'sessions'
  | 'settings'
  | 'hooks'
  | 'sandbox';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface Modal {
  id: string;
  title: string;
  content: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closable?: boolean;
  onClose?: () => void;
}

export interface AppState {
  // Navigation
  currentView: ViewType;
  sidebarCollapsed: boolean;

  // Session
  currentSessionId: string | null;
  sessions: SessionInfo[];

  // Data
  providers: ProviderInfo[];
  extensions: ExtensionInfo[];
  recipes: RecipeInfo[];
  hooks: HookInfo[];

  // Chat
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  streamingThinking: string;
  activeToolCalls: ToolCall[];

  // Trace
  traceEntries: TraceEntry[];
  tracePanelOpen: boolean;

  // Settings
  settings: AppSettings;

  // UI state
  toasts: Toast[];
  modals: Modal[];
  loading: boolean;
  version: string;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  autoSave: boolean;
  defaultProviderId: string;
  defaultModel: string;
  permissionMode: 'auto' | 'approve' | 'smart_approve' | 'chat';
  autoStartSandbox: boolean;
  minimizeToTray: boolean;
  traceEnabled: boolean;
  debugMode: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  language: 'en',
  autoSave: true,
  defaultProviderId: 'openai',
  defaultModel: 'gpt-4o',
  permissionMode: 'smart_approve',
  autoStartSandbox: true,
  minimizeToTray: true,
  traceEnabled: true,
  debugMode: false,
  logLevel: 'info',
};

// ─── Slash Command Types ───────────────────────────────────────────────────────

export interface SlashCommand {
  command: string;
  label: string;
  description: string;
  handler?: (args: string) => void;
}

// ─── Permission Request Types ──────────────────────────────────────────────────

export interface PermissionRequest {
  id: string;
  toolName: string;
  toolArguments: Record<string, unknown>;
  extensionId?: string;
  reason?: string;
  onApprove: () => void;
  onDeny: () => void;
}

// ─── Event Map for the Electron API ────────────────────────────────────────────

export interface ElectronAPIEvents {
  'sandbox:status-changed': SandboxStatus;
  'sandbox:error': { message: string };
  'extension:installed': ExtensionInfo;
  'extension:uninstalled': { extensionId: string };
  'extension:error': { message: string };
  'acp:connected': Record<string, unknown>;
  'acp:disconnected': void;
  'acp:message': Record<string, unknown>;
  'acp:error': { message: string };
  'chat:stream-chunk': { sessionId: string; chunk: string };
  'chat:stream-tool-call': { sessionId: string; toolCall: Record<string, unknown> };
  'chat:stream-tool-result': { sessionId: string; toolResult: Record<string, unknown> };
  'chat:stream-thinking': { sessionId: string; thinking: string };
  'chat:stream-error': { sessionId: string; error: string };
  'chat:stream-end': { sessionId: string; content: string };
  'chat:stream-cancelled': { sessionId: string };
  'file:dropped': DroppedFile[];
  'trace:entry': TraceEntry;
  'updater:checking': void;
  'updater:available': { version: string; releaseNotes?: string };
  'updater:progress': { percent: number; transferred: number; total: number };
  'updater:downloaded': { version: string };
  'updater:error': { message: string };
  'app:error': { message: string; stack?: string };
}

// ─── Global Window Augmentation ────────────────────────────────────────────────

declare global {
  interface Window {
    openagent?: {
      providers: {
        list: () => Promise<ProviderInfo[]>;
        add: (config: ProviderConfig) => Promise<ProviderInfo>;
        remove: (providerId: string) => Promise<void>;
        test: (providerId: string) => Promise<ProviderTestResult>;
        setDefault: (providerId: string, model: string) => Promise<void>;
      };
      extensions: {
        list: () => Promise<ExtensionInfo[]>;
        enable: (extensionId: string) => Promise<void>;
        disable: (extensionId: string) => Promise<void>;
        install: (source: string, options?: Record<string, unknown>) => Promise<ExtensionInfo>;
        configure: (extensionId: string, config: Record<string, unknown>) => Promise<void>;
      };
      sessions: {
        list: () => Promise<SessionInfo[]>;
        create: (options?: {
          name?: string;
          providerId?: string;
          model?: string;
          templateId?: string;
        }) => Promise<SessionData>;
        load: (sessionId: string) => Promise<SessionData>;
        save: (sessionId: string, data: Partial<SessionData>) => Promise<void>;
        delete: (sessionId: string) => Promise<void>;
        export: (sessionId: string, format: 'json' | 'markdown') => Promise<string>;
      };
      recipes: {
        list: () => Promise<RecipeInfo[]>;
        create: (recipeData: Partial<RecipeInfo> & { prompt: string }) => Promise<RecipeInfo>;
        run: (recipeId: string, variables?: Record<string, string>) => Promise<RecipeResult>;
        delete: (recipeId: string) => Promise<void>;
        import: (source: string, format?: string) => Promise<RecipeInfo>;
      };
      sandbox: {
        status: () => Promise<SandboxStatus>;
        start: (config?: {
          cpuLimit?: number;
          memoryLimitMB?: number;
          diskLimitMB?: number;
          networkIsolation?: boolean;
          allowedPaths?: string[];
        }) => Promise<void>;
        stop: () => Promise<void>;
        execute: (
          command: string,
          options?: { cwd?: string; timeout?: number; env?: Record<string, string> }
        ) => Promise<ExecuteResult>;
      };
      hooks: {
        list: () => Promise<HookInfo[]>;
        add: (config: Omit<HookInfo, 'id'>) => Promise<HookInfo>;
        remove: (hookId: string) => Promise<void>;
        trigger: (
          hookType: HookType,
          context: Record<string, unknown>
        ) => Promise<HookResult[]>;
      };
      acp: {
        connect: (serverUrl: string, options?: Record<string, unknown>) => Promise<void>;
        disconnect: () => Promise<void>;
        status: () => Promise<ACPStatus>;
      };
      chat: {
        send: (
          sessionId: string,
          message: string,
          options?: Record<string, unknown>
        ) => Promise<{ content: string; model: string; usage?: Record<string, number> }>;
        stream: (
          sessionId: string,
          message: string,
          options?: Record<string, unknown>
        ) => Promise<{ streaming: boolean }>;
        cancel: (sessionId: string) => Promise<void>;
      };
      files: {
        drop: (filePaths: string[]) => Promise<DroppedFile[]>;
        open: (filePath: string, options?: Record<string, unknown>) => Promise<void>;
      };
      trace: {
        start: (sessionId: string) => Promise<void>;
        stop: (sessionId: string) => Promise<void>;
        get: (
          sessionId: string,
          options?: { type?: TraceEntry['type']; limit?: number; offset?: number }
        ) => Promise<TraceEntry[]>;
      };
      opencode: {
        init: () => Promise<Record<string, unknown>>;
        status: () => Promise<{
          initialized: boolean;
          config?: Record<string, unknown>;
          sandboxRunning?: boolean;
          sandboxType?: string;
          activeExtensions?: number;
          totalExtensions?: number;
        }>;
      };
      platform: {
        getOS: () => NodeJS.Platform;
        isMac: () => boolean;
        isWindows: () => boolean;
        isLinux: () => boolean;
      };
      app: {
        getVersion: () => Promise<string>;
        quit: () => Promise<void>;
        minimize: () => Promise<void>;
        maximize: () => Promise<void>;
      };
      on: {
        sandboxStatusChanged: (callback: (status: SandboxStatus) => void) => () => void;
        sandboxError: (callback: (error: { message: string }) => void) => () => void;
        extensionInstalled: (callback: (extension: ExtensionInfo) => void) => () => void;
        extensionUninstalled: (callback: (data: { extensionId: string }) => void) => () => void;
        extensionError: (callback: (error: { message: string }) => void) => () => void;
        acpConnected: (callback: (info: Record<string, unknown>) => void) => () => void;
        acpDisconnected: (callback: () => void) => () => void;
        chatStreamChunk: (
          callback: (data: { sessionId: string; chunk: string }) => void
        ) => () => void;
        chatStreamToolCall: (
          callback: (data: { sessionId: string; toolCall: Record<string, unknown> }) => void
        ) => () => void;
        chatStreamToolResult: (
          callback: (data: { sessionId: string; toolResult: Record<string, unknown> }) => void
        ) => () => void;
        chatStreamThinking: (
          callback: (data: { sessionId: string; thinking: string }) => void
        ) => () => void;
        chatStreamError: (
          callback: (data: { sessionId: string; error: string }) => void
        ) => () => void;
        chatStreamEnd: (
          callback: (data: { sessionId: string; content: string }) => void
        ) => () => void;
        chatStreamCancelled: (callback: (data: { sessionId: string }) => void) => () => void;
        fileDropped: (callback: (files: DroppedFile[]) => void) => () => void;
        traceEntry: (callback: (entry: TraceEntry) => void) => () => void;
        appError: (callback: (data: { message: string; stack?: string }) => void) => () => void;
      };
    };
  }
}

export {};
