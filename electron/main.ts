/**
 * OpenAgent-Desktop - Electron Main Process Entry Point
 *
 * This is the main process for the OpenAgent-Desktop application.
 * It manages the BrowserWindow, IPC handlers, system tray, auto-updater,
 * deep links, and coordinates all subsystems.
 */

import {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  shell,
  dialog,
} from "electron";
import { autoUpdater } from "electron-updater";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";

// ─── Subsystem Imports ────────────────────────────────────────────────────────
import { SandboxManager } from "./sandbox/manager";
import { ProviderManager } from "./providers/manager";
import { ExtensionRegistry } from "./extensions/registry";
import { TraceCollector, TraceEntryType } from "./trace/collector";
import { SessionManager } from "./session/manager";
import { RecipeEngine } from "./recipes/engine";
import { HookManager, HookType } from "./hooks/manager";
import { ACPClient } from "./acp/client";
import { createBackup, recoverFromBackup, atomicWriteJSON } from "./utils/config-backup";
import { initializeLogger, logger, LogLevel } from "./utils/logger";
import { validateAppConfig } from "./utils/config-validator";
import { OpenCodeBridge, getOpenCodeBridge, setOpenCodeBridge } from './opencode/bridge';
import { ProjectManager } from './projects/manager';
import { SkillRegistry } from './skills/registry';
import { ProviderHealthMonitor } from './providers/health-monitor';
// ─── Aether v2: New Subsystem Imports ──────────────────────────────────────
import { CrashLogger, CrashDetector } from './crash';
// ─── Provider v3: New Provider System Imports ──────────────────────────────
import { AuthStore } from './providers/auth-store';
import { ProviderClient, setSidecarEndpoint } from './providers/provider-client';
import { OAuthHandler } from './providers/oauth/oauth-handler';
import { AzureAdProvider } from './providers/azure-ad/msal-provider';
import { ModelDiscoverer } from './providers/model-discoverer';
import { SessionBinding } from './providers/session-binding';
import { getProviderRegistry } from './providers/provider-registry';
// ─── Phase 1-8: New Subsystem Imports ────────────────────────────────────────
import { AgentRegistry, getAgentRegistry, setAgentRegistry } from './agents/registry';
import { AutoModeDetector, getAutoModeDetector } from './agents/auto-mode';
import { AgentPresetManager } from './agents/agent-presets';
import { AgentSessionBridge } from './agents/session-bridge';
import { AgentRunner } from './agents/agent-runner';
import { executeToolCall, listAvailableTools } from './agents/tool-executor';
import { AgentMode, ToolPermissionLevel } from './agents/types';
import { ModelIdResolver, getModelIdResolver } from './providers/model-id-resolver';
import { ConfigSetManager } from './providers/config-sets';
import { ModelVariantManager } from './providers/model-variants';
import { ProviderDiagnostics } from './providers/diagnostics';
import { AutoCompactionManager } from './context/auto-compaction-manager';
import { ContextWindowManager } from './context/context-window-manager';
import { SemanticSearchEngine } from './memory/embedding-search';
import { CoreMemoryStore } from './memory/core-store';
import { ExperienceMemoryStore } from './memory/experience-store';
import { WildcardMatcher } from './permissions/wildcard-matcher';
import { PermissionPolicyEngine } from './permissions/policy-engine';
import { SteerManager } from './security/steer-manager';
import { InjectionScanner } from './security/injection-scanner';
import { RecipeImporter } from './recipes/recipe-importer';
import { ScheduledExecutor } from './recipes/scheduled-executor';
import { SubagentDashboard } from './recipes/subagent-dashboard';
import { ExtensionMarketplace } from './extensions/marketplace';
import { HotReloadManager } from './extensions/hot-reload';
import { ExtensionLifecycleManager } from './extensions/lifecycle-manager';
import { ProjectConfigManager } from './config/project-config-manager';
import { SessionOperations } from './session/session-ops';
import { ComputerUseOverlayManager } from './extensions/computer-use-overlay';
import { LayeredConfig } from './config/layered-config';
import { runMigrations, closeDatabase } from './database';
// ─── Type Definitions ─────────────────────────────────────────────────────────

interface AppConfig {
  windowBounds: { width: number; height: number; x?: number; y?: number };
  theme: "light" | "dark" | "system";
  language: string;
  autoUpdate: boolean;
  minimizeToTray: boolean;
  startupBehavior: 'show' | 'hidden' | 'tray';
  defaultProviderId: string;
  defaultModel: string;
  opencodePort: number;
  opencodeHostname: string;
  opencodeAutoStart: boolean;
  autoStartSandbox: boolean;
  maxConcurrentSessions: number;
  autoSave: boolean;
  sessionTimeoutMinutes: number;
  permissionMode: string;
  sandboxMode: 'path' | 'vm';
  debugMode: boolean;
  skillsPath: string;
  enableBuiltinSkills: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  traceEnabled: boolean;
  crashLogRetention: number;
  developerMode: boolean;
}

interface DropppedFile {
  path: string;
  name: string;
  size: number;
  type: string;
  content?: Buffer;
}

// ─── IPC Error Handling ────────────────────────────────────────────────────────

interface IPCError {
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

function wrapIPC<T>(handler: (...args: any[]) => Promise<T>): (...args: any[]) => Promise<T | IPCError> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error: any) {
      return {
        code: error.code || 'UNKNOWN_ERROR',
        message: error.message || 'An unexpected error occurred',
        context: { stack: error.stack },
      };
    }
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const IS_DEV = process.env.NODE_ENV === "development" || !app.isPackaged;
const APP_NAME = "OpenAgent-Desktop";
const DEEP_LINK_PROTOCOL = "openagent-desktop";
const CONFIG_FILE = "openagent-desktop-config.json";
const MAX_TRACE_DAYS = 30;

// ─── Global State ─────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

let sandboxManager: SandboxManager;
let providerManager: ProviderManager;
let extensionRegistry: ExtensionRegistry;
let traceCollector: TraceCollector;
let sessionManager: SessionManager;
let recipeEngine: RecipeEngine;
let hookManager: HookManager;
let acpClient: ACPClient;
let projectManager: ProjectManager;
let skillRegistry: SkillRegistry;
let healthMonitor: ProviderHealthMonitor;
let openCodeBridge: OpenCodeBridge;

// ─── Provider v3 Globals ────────────────────────────────────────────────────
let authStore: AuthStore;
let providerClient: ProviderClient;
let oauthHandler: OAuthHandler;
let azureAdProvider: AzureAdProvider;
let modelDiscoverer: ModelDiscoverer;
let sessionBinding: SessionBinding;

// ─── Phase 1-8: New Subsystem Globals ────────────────────────────────────────
let agentRegistry: AgentRegistry;
let autoModeDetector: AutoModeDetector;
let agentPresetManager: AgentPresetManager;
let agentSessionBridge: AgentSessionBridge;
let modelIdResolver: ModelIdResolver;
let configSetManager: ConfigSetManager;
let modelVariantManager: ModelVariantManager;
let providerDiagnostics: ProviderDiagnostics;
let autoCompactionManager: AutoCompactionManager;
let contextWindowManager: ContextWindowManager;
let semanticSearchEngine: SemanticSearchEngine;
let coreMemoryStore: CoreMemoryStore;
let experienceMemoryStore: ExperienceMemoryStore;
let _wildcardMatcher: WildcardMatcher;
let permissionPolicyEngine: PermissionPolicyEngine;
let steerManager: SteerManager;
let injectionScanner: InjectionScanner;
let recipeImporter: RecipeImporter;
let scheduledExecutor: ScheduledExecutor;
let subagentDashboard: SubagentDashboard;
let extensionMarketplace: ExtensionMarketplace;
let hotReloadManager: HotReloadManager;
let extensionLifecycleManager: ExtensionLifecycleManager;
let projectConfigManager: ProjectConfigManager;
let sessionOperations: SessionOperations;
let computerUseOverlayManager: ComputerUseOverlayManager;
let layeredConfig: LayeredConfig;

let appConfig: AppConfig;
let healthCheckInterval: ReturnType<typeof setInterval> | undefined;

// ─── Configuration Management ─────────────────────────────────────────────────

function getUserDataPath(): string {
  return app.getPath("userData");
}

function getConfigPath(): string {
  return path.join(getUserDataPath(), CONFIG_FILE);
}

function loadConfig(): AppConfig {
  const configPath = getConfigPath();
  const defaults: AppConfig = {
    windowBounds: { width: 1280, height: 800 },
    theme: "system",
    language: "en",
    autoUpdate: true,
    minimizeToTray: true,
    startupBehavior: "show",
    defaultProviderId: "openai",
    defaultModel: "gpt-4o",
    opencodePort: 3000,
    opencodeHostname: "127.0.0.1",
    opencodeAutoStart: true,
    autoStartSandbox: true,
    maxConcurrentSessions: 5,
    autoSave: true,
    sessionTimeoutMinutes: 30,
    permissionMode: "ask",
    sandboxMode: "path",
    debugMode: false,
    skillsPath: "",
    enableBuiltinSkills: true,
    logLevel: "info",
    traceEnabled: true,
    crashLogRetention: 7,
    developerMode: false,
  };

  // Backup existing config before loading
  try {
    createBackup(configPath);
  } catch {
    // Ignore backup failures — non-critical
  }

  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8");
      const saved = JSON.parse(raw);
      return { ...defaults, ...saved };
    }
  } catch (err) {
    console.error("[Main] Failed to load config, attempting recovery from backup:", err);
    // Try to recover from a backup
    const recovered = recoverFromBackup(configPath);
    if (recovered) {
      try {
        const saved = JSON.parse(recovered);
        console.info("[Main] Successfully recovered config from backup");
        return { ...defaults, ...saved };
      } catch {
        // Backup content was also invalid, fall through to defaults
      }
    }
    console.error("[Main] Failed to recover config from backup, using defaults");
  }

  return defaults;
}

function saveConfig(config: AppConfig): void {
  const configPath = getConfigPath();
  try {
    atomicWriteJSON(configPath, config);
  } catch (err) {
    console.error("[Main] Failed to save config:", err);
  }
}

// ─── Window Management ────────────────────────────────────────────────────────

function createMainWindow(): BrowserWindow {
  const bounds = appConfig.windowBounds;

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 800,
    minHeight: 600,
    title: APP_NAME,
    backgroundColor: "#0a0a0a",
    show: false,
    frame: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  });

  // Load the application
  if (IS_DEV) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // SECURITY: Deny all popups / new windows opened from the renderer.
  // External links (https://...) are routed through the system browser via
  // shell.openExternal; everything else is blocked.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("mailto:")) {
      shell.openExternal(url).catch(() => { /* ignore */ });
    }
    return { action: "deny" };
  });

  // NOTE: The strict CSP injection via onHeadersReceived was removed because it
  // blocked the inline splash-screen-removal script in index.html (production
  // CSP had script-src 'self' without 'unsafe-inline'). The CSP meta tag in
  // index.html is now the sole CSP source — it's been tightened to use
  // connect-src 'self' instead of 'self' https: wss:. Keeping setWindowOpenHandler
  // and will-navigate hardening above.

  // Window lifecycle
  mainWindow.once("ready-to-show", () => {
    mainWindow!.show();
    mainWindow!.focus();
  });

  mainWindow.on("close", (event) => {
    if (appConfig.minimizeToTray && !isQuitting) {
      event.preventDefault();
      mainWindow!.hide();
      return;
    }

    // Save window bounds before closing
    const [width, height] = mainWindow!.getSize();
    const [x, y] = mainWindow!.getPosition();
    appConfig.windowBounds = { width, height, x, y };
    saveConfig(appConfig);

    // Cleanup subsystems
    cleanupBeforeQuit();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.on("minimize", () => {
    if (appConfig.minimizeToTray) {
      mainWindow?.hide();
    }
  });

  // Handle file drops from OS
  // SECURITY: In production the app is loaded from file://, so the previous
  // `!url.startsWith("file://")` check let the renderer navigate to any local
  // file (e.g. file:///etc/passwd). Now we only allow navigation back to the
  // app's own origin (dev server or the dist/index.html we loaded).
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowedOrigins = IS_DEV
      ? ["http://localhost:5173"]
      : [`file://${path.join(__dirname, "..", "dist", "index.html")}`];
    const isAllowed = allowedOrigins.some((origin) => url === origin || url.startsWith(origin + "#"));
    if (!isAllowed) {
      event.preventDefault();
      console.warn("[Main] Blocked navigation to:", url);
    }
  });

  mainWindow.webContents.on("did-navigate", (_event, url) => {
    console.info("[Main] Navigated to:", url);
  });

  return mainWindow;
}

