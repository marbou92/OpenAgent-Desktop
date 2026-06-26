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
  | 'custom_openai'
  | 'custom'
  | string; // Allow any provider type from the opencode catalog

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
  status: 'pending' | 'completed' | 'failed' | 'denied' | 'deactivated';
  /** Phase 1.2: When this tool call is awaiting permission approval,
   *  this holds the permission request data so ToolUseCard can render
   *  the approval UI inline (instead of a separate floating dialog). */
  _pendingPermission?: {
    requestId: string;
    toolName: string;
    args: Record<string, unknown>;
  };
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

// ─── Phase 8.3: Todos ─────────────────────────────────────────────────────────

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TodoPriority = 'high' | 'medium' | 'low';

export interface TodoItem {
  id: string;
  content: string;
  status: TodoStatus;
  priority: TodoPriority;
  createdAt: string;
  updatedAt: string;
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
  /** Phase 8.2: non-fatal warning (e.g. max-steps reached with partial content). */
  warning?: string;
  files?: AttachedFile[];
  /** Phase 4: base64 data URLs for images attached to this message */
  images?: string[];
  /** Phase 4: token usage from the AI SDK (assistant messages only) */
  usage?: TokenUsage;
}

// ─── Phase 4: Advanced AI SDK Types ───────────────────────────────────────────

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens?: number;
}

export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  hasPricing: boolean;
}

export interface StructuredOutputRequest {
  model: string;
  messages: ChatMessage[];
  schema: Record<string, unknown>;
  systemPrompt?: string;
}

export interface StructuredOutputResult {
  object: unknown;
  usage?: TokenUsage;
}

export interface EmbeddingSearchResult {
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
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
  | 'sandbox'
  | 'projects'
  | 'skills';

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

export interface ProjectConfig {
  id: string;
  name: string;
  description?: string;
  directory: string;
  providerId?: string;
  model?: string;
  extensions: string[];
  skills: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  defaultExtensions: string[];
  defaultSkills: string[];
  providerType?: string;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  author: string;
  icon?: string;
  steps: SkillStep[];
  variables: SkillVariable[];
  requiredExtensions: string[];
  tags: string[];
  isBuiltin: boolean;
}

export interface SkillStep {
  id: string;
  name: string;
  type: 'prompt' | 'tool' | 'conditional' | 'loop' | 'parallel';
  config: Record<string, unknown>;
}

export interface SkillVariable {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'file' | 'select';
  defaultValue?: unknown;
  required: boolean;
  options?: string[];
}

export interface SkillExecution {
  id: string;
  skillId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStepIndex: number;
  startedAt: string;
  completedAt?: string;
  results: SkillStepResult[];
  error?: string;
}

export interface SkillStepResult {
  stepId: string;
  status: 'completed' | 'failed' | 'skipped';
  output?: string;
  error?: string;
}

export interface ProviderHealthSnapshot {
  providerId: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latencyMs: number;
  lastCheckAt: string;
  consecutiveFailures: number;
  totalChecks: number;
  totalFailures: number;
  uptimePercent: number;
  latencyHistory: { timestamp: string; latencyMs: number }[];
  lastError?: string;
}

export interface HealthDashboardData {
  providers: ProviderHealthSnapshot[];
  summary: {
    totalProviders: number;
    healthyCount: number;
    degradedCount: number;
    unhealthyCount: number;
    unknownCount: number;
    averageLatencyMs: number;
  };
  lastUpdated: string;
}

export interface Modal {
  id: string;
  title: string;
  content: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closable?: boolean;
  onClose?: () => void;
  data?: Record<string, any>;
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
  // ─── General ──────────────────────────────────────────────────
  theme: 'light' | 'dark' | 'system';
  language: 'en' | 'zh' | 'ja' | 'ko';
  autoUpdate: boolean;
  minimizeToTray: boolean;
  startupBehavior: 'show' | 'hidden' | 'tray';

  // ─── Provider / Model ─────────────────────────────────────────
  defaultProviderId: string;
  defaultModel: string;
  opencodePort: number;
  opencodeHostname: string;
  opencodeAutoStart: boolean;
  autoStartSandbox: boolean;
  /** Phase 8.1 — which catalog provides the provider/model list. */
  catalogSource: 'models.dev' | 'pi.dev' | 'merged';

  // ─── Session ──────────────────────────────────────────────────
  maxConcurrentSessions: number;
  autoSave: boolean;
  sessionTimeoutMinutes: number;

