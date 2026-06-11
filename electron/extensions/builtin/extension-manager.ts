/**
 * OpenAgent-Desktop - Extension Manager Extension
 *
 * Enabled by default. Manages extensions:
 * - list_extensions: List all extensions and their status
 * - enable_extension: Enable an extension
 * - disable_extension: Disable an extension
 * - install_extension: Install new extension from URL or name
 * - uninstall_extension: Remove an extension
 * - search_extensions: Search community extensions
 */

import { BaseExtension } from '../base-extension';
import {
  ExtensionConfig,
  ExtensionType,
  ExtensionStatus,
  ToolResult,
  PermissionLevel,
  CommunityExtensionEntry,
  MalwareCheckResult,
  MalwareFlag,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Extension Manager state
// ─────────────────────────────────────────────────────────────────────────────

interface ExtensionInfo {
  id: string;
  type: ExtensionType;
  name: string;
  description: string;
  version: string;
  status: ExtensionStatus;
  enabled: boolean;
  builtin: boolean;
  toolCount: number;
  installedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extension Manager Extension class
// ─────────────────────────────────────────────────────────────────────────────

export class ExtensionManagerExtension extends BaseExtension {
  /** Reference to the extension registry (set during initialization) */
  private registry: {
    getExtensionConfigs(): ExtensionConfig[];
    getExtensionStatus(id: string): ExtensionStatus;
    enableExtension(id: string): Promise<boolean>;
    disableExtension(id: string): Promise<boolean>;
    installExtension(urlOrName: string): Promise<ExtensionConfig | null>;
    uninstallExtension(id: string): Promise<boolean>;
    getExtensionToolCount(id: string): number;
    searchCommunityExtensions(query: string): CommunityExtensionEntry[];
  } | null = null;

  constructor(config: ExtensionConfig) {
    super(config);
  }

  /** Set the registry reference — called by ExtensionRegistry during setup */
  setRegistry(registry: NonNullable<typeof this.registry>): void {
    this.registry = registry;
  }

  protected registerTools(): void {
    this.registerTool(
      {
        name: 'list_extensions',
        description: 'List all registered extensions with their current status, enabled state, and tool counts.',
        parameters: {
          type: 'object',
          properties: {
            filter: {
              type: 'string',
              description: 'Filter extensions by state',
              enum: ['all', 'enabled', 'disabled', 'builtin', 'community', 'error'],
              default: 'all',
            },
          },
        },
      },
      this.executeListExtensions.bind(this),
    );

    this.registerTool(
      {
        name: 'enable_extension',
        description: 'Enable an extension by its ID. The extension will be initialized and its tools will become available.',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID of the extension to enable',
            },
          },
          required: ['id'],
        },
      },
      this.executeEnableExtension.bind(this),
    );

    this.registerTool(
      {
        name: 'disable_extension',
        description: 'Disable an extension by its ID. The extension will be shut down and its tools will no longer be available.',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID of the extension to disable',
            },
          },
          required: ['id'],
        },
      },
      this.executeDisableExtension.bind(this),
    );

    this.registerTool(
      {
        name: 'install_extension',
        description:
          'Install a new extension from a community registry by name, or from a git/repository URL. ' +
          'The extension will be downloaded, validated for safety, and registered.',
        parameters: {
          type: 'object',
          properties: {
            url_or_name: {
              type: 'string',
              description: 'Extension name from the community registry (e.g., "github") or a repository URL',
            },
            auto_enable: {
              type: 'boolean',
              description: 'Whether to automatically enable the extension after installation (default: true)',
              default: true,
            },
          },
          required: ['url_or_name'],
        },
      },
      this.executeInstallExtension.bind(this),
    );

    this.registerTool(
      {
        name: 'uninstall_extension',
        description: 'Uninstall an extension by its ID. Built-in extensions cannot be uninstalled.',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID of the extension to uninstall',
            },
            force: {
              type: 'boolean',
              description: 'Force uninstall even if the extension is currently enabled (default: false)',
              default: false,
            },
          },
          required: ['id'],
        },
      },
      this.executeUninstallExtension.bind(this),
    );

    this.registerTool(
      {
        name: 'search_extensions',
        description: 'Search the community extension registry by name, category, or functionality.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query (e.g., "github", "database", "browser automation")',
            },
            category: {
              type: 'string',
              description: 'Filter by category',
              enum: ['development', 'productivity', 'browser', 'cloud', 'database', 'communication', 'design', 'media', 'search', 'memory', 'system', 'document_generation', 'automation', 'data'],
            },
          },
          required: ['query'],
        },
      },
      this.executeSearchExtensions.bind(this),
    );

    this.setPermissions([
      {
        level: PermissionLevel.Admin,
        reason: 'Manages extension lifecycle including installation and removal',
        resources: ['extensions', 'filesystem'],
      },
    ]);
  }

  // ─── Tool implementations ──────────────────────────────────────────────────

  private async executeListExtensions(args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.registry) {
      return this.error('Extension registry not available');
    }

    const filter = (args.filter as string) || 'all';
    const configs = this.registry.getExtensionConfigs();

    let filtered = configs;
    switch (filter) {
      case 'enabled':
        filtered = configs.filter((c) => c.enabled);
        break;
      case 'disabled':
        filtered = configs.filter((c) => !c.enabled);
        break;
      case 'builtin':
        filtered = configs.filter((c) => c.builtin);
        break;
      case 'community':
        filtered = configs.filter((c) => !c.builtin);
        break;
      case 'error':
        filtered = configs.filter((c) => this.registry!.getExtensionStatus(c.id) === 'error');
        break;
    }

    if (filtered.length === 0) {
      return this.success(`No extensions found matching filter "${filter}"`, { count: 0, filter });
    }

    const extensions: ExtensionInfo[] = filtered.map((c) => ({
      id: c.id,
      type: c.type,
      name: c.name,
      description: c.description,
      version: c.version,
      status: this.registry!.getExtensionStatus(c.id),
      enabled: c.enabled,
      builtin: c.builtin,
      toolCount: this.registry!.getExtensionToolCount(c.id),
      installedAt: c.installedAt,
    }));

    const output = extensions
      .map((ext) => {
        const statusIcon = ext.status === 'ready' ? '🟢' : ext.status === 'error' ? '🔴' : ext.status === 'initializing' ? '🟡' : '⚪';
        const builtinBadge = ext.builtin ? ' [builtin]' : '';
        const enabledBadge = ext.enabled ? '' : ' [disabled]';
        return `${statusIcon} ${ext.name} (v${ext.version}) — ${ext.description.substring(0, 60)}${builtinBadge}${enabledBadge}\n   ID: ${ext.id} | Status: ${ext.status} | Tools: ${ext.toolCount}`;
      })
      .join('\n\n');

    return this.success(output, { count: extensions.length, filter });
  }

  private async executeEnableExtension(args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.registry) {
      return this.error('Extension registry not available');
    }

    const id = args.id as string;

    try {
      const success = await this.registry.enableExtension(id);
      if (success) {
        return this.success(`Extension "${id}" enabled successfully`, { id, enabled: true });
      }
      return this.error(`Failed to enable extension "${id}". It may not be registered or initialization failed.`);
    } catch (err) {
      return this.error(
        `Error enabling extension "${id}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async executeDisableExtension(args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.registry) {
      return this.error('Extension registry not available');
    }

    const id = args.id as string;

    try {
      const success = await this.registry.disableExtension(id);
      if (success) {
        return this.success(`Extension "${id}" disabled successfully`, { id, enabled: false });
      }
      return this.error(`Failed to disable extension "${id}".`);
    } catch (err) {
      return this.error(
        `Error disabling extension "${id}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async executeInstallExtension(args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.registry) {
      return this.error('Extension registry not available');
    }

    const urlOrName = args.url_or_name as string;
    const autoEnable = args.auto_enable !== false;

    try {
      // Perform malware check first
      const malwareCheck = this.checkMalware(urlOrName);
      if (!malwareCheck.safe) {
        const criticalFlags = malwareCheck.flags.filter((f) => f.severity === 'critical');
        if (criticalFlags.length > 0) {
          return this.error(
            `Installation blocked — security concerns detected:\n${malwareCheck.flags.map((f) => `  [${f.severity}] ${f.message}`).join('\n')}`,
            { malwareCheck },
          );
        }
      }

      const config = await this.registry.installExtension(urlOrName);
      if (!config) {
        return this.error(`Failed to install extension from "${urlOrName}". Check the name or URL and try again.`);
      }

      if (autoEnable && config) {
        await this.registry.enableExtension(config.id);
      }

      return this.success(
        `Extension "${config.name}" installed successfully${autoEnable ? ' and enabled' : ''}.\n` +
        `ID: ${config.id}\nVersion: ${config.version}\nDescription: ${config.description}`,
        { id: config.id, name: config.name, enabled: autoEnable },
      );
    } catch (err) {
      return this.error(
        `Error installing extension: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async executeUninstallExtension(args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.registry) {
      return this.error('Extension registry not available');
    }

    const id = args.id as string;
    const force = args.force as boolean;

    // Check if it's a built-in extension
    const configs = this.registry.getExtensionConfigs();
    const ext = configs.find((c) => c.id === id);
    if (!ext) {
      return this.error(`Extension "${id}" not found.`);
    }

    if (ext.builtin) {
      return this.error(`Cannot uninstall built-in extension "${ext.name}". Use disable_extension instead.`);
    }

    if (ext.enabled && !force) {
      return this.error(
        `Extension "${id}" is currently enabled. Disable it first or use force=true.`,
      );
    }

    try {
      const success = await this.registry.uninstallExtension(id);
      if (success) {
        return this.success(`Extension "${id}" uninstalled successfully`, { id, uninstalled: true });
      }
      return this.error(`Failed to uninstall extension "${id}".`);
    } catch (err) {
      return this.error(
        `Error uninstalling extension "${id}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async executeSearchExtensions(args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.registry) {
      return this.error('Extension registry not available');
    }

    const query = args.query as string;
    const category = args.category as string | undefined;

    const results = this.registry.searchCommunityExtensions(query);

    // Filter by category if specified
    const filtered = category
      ? results.filter((r) => r.category === category)
      : results;

    if (filtered.length === 0) {
      return this.success(
        `No community extensions found matching "${query}"${category ? ` in category "${category}"` : ''}`,
        { query, category, count: 0 },
      );
    }

    const output = filtered
      .slice(0, 20)
      .map((ext, idx) => {
        const trusted = ext.trusted ? '✓' : '⚠';
        return `${idx + 1}. ${trusted} ${ext.name} (v${ext.version}) — ${ext.description.substring(0, 80)}\n   Type: ${ext.type} | Category: ${ext.category} | Command: ${ext.command}`;
      })
      .join('\n\n');

    return this.success(
      `Found ${filtered.length} extension(s) for "${query}":\n\n${output}`,
      { query, category, count: filtered.length },
    );
  }

  // ─── Malware detection ─────────────────────────────────────────────────────

  private checkMalware(urlOrName: string): MalwareCheckResult {
    const flags: MalwareFlag[] = [];

    // Check against known-bad patterns
    const knownMaliciousPatterns = [
      /rm\s+-rf\s+\//,
      /curl\s+.*\|\s*(ba)?sh/,
      /wget\s+.*\|\s*(ba)?sh/,
      /eval\s*\(/,
      /node\s+-e\s+/,
      /python\s+-c\s+/,
    ];

    for (const pattern of knownMaliciousPatterns) {
      if (pattern.test(urlOrName)) {
        flags.push({
          type: 'suspicious_command',
          message: `Potentially dangerous command pattern detected`,
          severity: 'critical',
          detail: `Pattern: ${pattern.source}`,
        });
      }
    }

    // Check for unverified sources
    const trustedDomains = [
      'github.com',
      'npmjs.com',
      'pypi.org',
      'registry.npmjs.org',
    ];
    const isUrl = urlOrName.startsWith('http://') || urlOrName.startsWith('https://');
    if (isUrl) {
      const isTrustedDomain = trustedDomains.some((domain) => urlOrName.includes(domain));
      if (!isTrustedDomain) {
        flags.push({
          type: 'unverified_source',
          message: 'Extension URL is not from a trusted domain',
          severity: 'medium',
          detail: `Trusted domains: ${trustedDomains.join(', ')}`,
        });
      }
    }

    return {
      safe: flags.every((f) => f.severity === 'low'),
      flags,
      checkedAt: new Date().toISOString(),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory function
// ─────────────────────────────────────────────────────────────────────────────

export function createExtensionManagerExtension(): ExtensionConfig {
  return {
    id: 'extension_manager',
    type: ExtensionType.ExtensionManager,
    name: 'Extension Manager',
    description: 'Install, enable, disable, and manage extensions for OpenAgent-Desktop',
    version: '1.0.0',
    enabled: true,
    settings: {
      allowUnverifiedSources: false,
      autoUpdateExtensions: true,
      malwareCheckEnabled: true,
      corporateAllowlist: [],
    },
    builtin: true,
    installedAt: new Date().toISOString(),
  };
}