// ─── System Tray ──────────────────────────────────────────────────────────────

function createTray(): void {
  // BUGFIX: previously this resolved `path.join(__dirname, "../assets/tray-icon.png")`
  // — but no `assets/` directory exists at the project root (verified via LS),
  // so the tray was always invisible. We now build a small 16x16 icon in
  // memory using nativeImage.createFromBuffer with a hardcoded PNG byte
  // sequence (a single-color square) so the tray icon is always visible
  // regardless of whether asset files are bundled correctly.
  let trayIcon: Electron.NativeImage;
  const iconPath = path.join(__dirname, "../assets/tray-icon.png");
  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath);
  } else {
    // 16x16 transparent PNG with a single indigo pixel pattern. Embedded as
    // base64 so we don't depend on bundling a separate asset file.
    const B64_PNG =
      "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAU0lEQVR42mNk+M9QzwAFjFAGI4Qy" +
      "DEYJi0EYz0KGJg0DGNoYcSiDYyCNYWAE0wS2e+Mehs1AbwbGYHMchqkB1ANYDg0j4RqARwAAAC" +
      "V0RVh0ZGF0ZTpjcmVhdGU9AMKzZQAAAABJRU5ErkJggg==";
    const buf = Buffer.from(B64_PNG, "base64");
    trayIcon = nativeImage.createFromBuffer(buf, { width: 16, height: 16 });
    if (trayIcon.isEmpty()) {
      // Last-resort fallback — still better than createEmpty() because at
      // least it preserves the intent.
      trayIcon = nativeImage.createEmpty();
    }
  }

  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
  tray.setToolTip(APP_NAME);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Window",
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    {
      label: "New Session",
      click: () => {
        mainWindow?.show();
        mainWindow?.webContents.send("session:new-requested");
      },
    },
    { type: "separator" },
    {
      label: "Sandbox Status",
      click: async () => {
        const status = sandboxManager.getStatus();
        mainWindow?.webContents.send("sandbox:status-changed", status);
      },
    },
    { type: "separator" },
    {
      label: "Check for Updates",
      click: () => {
        if (!IS_DEV) {
          autoUpdater.checkForUpdates();
        }
      },
    },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("double-click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  tray.on("click", () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
}

// ─── Deep Link Handling ───────────────────────────────────────────────────────

function setupDeepLinks(): void {
  // Register protocol handler
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL, process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL);
  }

  // Handle deep links on Windows/Linux (single instance)
  app.on("second-instance", (_event, commandLine) => {
    const deepLink = commandLine.find((arg) =>
      arg.startsWith(`${DEEP_LINK_PROTOCOL}://`)
    );
    if (deepLink) {
      handleDeepLink(deepLink);
    }

    // Focus the window
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  // Handle deep links on macOS
  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });
}

async function handleDeepLink(url: string): Promise<void> {
  try {
    const parsedUrl = new URL(url);
    const action = parsedUrl.hostname;
    const params = Object.fromEntries(parsedUrl.searchParams.entries());

    switch (action) {
      case "install-extension": {
        // SECURITY: Previously this called extensionRegistry.installFromUrl(extensionUrl)
        // directly with no confirmation — a crafted deep link was a one-click RCE
        // vector. Now we prompt the user with the URL and require explicit consent.
        const extensionUrl = params.url;
        if (!extensionUrl) {
          console.warn("[Main] install-extension deep link missing url param");
          break;
        }
        // Only allow https URLs (no http, no file://, no internal IPs).
        let parsed: URL;
        try {
          parsed = new URL(extensionUrl);
        } catch {
          mainWindow?.webContents.send("extension:install-error", { message: "Invalid extension URL" });
          break;
        }
        if (parsed.protocol !== "https:") {
          mainWindow?.webContents.send("extension:install-error", {
            message: "Refused to install extension from non-https URL",
          });
          break;
        }

        if (!mainWindow || mainWindow.isDestroyed()) {
          console.warn("[Main] install-extension: window not available to confirm");
          break;
        }
        dialog.showMessageBox(mainWindow, {
          type: "warning",
          title: "Install Extension",
          message: "An application is requesting to install an extension.",
          detail: `URL: ${extensionUrl}\n\nExtensions can execute arbitrary code in the main process. Only continue if you trust the source.`,
          buttons: ["Cancel", "Install"],
          defaultId: 0,
          cancelId: 0,
        }).then((result) => {
          if (result.response !== 1) return;
          extensionRegistry.installFromUrl(extensionUrl).then((ext) => {
            mainWindow?.webContents.send("extension:installed", ext);
          }).catch((err: any) => {
            mainWindow?.webContents.send("extension:install-error", { message: err.message });
          });
        }).catch(() => { /* dialog dismissed */ });
        break;
      }
      case "import-recipe": {
        // SECURITY: Previously this blindly JSON.parse'd attacker-controlled base64.
        // Now we validate the shape minimally and require user confirmation,
        // because recipes can use new Function()-style conditions (now sandboxed
        // via vm.runInNewContext, but defense in depth still applies).
        const recipeData = params.data;
        if (!recipeData) break;
        let recipe: unknown;
        try {
          const decoded = Buffer.from(recipeData, "base64").toString("utf-8");
          recipe = JSON.parse(decoded);
        } catch (err) {
          mainWindow?.webContents.send("recipe:import-error", {
            message: `Invalid recipe payload: ${err instanceof Error ? err.message : String(err)}`,
          });
          break;
        }
        // Minimal shape validation: must be an object with at least a name or prompt.
        if (typeof recipe !== "object" || recipe === null || Array.isArray(recipe)) {
          mainWindow?.webContents.send("recipe:import-error", { message: "Recipe payload is not an object" });
          break;
        }
        const r = recipe as Record<string, unknown>;
        if (typeof r.name !== "string" && typeof r.prompt !== "string") {
          mainWindow?.webContents.send("recipe:import-error", { message: "Recipe must have a name or prompt" });
          break;
        }

        if (!mainWindow || mainWindow.isDestroyed()) break;
        dialog.showMessageBox(mainWindow, {
          type: "question",
          title: "Import Recipe",
          message: "An application is requesting to import a recipe.",
          detail: `Name: ${typeof r.name === "string" ? r.name : "(unknown)"}\n\nRecipes can run prompts and execute sub-recipes. Only continue if you trust the source.`,
          buttons: ["Cancel", "Import"],
          defaultId: 0,
          cancelId: 0,
        }).then((result) => {
          if (result.response !== 1) return;
          recipeEngine.importRecipe(recipe).then((imported) => {
            mainWindow?.webContents.send("recipe:imported", imported);
          }).catch((err) => {
            mainWindow?.webContents.send("recipe:import-error", { message: err.message });
          });
        }).catch(() => { /* dialog dismissed */ });
        break;
      }
      case "open-session": {
        const sessionId = params.id;
        if (sessionId) {
          mainWindow?.webContents.send("session:open-requested", sessionId);
        }
        break;
      }
      case "oauth/callback": {
        // Provider v3 OAuth callback. The full URL is reconstructed from
        // searchParams because the URL parser strips some chars.
        try {
          const fullUrl = `${DEEP_LINK_PROTOCOL}://${action}${parsedUrl.search}${parsedUrl.hash}`;
          await oauthHandler.handleCallback(fullUrl);
        } catch (err) {
          console.error("[Main] OAuth callback failed:", err);
        }
        break;
      }
      case "azure-ad/callback": {
        // Azure AD OAuth callback.
        try {
          const fullUrl = `${DEEP_LINK_PROTOCOL}://${action}${parsedUrl.search}${parsedUrl.hash}`;
          await azureAdProvider.handleCallback(fullUrl);
        } catch (err) {
          console.error("[Main] Azure AD callback failed:", err);
        }
        break;
      }
      case "run-recipe": {
        // SECURITY: require explicit user confirmation before running a recipe
        // invoked via deep link, since recipes can execute prompts and sub-recipes.
        const recipeId = params.id;
        let variables: Record<string, string> = {};
        if (params.variables) {
          try {
            const parsedVars = JSON.parse(params.variables);
            if (parsedVars && typeof parsedVars === "object" && !Array.isArray(parsedVars)) {
              variables = parsedVars as Record<string, string>;
            } else {
              mainWindow?.webContents.send("recipe:run-error", { message: "Invalid variables payload" });
              break;
            }
          } catch (err) {
            mainWindow?.webContents.send("recipe:run-error", {
              message: `Invalid variables JSON: ${err instanceof Error ? err.message : String(err)}`,
            });
            break;
          }
        }
        if (!recipeId) break;
        if (!mainWindow || mainWindow.isDestroyed()) break;
        dialog.showMessageBox(mainWindow, {
          type: "question",
          title: "Run Recipe",
          message: "An application is requesting to run a recipe.",
          detail: `Recipe ID: ${recipeId}\n\nRecipes can execute prompts and sub-recipes. Only continue if you trust the source.`,
          buttons: ["Cancel", "Run"],
          defaultId: 0,
          cancelId: 0,
        }).then((result) => {
          if (result.response !== 1) return;
          recipeEngine.run(recipeId, variables).then((res) => {
            mainWindow?.webContents.send("recipe:run-complete", res);
          }).catch((err) => {
            mainWindow?.webContents.send("recipe:run-error", { message: err.message });
          });
        }).catch(() => { /* dialog dismissed */ });
        break;
      }
      default:
        console.warn("[Main] Unknown deep link action:", action);
    }
  } catch (err) {
    console.error("[Main] Failed to handle deep link:", err);
  }
}

// ─── Auto-Updater ─────────────────────────────────────────────────────────────