  // ─── Security ─────────────────────────────────────────────────
  permissionMode: 'auto' | 'approve' | 'smart_approve' | 'chat';
  sandboxMode: 'path' | 'vm';
  debugMode: boolean;

  // ─── Phase 2: Permissions ─────────────────────────────────────
  /** Map of toolName → enabled. Missing = enabled (default). */
  toolEnabled?: Record<string, boolean>;
  /** Bash/cmd safety configuration. */
  bashSafety?: BashSafetyConfig;

  // ─── Skills ───────────────────────────────────────────────────
  skillsPath: string;
  enableBuiltinSkills: boolean;

  // ─── Advanced ─────────────────────────────────────────────────
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  traceEnabled: boolean;
  crashLogRetention: number;
  developerMode: boolean;
}

/** Phase 2: Bash/cmd safety configuration. */
export interface BashSafetyConfig {
  /** Enable/disable the safety layer entirely. */
  enabled: boolean;
  /** Patterns that are ALWAYS denied (auto-block). */
  blocklist: BashSafetyRule[];
  /** Patterns that are ALWAYS allowed (auto-approve). */
  allowlist: BashSafetyRule[];
}

export interface BashSafetyRule {
  /** The pattern to match (substring match on the command string). */
  pattern: string;
  /** Human-readable description of what this rule blocks/allows. */
  description: string;
  /** Whether this rule is active. */
  enabled: boolean;
  /** Category for grouping in the UI. */
  category: 'destructive' | 'system' | 'network' | 'package' | 'injection' | 'custom';
}

export const DEFAULT_SETTINGS: AppSettings = {
  // General
  theme: 'system',
  language: 'en',
  autoUpdate: true,
  minimizeToTray: true,
  startupBehavior: 'show',
  // Provider / Model
  defaultProviderId: '',
  defaultModel: '',
  opencodePort: 0,
  opencodeHostname: '127.0.0.1',
  opencodeAutoStart: true,
  autoStartSandbox: false,
  catalogSource: 'models.dev',
  // Session
  maxConcurrentSessions: 5,
  autoSave: true,
  sessionTimeoutMinutes: 0,
  // Security
  permissionMode: 'smart_approve',
  sandboxMode: 'path',
  debugMode: false,
  // Phase 2: Permissions
  toolEnabled: {},
  bashSafety: {
    enabled: true,
    blocklist: [
      // Destructive
      { pattern: 'rm -rf', description: 'Recursive force delete (Linux/Mac)', enabled: true, category: 'destructive' },
      { pattern: 'rm -fr', description: 'Recursive force delete (alt syntax)', enabled: true, category: 'destructive' },
      { pattern: 'del /s', description: 'Recursive delete (Windows)', enabled: true, category: 'destructive' },
      { pattern: 'del /f', description: 'Force delete (Windows)', enabled: true, category: 'destructive' },
      { pattern: 'rmdir /s', description: 'Recursive directory delete (Windows)', enabled: true, category: 'destructive' },
      { pattern: 'format', description: 'Disk format', enabled: true, category: 'destructive' },
      { pattern: 'shred', description: 'Secure file deletion', enabled: true, category: 'destructive' },
      { pattern: 'mkfs', description: 'Filesystem creation (wipes disk)', enabled: true, category: 'destructive' },
      // System
      { pattern: 'sudo', description: 'Run as superuser', enabled: true, category: 'system' },
      { pattern: 'su ', description: 'Switch user', enabled: true, category: 'system' },
      { pattern: 'shutdown', description: 'System shutdown', enabled: true, category: 'system' },
      { pattern: 'reboot', description: 'System reboot', enabled: true, category: 'system' },
      { pattern: 'halt', description: 'System halt', enabled: true, category: 'system' },
      { pattern: 'kill -9', description: 'Force kill process', enabled: true, category: 'system' },
      { pattern: 'taskkill /f', description: 'Force kill process (Windows)', enabled: true, category: 'system' },
      // Network exfiltration
      { pattern: 'curl ', description: 'HTTP client (data exfil risk)', enabled: true, category: 'network' },
      { pattern: 'wget ', description: 'File download (data exfil risk)', enabled: true, category: 'network' },
      { pattern: 'scp ', description: 'Secure copy over SSH', enabled: true, category: 'network' },
      { pattern: 'rsync ', description: 'Remote sync', enabled: true, category: 'network' },
      { pattern: 'nc ', description: 'Netcat (network tool)', enabled: true, category: 'network' },
      // Package managers
      { pattern: 'npm install', description: 'Install npm packages', enabled: true, category: 'package' },
      { pattern: 'npm i ', description: 'Install npm packages (short)', enabled: true, category: 'package' },
      { pattern: 'pip install', description: 'Install pip packages', enabled: true, category: 'package' },
      { pattern: 'apt install', description: 'Install apt packages', enabled: true, category: 'package' },
      { pattern: 'apt-get install', description: 'Install apt packages (alt)', enabled: true, category: 'package' },
      { pattern: 'brew install', description: 'Install homebrew packages', enabled: true, category: 'package' },
      { pattern: 'choco install', description: 'Install chocolatey packages', enabled: true, category: 'package' },
      // Shell injection
      { pattern: '; rm', description: 'Shell injection: command chaining + rm', enabled: true, category: 'injection' },
      { pattern: '| rm', description: 'Shell injection: pipe + rm', enabled: true, category: 'injection' },
      { pattern: '&& rm', description: 'Shell injection: AND + rm', enabled: true, category: 'injection' },
      { pattern: '`rm', description: 'Shell injection: backtick + rm', enabled: true, category: 'injection' },
      { pattern: '$(rm', description: 'Shell injection: command substitution + rm', enabled: true, category: 'injection' },
    ],
    allowlist: [
      { pattern: 'ls', description: 'List directory contents', enabled: true, category: 'custom' },
      { pattern: 'dir', description: 'List directory (Windows)', enabled: true, category: 'custom' },
      { pattern: 'cat ', description: 'Read file contents', enabled: true, category: 'custom' },
      { pattern: 'head ', description: 'Read file head', enabled: true, category: 'custom' },
      { pattern: 'tail ', description: 'Read file tail', enabled: true, category: 'custom' },
      { pattern: 'wc ', description: 'Count lines/words', enabled: true, category: 'custom' },
      { pattern: 'git status', description: 'Git status', enabled: true, category: 'custom' },
      { pattern: 'git diff', description: 'Git diff', enabled: true, category: 'custom' },
      { pattern: 'git log', description: 'Git log', enabled: true, category: 'custom' },
      { pattern: 'git branch', description: 'Git branch', enabled: true, category: 'custom' },
      { pattern: 'node --version', description: 'Check Node version', enabled: true, category: 'custom' },
      { pattern: 'npm --version', description: 'Check npm version', enabled: true, category: 'custom' },
      { pattern: 'python --version', description: 'Check Python version', enabled: true, category: 'custom' },
      { pattern: 'echo ', description: 'Print text', enabled: true, category: 'custom' },
      { pattern: 'pwd', description: 'Print working directory', enabled: true, category: 'custom' },
      { pattern: 'find ', description: 'Find files', enabled: true, category: 'custom' },
      { pattern: 'grep ', description: 'Search text', enabled: true, category: 'custom' },
      { pattern: 'tree', description: 'Directory tree', enabled: true, category: 'custom' },
    ],
  },
  // Skills
  skillsPath: '~/.claude/skills',
  enableBuiltinSkills: true,
  // Advanced
  logLevel: 'info',
  traceEnabled: false,
  crashLogRetention: 5,
  developerMode: false,
};

// ─── Slash Command Types ───────────────────────────────────────────────────────

export interface SlashCommand {
  command: string;
  label: string;
  description: string;
  handler?: (args: string) => void;
}

// ─── Permission Request Types ──────────────────────────────────────────────────
// (Canonical PermissionRequest is defined near the bottom with Permission types)

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
        health: {
          check: (providerId: string) => Promise<ProviderHealthSnapshot>;
          dashboard: () => Promise<HealthDashboardData>;
        };
        // opencode provider system
        listProviders: () => Promise<any[]>;
        listAuth: () => Promise<Array<{ providerId: string; auth: any }>>;
        listModels: (providerId: string) => Promise<any[]>;
        refreshCatalog: () => Promise<any>;
        getCatalogInfo: () => Promise<any>;
        setApiKey: (providerId: string, apiKey: string) => Promise<void>;
        removeAuth: (providerId: string) => Promise<void>;
        setBaseUrl: (providerId: string, baseUrl: string) => Promise<void>;
        getPresets: () => Promise<any[]>;
        addCustom: (def: any) => Promise<void>;
        removeCustom: (providerId: string) => Promise<void>;
        startCopilot: () => Promise<any>;
        cancelCopilot: () => Promise<void>;
        runHealthCheck: (providerId: string) => Promise<any>;
        chat: (request: any) => Promise<any>;
      };
      extensions: {
        list: () => Promise<ExtensionInfo[]>;
        enable: (extensionId: string) => Promise<void>;
        disable: (extensionId: string) => Promise<void>;
        install: (source: string, options?: Record<string, unknown>) => Promise<ExtensionInfo>;
        configure: (extensionId: string, config: Record<string, unknown>) => Promise<void>;
        uninstall: (extensionId: string) => Promise<void>;
        search: (query?: string, category?: string) => Promise<ExtensionInfo[]>;
        getTools: (extensionId: string) => Promise<ToolDefinition[]>;
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
        update: (sessionId: string, updates: Record<string, unknown>) => Promise<void>;
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
      /** Phase 8.3: Per-session todo list (written by the agent via TodoWrite). */
      todos: {
        list: (sessionId: string) => Promise<TodoItem[]>;
        summary: (sessionId: string) => Promise<{ total: number; completed: number; inProgress: number; pending: number }>;
        clear: (sessionId: string) => Promise<void>;
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
        /** Phase 4: Structured outputs via generateObject */
        generateObject: (request: StructuredOutputRequest) => Promise<StructuredOutputResult & { success: boolean; error?: string }>;
      };
      /** Phase 4: Embeddings API */
      embeddings: {
        generate: (opts: { sessionId: string; texts: string[]; model: string; metadata?: any[] }) => Promise<any>;
        search: (opts: { sessionId: string; query: string; model: string; topK?: number }) => Promise<any>;
        count: (sessionId: string) => Promise<any>;
      };
      /** Phase 4: Cost estimation API */
      cost: {
        estimate: (opts: { providerId: string; modelId: string; usage: TokenUsage }) => Promise<any>;
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
        sessions: {
          list: () => Promise<any[]>;
          create: (options?: Record<string, unknown>) => Promise<any>;
          delete: (sessionId: string) => Promise<void>;
        };
        messages: {
          send: (sessionId: string, content: string, options?: Record<string, unknown>) => Promise<any>;
          list: (sessionId: string) => Promise<any[]>;
        };
        files: {
          list: (dirPath?: string) => Promise<any[]>;
          read: (filePath: string) => Promise<string>;
        };
        tools: {
          list: () => Promise<any[]>;
          execute: (name: string, args: Record<string, unknown>) => Promise<unknown>;
        };
        mcp: {
          list: () => Promise<any[]>;
          call: (serverName: string, toolName: string, args: Record<string, unknown>) => Promise<unknown>;
        };
        lsp: {
          diagnostics: (filePath?: string) => Promise<any[]>;
        };
      };
      projects: {
        list: () => Promise<ProjectConfig[]>;
        create: (options: Record<string, unknown>) => Promise<ProjectConfig>;
        open: (projectId: string) => Promise<ProjectConfig>;
        delete: (projectId: string) => Promise<void>;
        getActive: () => Promise<ProjectConfig | null>;
        setActive: (projectId: string) => Promise<void>;
        templates: () => Promise<ProjectTemplate[]>;
      };
      skills: {
        list: () => Promise<SkillDefinition[]>;
        get: (skillId: string) => Promise<SkillDefinition>;
        execute: (skillId: string, variables: Record<string, unknown>, context?: Record<string, unknown>) => Promise<SkillExecution>;
        /** Phase 8.4: list all skills available to the agent (disk + builtin). */
        listAgentic: () => Promise<Array<{ id: string; name: string; description: string; enabled?: boolean; category?: string }>>;
        /** Phase 8.4: reload skills from ~/.claude/skills/ on demand. */
        reload: () => Promise<{ count: number }>;
      };
      platform: {
        getOS: () => NodeJS.Platform;
        isMac: () => boolean;
        isWindows: () => boolean;
        isLinux: () => boolean;
        getEnvVar: (varName: string) => Promise<string | null>;
      };
      app: {
        getVersion: () => Promise<string>;
        /** Phase 0.2: Read the persisted app config (for settings hydration). */
        getConfig: () => Promise<Record<string, unknown>>;
        /** Persist config updates to the main process. */
        updateConfig: (updates: Record<string, unknown>) => Promise<{ success: boolean }>;
        quit: () => Promise<void>;
        minimize: () => Promise<void>;
        maximize: () => Promise<void>;
      };
      agents: {
        list: () => Promise<AgentDefinition[]>;
        get: (agentId: string) => Promise<AgentDefinition>;
        getActive: () => Promise<AgentDefinition>;
        setActive: (agentId: string) => Promise<void>;
        create: (agent: Omit<AgentDefinition, 'isBuiltIn'>) => Promise<AgentDefinition>;
        delete: (agentId: string) => Promise<void>;
      };
      configSets: {
        list: () => Promise<ProviderConfigSet[]>;
        get: (id: string) => Promise<ProviderConfigSet>;
        getActive: () => Promise<ProviderConfigSet>;
        create: (config: Omit<ProviderConfigSet, 'id' | 'createdAt' | 'updatedAt'>) => Promise<ProviderConfigSet>;
        update: (id: string, updates: Partial<ProviderConfigSet>) => Promise<ProviderConfigSet>;
        delete: (id: string) => Promise<void>;
        switch: (id: string) => Promise<ProviderConfigSet>;
      };
      modelVariants: {
        list: (modelId?: string) => Promise<ModelVariant[]>;
        get: (id: string) => Promise<ModelVariant>;
        getActive: () => Promise<ModelVariant | null>;
        setActive: (id: string) => Promise<void>;
        cycle: (modelId: string, direction?: 'next' | 'prev') => Promise<ModelVariant | null>;
      };
      diagnostics: {
        run: (providerId: string, quick?: boolean) => Promise<DiagnosticReport>;
      };
      memory: {
        getCore: () => Promise<CoreMemory[]>;
        setCore: (category: CoreMemory['category'], key: string, value: string) => Promise<CoreMemory>;
        deleteCore: (id: string) => Promise<void>;
        search: (query: string, limit?: number) => Promise<ExperienceMemory[]>;
        getExperiences: (limit?: number) => Promise<ExperienceMemory[]>;
      };
      permissions: {
        getRules: (agentId: string) => Promise<any[]>;
        addRule: (agentId: string, pattern: string, level: PermissionLevel, reason?: string) => Promise<void>;
        removeRule: (agentId: string, pattern: string) => Promise<void>;
        respond: (requestId: string, response: PermissionConfirmation['userResponse']) => Promise<void>;
        /** Phase 8.5: respond to an AskUserQuestion request with the selected option. */
        respondToQuestion: (requestId: string, answer: string | null) => Promise<void>;
      };
      context: {
        usage: (sessionId: string) => Promise<ContextUsage>;
        compact: (sessionId: string) => Promise<{ savedTokens: number }>;
      };
      sessionOps: {
        fork: (sessionId: string, atMessageIndex: number, title?: string) => Promise<{ forkId: string; forkedMessages: any[] }>;
        revert: (sessionId: string, atMessageIndex: number) => Promise<{ revertId: string; remainingMessages: any[] }>;
        share: (sessionId: string, expiresInDays?: number) => Promise<{ shareId: string; shareToken: string }>;
        exportSession: (sessionId: string) => Promise<string>;
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
        /** Phase 8.2: non-fatal warning (e.g. max-steps reached with partial content). */
        chatStreamWarning: (
          callback: (data: { sessionId: string; warning: string }) => void
        ) => () => void;
        chatStreamEnd: (
          callback: (data: { sessionId: string; content: string }) => void
        ) => () => void;
        chatStreamCancelled: (callback: (data: { sessionId: string }) => void) => () => void;
        fileDropped: (callback: (files: DroppedFile[]) => void) => () => void;
        traceEntry: (callback: (entry: TraceEntry) => void) => () => void;
        appError: (callback: (data: { message: string; stack?: string }) => void) => () => void;
        providerHealthUpdate: (callback: (data: ProviderHealthSnapshot) => void) => () => void;
        providerStatusChanged: (callback: (data: { providerId: string; oldStatus: string; newStatus: string }) => void) => () => void;
        projectCreated: (callback: (data: ProjectConfig) => void) => () => void;
        projectActivated: (callback: (data: ProjectConfig) => void) => () => void;
        agentSwitched: (callback: (data: { from: string; to: string; agent: AgentDefinition }) => void) => () => void;
        configSetSwitched: (callback: (data: ProviderConfigSet) => void) => () => void;
        permissionRequest: (callback: (data: PermissionRequest & { sessionId: string }) => void) => () => void;
        /** Phase 8.5: agent asks the user a question with multiple-choice options. */
        askUser: (callback: (data: { sessionId: string; id: string; toolName: string; args: { questions: AskUserQuestionItem[] } }) => void) => () => void;
        mainReady: (callback: () => void) => () => void;
        /** Phase 8.3: auto-compaction ran (manual or after a chat turn). */
        contextCompacted: (callback: (data: { sessionId?: string; savedTokens: number; strategy?: string }) => void) => () => void;
        /** Phase 8.3: live todo updates from the agent (TodoWrite tool). */
        todosUpdated: (callback: (data: { sessionId: string; todos: TodoItem[] }) => void) => () => void;
      };
    };
  }
}

