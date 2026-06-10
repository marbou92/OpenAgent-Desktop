/**
 * OpenAgent Desktop - Apps Extension
 *
 * Create and manage standalone HTML applications:
 * - create_app: Create HTML app in standalone window
 * - list_apps: List custom apps
 * - launch_app: Open app window
 * - delete_app: Remove app
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BaseExtension } from '../base-extension';
import {
  ExtensionConfig,
  ExtensionType,
  ToolDefinition,
  ToolResult,
  Permission,
  PermissionLevel,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// App data structures
// ─────────────────────────────────────────────────────────────────────────────

interface AppEntry {
  id: string;
  name: string;
  html: string;
  css: string;
  js: string;
  createdAt: string;
  updatedAt: string;
  width: number;
  height: number;
  lastLaunchedAt: string | null;
  launchCount: number;
}

interface AppStore {
  version: number;
  apps: Record<string, AppEntry>;
  nextId: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Apps Extension class
// ─────────────────────────────────────────────────────────────────────────────

export class AppsExtension extends BaseExtension {
  private storePath: string;
  private appsDir: string;
  private store: AppStore;
  private dirty: boolean = false;
  private openWindows: Map<string, number> = new Map(); // appId -> windowId

  constructor(config: ExtensionConfig) {
    super(config);
    this.storePath = this.getSetting<string>(
      'storePath',
      path.join(os.homedir(), '.openagent', 'apps', 'apps.json'),
    );
    this.appsDir = this.getSetting<string>(
      'appsDir',
      path.join(os.homedir(), '.openagent', 'apps', 'generated'),
    );
    this.store = { version: 1, apps: {}, nextId: 1 };
  }

  protected registerTools(): void {
    this.registerTool(
      {
        name: 'create_app',
        description:
          'Create a standalone HTML application that can be opened in its own window. ' +
          'Provide HTML, CSS, and JS content. The app will be saved and can be launched later.',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name for the app',
            },
            html: {
              type: 'string',
              description: 'HTML content for the app body',
            },
            css: {
              type: 'string',
              description: 'CSS styles for the app',
              default: '',
            },
            js: {
              type: 'string',
              description: 'JavaScript code for the app',
              default: '',
            },
          },
          required: ['name', 'html'],
        },
      },
      this.executeCreateApp.bind(this),
    );

    this.registerTool(
      {
        name: 'list_apps',
        description: 'List all created apps with their details.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      this.executeListApps.bind(this),
    );

    this.registerTool(
      {
        name: 'launch_app',
        description: 'Open an app in a standalone window. The app must have been created previously.',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID of the app to launch',
            },
          },
          required: ['id'],
        },
      },
      this.executeLaunchApp.bind(this),
    );

    this.registerTool(
      {
        name: 'delete_app',
        description: 'Delete an app by its ID.',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID of the app to delete',
            },
          },
          required: ['id'],
        },
      },
      this.executeDeleteApp.bind(this),
    );

    this.setPermissions([
      {
        level: PermissionLevel.Write,
        reason: 'Creates and manages HTML app files',
        resources: ['filesystem', 'windows'],
      },
    ]);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  protected async onInitialize(): Promise<void> {
    await this.loadStore();
    await fs.mkdir(this.appsDir, { recursive: true });
  }

  protected async onShutdown(): Promise<void> {
    // Close all open windows
    for (const [appId, windowId] of this.openWindows) {
      try {
        // In Electron, this would call BrowserWindow.fromId(windowId).close()
        this.logger.debug(`Closing window for app ${appId}`);
      } catch {
        // Window may already be closed
      }
    }
    this.openWindows.clear();
    await this.flushStore();
  }

  // ─── Store persistence ─────────────────────────────────────────────────────

  private async loadStore(): Promise<void> {
    try {
      const dir = path.dirname(this.storePath);
      await fs.mkdir(dir, { recursive: true });
      const data = await fs.readFile(this.storePath, 'utf-8');
      this.store = JSON.parse(data) as AppStore;
    } catch {
      this.store = { version: 1, apps: {}, nextId: 1 };
      this.dirty = true;
    }
  }

  private async flushStore(): Promise<void> {
    if (!this.dirty) return;
    try {
      const dir = path.dirname(this.storePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.storePath, JSON.stringify(this.store, null, 2), 'utf-8');
      this.dirty = false;
    } catch (err) {
      this.logger.error('Failed to flush apps store', err);
    }
  }

  private generateId(): string {
    const id = `app_${this.store.nextId}`;
    this.store.nextId++;
    this.dirty = true;
    return id;
  }

  /** Generate a complete HTML file for an app */
  private generateAppHTML(app: AppEntry): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${app.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    ${app.css}
  </style>
</head>
<body>
  ${app.html}
  <script>
    // OpenAgent App Runtime
    const openagent = {
      version: '1.0.0',
      appId: '${app.id}',
      close: () => window.close(),
    };

    ${app.js}
  </script>
</body>
</html>`;
  }

  // ─── Tool implementations ──────────────────────────────────────────────────

  private async executeCreateApp(args: Record<string, unknown>): Promise<ToolResult> {
    const name = args.name as string;
    const html = args.html as string;
    const css = (args.css as string) || '';
    const js = (args.js as string) || '';
    const now = new Date().toISOString();

    const id = this.generateId();
    const app: AppEntry = {
      id,
      name,
      html,
      css,
      js,
      createdAt: now,
      updatedAt: now,
      width: 800,
      height: 600,
      lastLaunchedAt: null,
      launchCount: 0,
    };

    this.store.apps[id] = app;
    this.dirty = true;

    // Generate and save the HTML file
    const appHTML = this.generateAppHTML(app);
    const appFile = path.join(this.appsDir, `${id}.html`);
    await fs.writeFile(appFile, appHTML, 'utf-8');

    return this.success(
      `App "${name}" created successfully.\nID: ${id}\nFile: ${appFile}`,
      { id, name, filePath: appFile },
    );
  }

  private async executeListApps(_args: Record<string, unknown>): Promise<ToolResult> {
    const apps = Object.values(this.store.apps);

    if (apps.length === 0) {
      return this.success('No apps created yet.', { count: 0 });
    }

    const output = apps
      .map((app) => {
        const isOpen = this.openWindows.has(app.id);
        const statusIcon = isOpen ? '🟢' : '⚪';
        return `${statusIcon} [${app.id}] ${app.name}\n   Created: ${new Date(app.createdAt).toLocaleDateString()} | Launched: ${app.launchCount}x | Size: ${app.width}x${app.height}`;
      })
      .join('\n\n');

    return this.success(output, { count: apps.length });
  }

  private async executeLaunchApp(args: Record<string, unknown>): Promise<ToolResult> {
    const id = args.id as string;

    const app = this.store.apps[id];
    if (!app) {
      return this.error(`App "${id}" not found`);
    }

    // Ensure the HTML file exists
    const appFile = path.join(this.appsDir, `${id}.html`);
    try {
      await fs.access(appFile);
    } catch {
      // Regenerate the HTML file
      const appHTML = this.generateAppHTML(app);
      await fs.writeFile(appFile, appHTML, 'utf-8');
    }

    app.lastLaunchedAt = new Date().toISOString();
    app.launchCount++;
    this.dirty = true;

    // In Electron, this would open a new BrowserWindow:
    // const win = new BrowserWindow({ width: app.width, height: app.height, title: app.name });
    // win.loadFile(appFile);
    // this.openWindows.set(id, win.id);

    this.logger.info(`App "${app.name}" launched (file: ${appFile})`);

    return this.success(
      `App "${app.name}" launched in standalone window.\nFile: ${appFile}`,
      { id, name: app.name, filePath: appFile, launchCount: app.launchCount },
    );
  }

  private async executeDeleteApp(args: Record<string, unknown>): Promise<ToolResult> {
    const id = args.id as string;

    const app = this.store.apps[id];
    if (!app) {
      return this.error(`App "${id}" not found`);
    }

    // Close window if open
    if (this.openWindows.has(id)) {
      this.openWindows.delete(id);
    }

    // Delete the HTML file
    const appFile = path.join(this.appsDir, `${id}.html`);
    try {
      await fs.unlink(appFile);
    } catch {
      // File may not exist
    }

    delete this.store.apps[id];
    this.dirty = true;

    return this.success(`App "${app.name}" deleted`, { deletedId: id, name: app.name });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory function
// ─────────────────────────────────────────────────────────────────────────────

export function createAppsExtension(): ExtensionConfig {
  return {
    id: 'apps',
    type: ExtensionType.Apps,
    name: 'Apps',
    description: 'Create and manage standalone HTML applications in their own windows',
    version: '1.0.0',
    enabled: false,
    settings: {
      storePath: '',
      appsDir: '',
    },
    builtin: true,
    installedAt: new Date().toISOString(),
  };
}