function setupAutoUpdater(): void {
  if (IS_DEV) {
    console.info("[Main] Skipping auto-updater in development mode");
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    console.info("[Main] Checking for updates...");
    mainWindow?.webContents.send("updater:checking");
  });

  autoUpdater.on("update-available", (info) => {
    console.info("[Main] Update available:", info.version);
    mainWindow?.webContents.send("updater:available", {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });

    dialog
      .showMessageBox(mainWindow!, {
        type: "info",
        title: "Update Available",
        message: `A new version (${info.version}) is available. Download now?`,
        buttons: ["Download", "Later"],
        defaultId: 0,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.downloadUpdate();
        }
      });
  });

  autoUpdater.on("update-not-available", () => {
    console.info("[Main] No updates available");
    mainWindow?.webContents.send("updater:not-available");
  });

  autoUpdater.on("download-progress", (progressInfo) => {
    mainWindow?.webContents.send("updater:progress", {
      percent: progressInfo.percent,
      transferred: progressInfo.transferred,
      total: progressInfo.total,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.info("[Main] Update downloaded:", info.version);
    mainWindow?.webContents.send("updater:downloaded", {
      version: info.version,
    });

    dialog
      .showMessageBox(mainWindow!, {
        type: "info",
        title: "Update Ready",
        message: "Update downloaded. Restart to install?",
        buttons: ["Restart Now", "Later"],
        defaultId: 0,
      })
      .then((result) => {
        if (result.response === 0) {
          isQuitting = true;
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.on("error", (err) => {
    console.error("[Main] Auto-updater error:", err);
    mainWindow?.webContents.send("updater:error", { message: err.message });
  });

  // Check for updates periodically
  if (appConfig.autoUpdate) {
    autoUpdater.checkForUpdates();
    setInterval(
      () => {
        autoUpdater.checkForUpdates();
      },
      60 * 60 * 1000
    ); // Every hour
  }
}

// ─── Subsystem Initialization ─────────────────────────────────────────────────

async function initializeSubsystems(): Promise<void> {
  const userDataPath = getUserDataPath();

  // Ensure data directories exist
  const dirs = [
    "sessions",
    "traces",
    "extensions",
    "recipes",
    "sandbox",
    "providers",
    "hooks",
    "logs",
    "projects",
    "skills",
  ];
  for (const dir of dirs) {
    const dirPath = path.join(userDataPath, dir);
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        logger.info('Main', `Created directory: ${dirPath}`);
      }
    } catch (err: any) {
      logger.error('Main', `Failed to create directory ${dirPath}`, err);
      // On Windows 7, try user Documents as fallback
      if (err.code === 'EACCES' || err.code === 'EPERM') {
        const fallbackPath = path.join(app.getPath('documents'), APP_NAME, dir);
        try {
          fs.mkdirSync(fallbackPath, { recursive: true });
          logger.warn('Main', `Using fallback directory: ${fallbackPath}`);
        } catch (fallbackErr) {
          logger.error('Main', `Fallback directory also failed`, fallbackErr);
        }
      }
    }
  }

  // Initialize trace collector first (other subsystems may use it)
  traceCollector = new TraceCollector({
    tracesDir: path.join(userDataPath, "traces"),
    maxFileAgeDays: MAX_TRACE_DAYS,
    enabled: appConfig.traceEnabled,
  });
  await traceCollector.initialize();

  // Initialize provider manager
  providerManager = new ProviderManager(
    path.join(userDataPath, "providers", "provider-configs.json")
  );
  await providerManager.initialize();

  // Set up health update callback to emit IPC events to renderer
  providerManager.setHealthUpdateCallback((providerId: string, check: any) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('provider:health-update', { providerId, check });
    }
  });

  // Initialize health monitor for providers
  healthMonitor = new ProviderHealthMonitor(providerManager, {
    checkIntervalMs: 60000,
    maxLatencyHistory: 100,
  });

  // Forward health monitor events to renderer
  healthMonitor.on('provider:health-update', (snapshot) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('provider:health-update', snapshot);
    }
  });
  healthMonitor.on('provider:status-changed', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('provider:status-changed', data);
    }
  });
  await healthMonitor.start();

  // ─── Provider v3 initialization ────────────────────────────────────────────
  // The new v3 provider system (auth-store + provider-registry + protocol-adapters +
  // provider-client + oauth + azure-ad + model-discoverer + session-binding).
  // Runs alongside the legacy v2 manager during the transition.
  authStore = new AuthStore();
  authStore.load();
  authStore.on('error', (err: unknown) => logger.error('AuthStore', 'Error', err));
  authStore.on('provider-changed', (providerId: string) => {
    mainWindow?.webContents.send('providerv3:changed', { providerId });
  });
  authStore.on('provider-removed', (providerId: string) => {
    mainWindow?.webContents.send('providerv3:removed', { providerId });
  });
  authStore.on('session-binding-changed', (sessionId: string) => {
    mainWindow?.webContents.send('providerv3:binding-changed', { sessionId });
  });

  providerClient = new ProviderClient(authStore);
  providerClient.on('sidecar-fallback', (info: unknown) => {
    logger.info('ProviderClient', 'Sidecar unavailable, using in-process path', info);
  });

  // If the OpenCode sidecar is running, route provider calls through it.
  const sidecarInstanceForV3 = providerManager.getSidecarInstance();
  if (sidecarInstanceForV3) {
    setSidecarEndpoint(sidecarInstanceForV3.url, sidecarInstanceForV3.password);
    logger.info('ProviderClient', 'OpenCode sidecar detected — using sidecar path for supported providers');
  } else {
    logger.info('ProviderClient', 'No OpenCode sidecar — using in-process provider path');
  }

  oauthHandler = new OAuthHandler(authStore);
  oauthHandler.on('flow-completed', ({ providerId }: { providerId: string }) => {
    mainWindow?.webContents.send('providerv3:oauth-completed', { providerId });
  });
  oauthHandler.on('flow-error', (info: unknown) => {
    mainWindow?.webContents.send('providerv3:oauth-error', info);
  });
  oauthHandler.on('needs-config', (info: unknown) => {
    mainWindow?.webContents.send('providerv3:oauth-needs-config', info);
  });

  azureAdProvider = new AzureAdProvider(authStore);
  azureAdProvider.on('flow-completed', ({ providerId }: { providerId: string }) => {
    mainWindow?.webContents.send('providerv3:azure-ad-completed', { providerId });
  });
  azureAdProvider.on('flow-error', (info: unknown) => {
    mainWindow?.webContents.send('providerv3:azure-ad-error', info);
  });

  modelDiscoverer = new ModelDiscoverer(authStore, providerClient);
  sessionBinding = new SessionBinding(authStore, providerClient);
  sessionBinding.on('binding-changed', (binding: unknown) => {
    mainWindow?.webContents.send('providerv3:binding-changed', binding);
  });
  sessionBinding.on('binding-invalid', (info: unknown) => {
    logger.warn('SessionBinding', 'Binding invalid — provider no longer configured', info);
  });

  logger.info('ProviderClient', `Provider v3 initialized — ${authStore.listProviders().length} providers configured`);

  // Initialize extension registry
  extensionRegistry = new ExtensionRegistry(path.join(userDataPath, "extensions", "extension-configs.json"));
  await extensionRegistry.initialize();

  // Initialize project manager
  projectManager = new ProjectManager(path.join(userDataPath, "projects"));
  await projectManager.initialize();
  projectManager.on('project:created', (project) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('project:created', project);
    }
  });
  projectManager.on('project:activated', (project) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('project:activated', project);
    }
  });

  // Initialize skill registry
  skillRegistry = new SkillRegistry();
  await skillRegistry.initialize(path.join(userDataPath, "skills"));

  // Initialize OpenCode bridge
  // BUGFIX: Previously this constructed a SEPARATE OpenCodeBridge pointing at
  // hardcoded port 4096, while ProviderManager owned its OWN bridge pointing
  // at the sidecar's RANDOM port (allocated by SidecarManager). So every
  // `opencode:sessions:*` / `opencode:messages:*` / `opencode:tools:*` IPC
  // handler targeted port 4096, where nothing was listening. Now we share the
  // ProviderManager's bridge instance so all callers talk to the same sidecar.
  const sidecarInstance = providerManager.getSidecarInstance();
  if (sidecarInstance) {
    openCodeBridge = new OpenCodeBridge({
      host: sidecarInstance.hostname,
      port: sidecarInstance.port,
      username: sidecarInstance.username,
      password: sidecarInstance.password,
    });
  } else {
    // Fallback to a no-op bridge so setOpenCodeBridge has something to track.
    openCodeBridge = new OpenCodeBridge();
  }
  setOpenCodeBridge(openCodeBridge);
  try {
    await openCodeBridge.connect();
    logger.info('Main', 'OpenCode bridge connected');
  } catch {
    logger.info('Main', 'OpenCode server not available (will retry on demand)');
  }

  // Initialize session manager
  sessionManager = new SessionManager({
    sessionsDir: path.join(userDataPath, "sessions"),
    maxConcurrentSessions: appConfig.maxConcurrentSessions,
    traceCollector,
  });
  await sessionManager.initialize();

  // Initialize hook manager
  hookManager = new HookManager({
    configDir: path.join(userDataPath, "hooks"),
    traceCollector,
  });
  await hookManager.initialize();

  // Initialize sandbox manager
  sandboxManager = new SandboxManager({
    sandboxDir: path.join(userDataPath, "sandbox"),
    traceCollector,
    hookManager,
  });
  if (appConfig.autoStartSandbox) {
    await sandboxManager.start({
      cpuLimit: 50,
      memoryLimitMB: 2048,
      diskLimitMB: 5120,
      networkIsolation: false,
      allowedPaths: [userDataPath],
    });
  }

  // Initialize ACP client
  acpClient = new ACPClient({
    traceCollector,
    extensionRegistry,
    sandboxManager,
  });
  await acpClient.initialize();

  // Initialize recipe engine
  recipeEngine = new RecipeEngine({
    recipesDir: path.join(userDataPath, "recipes"),
    traceCollector,
    extensionRegistry,
    providerManager,
    providerClient, // Provider v3 — preferred when available
    sandboxManager,
    hookManager,
  });
  await recipeEngine.initialize();

  console.info("[Main] All subsystems initialized successfully");
  logger.info('Main', 'All subsystems initialized successfully');

  // ─── Phase 1-8: Initialize New Subsystems ─────────────────────────────────
  try {
    // Phase 1: Agent Mode System
    agentRegistry = getAgentRegistry();
    await agentRegistry.initialize();
    setAgentRegistry(agentRegistry);
    autoModeDetector = getAutoModeDetector();
    agentPresetManager = new AgentPresetManager();
    await agentPresetManager.initialize();
    agentSessionBridge = new AgentSessionBridge(autoModeDetector);

    // Phase 2: Provider Overhaul
    modelIdResolver = getModelIdResolver();
    configSetManager = new ConfigSetManager();
    await configSetManager.initialize();
    modelVariantManager = new ModelVariantManager();
    await modelVariantManager.initialize();
    providerDiagnostics = new ProviderDiagnostics();

    // Phase 3: UI Overhaul - no backend init needed (frontend only)

    // Phase 4: Extension System Upgrade
    extensionMarketplace = new ExtensionMarketplace();
    hotReloadManager = new HotReloadManager();
    extensionLifecycleManager = new ExtensionLifecycleManager(undefined, hotReloadManager);

    // Phase 5: Context Management & Memory
    autoCompactionManager = new AutoCompactionManager();
    contextWindowManager = new ContextWindowManager();
    coreMemoryStore = new CoreMemoryStore();
    await coreMemoryStore.initialize();
    experienceMemoryStore = new ExperienceMemoryStore();
    await experienceMemoryStore.initialize();
    semanticSearchEngine = new SemanticSearchEngine();
    await semanticSearchEngine.indexMemories(experienceMemoryStore.list());

    // Phase 6: Permission & Security
    _wildcardMatcher = new WildcardMatcher();
    permissionPolicyEngine = new PermissionPolicyEngine();
    await permissionPolicyEngine.initialize();
    steerManager = new SteerManager();
    injectionScanner = new InjectionScanner();

    // Phase 7: Recipe & Automation
    recipeImporter = new RecipeImporter();
    scheduledExecutor = new ScheduledExecutor(
      async (recipeId: string, variables: Record<string, string>) => {
        const result = await recipeEngine.run(recipeId, variables);
        return result as any;
      },
    );
    await scheduledExecutor.initialize();
    subagentDashboard = new SubagentDashboard();

    // Phase 8: Polish & Integration
    projectConfigManager = new ProjectConfigManager();
    sessionOperations = new SessionOperations();
    computerUseOverlayManager = new ComputerUseOverlayManager();
    layeredConfig = new LayeredConfig();
    await layeredConfig.initialize();

    logger.info('Main', 'All Phase 1-8 subsystems initialized successfully');
  } catch (err) {
    logger.error('Main', 'Error initializing Phase 1-8 subsystems', err);
    // Non-fatal: continue with whatever did initialize
  }
}

// ─── IPC Handler Registration ─────────────────────────────────────────────────

