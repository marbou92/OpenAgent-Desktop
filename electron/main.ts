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
  protocol,
  net,
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

// ─── Type Definitions ─────────────────────────────────────────────────────────

interface AppConfig {
  windowBounds: { width: number; height: number; x?: number; y?: number };
  theme: "light" | "dark" | "system";
  autoStartSandbox: boolean;
  defaultProviderId: string;
  defaultModel: string;
  maxConcurrentSessions: number;
  traceEnabled: boolean;
  autoUpdate: boolean;
  minimizeToTray: boolean;
}

interface DropppedFile {
  path: string;
  name: string;
  size: number;
  type: string;
  content?: Buffer;
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

let appConfig: AppConfig;

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
    autoStartSandbox: true,
    defaultProviderId: "openai",
    defaultModel: "gpt-4o",
    maxConcurrentSessions: 5,
    traceEnabled: true,
    autoUpdate: true,
    minimizeToTray: true,
  };

  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8");
      const saved = JSON.parse(raw);
      return { ...defaults, ...saved };
    }
  } catch (err) {
    console.error("[Main] Failed to load config, using defaults:", err);
  }

  return defaults;
}

function saveConfig(config: AppConfig): void {
  const configPath = getConfigPath();
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
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
  mainWindow.webContents.on("will-navigate", (event, url) => {
    // Prevent navigation away from app
    if (!url.startsWith("http://localhost:5173") && !url.startsWith("file://")) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on("did-navigate", (_event, url) => {
    console.log("[Main] Navigated to:", url);
  });

  return mainWindow;
}

// ─── System Tray ──────────────────────────────────────────────────────────────

function createTray(): void {
  const iconPath = path.join(__dirname, "../assets/tray-icon.png");
  let trayIcon: Electron.NativeImage;

  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath);
  } else {
    // Create a simple default icon if asset doesn't exist
    trayIcon = nativeImage.createEmpty();
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

function handleDeepLink(url: string): void {
  try {
    const parsedUrl = new URL(url);
    const action = parsedUrl.hostname;
    const params = Object.fromEntries(parsedUrl.searchParams.entries());

    switch (action) {
      case "install-extension": {
        const extensionUrl = params.url;
        if (extensionUrl) {
          // TODO: Implement installFromUrl on ExtensionRegistry
          (extensionRegistry as any).installFromUrl(extensionUrl).then((ext: any) => {
            mainWindow?.webContents.send("extension:installed", ext);
          }).catch((err: any) => {
            mainWindow?.webContents.send("extension:install-error", {
              message: err.message,
            });
          });
        }
        break;
      }
      case "import-recipe": {
        const recipeData = params.data;
        if (recipeData) {
          const decoded = Buffer.from(recipeData, "base64").toString("utf-8");
          const recipe = JSON.parse(decoded);
          recipeEngine.importRecipe(recipe).then((imported) => {
            mainWindow?.webContents.send("recipe:imported", imported);
          }).catch((err) => {
            mainWindow?.webContents.send("recipe:import-error", {
              message: err.message,
            });
          });
        }
        break;
      }
      case "open-session": {
        const sessionId = params.id;
        if (sessionId) {
          mainWindow?.webContents.send("session:open-requested", sessionId);
        }
        break;
      }
      case "run-recipe": {
        const recipeId = params.id;
        const variables = params.variables
          ? JSON.parse(params.variables)
          : {};
        if (recipeId) {
          recipeEngine.run(recipeId, variables).then((result) => {
            mainWindow?.webContents.send("recipe:run-complete", result);
          }).catch((err) => {
            mainWindow?.webContents.send("recipe:run-error", {
              message: err.message,
            });
          });
        }
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
    console.log("[Main] Skipping auto-updater in development mode");
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    console.log("[Main] Checking for updates...");
    mainWindow?.webContents.send("updater:checking");
  });

  autoUpdater.on("update-available", (info) => {
    console.log("[Main] Update available:", info.version);
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
    console.log("[Main] No updates available");
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
    console.log("[Main] Update downloaded:", info.version);
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
  ];
  for (const dir of dirs) {
    const dirPath = path.join(userDataPath, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
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
  providerManager = new ProviderManager();
  await providerManager.initialize();

  // Initialize extension registry
  extensionRegistry = new ExtensionRegistry(path.join(userDataPath, "extensions", "extension-configs.json"));
  await extensionRegistry.initialize();

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
    sandboxManager,
    hookManager,
  });
  await recipeEngine.initialize();

  console.log("[Main] All subsystems initialized successfully");
}

// ─── IPC Handler Registration ─────────────────────────────────────────────────

function registerIpcHandlers(): void {
  // ── Provider IPC ──────────────────────────────────────────────────────────

  ipcMain.handle("provider:list", async () => {
    try {
      return { success: true, data: await (providerManager as any).list() };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(
    "provider:add",
    async (_event, providerConfig: Record<string, unknown>) => {
      try {
        const provider = await (providerManager as any).add(providerConfig);
        return { success: true, data: provider };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle("provider:remove", async (_event, providerId: string) => {
    try {
      await (providerManager as any).remove(providerId);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("provider:test", async (_event, providerId: string) => {
    try {
      const result = await providerManager.test(providerId);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(
    "provider:setDefault",
    async (_event, providerId: string, model: string) => {
      try {
        await providerManager.setDefault(providerId);
        appConfig.defaultProviderId = providerId;
        appConfig.defaultModel = model;
        saveConfig(appConfig);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  // ── Extension IPC ─────────────────────────────────────────────────────────

  ipcMain.handle("extension:list", async () => {
    try {
      return { success: true, data: await (extensionRegistry as any).list() };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(
    "extension:enable",
    async (_event, extensionId: string) => {
      try {
        await (extensionRegistry as any).enable(extensionId);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle(
    "extension:disable",
    async (_event, extensionId: string) => {
      try {
        await (extensionRegistry as any).disable(extensionId);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle(
    "extension:install",
    async (_event, source: string, options?: Record<string, unknown>) => {
      try {
        const extension = await (extensionRegistry as any).install(source, options);
        return { success: true, data: extension };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle(
    "extension:configure",
    async (
      _event,
      extensionId: string,
      config: Record<string, unknown>
    ) => {
      try {
        await (extensionRegistry as any).configure(extensionId, config);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  // ── Session IPC ───────────────────────────────────────────────────────────

  ipcMain.handle("session:list", async () => {
    try {
      return { success: true, data: await sessionManager.list() };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(
    "session:create",
    async (_event, options?: Record<string, unknown>) => {
      try {
        const session = await sessionManager.create(options);
        return { success: true, data: session };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle("session:load", async (_event, sessionId: string) => {
    try {
      const session = await sessionManager.load(sessionId);
      return { success: true, data: session };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(
    "session:save",
    async (_event, sessionId: string, data: Record<string, unknown>) => {
      try {
        await sessionManager.save(sessionId, data);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle("session:delete", async (_event, sessionId: string) => {
    try {
      await sessionManager.delete(sessionId);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(
    "session:export",
    async (_event, sessionId: string, format: "json" | "markdown") => {
      try {
        const exported = await sessionManager.exportSession(sessionId, format);
        return { success: true, data: exported };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  // ── Recipe IPC ────────────────────────────────────────────────────────────

  ipcMain.handle("recipe:list", async () => {
    try {
      return { success: true, data: await recipeEngine.list() };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(
    "recipe:create",
    async (_event, recipeData: Record<string, unknown>) => {
      try {
        const recipe = await (recipeEngine as any).create(recipeData);
        return { success: true, data: recipe };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle(
    "recipe:run",
    async (_event, recipeId: string, variables?: Record<string, string>) => {
      try {
        const result = await recipeEngine.run(recipeId, variables);
        return { success: true, data: result };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle("recipe:delete", async (_event, recipeId: string) => {
    try {
      await recipeEngine.delete(recipeId);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(
    "recipe:import",
    async (_event, source: string, format?: string) => {
      try {
        const recipe = await recipeEngine.importFromSource(source, format);
        return { success: true, data: recipe };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  // ── Sandbox IPC ───────────────────────────────────────────────────────────

  ipcMain.handle("sandbox:status", async () => {
    try {
      return { success: true, data: sandboxManager.getStatus() };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(
    "sandbox:start",
    async (_event, config?: Record<string, unknown>) => {
      try {
        await sandboxManager.start(config);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle("sandbox:stop", async () => {
    try {
      await sandboxManager.stop();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(
    "sandbox:execute",
    async (_event, command: string, options?: Record<string, unknown>) => {
      try {
        const result = await sandboxManager.execute(command, options);
        return { success: true, data: result };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  // ── Hooks IPC ─────────────────────────────────────────────────────────────

  ipcMain.handle("hooks:list", async () => {
    try {
      return { success: true, data: hookManager.list() };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(
    "hooks:add",
    async (_event, hookConfig: Record<string, unknown>) => {
      try {
        const hook = await (hookManager as any).add(hookConfig);
        return { success: true, data: hook };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle("hooks:remove", async (_event, hookId: string) => {
    try {
      await hookManager.remove(hookId);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(
    "hooks:trigger",
    async (_event, hookType: string, context: Record<string, unknown>) => {
      try {
        const results = await hookManager.trigger(hookType as HookType, context);
        return { success: true, data: results };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  // ── ACP IPC ───────────────────────────────────────────────────────────────

  ipcMain.handle(
    "acp:connect",
    async (_event, serverUrl: string, options?: Record<string, unknown>) => {
      try {
        await acpClient.connect(serverUrl, options);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle("acp:disconnect", async () => {
    try {
      await acpClient.disconnect();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("acp:status", async () => {
    try {
      return { success: true, data: acpClient.getStatus() };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ── Chat IPC ──────────────────────────────────────────────────────────────

  ipcMain.handle(
    "chat:send",
    async (
      _event,
      sessionId: string,
      message: string,
      options?: Record<string, unknown>
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

        // Get the provider and send the message
        const providerId = session.providerId || appConfig.defaultProviderId;
        const model = session.model || appConfig.defaultModel;

        const response = await (providerManager as any).send(
          providerId,
          model,
          session.messages,
          message,
          {
            sessionId,
            extensions: session.extensions,
            sandboxManager,
            traceCollector,
          }
        );

        // Save the response to the session
        await sessionManager.addMessage(sessionId, {
          role: "user",
          content: message,
        });
        await sessionManager.addMessage(sessionId, {
          role: "assistant",
          content: response.content,
        });

        // Trace the assistant response
        await traceCollector.addEntry(sessionId, {
          type: "info",
          content: `Assistant: ${response.content.substring(0, 200)}...`,
          metadata: { source: "assistant", model },
        });

        // Run post-session hooks
        await hookManager.trigger("PostSession", {
          sessionId,
          response: response.content,
        });

        return { success: true, data: response };
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
      options?: Record<string, unknown>
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
        const providerId = session.providerId || appConfig.defaultProviderId;
        const model = session.model || appConfig.defaultModel;

        // Create a streaming response
        const stream = await (providerManager as any).stream(
          providerId,
          model,
          session.messages,
          message,
          {
            sessionId,
            extensions: session.extensions,
            sandboxManager,
            traceCollector,
          }
        );

        // Set up stream event forwarding to the renderer
        stream.on("data", (chunk: string) => {
          mainWindow?.webContents.send("chat:stream-chunk", {
            sessionId,
            chunk,
          });
        });

        stream.on("tool_call", (toolCall: Record<string, unknown>) => {
          mainWindow?.webContents.send("chat:stream-tool-call", {
            sessionId,
            toolCall,
          });
        });

        stream.on("tool_result", (toolResult: Record<string, unknown>) => {
          mainWindow?.webContents.send("chat:stream-tool-result", {
            sessionId,
            toolResult,
          });
        });

        stream.on("thinking", (thinking: string) => {
          mainWindow?.webContents.send("chat:stream-thinking", {
            sessionId,
            thinking,
          });
        });

        stream.on("error", (error: Error) => {
          mainWindow?.webContents.send("chat:stream-error", {
            sessionId,
            error: error.message,
          });
        });

        stream.on("end", async (fullResponse: string) => {
          // Save messages
          await sessionManager.addMessage(sessionId, {
            role: "user",
            content: message,
          });
          await sessionManager.addMessage(sessionId, {
            role: "assistant",
            content: fullResponse,
          });

          mainWindow?.webContents.send("chat:stream-end", {
            sessionId,
            content: fullResponse,
          });
        });

        return { success: true, data: { streaming: true } };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle("chat:cancel", async (_event, sessionId: string) => {
    try {
      // Cancel any ongoing streaming for this session
      await (providerManager as any).cancelStream(sessionId);
      mainWindow?.webContents.send("chat:stream-cancelled", { sessionId });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ── File IPC ──────────────────────────────────────────────────────────────

  ipcMain.handle("file:drop", async (_event, filePaths: string[]) => {
    try {
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
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(
    "file:open",
    async (_event, filePath: string, options?: Record<string, unknown>) => {
      try {
        const result = await shell.openPath(filePath);
        if (result) {
          return { success: false, error: result };
        }
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  // Handle file open from OS (e.g., double-click a file)
  ipcMain.handle("file:read-in-sandbox", async (_event, sandboxPath: string) => {
    try {
      const content = await sandboxManager.getFile(sandboxPath);
      return {
        success: true,
        data: { content: content.toString("base64"), path: sandboxPath },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(
    "file:write-in-sandbox",
    async (_event, sandboxPath: string, contentBase64: string) => {
      try {
        const content = Buffer.from(contentBase64, "base64");
        await sandboxManager.putFile(sandboxPath, content);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  // ── Trace IPC ─────────────────────────────────────────────────────────────

  ipcMain.handle("trace:start", async (_event, sessionId: string) => {
    try {
      await traceCollector.startSession(sessionId);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("trace:stop", async (_event, sessionId: string) => {
    try {
      await traceCollector.stopSession(sessionId);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(
    "trace:get",
    async (
      _event,
      sessionId: string,
      options?: { type?: TraceEntryType; limit?: number; offset?: number }
    ) => {
      try {
        const traces = await traceCollector.getTraces(sessionId, options);
        return { success: true, data: traces };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  // ── OpenCode IPC ──────────────────────────────────────────────────────────

  ipcMain.handle("opencode:init", async () => {
    try {
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
        extensions: (await (extensionRegistry as any).list())
          .filter((e: any) => e.enabled)
          .map((e: any) => e.id),
      };

      const configPath = path.join(opencodeDir, "config.json");
      fs.writeFileSync(configPath, JSON.stringify(opencodeConfig, null, 2));

      return { success: true, data: opencodeConfig };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("opencode:status", async () => {
    try {
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
          activeExtensions: (await (extensionRegistry as any).list()).filter(
            (e: any) => e.enabled
          ).length,
          totalExtensions: (await (extensionRegistry as any).list()).length,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

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

// ─── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanupBeforeQuit(): Promise<void> {
  try {
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
  } catch (err) {
    console.error("[Main] Error during cleanup:", err);
  }
}

// ─── Single Instance Lock ─────────────────────────────────────────────────────

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  // ─── App Lifecycle ──────────────────────────────────────────────────────────

  app.on("ready", async () => {
    console.log(`[Main] ${APP_NAME} v${app.getVersion()} starting...`);

    // Load config
    appConfig = loadConfig();

    // Create the main window
    createMainWindow();

    // Initialize all subsystems
    await initializeSubsystems();

    // Register all IPC handlers
    registerIpcHandlers();

    // Set up subsystem event forwarding
    setupSubsystemEventForwarding();

    // Create system tray
    createTray();

    // Set up deep links
    setupDeepLinks();

    // Set up auto-updater
    setupAutoUpdater();

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

    console.log("[Main] Application ready");
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
    await cleanupBeforeQuit();
  });

  app.on("will-quit", () => {
    // Final cleanup
    if (tray) {
      tray.destroy();
    }
  });

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    console.error("[Main] Uncaught exception:", error);
    mainWindow?.webContents.send("app:error", {
      message: error.message,
      stack: error.stack,
    });
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[Main] Unhandled rejection:", reason);
    mainWindow?.webContents.send("app:error", {
      message: String(reason),
    });
  });
}
