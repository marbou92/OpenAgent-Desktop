/**
 * OpenAgent-Desktop - Extension System Types
 *
 * Defines all TypeScript types for the MCP-based extension/skills system.
 * Supports 60+ extensions inspired by Goose (https://github.com/aaif-goose/goose).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Extension Type Enum — one entry per supported extension
// ─────────────────────────────────────────────────────────────────────────────

export enum ExtensionType {
  // Built-in extensions
  Developer = 'developer',
  ComputerController = 'computer_controller',
  Memory = 'memory',
  Tutorial = 'tutorial',
  AutoVisualiser = 'auto_visualiser',
  Apps = 'apps',
  ChatRecall = 'chat_recall',
  CodeMode = 'code_mode',
  ExtensionManager = 'extension_manager',
  Summon = 'summon',
  Todo = 'todo',
  TopOfMind = 'top_of_mind',

  // Document generators (built-in)
  PptGenerator = 'ppt_generator',
  DocxGenerator = 'docx_generator',
  XlsxGenerator = 'xlsx_generator',
  GuiController = 'gui_controller',

  // Community / MCP-based extensions
  AgentQL = 'agentql',
  Apify = 'apify',
  Asana = 'asana',
  Beads = 'beads',
  Blender = 'blender',
  Browserbase = 'browserbase',
  ChromeDevtools = 'chrome_devtools',
  Cloudinary = 'cloudinary',
  Cognee = 'cognee',
  ContainerUse = 'container_use',
  Context7 = 'context7',
  DevTo = 'dev_to',
  ElevenLabs = 'elevenlabs',
  ExaSearch = 'exa_search',
  Excalidraw = 'excalidraw',
  Fetch = 'fetch',
  Figma = 'figma',
  Firecrawl = 'firecrawl',
  GitHub = 'github',
  GitMCP = 'gitmcp',
  GotoHuman = 'goto_human',
  JetBrains = 'jetbrains',
  KnowledgeGraphMemory = 'knowledge_graph_memory',
  LinuxMCP = 'linux_mcp',
  MongoDB = 'mongodb',
  NanoBanana = 'nano_banana',
  Neon = 'neon',
  Netlify = 'netlify',
  OpenMetadata = 'openmetadata',
  PdfReader = 'pdf_reader',
  Playwright = 'playwright',
  PromptsChat = 'prompts_chat',
  Reddit = 'reddit',
  Rendex = 'rendex',
  Repomix = 'repomix',
  Rube = 'rube',
  ScholarSidekick = 'scholar_sidekick',
  Selenium = 'selenium',
  Skills = 'skills',
  Square = 'square',
  Sugar = 'sugar',
  Supabase = 'supabase',
  TavilySearch = 'tavily_search',
  Vercel = 'vercel',
  VMwareAiops = 'vmware_aiops',
  YouTubeTranscript = 'youtube_transcript',

  // ── Development Tools ────────────────────────────────────────────────────
  Filesystem = 'filesystem',
  GitLab = 'gitlab',
  Postgres = 'postgres',
  MySQL = 'mysql',
  SQLite = 'sqlite',
  Redis = 'redis',
  Elasticsearch = 'elasticsearch',
  Docker = 'docker',

  // ── AI & Search ──────────────────────────────────────────────────────────
  BraveSearch = 'brave-search',
  GoogleSearch = 'google-search',
  BingSearch = 'bing-search',
  Serper = 'serper',
  Perplexity = 'perplexity',
  JinaReader = 'jina-reader',
  MojitoSearch = 'mojito-search',

  // ── Cloud & Infrastructure ───────────────────────────────────────────────
  AWS = 'aws',
  GCP = 'gcp',
  Azure = 'azure',
  Kubernetes = 'kubernetes',
  Terraform = 'terraform',
  Pulumi = 'pulumi',
  Cloudflare = 'cloudflare',
  DigitalOcean = 'digitalocean',

  // ── Communication ────────────────────────────────────────────────────────
  Slack = 'slack',
  Discord = 'discord',
  Telegram = 'telegram',
  Email = 'email',
  Notion = 'notion',
  Confluence = 'confluence',
  Jira = 'jira',
  Linear = 'linear',
  Trello = 'trello',

  // ── Data & Analytics ────────────────────────────────────────────────────
  Stripe = 'stripe',
  Plaid = 'plaid',
  HubSpot = 'hubspot',
  Salesforce = 'salesforce',
  Zendesk = 'zendesk',
  Intercom = 'intercom',
  Analytics = 'analytics',
  Mixpanel = 'mixpanel',
  Amplitude = 'amplitude',
  Datadog = 'datadog',

  // ── Productivity ─────────────────────────────────────────────────────────
  GoogleDrive = 'google-drive',
  GoogleCalendar = 'google-calendar',
  GoogleMail = 'google-mail',
  Microsoft365 = 'microsoft-365',
  Dropbox = 'dropbox',
  Airtable = 'airtable',
  Miro = 'miro',
  Lark = 'lark',
  Zoom = 'zoom',

  // ── Specialized ──────────────────────────────────────────────────────────
  UnrealEngine = 'unreal-engine',
  HomeAssistant = 'homeassistant',
  Weather = 'weather',
  Maps = 'maps',
  Spotify = 'spotify',
  Twitter = 'twitter',
  HackerNews = 'hackernews',
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON Schema — describes tool parameters
// ─────────────────────────────────────────────────────────────────────────────

export interface JSONSchema {
  /** The JSON Schema version, e.g. "https://json-schema.org/draft/2020-12/schema" */
  $schema?: string;
  /** Top-level type, typically "object" for tool parameters */
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';
  /** When type is "object" — the property definitions */
  properties?: Record<string, JSONSchema>;
  /** Which properties are required */
  required?: string[];
  /** When type is "array" — the item schema */
  items?: JSONSchema | JSONSchema[];
  /** Default value */
  default?: unknown;
  /** Human-readable description */
  description?: string;
  /** Enum constraint */
  enum?: string[];
  /** Constant value */
  const?: unknown;
  /** String format hint (date-time, email, uri, etc.) */
  format?: string;
  /** Minimum for number/integer */
  minimum?: number;
  /** Maximum for number/integer */
  maximum?: number;
  /** Min length for string */
  minLength?: number;
  /** Max length for string */
  maxLength?: number;
  /** Pattern (regex) for string */
  pattern?: string;
  /** Additional properties allowed in object */
  additionalProperties?: boolean | JSONSchema;
  /** AnyOf combinator */
  anyOf?: JSONSchema[];
  /** OneOf combinator */
  oneOf?: JSONSchema[];
  /** AllOf combinator */
  allOf?: JSONSchema[];
  /** Title */
  title?: string;
  /** Examples */
  examples?: unknown[];
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Server configuration — used by extensions that spawn external processes
// ─────────────────────────────────────────────────────────────────────────────