function registerIpcHandlers(): void {
  // ── Provider IPC ──────────────────────────────────────────────────────────

  ipcMain.handle("provider:list", wrapIPC(async () => {
    // Null-guard: if providerManager isn't initialized yet (handlers are
    // registered before initializeSubsystems completes), return empty.
    if (!providerManager) return { success: true, data: [] };
    return { success: true, data: await providerManager.list() };
  }));

  ipcMain.handle(
    "provider:add",
    wrapIPC(async (_event, providerConfig: Record<string, unknown>) => {
      const provider = await providerManager.add(providerConfig);
      return { success: true, data: provider };
    })
  );

  ipcMain.handle("provider:remove", wrapIPC(async (_event, providerId: string) => {
    await providerManager.remove(providerId);
    return { success: true };
  }));

  ipcMain.handle("provider:test", wrapIPC(async (_event, providerId: string) => {
    const result = await providerManager.test(providerId);
    return { success: true, data: result };
  }));

  ipcMain.handle("providers:healthCheck", wrapIPC(async (_event, providerId: string) => {
    const check = await providerManager.performHealthCheck(providerId);
    return { success: true, data: check };
  }));

  ipcMain.handle("providers:healthStatus", wrapIPC(async () => {
    return { success: true, data: providerManager.getAllHealthChecks() };
  }));

  ipcMain.handle(
    "provider:setDefault",
    wrapIPC(async (_event, providerId: string, model: string) => {
      await providerManager.setDefault(providerId, model);
      appConfig.defaultProviderId = providerId;
      appConfig.defaultModel = model;
      saveConfig(appConfig);
      return { success: true };
    })
  );

  // ── Custom Provider IPC (Aether v2) ─────────────────────────────────────────

  // Legacy custom-provider:* IPC handlers removed — replaced by providerv3:* above.
  // The v2 ProviderManager methods they called (addCustomProvider, etc.) depended
  // on the deleted custom-bridge / custom-provider/* modules.

  // ── Provider v3 IPC ──────────────────────────────────────────────────────────
  // The new opencode-style provider system. The renderer's ProvidersView calls
  // these via window.openagent.providersV3.* (see preload.ts).

  ipcMain.handle("providerv3:list-definitions", wrapIPC(async () => {
    return { success: true, data: getProviderRegistry().listAll() };
  }));

  ipcMain.handle("providerv3:list-configured", wrapIPC(async () => {
    return { success: true, data: authStore.listProviders() };
  }));

  ipcMain.handle("providerv3:list-models", wrapIPC(async (_event, providerId: string) => {
    return { success: true, data: providerClient.listAvailableModels(providerId) };
  }));

  ipcMain.handle("providerv3:get-discovered", wrapIPC(async (_event, providerId: string) => {
    const models = authStore.getCachedModels(providerId);
    const fetchedAt = authStore.getCachedModelsFetchedAt(providerId);
    return { success: true, data: models ? { models, fetchedAt } : null };
  }));

  ipcMain.handle("providerv3:refresh-models", wrapIPC(async (_event, providerId: string) => {
    const models = await modelDiscoverer.refreshModels(providerId, true);
    return { success: true, data: models };
  }));

  ipcMain.handle("providerv3:set-api-key", wrapIPC(async (_event, providerId: string, apiKey: string) => {
    const def = getProviderRegistry().get(providerId);
    if (!def) return { success: false, error: `Unknown provider: ${providerId}` };
    const existing = authStore.getProvider(providerId);
    authStore.upsertProvider({
      providerId,
      label: existing?.label || def.name,
      auth: { method: 'api_key', apiKey },
      customModels: existing?.customModels,
      baseUrlOverride: existing?.baseUrlOverride,
      defaultModelId: existing?.defaultModelId || def.modelPresets[0]?.id,
      enabled: true,
      updatedAt: new Date().toISOString(),
    });
    return { success: true };
  }));

  ipcMain.handle("providerv3:set-base-url-override", wrapIPC(async (_event, providerId: string, baseUrl: string) => {
    const existing = authStore.getProvider(providerId);
    if (!existing) return { success: false, error: 'Provider not configured' };
    authStore.upsertProvider({ ...existing, baseUrlOverride: baseUrl || undefined });
    return { success: true };
  }));

  ipcMain.handle("providerv3:set-default-model", wrapIPC(async (_event, providerId: string, modelId: string) => {
    const existing = authStore.getProvider(providerId);
    if (!existing) return { success: false, error: 'Provider not configured' };
    authStore.upsertProvider({ ...existing, defaultModelId: modelId });
    return { success: true };
  }));

  ipcMain.handle("providerv3:add-custom-model", wrapIPC(async (_event, providerId: string, model: { id: string; displayName: string; contextWindow?: number }) => {
    const existing = authStore.getProvider(providerId);
    if (!existing) return { success: false, error: 'Provider not configured' };
    const customModels = [...(existing.customModels || []), { ...model, supportsStreaming: true, supportsToolUse: true }];
    authStore.upsertProvider({ ...existing, customModels });
    return { success: true };
  }));

  ipcMain.handle("providerv3:remove-custom-model", wrapIPC(async (_event, providerId: string, modelId: string) => {
    const existing = authStore.getProvider(providerId);
    if (!existing) return { success: false, error: 'Provider not configured' };
    const customModels = (existing.customModels || []).filter((m) => m.id !== modelId);
    authStore.upsertProvider({ ...existing, customModels });
    return { success: true };
  }));

  ipcMain.handle("providerv3:set-enabled", wrapIPC(async (_event, providerId: string, enabled: boolean) => {
    authStore.setProviderEnabled(providerId, enabled);
    return { success: true };
  }));

  ipcMain.handle("providerv3:remove", wrapIPC(async (_event, providerId: string) => {
    authStore.removeProvider(providerId);
    return { success: true };
  }));

  ipcMain.handle("providerv3:disconnect", wrapIPC(async (_event, providerId: string) => {
    // Clear stored credentials but keep the provider entry (user can re-connect).
    const existing = authStore.getProvider(providerId);
    if (!existing) return { success: false, error: 'Provider not configured' };
    // Reset auth to a no-op env_var entry pointing at the provider's env var (if any).
    const def = getProviderRegistry().get(providerId);
    authStore.upsertProvider({
      ...existing,
      auth: { method: 'env_var', envVarName: def?.envVarName || '' },
      enabled: false,
    });
    return { success: true };
  }));

  ipcMain.handle("providerv3:start-oauth", wrapIPC(async (_event, providerId: string) => {
    await oauthHandler.startFlow(providerId);
    return { success: true };
  }));

  ipcMain.handle("providerv3:start-azure-ad", wrapIPC(async (_event, providerId: string, tenantId: string, clientId: string) => {
    // Persist the tenant/client first so handleCallback can find them.
    const def = getProviderRegistry().get(providerId);
    if (!def) return { success: false, error: `Unknown provider: ${providerId}` };
    const existing = authStore.getProvider(providerId);
    authStore.upsertProvider({
      providerId,
      label: existing?.label || def.name,
      auth: { method: 'azure_ad', tenantId, clientId },
      customModels: existing?.customModels,
      baseUrlOverride: existing?.baseUrlOverride,
      defaultModelId: existing?.defaultModelId || def.modelPresets[0]?.id,
      enabled: true,
      updatedAt: new Date().toISOString(),
    });
    await azureAdProvider.startFlow(providerId, tenantId, clientId);
    return { success: true };
  }));

  ipcMain.handle("providerv3:run-health-check", wrapIPC(async (_event, providerId: string) => {
    // Quick health check: attempt a tiny chat completion (max_tokens=1) or
    // a models list call. We use the models endpoint when available because
    // it's cheaper.
    const def = getProviderRegistry().get(providerId);
    if (!def) return { success: false, error: `Unknown provider: ${providerId}` };
    const startTime = Date.now();
    try {
      if (def.modelsEndpoint) {
        const models = await providerClient.discoverModels(providerId);
        return {
          success: true,
          data: {
            providerId,
            status: 'healthy' as const,
            latencyMs: Date.now() - startTime,
            lastCheckedAt: new Date().toISOString(),
            modelCount: models.length,
          },
        };
      } else {
        // No models endpoint — fall back to a 1-token chat.
        const models = providerClient.listAvailableModels(providerId);
        if (models.length === 0) {
          return {
            success: true,
            data: {
              providerId,
              status: 'unknown' as const,
              latencyMs: Date.now() - startTime,
              lastCheckedAt: new Date().toISOString(),
              error: 'No models available to test',
            },
          };
        }
        await providerClient.chat({
          model: models[0].qualifiedId,
          messages: [{ role: 'user', content: 'ping' }],
          maxTokens: 1,
        });
        return {
          success: true,
          data: {
            providerId,
            status: 'healthy' as const,
            latencyMs: Date.now() - startTime,
            lastCheckedAt: new Date().toISOString(),
          },
        };
      }
    } catch (err: any) {
      return {
        success: true,
        data: {
          providerId,
          status: 'unhealthy' as const,
          latencyMs: Date.now() - startTime,
          lastCheckedAt: new Date().toISOString(),
          error: err.message,
        },
      };
    }
  }));

  ipcMain.handle("providerv3:list-health", wrapIPC(async () => {
    // Return an empty record — health is checked on-demand per provider.
    // Future: cache the last result and return it here.
    return { success: true, data: {} };
  }));

  // Session binding IPC
  ipcMain.handle("providerv3:get-binding", wrapIPC(async (_event, sessionId: string) => {
    return { success: true, data: sessionBinding.getBinding(sessionId) };
  }));

  ipcMain.handle("providerv3:set-binding", wrapIPC(async (_event, sessionId: string, providerId: string, modelId: string, overrides?: { systemPromptOverride?: string; temperatureOverride?: number }) => {
    sessionBinding.setBinding(sessionId, providerId, modelId, overrides);
    return { success: true };
  }));

  ipcMain.handle("providerv3:clear-binding", wrapIPC(async (_event, sessionId: string) => {
    sessionBinding.clearBinding(sessionId);
    return { success: true };
  }));

  // Provider v3 chat (used by useChat via window.openagent.providersV3.chat / stream)
  ipcMain.handle("providerv3:chat", wrapIPC(async (_event, request: any) => {
    const response = await providerClient.chat(request);
    return { success: true, data: response };
  }));

  // ── Sidecar IPC ───────────────────────────────────────────────────────────
  // BUGFIX: preload.ts:457-461 exposes sidecar:status/restart/getInstance but
  // no matching ipcMain.handle existed — renderer calls returned promises that
  // never resolved. Now wired to the ProviderManager's sidecar lifecycle.

  ipcMain.handle("sidecar:status", wrapIPC(async () => {
    const instance = providerManager.getSidecarInstance();
    return {
      success: true,
      data: instance
        ? { url: instance.url, port: instance.port, hostname: instance.hostname }
        : { status: 'stopped' },
    };
  }));

  ipcMain.handle("sidecar:restart", wrapIPC(async () => {
    const instance = await providerManager.restartSidecar();
    return { success: true, data: { url: instance.url, port: instance.port, hostname: instance.hostname } };
  }));

  ipcMain.handle("sidecar:getInstance", wrapIPC(async () => {
    return { success: true, data: providerManager.getSidecarInstance() };
  }));

  // ── Crash IPC ─────────────────────────────────────────────────────────────
  // BUGFIX: preload.ts:449-453 exposes crash:check/getLog/dismiss but no
  // matching ipcMain.handle existed — renderer calls returned promises that
  // never resolved. Now wired to the CrashDetector.

  ipcMain.handle("crash:check", wrapIPC(async () => {
    // CrashDetector reads the previous run's crash.log file.
    const detector = new CrashDetector(getUserDataPath());
    const crash = detector.detect();
    return { success: true, data: crash };
  }));

  ipcMain.handle("crash:getLog", wrapIPC(async () => {
    try {
      const logPath = path.join(getUserDataPath(), 'crash.log');
      if (!fs.existsSync(logPath)) return { success: true, data: null };
      const content = fs.readFileSync(logPath, 'utf-8');
      return { success: true, data: content };
    } catch (err) {
      return { success: true, data: null };
    }
  }));

  ipcMain.handle("crash:dismiss", wrapIPC(async () => {
    try {
      const logPath = path.join(getUserDataPath(), 'crash.log');
      if (fs.existsSync(logPath)) {
        // Archive rather than delete, so we can inspect later if needed.
        const archived = path.join(getUserDataPath(), 'crash.log.archived');
        fs.renameSync(logPath, archived);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }));

  // ── Extension IPC ─────────────────────────────────────────────────────────

  ipcMain.handle("extension:list", wrapIPC(async () => {
    if (!extensionRegistry) return { success: true, data: [] };
    return { success: true, data: await extensionRegistry.list() };
  }));

  ipcMain.handle(
    "extension:enable",
    wrapIPC(async (_event, extensionId: string) => {
      await extensionRegistry.enable(extensionId);
      return { success: true };
    })
  );

  ipcMain.handle(
    "extension:disable",
    wrapIPC(async (_event, extensionId: string) => {
      await extensionRegistry.disable(extensionId);
      return { success: true };
    })
  );

  ipcMain.handle(
    "extension:install",
    wrapIPC(async (_event, source: string, options?: Record<string, unknown>) => {
      const extension = await extensionRegistry.install(source, options);
      return { success: true, data: extension };
    })
  );

  ipcMain.handle(
    "extension:configure",
    wrapIPC(async (
      _event,
      extensionId: string,
      config: Record<string, unknown>
    ) => {
      await extensionRegistry.configure(extensionId, config);
      return { success: true };
    })
  );

  ipcMain.handle(
    "extension:uninstall",
    wrapIPC(async (_event, extensionId: string) => {
      await extensionRegistry.uninstall(extensionId);
      return { success: true };
    })
  );

  ipcMain.handle(
    "extension:search",
    wrapIPC(async (_event, query?: string, category?: string) => {
      const results = await extensionRegistry.search(query, category);
      return { success: true, data: results };
    })
  );

  ipcMain.handle(
    "extension:getTools",
    wrapIPC(async (_event, extensionId: string) => {
      const tools = extensionRegistry.getExtensionTools(extensionId);
      return { success: true, data: tools };
    })
  );

  // ── Session IPC ───────────────────────────────────────────────────────────

  ipcMain.handle("session:list", wrapIPC(async () => {
    if (!sessionManager) return { success: true, data: [] };
    return { success: true, data: await sessionManager.list() };
  }));

  ipcMain.handle(
    "session:create",
    wrapIPC(async (_event, options?: Record<string, unknown>) => {
      const session = await sessionManager.create(options);
      return { success: true, data: session };
    })
  );

  ipcMain.handle("session:load", wrapIPC(async (_event, sessionId: string) => {
    const session = await sessionManager.load(sessionId);
    return { success: true, data: session };
  }));

  ipcMain.handle(
    "session:save",
    wrapIPC(async (_event, sessionId: string, data: Record<string, unknown>) => {
      await sessionManager.save(sessionId, data);
      return { success: true };
    })
  );

  ipcMain.handle("session:delete", wrapIPC(async (_event, sessionId: string) => {
    await sessionManager.delete(sessionId);
    return { success: true };
  }));

  ipcMain.handle(
    "session:export",
    wrapIPC(async (_event, sessionId: string, format: "json" | "markdown") => {
      const exported = await sessionManager.exportSession(sessionId, format);
      return { success: true, data: exported };
    })
  );

  // ── Recipe IPC ────────────────────────────────────────────────────────────

  ipcMain.handle("recipe:list", wrapIPC(async () => {
    if (!recipeEngine) return { success: true, data: [] };
    return { success: true, data: await recipeEngine.list() };
  }));

  ipcMain.handle(
    "recipe:create",
    wrapIPC(async (_event, recipeData: Record<string, unknown>) => {
      const recipe = await recipeEngine.create(recipeData as any);
      return { success: true, data: recipe };
    })
  );

  ipcMain.handle(
    "recipe:run",
    wrapIPC(async (_event, recipeId: string, variables?: Record<string, string>) => {
      const result = await recipeEngine.run(recipeId, variables);
      return { success: true, data: result };
    })
  );

  ipcMain.handle("recipe:delete", wrapIPC(async (_event, recipeId: string) => {
    await recipeEngine.delete(recipeId);
    return { success: true };
  }));

  // NOTE: "recipe:import" is registered below in the Phase 7 section — it uses
  // the dedicated RecipeImporter (with the security fix that regenerates IDs).
  // Previously there was a duplicate registration here that called
  // recipeEngine.importFromSource, which caused:
  //   "Attempted to register a second handler for 'recipe:import'" crash.

  // ── Sandbox IPC ───────────────────────────────────────────────────────────

  ipcMain.handle("sandbox:status", wrapIPC(async () => {
    return { success: true, data: sandboxManager.getStatus() };
  }));

  ipcMain.handle(
    "sandbox:start",
    wrapIPC(async (_event, config?: Record<string, unknown>) => {
      await sandboxManager.start(config);
      return { success: true };
    })
  );

  ipcMain.handle("sandbox:stop", wrapIPC(async () => {
    await sandboxManager.stop();
    return { success: true };
  }));

  ipcMain.handle(
    "sandbox:execute",
    wrapIPC(async (_event, command: string, options?: Record<string, unknown>) => {
      const result = await sandboxManager.execute(command, options);
      return { success: true, data: result };
    })
  );

  // ── Hooks IPC ─────────────────────────────────────────────────────────────

  ipcMain.handle("hooks:list", wrapIPC(async () => {
    return { success: true, data: hookManager.list() };
  }));

  ipcMain.handle(
    "hooks:add",
    wrapIPC(async (_event, hookConfig: Record<string, unknown>) => {
      const hook = await hookManager.add(hookConfig as any);
      return { success: true, data: hook };
    })
  );

  ipcMain.handle("hooks:remove", wrapIPC(async (_event, hookId: string) => {
    await hookManager.remove(hookId);
    return { success: true };
  }));

  ipcMain.handle(
    "hooks:trigger",
    wrapIPC(async (_event, hookType: string, context: Record<string, unknown>) => {
      const results = await hookManager.trigger(hookType as HookType, context);
      return { success: true, data: results };
    })
  );

  // ── ACP IPC ───────────────────────────────────────────────────────────────

  ipcMain.handle(
    "acp:connect",
    wrapIPC(async (_event, serverUrl: string, options?: Record<string, unknown>) => {
      await acpClient.connect(serverUrl, options);
      return { success: true };
    })
  );

  ipcMain.handle("acp:disconnect", wrapIPC(async () => {
    await acpClient.disconnect();
    return { success: true };
  }));

  // ── Agent Runner: Permission Request Infrastructure ──────────────────────────
  //
  // When AgentRunner needs user approval for a tool call (permission level 'ask'),
  // it emits 'permission:request' with a resolve callback. We store the callback
  // keyed by a generated requestId, forward the request to the renderer via
  // 'chat:permission-request' IPC event, and wait for the renderer to call
  // 'permission:respond' with the user's decision.

  const pendingPermissionRequests = new Map<string, (level: ToolPermissionLevel) => void>();

  ipcMain.handle("permission:respond", wrapIPC(async (_e, requestId: string, response: string) => {
    const resolve = pendingPermissionRequests.get(requestId);
    if (!resolve) {
      return { success: false, error: 'No pending permission request for this id' };
    }
    pendingPermissionRequests.delete(requestId);
    // Map the renderer's response to a ToolPermissionLevel.
    const level: ToolPermissionLevel =
      response === 'allow_once' || response === 'always_allow' ? 'allow' :
      response === 'deny_once' || response === 'always_deny' ? 'deny' : 'ask';
    resolve(level);
    return { success: true };
  }));

  /**
   * Run the agentic loop for a chat message. Used by chat:send and chat:stream
   * when the session's agent mode is anything other than 'chat'.
   *
   * The agent loop: LLM → tool calls → permission check → tool execution →
   * tool result → repeat, until the LLM stops requesting tools or maxSteps
   * is reached.
   *
   * Events are forwarded to the renderer via the `send` callback so both
   * chat:send (non-streaming) and chat:stream (streaming) can use it.
   */
  async function runAgent(opts: {
    sessionId: string;
    message: string;
    session: any;
    send: (channel: string, data: Record<string, unknown>) => void;
    signal?: AbortSignal;
  }): Promise<{ content: string; steps: number; status: string }> {
    const { sessionId, message, session, send } = opts;

    // Resolve the agent for this session.
    const agentId = agentSessionBridge.getCurrentAgentId(sessionId);
    const agent = agentRegistry.get(agentId) || agentRegistry.getActive();
    if (!agent) {
      throw new Error('No agent configured');
    }

    // Resolve the provider+model for this session.
    const binding = sessionBinding.getBinding(sessionId);
    const providerId = binding?.providerId || session.providerId || appConfig.defaultProviderId;
    const modelId = binding?.modelId || session.model || appConfig.defaultModel;
    const qualifiedModel = `${providerId}/${modelId}`;

    // Build the agent context.
    const context = {
      agentId: agent.id,
      sessionId,
      workingDirectory: session.workingDirectory || process.cwd(),
      extensions: session.extensions || [],
      model: qualifiedModel,
      providerId,
    };

    // Create the runner.
    const runner = new AgentRunner(agent, context);
    runner.setProviderClient(providerClient);
    if (permissionPolicyEngine) {
      runner.setPolicyEngine(permissionPolicyEngine);
    }

    // Wire permission requests → renderer.
    runner.on('permission:request', (toolName: string, args: Record<string, unknown>, resolve: (level: ToolPermissionLevel) => void) => {
      const requestId = `perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      pendingPermissionRequests.set(requestId, resolve);
      send('chat:permission-request', { id: requestId, toolName, args });
    });

    // Build the messages array from session history.
    const messages = [
      ...(session.messages || []).map((m: any) => ({
        id: m.id || crypto.randomUUID(),
        role: m.role,
        content: m.content || '',
        toolCallId: m.toolCallId,
        toolCalls: m.toolCalls,
        timestamp: m.timestamp || new Date().toISOString(),
      })),
      { id: crypto.randomUUID(), role: 'user' as const, content: message, timestamp: new Date().toISOString() },
    ];

    // Run the loop.
    // Build the tool catalog: built-in tools + extension-registered (MCP) tools.
    // The LLM needs this list so it knows what it can call.
    const toolDeps = {
      sandboxManager,
      workingDirectory: context.workingDirectory,
      extensionRegistry, // enables MCP tools via ExtensionRegistry.executeTool
    };
    const tools = listAvailableTools(toolDeps);

    const result = await runner.run(messages, {
      maxSteps: agent.maxSteps,
      systemPrompt: runner.getSystemPrompt(),
      tools,
      signal: opts.signal,
      onStep: (step) => {
        // Forward each step's assistant message to the renderer.
        if (step.message.content) {
          send('chat:stream-chunk', { chunk: step.message.content });
        }
        if (step.message.toolCalls) {
          for (const tc of step.message.toolCalls) {
            send('chat:stream-tool-call', { toolCall: tc });
          }
        }
      },
      onToolCall: async (toolCall) => {
        // Execute the tool via the tool executor (built-in or MCP).
        send('chat:stream-tool-call', { toolCall });
        const result = await executeToolCall(toolCall, toolDeps);
        send('chat:stream-tool-result', { toolResult: { id: toolCall.id, content: result.content, isError: result.isError } });
        return result;
      },
    });

    // Extract the final assistant message content.
    const finalContent = result.finalMessage?.content || result.steps[result.steps.length - 1]?.message?.content || '';
    return {
      content: finalContent,
      steps: result.steps.length,
      status: result.status,
    };
  }

  ipcMain.handle("acp:status", wrapIPC(async () => {
    return { success: true, data: acpClient.getStatus() };
  }));

  // ── Chat IPC ──────────────────────────────────────────────────────────────

  ipcMain.handle(
    "chat:send",
    async (
      _event,
      sessionId: string,
      message: string,
      _options?: Record<string, unknown>
    ) => {
      try {
        // Run pre-session hooks
        const hookResults = await hookManager.trigger("UserPromptSubmit", {
          sessionId,
          message,
        });

        // Check if any hook denied the message
        const denied = hookResults.find((r) => r.deny === true);
        if (denied) {
          return {
            success: false,
            error: denied.reason || "Message denied by hook",
          };
        }

        // Get the session
        const session = await sessionManager.load(sessionId);

        // Trace the user message
        await traceCollector.addEntry(sessionId, {
          type: "info",
          content: `User: ${message}`,
          metadata: { source: "user" },
        });

        // Determine the agent mode for this session.
        const agentMode = agentSessionBridge.getCurrentMode(sessionId);

        let responseContent: string;

        if (agentMode === AgentMode.chat) {
          // Chat mode: direct LLM call, no agentic loop, no tools.
          const providerId = session.providerId || appConfig.defaultProviderId;
          const model = session.model || appConfig.defaultModel;

          const response = await providerClient.chat({
            model: `${providerId}/${model}`,
            messages: [
              ...session.messages.map((m: any) => ({ role: m.role, content: m.content })),
              { role: 'user', content: message },
            ],
          });
          responseContent = response.content;
        } else {
          // Build / Plan / Smart mode: run the agentic loop.
          const send = (channel: string, data: Record<string, unknown>) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send(channel, { sessionId, ...data });
            }
          };
          const agentResult = await runAgent({ sessionId, message, session, send });
          responseContent = agentResult.content;
        }

        // Save the response to the session
        await sessionManager.addMessage(sessionId, {
          role: "user",
          content: message,
        });
        await sessionManager.addMessage(sessionId, {
          role: "assistant",
          content: responseContent,
        });

        // Trace the assistant response
        await traceCollector.addEntry(sessionId, {
          type: "info",
          content: `Assistant: ${responseContent.substring(0, 200)}...`,
          metadata: { source: "assistant" },
        });

        // Run post-session hooks
        await hookManager.trigger("PostSession", {
          sessionId,
          response: responseContent,
        });

        return { success: true, data: { content: responseContent } };
      } catch (err: any) {
        await traceCollector.addEntry(sessionId, {
          type: "error",
          content: `Chat error: ${err.message}`,
          metadata: { source: "system" },
        });
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle(
    "chat:stream",
    async (
      _event,
      sessionId: string,
      message: string,
      _options?: Record<string, unknown>
    ) => {
      try {
        // Run pre-session hooks
        const hookResults = await hookManager.trigger("UserPromptSubmit", {
          sessionId,
          message,
        });
        const denied = hookResults.find((r) => r.deny === true);
        if (denied) {
          return {
            success: false,
            error: denied.reason || "Message denied by hook",
          };
        }

        const session = await sessionManager.load(sessionId);
        const agentMode = agentSessionBridge.getCurrentMode(sessionId);

        const send = (channel: string, data: unknown) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(channel, { sessionId, ...((typeof data === 'object' && data !== null) ? data : { data }) });
          }
        };

        if (agentMode !== AgentMode.chat) {
          // ── Agent mode (Build / Plan / Smart): run the agentic loop ──────────
          // The loop runs in the background; each step's content and tool calls
          // are forwarded to the renderer via the same chat:stream-* events
          // that the direct streaming path uses, so useChat doesn't need to
          // distinguish between the two paths.
          (async () => {
            try {
              const agentResult = await runAgent({ sessionId, message, session, send });
              await sessionManager.addMessage(sessionId, { role: 'user', content: message });
              await sessionManager.addMessage(sessionId, { role: 'assistant', content: agentResult.content });
              send('chat:stream-end', { content: agentResult.content });
            } catch (err: any) {
              send('chat:stream-error', { error: err.message });
            }
          })();
          return { success: true, data: { streaming: true } };
        }

        // ── Chat mode: direct streaming via providerClient.chatStream ──────────
        const providerId = session.providerId || appConfig.defaultProviderId;
        const model = session.model || appConfig.defaultModel;

        // Run the generator in the background and forward chunks to the renderer.
        (async () => {
          try {
            let fullResponse = '';
            for await (const chunk of providerClient.chatStream({
              model: `${providerId}/${model}`,
              messages: [
                ...session.messages.map((m: any) => ({ role: m.role, content: m.content })),
                { role: 'user', content: message },
              ],
            })) {
              switch (chunk.type) {
                case 'content':
                  if (chunk.content) {
                    fullResponse += chunk.content;
                    send('chat:stream-chunk', { chunk: chunk.content });
                  }
                  break;
                case 'thinking':
                  if (chunk.content) send('chat:stream-thinking', { thinking: chunk.content });
                  break;
                case 'tool_call_start':
                case 'tool_call_delta':
                case 'tool_call_end':
                  send('chat:stream-tool-call', { toolCall: chunk.toolCall });
                  break;
                case 'tool_result':
                  send('chat:stream-tool-result', { toolResult: chunk.toolResult });
                  break;
                case 'usage':
                  break;
                case 'error':
                  send('chat:stream-error', { error: chunk.error?.message || 'Unknown stream error' });
                  return;
                case 'done':
                  await sessionManager.addMessage(sessionId, { role: 'user', content: message });
                  await sessionManager.addMessage(sessionId, { role: 'assistant', content: fullResponse });
                  send('chat:stream-end', { content: fullResponse });
                  return;
              }
            }
          } catch (err: any) {
            send('chat:stream-error', { error: err.message });
          }
        })();

        return { success: true, data: { streaming: true } };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle("chat:cancel", wrapIPC(async (_event, sessionId: string) => {
    // Cancel any ongoing streaming for this session
    await providerManager.cancelStream(sessionId);
    mainWindow?.webContents.send("chat:stream-cancelled", { sessionId });
    return { success: true };
  }));

  // ── File IPC ──────────────────────────────────────────────────────────────

  ipcMain.handle("file:drop", wrapIPC(async (_event, filePaths: string[]) => {
    const files: DropppedFile[] = [];
    for (const filePath of filePaths) {
      const stat = fs.statSync(filePath);
      files.push({
        path: filePath,
        name: path.basename(filePath),
        size: stat.size,
        type: path.extname(filePath).slice(1) || "unknown",
      });
    }
    mainWindow?.webContents.send("file:dropped", files);
    return { success: true, data: files };
  }));

  ipcMain.handle(
    "file:open",
    wrapIPC(async (_event, filePath: string, _options?: Record<string, unknown>) => {
      const result = await shell.openPath(filePath);
      if (result) {
        return { success: false, error: result };
      }
      return { success: true };
    })
  );

  // Handle file open from OS (e.g., double-click a file)
  ipcMain.handle("file:read-in-sandbox", wrapIPC(async (_event, sandboxPath: string) => {
    const content = await sandboxManager.getFile(sandboxPath);
    return {
      success: true,
      data: { content: content.toString("base64"), path: sandboxPath },
    };
  }));

  ipcMain.handle(
    "file:write-in-sandbox",
    wrapIPC(async (_event, sandboxPath: string, contentBase64: string) => {
      const content = Buffer.from(contentBase64, "base64");
      await sandboxManager.putFile(sandboxPath, content);
      return { success: true };
    })
  );

  // ── Trace IPC ─────────────────────────────────────────────────────────────

  ipcMain.handle("trace:start", wrapIPC(async (_event, sessionId: string) => {
    await traceCollector.startSession(sessionId);
    return { success: true };
  }));

  ipcMain.handle("trace:stop", wrapIPC(async (_event, sessionId: string) => {
    await traceCollector.stopSession(sessionId);
    return { success: true };
  }));

  ipcMain.handle(
    "trace:get",
    wrapIPC(async (
      _event,
      sessionId: string,
      options?: { type?: TraceEntryType; limit?: number; offset?: number }
    ) => {
      const traces = await traceCollector.getTraces(sessionId, options);
      return { success: true, data: traces };
    })
  );

  // ── OpenCode IPC ──────────────────────────────────────────────────────────

  ipcMain.handle("opencode:init", wrapIPC(async () => {
    // Initialize OpenCode integration
    const opencodeDir = path.join(getUserDataPath(), "opencode");
    if (!fs.existsSync(opencodeDir)) {
      fs.mkdirSync(opencodeDir, { recursive: true });
    }

    // Create default configuration
    const opencodeConfig = {
      version: "1.0.0",
      defaultProvider: appConfig.defaultProviderId,
      defaultModel: appConfig.defaultModel,
      sandbox: {
        enabled: true,
        type: sandboxManager.getSandboxType(),
      },
      extensions: (await extensionRegistry.list())
        .filter((e) => e.enabled)
        .map((e) => e.id),
    };

    const configPath = path.join(opencodeDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify(opencodeConfig, null, 2));

    return { success: true, data: opencodeConfig };
  }));

  ipcMain.handle("opencode:status", wrapIPC(async () => {
    const opencodeDir = path.join(getUserDataPath(), "opencode");
    const configPath = path.join(opencodeDir, "config.json");

    if (!fs.existsSync(configPath)) {
      return { success: true, data: { initialized: false } };
    }

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const sandboxStatus = sandboxManager.getStatus();

    return {
      success: true,
      data: {
        initialized: true,
        config,
        sandboxRunning: sandboxStatus.running,
        sandboxType: sandboxStatus.type,
        activeExtensions: (await extensionRegistry.list()).filter(
          (e) => e.enabled
        ).length,
        totalExtensions: (await extensionRegistry.list()).length,
      },
    };
  }));

  // ── OpenCode Bridge IPC ──────────────────────────────────────────────────

  ipcMain.handle("opencode:sessions:list", wrapIPC(async () => {
    const bridge = getOpenCodeBridge();
    const sessions = await bridge.listSessions();
    return { success: true, data: sessions };
  }));

  ipcMain.handle("opencode:sessions:create", wrapIPC(async (_event, options?: Record<string, unknown>) => {
    const bridge = getOpenCodeBridge();
    const session = await bridge.createSession(options);
    return { success: true, data: session };
  }));

  ipcMain.handle("opencode:sessions:delete", wrapIPC(async (_event, sessionId: string) => {
    const bridge = getOpenCodeBridge();
    await bridge.deleteSession(sessionId);
    return { success: true };
  }));

  ipcMain.handle("opencode:messages:send", wrapIPC(async (_event, sessionId: string, content: string, options?: Record<string, unknown>) => {
    const bridge = getOpenCodeBridge();
    const message = await bridge.sendMessage(sessionId, content, options);
    return { success: true, data: message };
  }));

  ipcMain.handle("opencode:messages:list", wrapIPC(async (_event, sessionId: string) => {
    const bridge = getOpenCodeBridge();
    const messages = await bridge.listMessages(sessionId);
    return { success: true, data: messages };
  }));

  ipcMain.handle("opencode:files:list", wrapIPC(async (_event, dirPath?: string) => {
    const bridge = getOpenCodeBridge();
    const files = await bridge.listFiles(dirPath);
    return { success: true, data: files };
  }));

  ipcMain.handle("opencode:files:read", wrapIPC(async (_event, filePath: string) => {
    const bridge = getOpenCodeBridge();
    const content = await bridge.readFile(filePath);
    return { success: true, data: content };
  }));

  ipcMain.handle("opencode:tools:list", wrapIPC(async () => {
    const bridge = getOpenCodeBridge();
    const tools = await bridge.listTools();
    return { success: true, data: tools };
  }));

  ipcMain.handle("opencode:tools:execute", wrapIPC(async (_event, name: string, args: Record<string, unknown>) => {
    const bridge = getOpenCodeBridge();
    const result = await bridge.executeTool(name, args);
    return { success: true, data: result };
  }));

  ipcMain.handle("opencode:mcp:list", wrapIPC(async () => {
    const bridge = getOpenCodeBridge();
    const servers = await bridge.listMCPServers();
    return { success: true, data: servers };
  }));

  ipcMain.handle("opencode:mcp:call", wrapIPC(async (_event, serverName: string, toolName: string, args: Record<string, unknown>) => {
    const bridge = getOpenCodeBridge();
    const result = await bridge.callMCPTool(serverName, toolName, args);
    return { success: true, data: result };
  }));

  ipcMain.handle("opencode:lsp:diagnostics", wrapIPC(async (_event, filePath?: string) => {
    const bridge = getOpenCodeBridge();
    const diagnostics = await bridge.getDiagnostics(filePath);
    return { success: true, data: diagnostics };
  }));

  // ── Window Control IPC ────────────────────────────────────────────────────

  ipcMain.handle("window:minimize", () => {
    mainWindow?.minimize();
    return { success: true };
  });

  ipcMain.handle("window:maximize", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
    return { success: true };
  });

  ipcMain.handle("window:close", () => {
    mainWindow?.close();
    return { success: true };
  });

  ipcMain.handle("window:isMaximized", () => {
    return mainWindow?.isMaximized() ?? false;
  });

  // ── App Info IPC ──────────────────────────────────────────────────────────

  ipcMain.handle("app:getVersion", () => {
    return app.getVersion();
  });

  ipcMain.handle("app:quit", () => {
    isQuitting = true;
    app.quit();
  });

  ipcMain.handle("app:getConfig", () => {
    return appConfig;
  });

  ipcMain.handle("app:updateConfig", (_event, updates: Partial<AppConfig>) => {
    appConfig = { ...appConfig, ...updates };
    saveConfig(appConfig);
    return { success: true };
  });

  // ── Dialog IPC ────────────────────────────────────────────────────────────

  ipcMain.handle(
    "dialog:openFile",
    async (_event, options: Electron.OpenDialogOptions) => {
      const result = await dialog.showOpenDialog(mainWindow!, options);
      return result;
    }
  );

  ipcMain.handle(
    "dialog:saveFile",
    async (_event, options: Electron.SaveDialogOptions) => {
      const result = await dialog.showSaveDialog(mainWindow!, options);
      return result;
    }
  );

  // ── Project IPC ──────────────────────────────────────────────────────────

  ipcMain.handle("project:list", wrapIPC(async () => {
    return { success: true, data: projectManager.list() };
  }));

  ipcMain.handle("project:create", wrapIPC(async (_event, options: Record<string, unknown>) => {
    const project = await projectManager.create(options as any);
    return { success: true, data: project };
  }));

  ipcMain.handle("project:open", wrapIPC(async (_event, projectId: string) => {
    const project = projectManager.get(projectId);
    if (!project) return { success: false, error: 'Project not found' };
    await projectManager.setActive(projectId);
    return { success: true, data: project };
  }));

  ipcMain.handle("project:delete", wrapIPC(async (_event, projectId: string) => {
    await projectManager.delete(projectId);
    return { success: true };
  }));

  ipcMain.handle("project:getActive", wrapIPC(async () => {
    return { success: true, data: projectManager.getActive() };
  }));

  ipcMain.handle("project:setActive", wrapIPC(async (_event, projectId: string) => {
    await projectManager.setActive(projectId);
    return { success: true };
  }));

  ipcMain.handle("project:templates", wrapIPC(async () => {
    return { success: true, data: projectManager.getBuiltinTemplates() };
  }));

  // ── Skill IPC ────────────────────────────────────────────────────────────

  ipcMain.handle("skill:list", wrapIPC(async () => {
    return { success: true, data: skillRegistry.list() };
  }));

  ipcMain.handle("skill:get", wrapIPC(async (_event, skillId: string) => {
    const skill = skillRegistry.get(skillId);
    if (!skill) return { success: false, error: 'Skill not found' };
    return { success: true, data: skill };
  }));

  ipcMain.handle("skill:execute", wrapIPC(async (_event, skillId: string, variables: Record<string, unknown>, context?: Record<string, unknown>) => {
    const execution = await skillRegistry.execute(skillId, variables, context);
    return { success: true, data: execution };
  }));

  // ── Provider Health IPC ──────────────────────────────────────────────────

  ipcMain.handle("provider:health:check", wrapIPC(async (_event, providerId: string) => {
    const snapshot = await healthMonitor.checkProvider(providerId);
    return { success: true, data: snapshot };
  }));

  ipcMain.handle("provider:health:dashboard", wrapIPC(async () => {
    return { success: true, data: healthMonitor.getDashboardData() };
  }));

  // ── Platform IPC ─────────────────────────────────────────────────────────

  ipcMain.handle("platform:getEnvVar", wrapIPC(async (_event, varName: string) => {
    const value = process.env[varName];
    return { success: true, data: value || null };
  }));

  // ── Phase 1-8: New IPC Handlers ──────────────────────────────────────────

  // Phase 1: Agent Mode System IPC
  ipcMain.handle("agent:list", wrapIPC(async () => agentRegistry.list()));
  ipcMain.handle("agent:get", wrapIPC(async (_e, id: string) => agentRegistry.get(id)));
  ipcMain.handle("agent:getActive", wrapIPC(async () => agentRegistry.getActive()));
  ipcMain.handle("agent:setActive", wrapIPC(async (_e, id: string) => { agentRegistry.setActive(id); }));
  ipcMain.handle("agent:create", wrapIPC(async (_e, agent: any) => { await agentRegistry.create(agent); return agentRegistry.get(agent.id); }));
  ipcMain.handle("agent:delete", wrapIPC(async (_e, id: string) => { await agentRegistry.delete(id); }));
  ipcMain.handle("agent:detectMode", wrapIPC(async (_e, prompt: string) => autoModeDetector.detectMode(prompt)));
  ipcMain.handle("agent:listPresets", wrapIPC(async () => agentPresetManager.list()));
  ipcMain.handle("agent:applyPreset", wrapIPC(async (_e, presetId: string) => agentPresetManager.apply(presetId)));
  ipcMain.handle("agent:switchMode", wrapIPC(async (_e, sessionId: string, mode: string) => { agentSessionBridge.switchMode(sessionId, mode as any, 'manual'); }));
  ipcMain.handle("agent:suggestMode", wrapIPC(async (_e, sessionId: string, prompt: string) => agentSessionBridge.suggestMode(sessionId, prompt)));

  // Phase 2: Provider Overhaul IPC
  ipcMain.handle("provider:resolveModelId", wrapIPC(async (_e, modelId: string) => modelIdResolver.resolve(modelId)));
  ipcMain.handle("provider:listAliases", wrapIPC(async () => modelIdResolver.listAliases()));
  // Provider catalog + gateway router removed — replaced by the v3 provider registry.
  ipcMain.handle("provider:configSets", wrapIPC(async () => configSetManager.list()));
  ipcMain.handle("provider:configSetActive", wrapIPC(async () => configSetManager.getActive()));
  ipcMain.handle("provider:configSetSwitch", wrapIPC(async (_e, id: string) => configSetManager.switch(id)));
  ipcMain.handle("provider:configSetCreate", wrapIPC(async (_e, config: any) => configSetManager.create(config)));
  ipcMain.handle("provider:configSetUpdate", wrapIPC(async (_e, id: string, updates: any) => configSetManager.update(id, updates)));
  ipcMain.handle("provider:configSetDelete", wrapIPC(async (_e, id: string) => configSetManager.delete(id)));
  ipcMain.handle("provider:modelVariants", wrapIPC(async (_e, modelId?: string) => modelVariantManager.list(modelId)));
  ipcMain.handle("provider:modelVariantActive", wrapIPC(async () => modelVariantManager.getActive()));
  ipcMain.handle("provider:modelVariantSet", wrapIPC(async (_e, id: string) => modelVariantManager.setActive(id)));
  ipcMain.handle("provider:modelVariantCycle", wrapIPC(async (_e, modelId: string, dir?: string) => modelVariantManager.cycleVariant(modelId, dir as any)));
  ipcMain.handle("provider:diagnose", wrapIPC(async (_e, providerId: string, quick?: boolean) => {
    const provider = providerManager.getProvider(providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);
    const config = provider.config;
    if (quick) {
      return providerDiagnostics.runQuick(providerId, config.type, config.apiHost || '', config.apiKey);
    }
    return providerDiagnostics.runFull(providerId, config.type, config.apiHost || '', config.apiKey, config.models?.[0]);
  }));

  // Phase 4: Extension System Upgrade IPC
  ipcMain.handle("extension:marketplace:search", wrapIPC(async (_e, query?: string, cat?: string) => extensionMarketplace.search(query, cat as any)));
  ipcMain.handle("extension:marketplace:featured", wrapIPC(async () => extensionMarketplace.getFeatured()));
  ipcMain.handle("extension:marketplace:install", wrapIPC(async (_e, id: string) => extensionMarketplace.install(id)));
  ipcMain.handle("extension:lifecycle:state", wrapIPC(async (_e, id: string) => extensionLifecycleManager.getState(id)));
  ipcMain.handle("extension:lifecycle:activate", wrapIPC(async (_e, id: string) => { await extensionLifecycleManager.activate(id); }));
  ipcMain.handle("extension:lifecycle:deactivate", wrapIPC(async (_e, id: string) => { await extensionLifecycleManager.deactivate(id); }));
  ipcMain.handle("extension:lifecycle:restart", wrapIPC(async (_e, id: string) => { await extensionLifecycleManager.restart(id); }));
  ipcMain.handle("extension:hotReload:watch", wrapIPC(async (_e, id: string) => { hotReloadManager.watch(id, ''); }));
  ipcMain.handle("extension:hotReload:unwatch", wrapIPC(async (_e, id: string) => { hotReloadManager.unwatch(id); }));

  // Phase 5: Context & Memory IPC
  ipcMain.handle("context:usage", wrapIPC(async (_e, sessionId: string) => {
    const session = await sessionManager.load(sessionId);
    const allocation = contextWindowManager.allocate(sessionId, session.messages || [], [], '', []);
    return contextWindowManager.createContextUsage(allocation);
  }));
  ipcMain.handle("context:compact", wrapIPC(async (_e, sessionId: string) => {
    const session = await sessionManager.load(sessionId);
    const result = await autoCompactionManager.forceCompact(sessionId, session.messages);
    return { savedTokens: result.savedTokens };
  }));
  ipcMain.handle("context:windowInfo", wrapIPC(async (_e, modelId: string) => contextWindowManager.getContextWindow(modelId)));
  ipcMain.handle("memory:core:list", wrapIPC(async () => coreMemoryStore.list()));
  ipcMain.handle("memory:core:set", wrapIPC(async (_e, cat: string, key: string, val: string) => coreMemoryStore.set(cat as any, key, val)));
  ipcMain.handle("memory:core:delete", wrapIPC(async (_e, id: string) => { await coreMemoryStore.delete(id); }));
  ipcMain.handle("memory:experience:search", wrapIPC(async (_e, query: string, limit?: number) => semanticSearchEngine.search(query, limit)));
  ipcMain.handle("memory:experience:list", wrapIPC(async (_e, limit?: number) => experienceMemoryStore.list(limit)));

  // Phase 6: Permission & Security IPC
  ipcMain.handle("permission:policies", wrapIPC(async () => permissionPolicyEngine.getAllPolicies()));
  ipcMain.handle("permission:policy:get", wrapIPC(async (_e, id: string) => permissionPolicyEngine.getPolicy(id)));
  ipcMain.handle("permission:policy:create", wrapIPC(async (_e, policy: any) => { permissionPolicyEngine.createPolicy(policy); }));
  ipcMain.handle("permission:policy:update", wrapIPC(async (_e, id: string, updates: any) => { permissionPolicyEngine.updatePolicy(id, updates); }));
  ipcMain.handle("permission:policy:delete", wrapIPC(async (_e, id: string) => { permissionPolicyEngine.deletePolicy(id); }));
  ipcMain.handle("permission:policy:templates", wrapIPC(async () => permissionPolicyEngine.getTemplates()));
  ipcMain.handle("permission:evaluate", wrapIPC(async (_e, toolName: string, args: any, mode: string) => permissionPolicyEngine.evaluate(toolName, args, { customContext: { agentMode: mode } })));
  ipcMain.handle("security:scan", wrapIPC(async (_e, content: string, location?: string) => injectionScanner.scan(content, location as any)));
  ipcMain.handle("security:steer:inject", wrapIPC(async (_e, sessionId: string, content: string, opts?: any) => steerManager.inject(sessionId, content, opts)));
  ipcMain.handle("security:steer:pending", wrapIPC(async (_e, sessionId: string) => steerManager.getPendingSteers(sessionId)));
  ipcMain.handle("security:steer:history", wrapIPC(async (_e, sessionId: string) => steerManager.getSteerHistory(sessionId)));

  // Phase 7: Recipe & Automation IPC
  ipcMain.handle("recipe:import", wrapIPC(async (_e, content: string, format?: string) => recipeImporter.importFromString(content, (format || 'json') as any)));
  ipcMain.handle("recipe:export", wrapIPC(async (_e, recipeId: string, format?: string) => {
    const recipe = await recipeEngine.get(recipeId);
    if (!recipe) throw new Error(`Recipe not found: ${recipeId}`);
    return recipeImporter.exportToString(recipe as any, (format || 'json') as any);
  }));
  ipcMain.handle("recipe:schedule:list", wrapIPC(async () => scheduledExecutor.listJobs()));
  ipcMain.handle("recipe:schedule:create", wrapIPC(async (_e, recipeId: string, schedule: string, vars?: any) => scheduledExecutor.schedule(recipeId, schedule, vars)));
  ipcMain.handle("recipe:schedule:pause", wrapIPC(async (_e, jobId: string) => { scheduledExecutor.pause(jobId); }));
  ipcMain.handle("recipe:schedule:resume", wrapIPC(async (_e, jobId: string) => { scheduledExecutor.resume(jobId); }));
  ipcMain.handle("recipe:schedule:cancel", wrapIPC(async (_e, jobId: string) => { scheduledExecutor.cancel(jobId); }));
  ipcMain.handle("recipe:schedule:runNow", wrapIPC(async (_e, jobId: string) => scheduledExecutor.runNow(jobId)));
  ipcMain.handle("recipe:subagent:dashboard", wrapIPC(async () => subagentDashboard.getDashboard()));
  ipcMain.handle("recipe:subagent:sessionTasks", wrapIPC(async (_e, sessionId: string) => subagentDashboard.getSessionTasks(sessionId)));

  // Phase 8: Polish & Integration IPC
  ipcMain.handle("project:config:load", wrapIPC(async (_e, dir: string) => projectConfigManager.loadProject(dir)));
  ipcMain.handle("project:config:save", wrapIPC(async (_e, config: any) => { await projectConfigManager.saveProject(config); }));
  ipcMain.handle("project:config:instructions", wrapIPC(async (_e, dir: string) => projectConfigManager.getInstructions(dir)));
  ipcMain.handle("project:config:createInstructions", wrapIPC(async (_e, dir: string, fmt: string) => { await projectConfigManager.createInstructions(dir, fmt as any); }));
  ipcMain.handle("session:fork", wrapIPC(async (_e, sessionId: string, atIdx: number, title?: string) => sessionOperations.fork(sessionId, atIdx, title)));
  ipcMain.handle("session:revert", wrapIPC(async (_e, sessionId: string, atIdx: number) => sessionOperations.revert(sessionId, atIdx)));
  ipcMain.handle("session:share", wrapIPC(async (_e, sessionId: string, expDays?: number) => sessionOperations.share(sessionId, expDays)));
  ipcMain.handle("session:branches", wrapIPC(async (_e, sessionId: string) => sessionOperations.getBranches(sessionId)));
  ipcMain.handle("session:compare", wrapIPC(async (_e, id1: string, id2: string) => sessionOperations.compare(id1, id2)));
  ipcMain.handle("computerUse:state", wrapIPC(async () => computerUseOverlayManager.getState()));
  ipcMain.handle("computerUse:show", wrapIPC(async () => { computerUseOverlayManager.showOverlay(); }));
  ipcMain.handle("computerUse:hide", wrapIPC(async () => { computerUseOverlayManager.hideOverlay(); }));
  ipcMain.handle("computerUse:captureScreenshot", wrapIPC(async () => computerUseOverlayManager.captureScreenshot()));
  ipcMain.handle("config:layered:get", wrapIPC(async (_e, key: string) => layeredConfig.get(key)));
  ipcMain.handle("config:layered:set", wrapIPC(async (_e, key: string, value: any, layer?: string) => { await layeredConfig.set(key, value, layer as any); }));
  ipcMain.handle("config:layered:layers", wrapIPC(async () => layeredConfig.getAllLayers()));
}

// ─── Subsystem Event Forwarding ───────────────────────────────────────────────

function setupSubsystemEventForwarding(): void {
  // Sandbox events
  sandboxManager.on("status-changed", (status: any) => {
    mainWindow?.webContents.send("sandbox:status-changed", status);
  });

  sandboxManager.on("error", (error: Error) => {
    mainWindow?.webContents.send("sandbox:error", { message: error.message });
  });

  sandboxManager.on("health-check", (health: any) => {
    mainWindow?.webContents.send("sandbox:health", health);
  });

  // Extension events
  extensionRegistry.on("installed", (extension: any) => {
    mainWindow?.webContents.send("extension:installed", extension);
  });

  extensionRegistry.on("uninstalled", (extensionId: string) => {
    mainWindow?.webContents.send("extension:uninstalled", { extensionId });
  });

  extensionRegistry.on("error", (error: Error) => {
    mainWindow?.webContents.send("extension:error", { message: error.message });
  });

  // ACP events
  acpClient.on("connected", (info: any) => {
    mainWindow?.webContents.send("acp:connected", info);
  });

  acpClient.on("disconnected", () => {
    mainWindow?.webContents.send("acp:disconnected");
  });

  acpClient.on("message", (message: any) => {
    mainWindow?.webContents.send("acp:message", message);
  });

  acpClient.on("error", (error: Error) => {
    mainWindow?.webContents.send("acp:error", { message: error.message });
  });

  // Trace events
  traceCollector.on("entry", (entry: any) => {
    mainWindow?.webContents.send("trace:entry", entry);
  });
}

// ─── Subsystem Health Check ────────────────────────────────────────────────────

function startSubsystemHealthCheck(): void {
  healthCheckInterval = setInterval(() => {
    // Check if ProviderManager is initialized
    if (providerManager && !(providerManager as any).isInitialized) {
      logger.warn('HealthCheck', 'ProviderManager not initialized, attempting recovery');
      try {
        providerManager.initialize().catch((err: any) => {
          logger.error('HealthCheck', 'ProviderManager recovery failed', err);
        });
      } catch (err) {
        logger.error('HealthCheck', 'ProviderManager recovery error', err);
      }
    }

    // Check log directory exists
    const logsDir = path.join(getUserDataPath(), 'logs');
    try {
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
        logger.warn('HealthCheck', 'Recreated missing logs directory');
      }
    } catch (err) {
      logger.error('HealthCheck', 'Failed to recreate logs directory', err);
    }

    logger.debug('HealthCheck', 'Health check completed');
  }, 60000); // Every 60 seconds
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanupBeforeQuit(): Promise<void> {
  try {
    if (healthMonitor) {
      // BUGFIX: previously the health monitor interval was never stopped on
      // quit, leaking an interval that kept hitting provider APIs.
      healthMonitor.stop?.();
    }
    if (sandboxManager) {
      await sandboxManager.stop();
    }
    if (acpClient) {
      await acpClient.disconnect();
    }
    if (traceCollector) {
      await traceCollector.shutdown();
    }
    if (sessionManager) {
      await sessionManager.shutdown();
    }
    // Phase 1-8: Cleanup new subsystems
    if (hotReloadManager) {
      hotReloadManager.stopAll();
    }
    if (scheduledExecutor) {
      scheduledExecutor.shutdown();
    }
    // BUGFIX: Previously the ProviderManager (which owns the SidecarManager)
    // was never shut down, orphaning the OpenCode sidecar child process as a
    // zombie after the app exited. Now we explicitly call shutdown().
    if (providerManager && typeof providerManager.shutdown === 'function') {
      try {
        await providerManager.shutdown();
      } catch (err) {
        logger.error('Main', 'ProviderManager shutdown error', err);
      }
    }
    // Close database connection
    closeDatabase();
    logger.info('Main', 'Cleanup completed successfully');
  } catch (err) {
    console.error("[Main] Error during cleanup:", err);
    logger.error('Main', 'Error during cleanup', err);
  }
}

// ─── Single Instance Lock ─────────────────────────────────────────────────────

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  // ─── App Lifecycle ──────────────────────────────────────────────────────────

  app.on("ready", async () => {
    console.info(`[Main] ${APP_NAME} v${app.getVersion()} starting...`);

    // Initialize logger first — all subsequent code can use it
    initializeLogger(
      path.join(getUserDataPath(), 'logs'),
      IS_DEV ? LogLevel.DEBUG : LogLevel.INFO
    );
    logger.info('Main', `${APP_NAME} v${app.getVersion()} starting...`);

    // Run database migrations
    runMigrations();

    // Load config
    appConfig = loadConfig();

    // Validate config and log warnings
    const configValidation = validateAppConfig(appConfig);
    if (configValidation.warnings.length > 0) {
      for (const warning of configValidation.warnings) {
        logger.warn('Main', `Config warning: ${warning}`);
      }
    }
    if (!configValidation.valid) {
      for (const error of configValidation.errors) {
        logger.error('Main', `Config error: ${error}`);
      }
      logger.warn('Main', 'Resetting invalid config fields to defaults');
      const defaults: AppConfig = {
        windowBounds: { width: 1280, height: 800 },
        theme: "system",
        language: "en",
        autoUpdate: true,
        minimizeToTray: true,
        startupBehavior: "show",
        defaultProviderId: "openai",
        defaultModel: "gpt-4o",
        opencodePort: 3000,
        opencodeHostname: "127.0.0.1",
        opencodeAutoStart: true,
        autoStartSandbox: true,
        maxConcurrentSessions: 5,
        autoSave: true,
        sessionTimeoutMinutes: 30,
        permissionMode: "ask",
        sandboxMode: "path",
        debugMode: false,
        skillsPath: "",
        enableBuiltinSkills: true,
        logLevel: "info",
        traceEnabled: true,
        crashLogRetention: 7,
        developerMode: false,
      };
      appConfig = { ...defaults, ...appConfig };
    }

    // Create the main window
    createMainWindow();

    // BUGFIX: Register IPC handlers BEFORE initializeSubsystems(). Previously
    // the renderer would start calling IPC methods (provider:list, sessions:list,
    // etc.) as soon as the window loaded, but the handlers weren't registered
    // yet because initializeSubsystems() was still running. ipcRenderer.invoke()
    // for an unregistered channel never resolves — the promise hangs forever —
    // so initializeApp() in the renderer never reached setLoading(false) and the
    // app was stuck on the "Loading your AI workspace..." spinner.
    registerIpcHandlers();

    // Initialize all subsystems
    await initializeSubsystems();

    // Notify the renderer that all subsystems are ready. The renderer can
    // re-fetch any data that returned empty on the first try (before the
    // subsystems were initialized).
    mainWindow?.webContents.send("main:ready");

    // Set up subsystem event forwarding
    setupSubsystemEventForwarding();

    // Create system tray
    createTray();

    // Set up deep links
    setupDeepLinks();

    // Set up auto-updater
    setupAutoUpdater();

    // Start subsystem health check
    startSubsystemHealthCheck();

    // Register file drag-drop handler
    if (mainWindow) {
      // Note: file-dropped-in-page is not a standard Electron event.
      // File drop handling is done via IPC from the renderer process.
      // Keeping as a type assertion for future custom event support.
      (mainWindow.webContents as any).on("file-dropped-in-page", (_event: any, paths: any) => {
        const files: DropppedFile[] = paths.map((p: string) => ({
          path: p,
          name: path.basename(p),
          size: fs.statSync(p).size,
          type: path.extname(p).slice(1) || "unknown",
        }));
        mainWindow?.webContents.send("file:dropped", files);
      });
    }

    console.info("[Main] Application ready");
    logger.info('Main', 'Application ready');
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });

  app.on("before-quit", async () => {
    isQuitting = true;
    // Stop health check interval
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
      healthCheckInterval = undefined;
    }
    await cleanupBeforeQuit();
  });

  app.on("will-quit", () => {
    // Final cleanup
    if (tray) {
      tray.destroy();
    }
  });

  // Handle uncaught exceptions — Aether v2: Crash Logger
  // BUGFIX: previously the handler logged the crash but did NOT exit, leaving
  // the process in an undefined state (Node convention is to exit after
  // uncaughtException because the state is unrecoverable). We now log and
  // then exit so the user gets a clean restart instead of cascading failures.
  process.on("uncaughtException", (error: Error) => {
    console.error("[Main] Uncaught exception:", error);
    logger.error('Process', 'Uncaught exception', error);
    try {
      const crashLogger = new CrashLogger(getUserDataPath());
      crashLogger.writeCrashLog({
        timestamp: new Date().toISOString(),
        errorType: 'uncaughtException',
        errorName: error.name,
        errorMessage: error.message,
        stackTrace: error.stack || '',
      }, logger.getRecentEntries(100));
    } catch { /* best effort */ }
    mainWindow?.webContents.send("app:error", {
      message: error.message,
      stack: error.stack,
    });
    // Give the IPC a moment to flush, then exit.
    setTimeout(() => {
      isQuitting = true;
      app.quit();
      // Hard fallback if app.quit() doesn't exit within 2s.
      setTimeout(() => process.exit(1), 2000).unref();
    }, 500).unref();
  });

  process.on("unhandledRejection", (reason: unknown) => {
    console.error("[Main] Unhandled rejection:", reason);
    logger.error('Process', 'Unhandled rejection', reason);
    const error = reason instanceof Error ? reason : new Error(String(reason));
    try {
      const crashLogger = new CrashLogger(getUserDataPath());
      crashLogger.writeCrashLog({
        timestamp: new Date().toISOString(),
        errorType: 'unhandledRejection',
        errorName: error.name,
        errorMessage: error.message,
        stackTrace: error.stack || '',
      }, logger.getRecentEntries(100));
    } catch { /* best effort */ }
    mainWindow?.webContents.send("app:error", {
      message: String(reason),
    });
    // Note: do not exit on unhandledRejection — promises are recoverable in
    // most cases. The user can keep working. The log captures the failure.
  });

  // Aether v2: Signal handlers for clean shutdown.
  // BUGFIX: previously SIGTERM/SIGINT were logged as crashes — but these are
  // NORMAL shutdown signals (sent by systemd, by `kill`, by Ctrl+C in dev,
  // and by the OS during logout). Polluting the crash log with them hid real
  // crashes. We now log them as informational and skip writing a crash log.
  process.on('SIGTERM', () => {
    logger.info('Process', 'Received SIGTERM (clean shutdown)');
    isQuitting = true;
    app.quit();
  });

  process.on('SIGINT', () => {
    logger.info('Process', 'Received SIGINT (Ctrl+C — clean shutdown)');
    isQuitting = true;
    app.quit();
  });
}