// ─── Agent Mode Types ────────────────────────────────────────────────────────

export type AgentMode = 'build' | 'plan' | 'chat' | 'smart';

export interface AgentDefinition {
  id: string;
  name: string;
  mode: AgentMode;
  description: string;
  prompt?: string;
  model?: string;
  permissions: Record<string, 'allow' | 'ask' | 'deny'>;
  maxSteps?: number;
  temperature?: number;
  color?: string;
  hidden?: boolean;
  isBuiltIn?: boolean;
}

// ─── Config Set Types ────────────────────────────────────────────────────────

export interface ProviderConfigSet {
  id: string;
  name: string;
  providerType: ProviderType;
  apiKey?: string;
  apiHost?: string;
  model: string;
  contextWindow?: number;
  maxTokens?: number;
  temperature?: number;
  enableThinking?: boolean;
  thinkingBudget?: number;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Model Variant Types ─────────────────────────────────────────────────────

export interface ModelVariant {
  id: string;
  name: string;
  modelId: string;
  description?: string;
  options: Record<string, unknown>;
  color?: string;
  isBuiltIn?: boolean;
}

// ─── Diagnostic Types ────────────────────────────────────────────────────────

export type DiagnosticStep = 'dns' | 'tcp' | 'tls' | 'auth' | 'model';
export type DiagnosticStatus = 'pending' | 'running' | 'passed' | 'failed' | 'warning' | 'skipped';

export interface DiagnosticResult {
  step: DiagnosticStep;
  status: DiagnosticStatus;
  latencyMs?: number;
  message: string;
  advisoryCode?: string;
}

export interface DiagnosticReport {
  providerId: string;
  providerType: string;
  apiHost: string;
  results: DiagnosticResult[];
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  totalLatencyMs: number;
  timestamp: string;
  advisoryCodes: string[];
}

// ─── Memory Types ────────────────────────────────────────────────────────────

export interface CoreMemory {
  id: string;
  category: 'identity' | 'preferences' | 'skills' | 'interests' | 'notes';
  key: string;
  value: string;
  updatedAt: string;
  createdAt: string;
}

export interface ExperienceMemory {
  id: string;
  sessionId: string;
  summary: string;
  keyTopics: string[];
  toolsUsed: string[];
  outcome: 'success' | 'partial' | 'failure';
  workingDirectory?: string;
  model?: string;
  createdAt: string;
}

// ─── Permission Types ────────────────────────────────────────────────────────

export type PermissionLevel = 'allow' | 'ask' | 'deny';

export interface PermissionRequest {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  matchedPattern?: string;
  reason?: string;
}

// ─── Phase 8.5: AskUserQuestion Types ─────────────────────────────────────────

export interface AskUserQuestionOption {
  label: string;
  description?: string;
}

export interface AskUserQuestionItem {
  question: string;
  header?: string;
  options: AskUserQuestionOption[];
}

export interface AskUserQuestionRequest {
  id: string;
  toolName: string; // always 'AskUserQuestion'
  questions: AskUserQuestionItem[];
}

export interface PermissionConfirmation {
  toolName: string;
  args: Record<string, unknown>;
  userResponse: 'allow_once' | 'always_allow' | 'deny_once' | 'always_deny';
}

// ─── Context Types ───────────────────────────────────────────────────────────

export interface ContextUsage {
  totalTokens: number;
  maxTokens: number;
  usagePercent: number;
  promptTokens: number;
  completionTokens: number;
  canCompact: boolean;
}

export interface TraceStep {
  id: string;
  type: 'thinking' | 'tool_call' | 'tool_result' | 'message';
  content: string;
  toolName?: string;
  timestamp: string;
}

export {};