export interface MCPServerConfig {
  /** The command to spawn (e.g. "npx", "python", "uvx") */
  command: string;
  /** Arguments to pass to the command */
  args: string[];
  /** Environment variables to set for the spawned process */
  env: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extension configuration — persisted and loaded at runtime
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtensionConfig {
  /** Unique identifier for this extension instance */
  id: string;
  /** Which extension type this represents */
  type: ExtensionType;
  /** Human-readable display name */
  name: string;
  /** Short description of what the extension does */
  description: string;
  /** Semantic version string */
  version: string;
  /** Whether this extension is currently enabled */
  enabled: boolean;
  /** Extension-specific settings (API keys, preferences, etc.) */
  settings: Record<string, unknown>;
  /** MCP server configuration for external-process extensions */
  mcpServer?: MCPServerConfig;
  /** Whether this is a built-in extension (vs. community-installed) */
  builtin: boolean;
  /** ISO timestamp when the extension was installed */
  installedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool definition — describes a single tool an extension exposes
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolDefinition {
  /** Tool name, unique within the extension (e.g. "shell") */
  name: string;
  /** Human-readable description of what the tool does */
  description: string;
  /** JSON Schema describing the tool's parameters */
  parameters: JSONSchema;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool result — what a tool returns after execution
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolResult {
  /** The textual content of the result */
  content: string;
  /** Whether the tool execution resulted in an error */
  isError: boolean;
  /** Optional metadata (timing, diagnostics, etc.) */
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extension status — lifecycle states
// ─────────────────────────────────────────────────────────────────────────────

export type ExtensionStatus =
  | 'uninitialized'
  | 'initializing'
  | 'ready'
  | 'error'
  | 'shutdown';

// ─────────────────────────────────────────────────────────────────────────────
// Extension interface — the contract every extension must satisfy
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtensionInterface {
  /** Unique identifier matching ExtensionConfig.id */
  id: string;
  /** The extension's configuration */
  config: ExtensionConfig;
  /** Initialize the extension (spawn MCP server, load state, etc.) */
  initialize(): Promise<void>;
  /** Gracefully shut down the extension */
  shutdown(): Promise<void>;
  /** Return the list of tools this extension exposes */
  listTools(): ToolDefinition[];
  /** Execute a named tool with the given arguments */
  executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  /** Return the current status of the extension */
  getStatus(): ExtensionStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Permission system
// ─────────────────────────────────────────────────────────────────────────────

export enum PermissionLevel {
  /** No special permissions — safe operations only */
  None = 'none',
  /** Can read files and environment */
  Read = 'read',
  /** Can read and write files, execute shell commands */
  Write = 'write',
  /** Full system access including network, processes, etc. */
  Admin = 'admin',
}

export interface Permission {
  /** The permission level required */
  level: PermissionLevel;
  /** Human-readable description of why the permission is needed */
  reason: string;
  /** Specific resources this permission covers (e.g. file paths) */
  resources?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP JSON-RPC types
// ─────────────────────────────────────────────────────────────────────────────

export interface MCPRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface MCPNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Server capabilities (returned from initialize handshake)
// ─────────────────────────────────────────────────────────────────────────────

export interface MCPServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: {};
  sampling?: {};
  elicitation?: {};
  experimental?: Record<string, unknown>;
}

export interface MCPClientCapabilities {
  roots?: { listChanged?: boolean };
  sampling?: {};
  elicitation?: {};
  experimental?: Record<string, unknown>;
}

export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: MCPServerCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Tool types (returned from tools/list)
// ─────────────────────────────────────────────────────────────────────────────

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: JSONSchema;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Resource types
// ─────────────────────────────────────────────────────────────────────────────

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  annotations?: {
    audience?: ('user' | 'assistant')[];
    priority?: number;
  };
}

export interface MCPResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Prompt types
// ─────────────────────────────────────────────────────────────────────────────

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface MCPPromptMessage {
  role: 'user' | 'assistant';
  content: {
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
    resource?: MCPResource;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Health check result
// ─────────────────────────────────────────────────────────────────────────────

export interface HealthCheckResult {
  healthy: boolean;
  latencyMs: number;
  error?: string;
  timestamp: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extension metadata — used by the UI and marketplace
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtensionMetadata {
  id: string;
  type: ExtensionType;
  name: string;
  description: string;
  version: string;
  author?: string;
  homepage?: string;
  repository?: string;
  icon?: string;
  category: ExtensionCategory;
  tags: string[];
  requiredEnvVars: string[];
  optionalEnvVars: string[];
  permissions: Permission[];
  builtin: boolean;
  enabledByDefault: boolean;
  enabled: boolean;
}

export enum ExtensionCategory {
  Development = 'development',
  Productivity = 'productivity',
  Browser = 'browser',
  Cloud = 'cloud',
  Database = 'database',
  Communication = 'communication',
  Design = 'design',
  Media = 'media',
  Search = 'search',
  Memory = 'memory',
  System = 'system',
  DocumentGeneration = 'document_generation',
  Automation = 'automation',
  Data = 'data',
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry events — emitted by ExtensionRegistry
// ─────────────────────────────────────────────────────────────────────────────

export type RegistryEventType =
  | 'extension:registered'
  | 'extension:initialized'
  | 'extension:shutdown'
  | 'extension:error'
  | 'extension:enabled'
  | 'extension:disabled'
  | 'extension:installed'
  | 'extension:configured'
  | 'extension:uninstalled'
  | 'tool:called'
  | 'tool:completed'
  | 'tool:error'
  | 'health:check';

export interface RegistryEvent {
  type: RegistryEventType;
  extensionId: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Community extension entry — used by MCP registry for discovery
// ─────────────────────────────────────────────────────────────────────────────

export interface CommunityExtensionEntry {
  type: ExtensionType;
  name: string;
  description: string;
  repository: string;
  command: string;
  args: string[];
  requiredEnvVars: string[];
  optionalEnvVars: string[];
  category: ExtensionCategory;
  tags: string[];
  permissions: Permission[];
  homepage?: string;
  icon?: string;
  author?: string;
  version: string;
  trusted: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Malware detection
// ─────────────────────────────────────────────────────────────────────────────

export interface MalwareCheckResult {
  safe: boolean;
  flags: MalwareFlag[];
  checkedAt: string;
}

export interface MalwareFlag {
  type: 'known_malicious' | 'suspicious_command' | 'suspicious_url' | 'unverified_source' | 'dangerous_permission';
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  detail?: string;
}
