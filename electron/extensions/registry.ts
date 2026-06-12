/**
 * OpenAgent-Desktop - Extension Registry
 *
 * Central registry that:
 * - Registers all built-in extensions
 * - Manages extension lifecycle (initialize, shutdown)
 * - Routes tool calls to the correct extension
 * - Handles MCP server discovery and connection
 * - Persists extension configs
 * - Provides extension metadata for UI
 * - Health monitoring
 * - Extension dependency resolution
 * - Dynamic loading/unloading
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ExtensionConfig,
  ExtensionInterface,
  ExtensionStatus,
  ExtensionType,
  ExtensionMetadata,
  ExtensionCategory,
  ToolDefinition,
  ToolResult,
  RegistryEvent,
  RegistryEventType,
  CommunityExtensionEntry,
  HealthCheckResult,
  Permission,
  PermissionLevel,
} from './types';
import { BaseExtension } from './base-extension';
import { MCPClient } from './mcp/mcp-client';
import { MCPRegistry, getMCPRegistry } from './mcp/mcp-registry';

// ─────────────────────────────────────────────────────────────────────────────
// Built-in extension imports
// ─────────────────────────────────────────────────────────────────────────────

import {
  DeveloperExtension,
  createDeveloperExtension,
} from './builtin/developer';

import {
  ComputerControllerExtension,
  createComputerControllerExtension,
} from './builtin/computer-controller';

import {
  MemoryExtension,
  createMemoryExtension,
} from './builtin/memory';

import {
  TodoExtension,
  createTodoExtension,
} from './builtin/todo';

import {
  SummonExtension,
  createSummonExtension,
} from './builtin/summon';

import {
  ExtensionManagerExtension,
  createExtensionManagerExtension,
} from './builtin/extension-manager';

import {
  ChatRecallExtension,
  createChatRecallExtension,
} from './builtin/chat-recall';

import {
  CodeModeExtension,
  createCodeModeExtension,
} from './builtin/code-mode';

import {
  AppsExtension,
  createAppsExtension,
} from './builtin/apps';

import {
  AutoVisualiserExtension,
  createAutoVisualiserExtension,
} from './builtin/auto-visualiser';

import {
  TopOfMindExtension,
  createTopOfMindExtension,
} from './builtin/top-of-mind';

import {
  DocumentGeneratorsExtension,
  createPptGeneratorExtension,
  createDocxGeneratorExtension,
  createXlsxGeneratorExtension,
} from './builtin/document-generators';

// ─────────────────────────────────────────────────────────────────────────────
// MCP-based community extension wrapper
// ─────────────────────────────────────────────────────────────────────────────

class MCPExtensionWrapper implements ExtensionInterface {
  id: string;
  config: ExtensionConfig;
  private client: MCPClient;
  private statusValue: ExtensionStatus = 'uninitialized';
  private toolsCache: ToolDefinition[] = [];
  private eventEmitter: EventEmitter = new EventEmitter();

  constructor(config: ExtensionConfig) {
    this.id = config.id;
    this.config = config;
    this.client = new MCPClient({
      command: config.mcpServer?.command || '',
      args: config.mcpServer?.args || [],
      env: config.mcpServer?.env || {},
    });
  }

  async initialize(): Promise<void> {
    this.setStatus('initializing');
    try {
      await this.client.connect();

      // Load tools from the MCP server
      const mcpTools = await this.client.listTools();
      this.toolsCache = mcpTools.map((tool) => ({
        name: tool.name,
        description: tool.description || '',
        parameters: tool.inputSchema,
      }));

      this.setStatus('ready');
    } catch (err) {
      this.setStatus('error');
      throw err;
    }
  }

  async shutdown(): Promise<void> {
    try {
      await this.client.disconnect();
      this.toolsCache = [];
      this.setStatus('shutdown');
    } catch (err) {
      this.setStatus('error');
      throw err;
    }
  }

  listTools(): ToolDefinition[] {
    return this.toolsCache;
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const result = await this.client.callTool(name, args);
      const textContent = result.content
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text)
        .join('\n');

      return {
        content: textContent,
        isError: result.isError ?? false,
        metadata: { rawResult: result },
      };
    } catch (err) {
      return {
        content: `MCP tool error: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  }

  getStatus(): ExtensionStatus {
    return this.statusValue;
  }

  private setStatus(status: ExtensionStatus): void {
    const oldStatus = this.statusValue;
    this.statusValue = status;
    if (oldStatus !== status) {
      this.eventEmitter.emit('statusChanged', { oldStatus, newStatus: status });
    }
  }

  /** Get the underlying MCP client */
  getClient(): MCPClient {
    return this.client;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Extension Registry class
// ─────────────────────────────────────────────────────────────────────────────

export class ExtensionRegistry extends EventEmitter {
  private extensions: Map<string, ExtensionInterface> = new Map();
  private configs: Map<string, ExtensionConfig> = new Map();
  private toolToExtension: Map<string, string> = new Map(); // toolName -> extensionId
  private mcpRegistry: MCPRegistry;
  private persistPath: string;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private healthCheckIntervalMs = 60000;
  private initialized = false;

  constructor(persistPath?: string) {
    super();
    this.persistPath = persistPath || path.join(os.homedir(), '.openagent', 'extension-configs.json');
    this.mcpRegistry = getMCPRegistry();
  }

  // ─── Initialization ────────────────────────────────────────────────────────

  /** Initialize the registry — register built-ins, load configs, start health monitoring */
  async initialize(): Promise<void> {
    if (this.initialized) {
      throw new Error('Extension registry already initialized');
    }

    // Load persisted configs
    await this.loadConfigs();

    // Load MCP registry state
    await this.mcpRegistry.load();

    // Register all built-in extensions
    this.registerBuiltinExtensions();

    // Initialize enabled extensions
    await this.initializeEnabledExtensions();

    // Start health monitoring
    this.startHealthMonitoring();

    this.initialized = true;
    this.emitEvent('extension:registered', 'registry', { count: this.extensions.size });
  }

  /** Shut down the registry — gracefully shut down all extensions */
  async shutdown(): Promise<void> {
    this.stopHealthMonitoring();

    // Shut down all extensions in reverse order
    const extensionIds = Array.from(this.extensions.keys()).reverse();
    for (const id of extensionIds) {
      try {
        const ext = this.extensions.get(id)!;
        await ext.shutdown();
        this.emitEvent('extension:shutdown', id);
      } catch (err) {
        this.emitEvent('extension:error', id, { error: String(err) });
      }
    }

    // Save configs
    await this.saveConfigs();

    this.extensions.clear();
    this.configs.clear();
    this.toolToExtension.clear();
    this.initialized = false;
  }

  // ─── Built-in extension registration ──────────────────────────────────────

  private registerBuiltinExtensions(): void {
    const builtinFactories: Array<{ create: () => ExtensionConfig; extensionClass: new (config: ExtensionConfig) => BaseExtension }> = [
      { create: createDeveloperExtension, extensionClass: DeveloperExtension as unknown as new (config: ExtensionConfig) => BaseExtension },
      { create: createComputerControllerExtension, extensionClass: ComputerControllerExtension as unknown as new (config: ExtensionConfig) => BaseExtension },
      { create: createMemoryExtension, extensionClass: MemoryExtension as unknown as new (config: ExtensionConfig) => BaseExtension },
      { create: createTodoExtension, extensionClass: TodoExtension as unknown as new (config: ExtensionConfig) => BaseExtension },
      { create: createSummonExtension, extensionClass: SummonExtension as unknown as new (config: ExtensionConfig) => BaseExtension },
      { create: createExtensionManagerExtension, extensionClass: ExtensionManagerExtension as unknown as new (config: ExtensionConfig) => BaseExtension },
      { create: createChatRecallExtension, extensionClass: ChatRecallExtension as unknown as new (config: ExtensionConfig) => BaseExtension },
      { create: createCodeModeExtension, extensionClass: CodeModeExtension as unknown as new (config: ExtensionConfig) => BaseExtension },
      { create: createAppsExtension, extensionClass: AppsExtension as unknown as new (config: ExtensionConfig) => BaseExtension },
      { create: createAutoVisualiserExtension, extensionClass: AutoVisualiserExtension as unknown as new (config: ExtensionConfig) => BaseExtension },
      { create: createTopOfMindExtension, extensionClass: TopOfMindExtension as unknown as new (config: ExtensionConfig) => BaseExtension },
      { create: createPptGeneratorExtension, extensionClass: DocumentGeneratorsExtension as unknown as new (config: ExtensionConfig) => BaseExtension },
      { create: createDocxGeneratorExtension, extensionClass: DocumentGeneratorsExtension as unknown as new (config: ExtensionConfig) => BaseExtension },
      { create: createXlsxGeneratorExtension, extensionClass: DocumentGeneratorsExtension as unknown as new (config: ExtensionConfig) => BaseExtension },
    ];

    for (const { create, extensionClass } of builtinFactories) {
      const config = create();

      // Merge with persisted config if available
      const persistedConfig = this.configs.get(config.id);
      const mergedConfig = persistedConfig
        ? { ...config, ...persistedConfig, settings: { ...config.settings, ...persistedConfig.settings } }
        : config;

      // Create extension instance
      const extension = new extensionClass(mergedConfig);

      // Register
      this.extensions.set(mergedConfig.id, extension);
      this.configs.set(mergedConfig.id, mergedConfig);

      // Register tools in the routing map
      for (const tool of extension.listTools()) {
        this.toolToExtension.set(tool.name, mergedConfig.id);
      }

      // Listen for tool changes
      if (extension instanceof BaseExtension) {
        extension.on('tool:completed', (data: unknown) => {
          const d = data as { toolName: string; durationMs: number };
          this.emitEvent('tool:completed', mergedConfig.id, d);
        });

        extension.on('tool:error', (data: unknown) => {
          const d = data as { toolName: string; error: string };
          this.emitEvent('tool:error', mergedConfig.id, d);
        });
      }

      this.emitEvent('extension:registered', mergedConfig.id, { name: mergedConfig.name });
    }

    // Set up the extension manager's registry reference
    const extManager = this.extensions.get('extension_manager');
    if (extManager instanceof ExtensionManagerExtension) {
      extManager.setRegistry({
        getExtensionConfigs: () => this.getExtensionConfigs(),
        getExtensionStatus: (id: string) => this.getExtensionStatus(id),
        enableExtension: (id: string) => this.enableExtension(id),
        disableExtension: (id: string) => this.disableExtension(id),
        installExtension: (urlOrName: string) => this.installExtension(urlOrName),
        uninstallExtension: (id: string) => this.uninstallExtension(id),
        getExtensionToolCount: (id: string) => this.getExtensionToolCount(id),
        searchCommunityExtensions: (query: string) => this.searchCommunityExtensions(query),
      });
    }
  }

  // ─── Extension lifecycle ───────────────────────────────────────────────────

  /** Initialize all enabled extensions */
  private async initializeEnabledExtensions(): Promise<void> {
    for (const [id, config] of this.configs) {
      if (!config.enabled) continue;

      const ext = this.extensions.get(id);
      if (!ext) continue;

      try {
        await ext.initialize();

        // Re-register tools after initialization (MCP tools may have been loaded)
        this.syncToolRouting(id, ext);

        this.emitEvent('extension:initialized', id);
      } catch (err) {
        this.emitEvent('extension:error', id, { error: String(err) });
      }
    }
  }

  /** Enable an extension by ID */
  async enableExtension(id: string): Promise<boolean> {
    const config = this.configs.get(id);
    if (!config) return false;

    if (config.enabled) return true; // Already enabled

    config.enabled = true;

    const ext = this.extensions.get(id);
    if (ext) {
      try {
        await ext.initialize();
        this.syncToolRouting(id, ext);
        this.emitEvent('extension:enabled', id);
      } catch (err) {
        this.emitEvent('extension:error', id, { error: String(err) });
        return false;
      }
    }

    await this.saveConfigs();
    return true;
  }

  /** Disable an extension by ID */
  async disableExtension(id: string): Promise<boolean> {
    const config = this.configs.get(id);
    if (!config) return false;

    if (!config.enabled) return true; // Already disabled

    const ext = this.extensions.get(id);
    if (ext) {
      try {
        await ext.shutdown();
        // Remove tool routing
        for (const tool of ext.listTools()) {
          if (this.toolToExtension.get(tool.name) === id) {
            this.toolToExtension.delete(tool.name);
          }
        }
        this.emitEvent('extension:disabled', id);
      } catch (err) {
        this.emitEvent('extension:error', id, { error: String(err) });
        return false;
      }
    }

    config.enabled = false;
    await this.saveConfigs();
    return true;
  }

  /** Install a new extension from URL or community name */
  async installExtension(urlOrName: string): Promise<ExtensionConfig | null> {
    // Check against corporate allowlist
    if (!this.mcpRegistry.isAllowedByCorporatePolicy(urlOrName as ExtensionType)) {
      throw new Error('Extension blocked by corporate policy');
    }

    // Search the community registry
    const results = this.mcpRegistry.search(urlOrName);
    if (results.length === 0) {
      // Try as a direct URL
      return this.installExtensionFromUrl(urlOrName);
    }

    // Use the first matching result
    const entry = results[0];

    // Run malware check
    const malwareCheck = this.mcpRegistry.checkMalware(entry.type);
    if (malwareCheck.flags.some((f) => f.severity === 'critical')) {
      throw new Error(`Installation blocked — security concerns: ${malwareCheck.flags.map((f) => f.message).join('; ')}`);
    }

    // Check for missing required environment variables
    const missingEnvVars = entry.requiredEnvVars.filter(
      (varName) => !process.env[varName],
    );
    if (missingEnvVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingEnvVars.join(', ')}. ` +
        `Set them before installing this extension.`,
      );
    }

    // Create config
    const config: ExtensionConfig = {
      id: entry.type,
      type: entry.type,
      name: entry.name,
      description: entry.description,
      version: entry.version,
      enabled: true,
      settings: {},
      mcpServer: {
        command: entry.command,
        args: entry.args,
        env: entry.requiredEnvVars.reduce<Record<string, string>>((acc, varName) => {
          const value = process.env[varName];
          if (value) acc[varName] = value;
          return acc;
        }, {}),
      },
      builtin: false,
      installedAt: new Date().toISOString(),
    };

    // Create extension instance
    const extension = new MCPExtensionWrapper(config);

    // Register
    this.extensions.set(config.id, extension);
    this.configs.set(config.id, config);

    // Try to initialize
    try {
      await extension.initialize();
      this.syncToolRouting(config.id, extension);
      this.emitEvent('extension:installed', config.id, { name: config.name });
    } catch (err) {
      this.emitEvent('extension:error', config.id, { error: String(err) });
    }

    await this.saveConfigs();
    return config;
  }

  /** Install an extension from a direct URL */
  private async installExtensionFromUrl(url: string): Promise<ExtensionConfig | null> {
    // Run malware check on the URL
    const malwareCheck = this.mcpRegistry.checkUrlOrCommand(url);
    if (malwareCheck.flags.some((f) => f.severity === 'critical')) {
      throw new Error(`Installation blocked — security concerns: ${malwareCheck.flags.map((f) => f.message).join('; ')}`);
    }

    // Extract name from URL
    const urlParts = url.split('/');
    const repoName = urlParts[urlParts.length - 1] || 'unknown';
    const name = repoName.replace(/\.git$/, '').replace(/[-_]/g, ' ');

    const config: ExtensionConfig = {
      id: `custom_${Date.now()}`,
      type: ExtensionType.Fetch, // Default type for custom extensions
      name,
      description: `Custom extension installed from ${url}`,
      version: '0.1.0',
      enabled: false,
      settings: {},
      mcpServer: {
        command: 'npx',
        args: ['-y', url],
        env: {},
      },
      builtin: false,
      installedAt: new Date().toISOString(),
    };

    this.configs.set(config.id, config);
    await this.saveConfigs();

    this.emitEvent('extension:installed', config.id, { name: config.name, source: url });
    return config;
  }

  /** Uninstall an extension by ID */
  async uninstallExtension(id: string): Promise<boolean> {
    const config = this.configs.get(id);
    if (!config) return false;

    if (config.builtin) {
      throw new Error('Cannot uninstall built-in extensions');
    }

    // Shut down if running
    const ext = this.extensions.get(id);
    if (ext && ext.getStatus() !== 'shutdown') {
      try {
        await ext.shutdown();
      } catch {
        // Continue with uninstall even if shutdown fails
      }
    }

    // Remove tool routing
    if (ext) {
      for (const tool of ext.listTools()) {
        if (this.toolToExtension.get(tool.name) === id) {
          this.toolToExtension.delete(tool.name);
        }
      }
    }

    // Remove from registry
    this.extensions.delete(id);
    this.configs.delete(id);

    await this.saveConfigs();
    this.emitEvent('extension:uninstalled', id, { name: config.name });
    return true;
  }

  // ─── IPC-facing API methods ─────────────────────────────────────────────────

  /** List all registered extensions' metadata (enabled and disabled) */
  async list(): Promise<ExtensionMetadata[]> {
    return this.getAllExtensionMetadata();
  }

  /** Enable an extension by ID — persists config, initializes if needed */
  async enable(extensionId: string): Promise<void> {
    const config = this.configs.get(extensionId);
    if (!config) {
      throw new Error(`Extension "${extensionId}" not found`);
    }

    if (config.enabled) return; // Already enabled

    const success = await this.enableExtension(extensionId);
    if (!success) {
      throw new Error(`Failed to enable extension "${extensionId}"`);
    }
  }

  /** Disable an extension by ID — persists config, shuts down if running */
  async disable(extensionId: string): Promise<void> {
    const config = this.configs.get(extensionId);
    if (!config) {
      throw new Error(`Extension "${extensionId}" not found`);
    }

    if (!config.enabled) return; // Already disabled

    const success = await this.disableExtension(extensionId);
    if (!success) {
      throw new Error(`Failed to disable extension "${extensionId}"`);
    }
  }

  /** Install an extension from a source (URL or community name).
   *  For MCP extensions, registers via MCPRegistry. For built-in, just enables. */
  async install(source: string, _options?: Record<string, unknown>): Promise<ExtensionInterface> {
    // Check if source matches a built-in or already-installed extension ID
    const existingConfig = this.configs.get(source);
    if (existingConfig) {
      if (!existingConfig.enabled) {
        await this.enable(source);
      }
      const ext = this.extensions.get(source);
      if (!ext) {
        throw new Error(`Extension "${source}" not found after enable`);
      }
      return ext;
    }

    // Try as a community extension name
    const communityResults = this.mcpRegistry.search(source);
    if (communityResults.length > 0) {
      const config = await this.installExtension(source);
      if (!config) {
        throw new Error(`Failed to install extension "${source}"`);
      }
      const ext = this.extensions.get(config.id);
      if (!ext) {
        throw new Error(`Extension instance not found after installation of "${config.id}"`);
      }
      return ext;
    }

    // Try as a URL
    return this.installFromUrl(source);
  }

  /** Update an extension's configuration and persist it */
  async configure(extensionId: string, config: Record<string, unknown>): Promise<void> {
    const extConfig = this.configs.get(extensionId);
    if (!extConfig) {
      throw new Error(`Extension "${extensionId}" not found`);
    }

    // Merge the new config into settings
    extConfig.settings = { ...extConfig.settings, ...config };

    // Apply settings to the extension instance if it's a BaseExtension
    const ext = this.extensions.get(extensionId);
    if (ext instanceof BaseExtension) {
      ext.updateSettings(config);
    }

    await this.saveConfigs();
    this.emitEvent('extension:configured', extensionId, { config });
  }

  /** Uninstall an extension by ID — IPC-facing method */
  async uninstall(extensionId: string): Promise<void> {
    const ext = this.extensions.get(extensionId);
    const config = this.configs.get(extensionId);

    if (!ext && !config) {
      throw new Error(`Extension "${extensionId}" not found`);
    }

    // Shut down if running
    if (ext) {
      try {
        await ext.shutdown();
      } catch {
        // Continue with uninstall even if shutdown fails
      }

      // Remove tool routing
      for (const tool of ext.listTools()) {
        if (this.toolToExtension.get(tool.name) === extensionId) {
          this.toolToExtension.delete(tool.name);
        }
      }
    }

    // Remove from registry
    this.extensions.delete(extensionId);
    this.configs.delete(extensionId);

    // Remove individual config file from disk if it exists
    const configDir = path.dirname(this.persistPath);
    const individualConfigPath = path.join(configDir, `${extensionId}.json`);
    try {
      await fs.unlink(individualConfigPath);
    } catch {
      // File may not exist — that's fine
    }

    // Save updated configs
    await this.saveConfigs();

    // Emit registry event
    this.emitEvent('extension:uninstalled', extensionId, { name: config?.name });

    // Emit plain event for main.ts IPC listener
    this.emit('uninstalled', extensionId);
  }

  /** Search for available extensions — returns uninstalled community and placeholder extensions */
  async search(query?: string, category?: string): Promise<ExtensionMetadata[]> {
    const installedIds = new Set(this.configs.keys());
    const results: ExtensionMetadata[] = [];

    // 1. Get community extensions from MCP registry that aren't installed
    const allCommunity = this.mcpRegistry.getAllExtensions();
    for (const entry of allCommunity) {
      if (installedIds.has(entry.type)) continue;

      const metadata: ExtensionMetadata = {
        id: entry.type,
        type: entry.type,
        name: entry.name,
        description: entry.description,
        version: entry.version,
        author: entry.author,
        homepage: entry.homepage,
        icon: entry.icon,
        category: entry.category,
        tags: entry.tags,
        requiredEnvVars: entry.requiredEnvVars,
        optionalEnvVars: entry.optionalEnvVars,
        permissions: entry.permissions,
        builtin: false,
        enabledByDefault: false,
        enabled: false,
      };
      results.push(metadata);
    }

    // 2. Add placeholder community extensions to demonstrate the marketplace
    const placeholders: ExtensionMetadata[] = [
      {
        id: 'community_weather',
        type: ExtensionType.Weather,
        name: 'Weather',
        description: 'Get current weather forecasts and historical data for any location worldwide.',
        version: '1.2.0',
        author: 'Community',
        category: ExtensionCategory.Automation,
        tags: ['weather', 'forecast', 'location'],
        requiredEnvVars: ['OPENWEATHER_API_KEY'],
        optionalEnvVars: [],
        permissions: [{ level: PermissionLevel.Read, reason: 'Fetch weather data via API' }],
        builtin: false,
        enabledByDefault: false,
        enabled: false,
      },
      {
        id: 'community_spotify',
        type: ExtensionType.Spotify,
        name: 'Spotify',
        description: 'Control Spotify playback, search for music, and manage playlists.',
        version: '0.9.0',
        author: 'Community',
        category: ExtensionCategory.Media,
        tags: ['music', 'spotify', 'playback', 'playlists'],
        requiredEnvVars: ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'],
        optionalEnvVars: ['SPOTIFY_REDIRECT_URI'],
        permissions: [{ level: PermissionLevel.Read, reason: 'Access Spotify API' }],
        builtin: false,
        enabledByDefault: false,
        enabled: false,
      },
      {
        id: 'community_twitter',
        type: ExtensionType.Twitter,
        name: 'Twitter / X',
        description: 'Post tweets, search timelines, and interact with the Twitter/X API.',
        version: '1.0.0',
        author: 'Community',
        category: ExtensionCategory.Communication,
        tags: ['twitter', 'social', 'tweets'],
        requiredEnvVars: ['TWITTER_API_KEY', 'TWITTER_API_SECRET'],
        optionalEnvVars: [],
        permissions: [{ level: PermissionLevel.Write, reason: 'Post and read tweets' }],
        builtin: false,
        enabledByDefault: false,
        enabled: false,
      },
    ];

    for (const ph of placeholders) {
      if (!installedIds.has(ph.id)) {
        results.push(ph);
      }
    }

    // 3. Filter by query
    let filtered = results;
    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(
        (ext) =>
          ext.name.toLowerCase().includes(q) ||
          ext.description.toLowerCase().includes(q) ||
          ext.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    // 4. Filter by category
    if (category) {
      filtered = filtered.filter((ext) => ext.category === category);
    }

    return filtered;
  }

  /** Install an extension from a URL (download and register) */
  async installFromUrl(url: string): Promise<ExtensionInterface> {
    // Run malware check on the URL
    const malwareCheck = this.mcpRegistry.checkUrlOrCommand(url);
    if (malwareCheck.flags.some((f) => f.severity === 'critical')) {
      throw new Error(`Installation blocked — security concerns: ${malwareCheck.flags.map((f) => f.message).join('; ')}`);
    }

    // Extract name from URL
    const urlParts = url.split('/');
    const repoName = urlParts[urlParts.length - 1] || 'unknown';
    const name = repoName.replace(/\.git$/, '').replace(/[-_]/g, ' ');

    const config: ExtensionConfig = {
      id: `custom_${Date.now()}`,
      type: ExtensionType.Fetch, // Default type for custom extensions
      name,
      description: `Custom extension installed from ${url}`,
      version: '0.1.0',
      enabled: true,
      settings: {},
      mcpServer: {
        command: 'npx',
        args: ['-y', url],
        env: {},
      },
      builtin: false,
      installedAt: new Date().toISOString(),
    };

    // Create extension instance
    const extension = new MCPExtensionWrapper(config);

    // Register
    this.extensions.set(config.id, extension);
    this.configs.set(config.id, config);

    // Try to initialize
    try {
      await extension.initialize();
      this.syncToolRouting(config.id, extension);
      this.emitEvent('extension:installed', config.id, { name: config.name, source: url });
    } catch (err) {
      this.emitEvent('extension:error', config.id, { error: String(err) });
    }

    await this.saveConfigs();
    return extension;
  }

  // ─── Tool routing ─────────────────────────────────────────────────────────

  /** Execute a tool by name — routes to the correct extension */
  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const extensionId = this.toolToExtension.get(toolName);
    if (!extensionId) {
      return {
        content: `Tool "${toolName}" not found. No extension provides this tool.`,
        isError: true,
        metadata: { availableTools: this.getAllToolNames() },
      };
    }

    const ext = this.extensions.get(extensionId);
    if (!ext) {
      return {
        content: `Extension "${extensionId}" for tool "${toolName}" is not available.`,
        isError: true,
      };
    }

    if (ext.getStatus() !== 'ready') {
      return {
        content: `Extension "${extensionId}" is not ready (status: ${ext.getStatus()}). Tool "${toolName}" cannot be executed.`,
        isError: true,
        metadata: { extensionStatus: ext.getStatus() },
      };
    }

    this.emitEvent('tool:called', extensionId, { toolName, args });

    const result = await ext.executeTool(toolName, args);

    if (result.isError) {
      this.emitEvent('tool:error', extensionId, { toolName, error: result.content.substring(0, 200) });
    } else {
      this.emitEvent('tool:completed', extensionId, { toolName });
    }

    return result;
  }

  /** Get all available tool names */
  getAllToolNames(): string[] {
    return Array.from(this.toolToExtension.keys());
  }

  /** Get all tools across all enabled extensions */
  getAllTools(): Array<ToolDefinition & { extensionId: string }> {
    const tools: Array<ToolDefinition & { extensionId: string }> = [];

    for (const [id, ext] of this.extensions) {
      const config = this.configs.get(id);
      if (!config?.enabled) continue;

      for (const tool of ext.listTools()) {
        tools.push({ ...tool, extensionId: id });
      }
    }

    return tools;
  }

  /** Get tools for a specific extension */
  getExtensionTools(extensionId: string): ToolDefinition[] {
    const ext = this.extensions.get(extensionId);
    if (!ext) return [];
    return ext.listTools();
  }

  /** Synchronize tool routing for an extension */
  private syncToolRouting(extensionId: string, ext: ExtensionInterface): void {
    // Remove old routing for this extension
    for (const [toolName, extId] of this.toolToExtension) {
      if (extId === extensionId) {
        this.toolToExtension.delete(toolName);
      }
    }

    // Add new routing
    for (const tool of ext.listTools()) {
      this.toolToExtension.set(tool.name, extensionId);
    }
  }

  // ─── Extension queries ────────────────────────────────────────────────────

  /** Get all extension configs */
  getExtensionConfigs(): ExtensionConfig[] {
    return Array.from(this.configs.values());
  }

  /** Get a specific extension config */
  getExtensionConfig(id: string): ExtensionConfig | undefined {
    return this.configs.get(id);
  }

  /** Get the status of a specific extension */
  getExtensionStatus(id: string): ExtensionStatus {
    const ext = this.extensions.get(id);
    if (!ext) return 'uninitialized';
    return ext.getStatus();
  }

  /** Get the tool count for a specific extension */
  getExtensionToolCount(id: string): number {
    const ext = this.extensions.get(id);
    if (!ext) return 0;
    return ext.listTools().length;
  }

  /** Get extension metadata for UI display */
  getExtensionMetadata(id: string): ExtensionMetadata | null {
    const config = this.configs.get(id);
    if (!config) return null;

    const ext = this.extensions.get(id);

    // Determine category
    const categoryMap: Partial<Record<ExtensionType, ExtensionCategory>> = {
      [ExtensionType.Developer]: ExtensionCategory.Development,
      [ExtensionType.ComputerController]: ExtensionCategory.System,
      [ExtensionType.Memory]: ExtensionCategory.Memory,
      [ExtensionType.Todo]: ExtensionCategory.Productivity,
      [ExtensionType.Summon]: ExtensionCategory.Automation,
      [ExtensionType.ExtensionManager]: ExtensionCategory.System,
      [ExtensionType.ChatRecall]: ExtensionCategory.Memory,
      [ExtensionType.CodeMode]: ExtensionCategory.Development,
      [ExtensionType.Apps]: ExtensionCategory.Productivity,
      [ExtensionType.AutoVisualiser]: ExtensionCategory.Design,
      [ExtensionType.TopOfMind]: ExtensionCategory.Memory,
      [ExtensionType.PptGenerator]: ExtensionCategory.DocumentGeneration,
      [ExtensionType.DocxGenerator]: ExtensionCategory.DocumentGeneration,
      [ExtensionType.XlsxGenerator]: ExtensionCategory.DocumentGeneration,
      [ExtensionType.GuiController]: ExtensionCategory.System,
    };

    return {
      id,
      type: config.type,
      name: config.name,
      description: config.description,
      version: config.version,
      category: categoryMap[config.type] || ExtensionCategory.Automation,
      tags: [],
      requiredEnvVars: config.mcpServer ? Object.keys(config.mcpServer.env) : [],
      optionalEnvVars: [],
      permissions: ext instanceof BaseExtension ? ext.getPermissions() : [],
      builtin: config.builtin,
      enabledByDefault: this.isEnabledByDefault(config.type),
      enabled: config.enabled,
    };
  }

  /** Get all extension metadata */
  getAllExtensionMetadata(): ExtensionMetadata[] {
    return Array.from(this.configs.keys())
      .map((id) => this.getExtensionMetadata(id))
      .filter((m): m is ExtensionMetadata => m !== null);
  }

  /** Search community extensions */
  searchCommunityExtensions(query: string): CommunityExtensionEntry[] {
    return this.mcpRegistry.search(query);
  }

  // ─── Health monitoring ─────────────────────────────────────────────────────

  /** Start periodic health monitoring */
  private startHealthMonitoring(): void {
    this.stopHealthMonitoring();

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.healthCheckIntervalMs);
  }

  /** Stop health monitoring */
  private stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /** Perform health checks on all extensions */
  private async performHealthChecks(): Promise<void> {
    for (const [id, ext] of this.extensions) {
      const config = this.configs.get(id);
      if (!config?.enabled) continue;

      try {
        if (ext instanceof BaseExtension) {
          const health = ext.getLastHealthCheck();
          if (health && !health.healthy) {
            this.emitEvent('health:check', id, { healthy: false, error: health.error });
          }
        }
      } catch (err) {
        this.emitEvent('extension:error', id, { error: String(err) });
      }
    }
  }

  /** Get health status of all extensions */
  async getHealthStatus(): Promise<Record<string, HealthCheckResult | null>> {
    const status: Record<string, HealthCheckResult | null> = {};

    for (const [id, ext] of this.extensions) {
      if (ext instanceof BaseExtension) {
        status[id] = ext.getLastHealthCheck();
      } else {
        status[id] = {
          healthy: ext.getStatus() === 'ready',
          latencyMs: 0,
          timestamp: new Date().toISOString(),
        };
      }
    }

    return status;
  }

  // ─── Dependency resolution ─────────────────────────────────────────────────

  /** Check if an extension's dependencies are satisfied */
  checkDependencies(extensionId: string): {
    satisfied: boolean;
    missing: string[];
  } {
    const config = this.configs.get(extensionId);
    if (!config) return { satisfied: false, missing: ['Extension not found'] };

    const dependencies = this.getDependencies(config.type);
    const missing: string[] = [];

    for (const dep of dependencies) {
      const depConfig = Array.from(this.configs.values()).find((c) => c.type === dep);
      if (!depConfig || !depConfig.enabled) {
        missing.push(dep);
      }
    }

    return {
      satisfied: missing.length === 0,
      missing,
    };
  }

  /** Get the dependencies for an extension type */
  private getDependencies(type: ExtensionType): ExtensionType[] {
    const dependencyMap: Partial<Record<ExtensionType, ExtensionType[]>> = {
      [ExtensionType.ComputerController]: [ExtensionType.Developer],
      [ExtensionType.CodeMode]: [ExtensionType.Developer],
      [ExtensionType.Summon]: [ExtensionType.ExtensionManager],
    };

    return dependencyMap[type] || [];
  }

  /** Resolve dependencies — enable all required extensions */
  async resolveDependencies(extensionId: string): Promise<boolean> {
    const deps = this.checkDependencies(extensionId);
    if (deps.satisfied) return true;

    for (const missingType of deps.missing) {
      const config = Array.from(this.configs.values()).find((c) => c.type === missingType);
      if (config) {
        const success = await this.enableExtension(config.id);
        if (!success) return false;
      }
    }

    return true;
  }

  // ─── Persistence ───────────────────────────────────────────────────────────

  /** Save extension configs to disk */
  async saveConfigs(): Promise<void> {
    try {
      const dir = path.dirname(this.persistPath);
      await fs.mkdir(dir, { recursive: true });

      const data = Array.from(this.configs.values());
      await fs.writeFile(this.persistPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      this.emitEvent('extension:error', 'registry', {
        error: `Failed to save configs: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /** Load extension configs from disk */
  private async loadConfigs(): Promise<void> {
    try {
      const data = await fs.readFile(this.persistPath, 'utf-8');
      const configs = JSON.parse(data) as ExtensionConfig[];

      for (const config of configs) {
        this.configs.set(config.id, config);
      }
    } catch {
      // No persisted configs — use defaults
    }
  }

  // ─── Dynamic loading ───────────────────────────────────────────────────────

  /** Dynamically load a community extension by type */
  async loadCommunityExtension(type: ExtensionType): Promise<ExtensionConfig | null> {
    const entry = this.mcpRegistry.getExtension(type);
    if (!entry) {
      throw new Error(`Community extension "${type}" not found in registry`);
    }

    // Check if already installed
    const existingConfig = Array.from(this.configs.values()).find((c) => c.type === type);
    if (existingConfig) {
      return existingConfig;
    }

    return this.installExtension(type);
  }

  /** Reload an extension (shutdown + reinitialize) */
  async reloadExtension(id: string): Promise<boolean> {
    const ext = this.extensions.get(id);
    if (!ext) return false;

    try {
      await ext.shutdown();
      await ext.initialize();
      this.syncToolRouting(id, ext);
      this.emitEvent('extension:initialized', id);
      return true;
    } catch (err) {
      this.emitEvent('extension:error', id, { error: String(err) });
      return false;
    }
  }

  // ─── MCP discovery ─────────────────────────────────────────────────────────

  /** Discover and register installed MCP servers */
  async discoverMCPServers(): Promise<Array<{ type: ExtensionType; name: string; discovered: boolean }>> {
    const discovered = await this.mcpRegistry.discoverInstalledServers();

    const results: Array<{ type: ExtensionType; name: string; discovered: boolean }> = [];

    for (const server of discovered) {
      // Check if already registered
      const existingConfig = Array.from(this.configs.values()).find((c) => c.type === server.type);
      if (existingConfig) {
        results.push({ type: server.type, name: server.name, discovered: true });
        continue;
      }

      // Register the discovered server
      const entry = this.mcpRegistry.getExtension(server.type);
      if (!entry) continue;

      const config: ExtensionConfig = {
        id: server.type,
        type: server.type,
        name: server.name,
        description: entry.description,
        version: entry.version,
        enabled: false,
        settings: {},
        mcpServer: {
          command: server.command,
          args: server.args,
          env: entry.requiredEnvVars.reduce<Record<string, string>>((acc, varName) => {
            const value = process.env[varName];
            if (value) acc[varName] = value;
            return acc;
          }, {}),
        },
        builtin: false,
        installedAt: new Date().toISOString(),
      };

      const extension = new MCPExtensionWrapper(config);
      this.extensions.set(config.id, extension);
      this.configs.set(config.id, config);

      results.push({ type: server.type, name: server.name, discovered: true });
    }

    await this.saveConfigs();
    return results;
  }

  // ─── Utility ───────────────────────────────────────────────────────────────

  /** Check if an extension type is enabled by default */
  private isEnabledByDefault(type: ExtensionType): boolean {
    const enabledByDefault: ExtensionType[] = [
      ExtensionType.Developer,
      ExtensionType.Memory,
      ExtensionType.Todo,
      ExtensionType.Summon,
      ExtensionType.ExtensionManager,
    ];
    return enabledByDefault.includes(type);
  }

  /** Emit a registry event */
  private emitEvent(type: RegistryEventType, extensionId: string, data?: Record<string, unknown>): void {
    const event: RegistryEvent = {
      type,
      extensionId,
      timestamp: new Date().toISOString(),
      data,
    };

    this.emit(type, event);
    this.emit('event', event); // Catch-all event
  }

  /** Get the number of registered extensions */
  getExtensionCount(): number {
    return this.extensions.size;
  }

  /** Get the number of enabled extensions */
  getEnabledExtensionCount(): number {
    return Array.from(this.configs.values()).filter((c) => c.enabled).length;
  }

  /** Check if the registry is initialized */
  isInitialized(): boolean {
    return this.initialized;
  }

  /** Get a summary of the registry state */
  getSummary(): {
    totalExtensions: number;
    enabledExtensions: number;
    totalTools: number;
    readyExtensions: number;
    errorExtensions: number;
  } {
    let enabledCount = 0;
    let readyCount = 0;
    let errorCount = 0;

    for (const [id, ext] of this.extensions) {
      const config = this.configs.get(id);
      if (config?.enabled) enabledCount++;
      const status = ext.getStatus();
      if (status === 'ready') readyCount++;
      if (status === 'error') errorCount++;
    }

    return {
      totalExtensions: this.extensions.size,
      enabledExtensions: enabledCount,
      totalTools: this.toolToExtension.size,
      readyExtensions: readyCount,
      errorExtensions: errorCount,
    };
  }

  /** Get the MCP registry instance */
  getMCPRegistry(): MCPRegistry {
    return this.mcpRegistry;
  }

  /** Get an extension instance by ID */
  getExtension(id: string): ExtensionInterface | undefined {
    return this.extensions.get(id);
  }

  /** Update an extension's settings */
  async updateExtensionSettings(id: string, settings: Record<string, unknown>): Promise<boolean> {
    const config = this.configs.get(id);
    if (!config) return false;

    config.settings = { ...config.settings, ...settings };

    // Apply settings to the extension if it's a BaseExtension
    const ext = this.extensions.get(id);
    if (ext instanceof BaseExtension) {
      ext.updateSettings(settings);
    }

    await this.saveConfigs();
    return true;
  }

  /** Get the Top of Mind extension's combined instructions */
  getPersistentInstructions(): string {
    const ext = this.extensions.get('top_of_mind');
    if (ext instanceof TopOfMindExtension) {
      return ext.getCombinedInstructions();
    }
    return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton instance
// ─────────────────────────────────────────────────────────────────────────────

let registryInstance: ExtensionRegistry | null = null;

export function getExtensionRegistry(): ExtensionRegistry {
  if (!registryInstance) {
    registryInstance = new ExtensionRegistry();
  }
  return registryInstance;
}

export function resetExtensionRegistry(): void {
  registryInstance = null;
}
