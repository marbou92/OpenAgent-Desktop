/**
 * OpenAgent-Desktop - Electron Main Process Entry Point
 *
 * This is the main process for the OpenAgent-Desktop application.
 * It manages the BrowserWindow, IPC handlers, system tray, auto-updater,
 * deep links, and coordinates all subsystems.
 */

// ─── fetch globals polyfill (MUST be the first import) ───────────────────────
// On Windows 7 / Electron 22 / Node 16, `globalThis.fetch` does not exist.
// Both the Vercel AI SDK AND our hand-rolled protocol adapters call fetch()
// directly, so we polyfill it from undici BEFORE any other module loads.
// On Node 18+ (Electron 28+) this is a no-op (native fetch detected).
//
// Ref: Phase 2.3 — fixes "fetch is not defined" when chatting with any provider.
import './polyfills/fetch-globals';

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
import { AuthStore } from './providers/auth-store-v2';
import { ProviderClient, setSidecarEndpoint } from './providers/provider-client';
import { ChatEngine } from './providers/chat-engine';
import { calculateCost, formatCost } from './providers/cost-calculator';
import { getEmbeddingsStore } from './providers/embeddings-store';
import { OpencodeConfig } from './providers/opencode-config';
import { getModelsDevClient } from './providers/models-dev-client';
import { getOpencodeRegistry } from './providers/opencode-registry';
import { GithubCopilotAuth } from './providers/github-copilot-auth';
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

// ─── Phase 11.8: Tool Filtering by Mode ──────────────────────────────────────
//
// Filters the tools map based on the agent's mode + permissions. Tools that
// are 'deny' by default are NOT passed to the model — the model can't even
// try to call them. This enforces Plan mode (read-only) and Chat mode (no
// tools) at the model level, not just at the execution level.

function filterToolsByMode(
  allTools: Record<string, any>,
  mode: string,
  permissions: Record<string, string>
): Record<string, any> {
  // Chat mode: no tools at all.
  if (mode === 'chat') {
    return {};
  }

  // For Plan mode: only allow tools that are explicitly 'allow' or 'ask'
  // (not 'deny'). This removes write/edit/bash (except read-only bash commands
  // which are 'allow' in DEFAULT_PLAN_PERMISSIONS).
  // For Build mode: all tools pass through (the '*' rule is 'allow').
  // For Smart mode: all tools pass through (the '*' rule is 'ask', so the
  //   permission dialog handles it).
  const filtered: Record<string, any> = {};

  for (const [name, tool] of Object.entries(allTools)) {
    // Check the permission level for this tool.
    const level = evaluatePermissionLevel(name, permissions);

    if (level === 'deny') {
      // Skip denied tools — don't even tell the model about them.
      continue;
    }

    // For Plan mode, additionally filter out tools that could modify state
    // even if they're 'ask' (edit, write, bash without read-only commands).
    // The user shouldn't see permission dialogs in Plan mode — they should
    // just not have those tools available.
    if (mode === 'plan') {
      // In plan mode, only allow tools that are explicitly 'allow'.
      // 'ask' tools are excluded — plan mode is read-only, no prompts.
      if (level !== 'allow') {
        continue;
      }
    }

    filtered[name] = tool;
  }

  return filtered;
}

/**
 * Evaluate the permission level for a tool name against the permissions map.
 * Uses last-match-wins semantics (like the PermissionEvaluator).
 */
function evaluatePermissionLevel(toolName: string, permissions: Record<string, string>): string {
  let result = 'ask'; // Default

  for (const [pattern, level] of Object.entries(permissions)) {
    if (pattern === '*') {
      result = level;
      continue;
    }
    // Check if the pattern matches the tool name.
    // Simple matching: exact match, or prefix match (e.g., "bash" matches "bash").
    if (pattern === toolName || toolName.startsWith(pattern.split(':')[0])) {
      // More specific patterns override less specific ones.
      // Only override if the pattern is more specific than just the tool name.
      if (pattern.includes(':') || pattern === toolName) {
        result = level;
      } else if (!result || result === 'ask') {
        result = level;
      }
    }
  }

  return result;
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

// ─── Provider opencode Globals ───────────────────────────────────────────────
let authStore: AuthStore;
let providerClient: ProviderClient;
let chatEngine: ChatEngine;
let opencodeConfig: OpencodeConfig;
let modelsDevClient: ReturnType<typeof getModelsDevClient>;
let catalogReady = false; // Phase 4.4: set to true when the catalog refresh completes
let copilotAuth: GithubCopilotAuth;

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
    defaultProviderId: "",
    defaultModel: "",
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
        // OAuth callback — no longer used (the old OAuthHandler was removed in
        // favor of the GitHub Copilot device flow which doesn't use redirects).
        console.warn("[Main] oauth/callback deep link received but OAuth redirect handler is no longer active");
        break;
      }
      case "azure-ad/callback": {
        // Azure AD callback — removed (Azure now uses api key auth).
        console.warn("[Main] azure-ad/callback deep link received but Azure AD handler is no longer active");
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
    // Silently swallow auto-updater errors — "No published versions on GitHub"
    // is expected when no releases exist yet. Don't crash the app.
    console.warn("[Main] Auto-updater error (non-fatal):", err.message);
  });

  // Check for updates periodically — wrapped in try/catch so "No published
  // versions on GitHub" doesn't crash the app.
  if (appConfig.autoUpdate) {
    const safeCheck = () => {
      try {
        autoUpdater.checkForUpdates().catch(() => {
          // Silently ignore — no releases yet is not a crash-worthy error.
        });
      } catch {
        // ignore
      }
    };
    safeCheck();
    setInterval(safeCheck, 60 * 60 * 1000); // Every hour
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

  // ─── Provider opencode initialization ──────────────────────────────────────
  // The opencode-compatible provider system: auth-store-v2 (opencode auth.json format)
  // + opencode-registry (11 well-known providers) + models-dev-client (dynamic catalog)
  // + opencode-config (opencode.json config file) + protocol adapters + github-copilot auth.
  authStore = new AuthStore();
  authStore.load();
  authStore.on('error', (err: unknown) => logger.error('AuthStore', 'Error', err));
  authStore.on('provider-changed', (providerId: string) => {
    mainWindow?.webContents.send('provider:changed', { providerId });
  });
  authStore.on('provider-removed', (providerId: string) => {
    mainWindow?.webContents.send('provider:removed', { providerId });
  });

  opencodeConfig = new OpencodeConfig();
  opencodeConfig.load();
  opencodeConfig.on('error', (err: unknown) => logger.error('OpencodeConfig', 'Error', err));

  modelsDevClient = getModelsDevClient();
  modelsDevClient.loadCache();

  // Phase 4.3: Send catalog progress events to the renderer so the splash
  // screen can show a progress bar. The refresh is still non-blocking —
  // the app works with cached/embedded data while the refresh runs.
  function sendCatalogProgress(percent: number, message: string) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('main:catalog-progress', { percent, message });
    }
  }
  function sendCatalogReady() {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('main:catalog-ready', {
        providerCount: modelsDevClient.getCachedProviderIds().length,
        modelCount: modelsDevClient.getTotalModelCount(),
      });
    }
  }

  sendCatalogProgress(5, 'Fetching model catalog…');
  modelsDevClient.refresh().then(() => {
    logger.info('ModelsDev', `Catalog refreshed — ${modelsDevClient.getTotalModelCount()} models across ${modelsDevClient.getCachedProviderIds().length} providers`);
    sendCatalogProgress(100, `Loaded ${modelsDevClient.getTotalModelCount()} models`);
    catalogReady = true;
    sendCatalogReady();
  }).catch((err: unknown) => {
    logger.warn('ModelsDev', 'Failed to refresh catalog (using cached/hardcoded fallback)', err);
    sendCatalogProgress(100, 'Using cached catalog');
    catalogReady = true;
    sendCatalogReady();
  });

  // Forward catalog-updated events to the renderer so the UI can refresh.
  modelsDevClient.on('catalog-updated', (info: { providerCount: number; modelCount: number; previousModelCount: number }) => {
    logger.info('ModelsDev', `Catalog updated — ${info.modelCount} models (was ${info.previousModelCount})`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('provider:catalog-updated', info);
    }
  });

  // Start the background checker — checks both models.json ETag and GitHub
  // commits SHA. When the GitHub repo changes, re-fetches .toml model files
  // for configured providers only.
  modelsDevClient.startBackgroundChecker(() => {
    return authStore.list().map((entry: { providerId: string; auth: any }) => entry.providerId);
  });

  providerClient = new ProviderClient(authStore, opencodeConfig);
  providerClient.on('sidecar-fallback', (info: unknown) => {
    logger.info('ProviderClient', 'Sidecar unavailable, using in-process path', info);
  });

  // Initialize the AI SDK chat engine — replaces AgentRunner.
  chatEngine = new ChatEngine(authStore, opencodeConfig);

  // If the OpenCode sidecar is running, route provider calls through it.
  const sidecarInstanceForV3 = providerManager.getSidecarInstance();
  if (sidecarInstanceForV3) {
    setSidecarEndpoint(sidecarInstanceForV3.url, sidecarInstanceForV3.password);
    logger.info('ProviderClient', 'OpenCode sidecar detected — using sidecar path for supported providers');
  } else {
    logger.info('ProviderClient', 'No OpenCode sidecar — using in-process provider path');
  }

  copilotAuth = new GithubCopilotAuth(authStore);
  copilotAuth.on('completed', ({ providerId }: { providerId: string }) => {
    mainWindow?.webContents.send('provider:copilot-completed', { providerId });
  });
  copilotAuth.on('error', (info: unknown) => {
    mainWindow?.webContents.send('provider:copilot-error', info);
  });

  logger.info('ProviderClient', `Provider system initialized — ${authStore.list().length} providers configured`);

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

    // Phase 1: Removed the old permission-overrides.json disk loading.
    // "Always" rules are now session-scoped with 30-min expiry (in-memory
    // only), so they don't need to survive app restarts. Each new session
    // starts fresh.

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

  // ── Provider opencode IPC ──────────────────────────────────────────────────
  // The opencode-compatible provider system. The renderer's ProvidersView calls
  // these via window.openagent.providers.* (see preload.ts).

  // Catalog
  ipcMain.handle("provider:list-providers", wrapIPC(async () => {
    // Null-guard: subsystems may not be initialized yet (handlers are
    // registered before initializeSubsystems completes). Return the hardcoded
    // builtin list as a fallback so the UI doesn't hang.
    if (!modelsDevClient) {
      return { success: true, data: getOpencodeRegistry().listAll() };
    }
    return { success: true, data: modelsDevClient.getMergedProviders() };
  }));

  ipcMain.handle("provider:list-auth", wrapIPC(async () => {
    if (!authStore) return { success: true, data: [] };
    return { success: true, data: authStore.list() };
  }));

  ipcMain.handle("provider:list-models", wrapIPC(async (_event, providerId: string) => {
    if (!providerClient) return { success: true, data: [] };
    return { success: true, data: providerClient.listAvailableModels(providerId) };
  }));

  ipcMain.handle("provider:refresh-catalog", wrapIPC(async () => {
    if (!modelsDevClient) return { success: false, error: 'Catalog not initialized yet' };
    await modelsDevClient.refresh();
    return { success: true, data: { providerCount: modelsDevClient.getCachedProviderIds().length, modelCount: modelsDevClient.getTotalModelCount() } };
  }));

  ipcMain.handle("provider:get-catalog-info", wrapIPC(async () => {
    if (!modelsDevClient) return { success: true, data: { fetchedAt: null, providerCount: 0, modelCount: 0 } };
    return { success: true, data: { fetchedAt: modelsDevClient.getFetchedAt(), providerCount: modelsDevClient.getCachedProviderIds().length, modelCount: modelsDevClient.getTotalModelCount() } };
  }));

  // Phase 4.4: Let the renderer check if the catalog is already ready.
  // Used by the splash screen as a fallback in case the main:catalog-ready
  // IPC event was missed (fired before the preload registered its listener).
  ipcMain.handle("catalog:is-ready", wrapIPC(async () => {
    return { success: true, data: { ready: catalogReady } };
  }));

  // Auth
  ipcMain.handle("provider:set-api-key", wrapIPC(async (_event, providerId: string, apiKey: string) => {
    if (!authStore) return { success: false, error: 'Auth store not initialized' };
    authStore.set(providerId, { type: 'api', key: apiKey });
    return { success: true };
  }));

  ipcMain.handle("provider:remove-auth", wrapIPC(async (_event, providerId: string) => {
    if (!authStore) return { success: false, error: 'Auth store not initialized' };
    authStore.remove(providerId);
    return { success: true };
  }));

  // Config
  ipcMain.handle("provider:set-base-url", wrapIPC(async (_event, providerId: string, baseUrl: string) => {
    if (!opencodeConfig) return { success: false, error: 'Config not initialized' };
    opencodeConfig.setProviderOptions(providerId, { options: { ...opencodeConfig.getProvider(providerId)?.options, baseURL: baseUrl || undefined } });
    return { success: true };
  }));

  // Custom providers
  ipcMain.handle("provider:get-presets", wrapIPC(async () => {
    return { success: true, data: getOpencodeRegistry().getPresets() };
  }));

  ipcMain.handle("provider:add-custom", wrapIPC(async (_event, def: any) => {
    if (!opencodeConfig) return { success: false, error: 'Config not initialized' };
    opencodeConfig.addCustomProvider(def);
    return { success: true };
  }));

  ipcMain.handle("provider:remove-custom", wrapIPC(async (_event, providerId: string) => {
    if (!opencodeConfig) return { success: false, error: 'Config not initialized' };
    opencodeConfig.removeProvider(providerId);
    getOpencodeRegistry().unregisterCustom(providerId);
    return { success: true };
  }));

  // GitHub Copilot device flow
  ipcMain.handle("provider:start-copilot", wrapIPC(async () => {
    if (!copilotAuth) return { success: false, error: 'Copilot auth not initialized' };
    const result = await copilotAuth.startDeviceFlow();
    return { success: true, data: result };
  }));

  ipcMain.handle("provider:cancel-copilot", wrapIPC(async () => {
    if (!copilotAuth) return { success: true };
    copilotAuth.cancel();
    return { success: true };
  }));

  // Health check
  ipcMain.handle("provider:run-health-check", wrapIPC(async (_event, providerId: string) => {
    if (!providerClient) return { success: false, error: 'Provider client not initialized' };
    const def = opencodeConfig?.getProvider(providerId) || getOpencodeRegistry().get(providerId);
    if (!def) return { success: false, error: `Unknown provider: ${providerId}` };
    const startTime = Date.now();
    try {
      const models = providerClient.listAvailableModels(providerId);
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

  // Chat (used by recipe executor + agent runner)
  ipcMain.handle("provider:chat", wrapIPC(async (_event, request: any) => {
    if (!providerClient) return { success: false, error: 'Provider client not initialized' };
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

  // Update session fields (providerId, model, name, etc.) without
  // overwriting the entire session. Used by ChatView's provider/model
  // dropdowns to save the user's selection.
  ipcMain.handle(
    "session:update",
    wrapIPC(async (_event, sessionId: string, updates: Record<string, unknown>) => {
      const session = await sessionManager.load(sessionId);
      const updated = { ...session, ...updates };
      await sessionManager.save(sessionId, updated);
      return { success: true, data: updated };
    })
  );

  ipcMain.handle("session:delete", wrapIPC(async (_event, sessionId: string) => {
    await sessionManager.delete(sessionId);
    // Phase 1: Clean up session-scoped permission rules when the session
    // is deleted so memory doesn't leak.
    sessionPermissionRules.delete(sessionId);
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
    // Phase 4.4: handle gracefully if hookManager isn't initialized yet.
    // The renderer re-fetches on main:ready, so returning an empty list
    // prevents the "Failed to load hooks" error on startup.
    if (!hookManager) {
      return { success: true, data: [] };
    }
    return { success: true, data: hookManager.list() };
  }));

  ipcMain.handle(
    "hooks:add",
    wrapIPC(async (_event, hookConfig: Record<string, unknown>) => {
      if (!hookManager) return { success: false, error: 'Hooks not initialized yet' };
      const hook = await hookManager.add(hookConfig as any);
      return { success: true, data: hook };
    })
  );

  ipcMain.handle("hooks:remove", wrapIPC(async (_event, hookId: string) => {
    if (!hookManager) return { success: false, error: 'Hooks not initialized yet' };
    await hookManager.remove(hookId);
    return { success: true };
  }));

  ipcMain.handle(
    "hooks:trigger",
    wrapIPC(async (_event, hookType: string, context: Record<string, unknown>) => {
      if (!hookManager) return { success: true, data: [] };
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

  // Phase 0.2 / Phase 1: Store tool info alongside each pending permission
  // request. Now includes sessionId so "Always" rules can be scoped to the
  // session that created them.
  const pendingPermissionRequestInfo = new Map<string, { agentId: string; toolName: string; args: Record<string, unknown>; sessionId: string }>();

  // Phase 0.2: Pending AskUserQuestion requests.
  const pendingAskUserRequests = new Map<string, (answer: string | null) => void>();

  // Phase 1: Session-scoped permission rules with 30-minute expiry.
  //
  // "Always Allow" / "Always Deny" no longer means "forever, globally". It
  // means "for this session, for the next 30 minutes, don't ask again for
  // this tool pattern." After 30 minutes the rule expires and the dialog
  // re-appears. Rules are also scoped to the session that created them —
  // a rule created in session A does not affect session B.
  //
  // Structure: sessionId → (pattern → { level, expiresAt })
  const SESSION_RULE_TTL_MS = 30 * 60 * 1000; // 30 minutes
  const sessionPermissionRules = new Map<string, Map<string, { level: 'allow' | 'deny'; expiresAt: number }>>();

  function getSessionRules(sessionId: string): Map<string, { level: 'allow' | 'deny'; expiresAt: number }> {
    let rules = sessionPermissionRules.get(sessionId);
    if (!rules) {
      rules = new Map();
      sessionPermissionRules.set(sessionId, rules);
    }
    return rules;
  }

  /** Check session-scoped rules for a tool. Returns 'allow'/'deny' if a
   *  non-expired rule matches, or null if no rule matches. */
  function checkSessionRule(sessionId: string, toolName: string, args: Record<string, unknown>): 'allow' | 'deny' | null {
    const rules = sessionPermissionRules.get(sessionId);
    if (!rules || rules.size === 0) return null;

    // Build the tool identifier the same way the evaluator does
    let toolId = toolName;
    if (toolName === 'bash' && args.command) {
      toolId = `bash:${String(args.command).trim()}`;
    } else if ((toolName === 'edit' || toolName === 'write') && (args.path || args.file_path)) {
      toolId = `${toolName}:${args.path || args.file_path}`;
    } else if (toolName === 'read' && args.path) {
      toolId = `read:${args.path}`;
    }

    const now = Date.now();
    let result: 'allow' | 'deny' | null = null;

    for (const [pattern, rule] of rules) {
      // Expired rule — clean it up and skip
      if (now > rule.expiresAt) {
        rules.delete(pattern);
        continue;
      }
      // Check if the pattern matches
      if (pattern === toolName || pattern === toolId) {
        result = rule.level;
      } else if (pattern.includes('*')) {
        // Simple wildcard match
        const regex = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
        if (regex.test(toolId) || regex.test(toolName)) {
          result = rule.level;
        }
      } else if (!pattern.includes(':') && toolId.startsWith(pattern + ':')) {
        // Prefix match: "edit" matches "edit:/foo/bar.ts"
        result = rule.level;
      }
    }

    return result;
  }

  /** Build the pattern for an "always" rule. */
  function buildAlwaysPattern(toolName: string, args: Record<string, unknown>): string {
    if (toolName === 'bash' && args.command) {
      const cmd = String(args.command).trim().split(/\s+/)[0];
      return `bash:${cmd} *`;
    }
    return toolName;
  }

  // Phase 1: Track denied tool call IDs per agent run so the UI can show
  // a "Denied" state even if the sentinel object doesn't survive the AI
  // SDK's stream pipeline.
  const deniedToolCallIds = new Set<string>();

  ipcMain.handle("permission:respond", wrapIPC(async (_e, requestId: string, response: string) => {
    const resolve = pendingPermissionRequests.get(requestId);
    if (!resolve) {
      return { success: false, error: 'No pending permission request for this id' };
    }
    pendingPermissionRequests.delete(requestId);

    // Phase 1: Handle 'always_allow' and 'always_deny' by storing
    // session-scoped rules with a 30-minute expiry. No more global
    // permanent rules — the dialog will re-appear after 30 minutes.
    if (response === 'always_allow' || response === 'always_deny') {
      try {
        const pendingInfo = pendingPermissionRequestInfo.get(requestId);
        if (pendingInfo) {
          const { toolName, args, sessionId } = pendingInfo;
          const pattern = buildAlwaysPattern(toolName, args);
          const level = response === 'always_allow' ? 'allow' : 'deny';
          const rules = getSessionRules(sessionId);
          rules.set(pattern, { level, expiresAt: Date.now() + SESSION_RULE_TTL_MS });
          logger.info('Permissions', `Session rule (30min): ${pattern} → ${level} [session=${sessionId}]`);
        }
        pendingPermissionRequestInfo.delete(requestId);
      } catch (err) {
        logger.warn('Permissions', 'Failed to store session permission rule', err);
      }
    }

    // Map the renderer's response to a ToolPermissionLevel.
    const level: ToolPermissionLevel =
      response === 'allow_once' || response === 'always_allow' ? 'allow' :
      response === 'deny_once' || response === 'always_deny' ? 'deny' : 'ask';
    resolve(level);
    return { success: true };
  }));

  // Phase 0.2: AskUserQuestion response handler.
  ipcMain.handle("askUser:respond", wrapIPC(async (_e, requestId: string, answer: string | null) => {
    const resolve = pendingAskUserRequests.get(requestId);
    if (!resolve) {
      return { success: false, error: 'No pending ask-user request for this id' };
    }
    pendingAskUserRequests.delete(requestId);
    resolve(answer);
    return { success: true };
  }));

  /**
   * Run the agentic loop using the AI SDK's streamText() with tools + maxSteps.
   * The AI SDK handles:
   *   - Calling the LLM
   *   - Parsing tool calls from the response
   *   - Executing tool handlers (with permission checks built in)
   *   - Feeding tool results back to the LLM
   *   - Repeating until no more tool calls or maxSteps reached
   *   - Streaming text deltas in real-time
   *
   * We just forward the stream parts to the renderer via IPC events.
   */
  async function runAgent(opts: {
    sessionId: string;
    message: string;
    session: any;
    send: (channel: string, data: Record<string, unknown>) => void;
    signal?: AbortSignal;
    images?: string[]; // Phase 4: base64 data URLs for multi-modal
    thinkingEffort?: string; // Phase 4.2: thinking effort level
  }): Promise<{ content: string; steps: number; status: string }> {
    const { sessionId, message, session, send, images, thinkingEffort } = opts;

    // Resolve the agent for this session.
    const agentId = agentSessionBridge.getCurrentAgentId(sessionId);
    const agent = agentRegistry.get(agentId) || agentRegistry.getActive();
    if (!agent) throw new Error('No agent configured');

    // Resolve the provider+model for this session.
    const providerId = session.providerId;
    const modelId = session.model;
    if (!providerId || !modelId) {
      throw new Error('No provider or model selected. Please select a provider and model from the dropdowns above.');
    }

    // Build the tool definitions with permission checking.
    const toolDeps = {
      sandboxManager,
      workingDirectory: session.workingDirectory || process.cwd(),
      extensionRegistry,
      // Phase 1: Pass the denied tracker so execute() handlers can report
      // which tool call IDs were denied. This is used as a backup to the
      // sentinel object detection to ensure the UI shows "Denied".
      deniedToolCallIds,
    };

    // Permission checker — uses the agent's permission rules.
    // Phase 1: Now checks (1) the settings permissionMode override,
    // (2) session-scoped "always" rules (30-min expiry), (3) the agent's
    // permanent permission rules + policy engine.
    const permissionEvaluator = new (require('./permissions/evaluator').PermissionEvaluator)(agent.permissions);
    permissionEvaluator.setAgentMode(agent.mode);
    if (permissionPolicyEngine) {
      permissionEvaluator.setPolicyEngine(permissionPolicyEngine);
    }

    // Phase 1: Read the permission mode from settings. This is the global
    // override that takes precedence over everything else.
    //   auto         → allow everything (full autonomy, no dialogs)
    //   approve      → ask for everything (every tool call pops a dialog)
    //   smart_approve → normal evaluation (agent rules + policy engine)
    //   chat         → deny everything (no tools allowed, conversation only)
    const settingsPermissionMode = (appConfig as any)?.permissionMode || 'smart_approve';

    const permissionChecker = {
      checkPermission(toolName: string, args: Record<string, unknown>): 'allow' | 'ask' | 'deny' {
        // (1) Settings override — highest priority
        if (settingsPermissionMode === 'auto') return 'allow';
        if (settingsPermissionMode === 'approve') return 'ask';
        if (settingsPermissionMode === 'chat') return 'deny';

        // (2) Session-scoped "always" rules (30-min expiry)
        const sessionRule = checkSessionRule(sessionId, toolName, args);
        if (sessionRule !== null) return sessionRule;

        // (3) Agent's permanent permission rules + policy engine
        const freshEvaluator = new (require('./permissions/evaluator').PermissionEvaluator)(agent.permissions);
        freshEvaluator.setAgentMode(agent.mode);
        if (permissionPolicyEngine) {
          freshEvaluator.setPolicyEngine(permissionPolicyEngine);
        }
        return freshEvaluator.evaluate(toolName, args);
      },
      requestPermission(toolName: string, args: Record<string, unknown>): Promise<boolean> {
        return new Promise((resolve) => {
          const requestId = `perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          pendingPermissionRequests.set(requestId, (level: ToolPermissionLevel) => resolve(level === 'allow'));
          pendingPermissionRequestInfo.set(requestId, { agentId: agent.id, toolName, args, sessionId });
          send('chat:permission-request', { id: requestId, toolName, args });
        });
      },
      requestUserAnswer(toolName: string, args: Record<string, unknown>): Promise<string | null> {
        return new Promise((resolve) => {
          const requestId = `ask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          pendingAskUserRequests.set(requestId, (answer: string | null) => resolve(answer));
          send('chat:ask-user', { id: requestId, toolName, args });
        });
      },
    };

    // Build AI SDK tool definitions with execute() handlers.
    const allTools = chatEngine.buildTools(toolDeps, permissionChecker, executeToolCall);

    // Phase 0.2: REMOVED filterToolsByMode — it had a bug that removed bash+edit
    // in BUILD mode. Permission is handled at execution time via checkPermission().
    const tools = allTools;

    // Build the system prompt.
    const systemPrompt = agent.prompt
      ? `${agent.prompt}\n\nCurrent mode: ${agent.mode.toUpperCase()}\nWorking directory: ${toolDeps.workingDirectory}`
      : `You are an AI assistant in ${agent.mode.toUpperCase()} mode. Working directory: ${toolDeps.workingDirectory}`;

    // Phase 11.8: Add mode-specific restrictions to the system prompt.
    let modeRestriction = '';
    if (agent.mode === 'plan') {
      modeRestriction = '\n\nYou are in PLAN mode — you are READ-ONLY. You can only read files, search, and inspect. You MUST NOT write, edit, or run commands that modify anything. If the user asks you to make changes, explain what you WOULD do and suggest they switch to BUILD mode.';
    } else if (agent.mode === 'chat') {
      modeRestriction = '\n\nYou are in CHAT mode — no tools are available. Answer directly from the conversation context.';
    } else if (agent.mode === 'smart') {
      modeRestriction = '\n\nYou are in SMART APPROVE mode — read operations run automatically, but any write/edit/mutation requires explicit user approval.';
    }
    const fullSystemPrompt = systemPrompt + modeRestriction;

    // Build messages array from session history.
    // Phase 4: attach images to the latest user message for multi-modal.
    const messages = [
      ...(session.messages || []).map((m: any) => ({
        role: m.role,
        content: m.content || '',
        images: (m as any).images,
      })),
      { role: 'user' as const, content: message, images },
    ];

    // Run the AI SDK streamText() with tools + maxSteps.
    // This IS the agent loop — the SDK handles everything.
    let fullContent = '';
    let stepCount = 0;
    let status = 'completed';

    for await (const chunk of chatEngine.chatStream(
      {
        model: `${providerId}/${modelId}`,
        messages,
        systemPrompt: fullSystemPrompt,
        temperature: agent.temperature,
      },
      {
        signal: opts.signal,
        tools,
        maxSteps: agent.maxSteps || 50,
        thinkingEffort, // Phase 4.2: pass thinking effort
        // Phase 0.9: onToolCall/onToolResult are now ONLY used by the
        // direct agent loop (runDirectAgentLoop). The AI SDK streamText
        // path forwards tool calls/results via stream chunks instead
        // (see the switch below), which avoids the duplicate events +
        // shape mismatch bug that was causing stuck spinners.
        onToolCall: (tc: any) => {
          send('chat:stream-tool-call', { toolCall: tc });
        },
        onToolResult: (tr: any) => {
          // Phase 1.1: Same triple-layer denial detection as the stream
          // chunk handler above. The direct agent loop calls this callback
          // instead of yielding stream chunks, so we need the same logic here.
          const trId = tr?.id || tr?.toolCallId;
          const trContent = typeof tr?.content === 'string' ? tr.content :
                            typeof tr?.result === 'string' ? tr.result :
                            JSON.stringify(tr?.result || tr?.content || '');
          const hasDeniedMarker = trContent.includes('DENIED') || trContent.includes('Permission denied');
          const isDenied = (tr?.denied === true) ||
                           (trId && deniedToolCallIds.has(trId)) ||
                           hasDeniedMarker;
          if (isDenied) {
            send('chat:stream-tool-result', { toolResult: { ...tr, denied: true } });
          } else {
            send('chat:stream-tool-result', { toolResult: tr });
          }
          if (trId) deniedToolCallIds.delete(trId);
        },
      }
    )) {
      switch (chunk.type) {
        case 'content':
          if (chunk.content) {
            fullContent += chunk.content;
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
        case 'tool_result': {
          // Phase 1.1: Triple-layer denial detection.
          //
          // Layer 1: The `denied: true` flag set by chat-engine.ts's
          //   extractPermissionDenied() in the tool-result stream case.
          //   This works when the sentinel object survives the AI SDK
          //   pipeline intact.
          //
          // Layer 2: The deniedToolCallIds Set, populated by markDenied()
          //   in the execute() handlers. This works when the toolCallId
          //   is passed to execute() by the AI SDK.
          //
          // Layer 3 (NEW): Content-based detection. If the tool result
          //   content contains "DENIED" (the exact marker from our denial
          //   messages), mark it as denied. This is the most robust layer
          //   because it doesn't depend on any object structure or ID
          //   passing — it just checks the text content.
          const tr: any = chunk.toolResult;
          const trId = tr?.id || tr?.toolCallId;
          const trContent = typeof tr?.content === 'string' ? tr.content :
                            typeof tr?.result === 'string' ? tr.result :
                            JSON.stringify(tr?.result || tr?.content || '');
          const hasDeniedMarker = trContent.includes('DENIED') || trContent.includes('Permission denied');
          const isDenied = (tr?.denied === true) ||
                           (trId && deniedToolCallIds.has(trId)) ||
                           hasDeniedMarker;
          if (isDenied) {
            send('chat:stream-tool-result', { toolResult: { ...tr, denied: true } });
          } else {
            send('chat:stream-tool-result', { toolResult: tr });
          }
          stepCount++;
          if (trId) deniedToolCallIds.delete(trId);
          break;
        }
        case 'usage':
          // Token usage — could be forwarded to the renderer for display.
          break;
        case 'error':
          status = 'error';
          send('chat:stream-error', { error: chunk.error?.message || 'Unknown error' });
          break;
        case 'done':
          break;
      }
    }

    // Phase 2.7: if the model returned an empty response (no content, no
    // error), send a clear error so the user isn't left staring at a blank
    // bubble. This happens with some free models that return empty SSE
    // streams, or when the agent loop exhausts maxSteps with only tool
    // calls and no final text.
    if (!fullContent && status !== 'error') {
      const errMsg = `The model ${providerId}/${modelId} returned an empty response. This can happen with free models that have rate limits, or when the model only made tool calls without producing a final answer. Try sending the message again, or switch to a different model.`;
      send('chat:stream-error', { error: errMsg });
      return { content: '', steps: stepCount, status: 'error' };
    }

    return { content: fullContent, steps: stepCount, status };
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
          // Chat mode: direct LLM call via AI SDK, no agentic loop, no tools.
          const providerId = session.providerId;
          const model = session.model;
          if (!providerId || !model) {
            return { success: false, error: 'No provider or model selected. Please select a provider and model from the dropdowns above.' };
          }

          const response = await chatEngine.chat({
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
              // Phase 4: pass images from options to runAgent for multi-modal
              const images = (options?.images as string[]) || undefined;
              // Phase 4.2: pass thinking effort from options
              const thinkingEffort = (options?.thinkingEffort as string) || undefined;
              const agentResult = await runAgent({ sessionId, message, session, send, images, thinkingEffort });
              await sessionManager.addMessage(sessionId, { role: 'user', content: message });
              await sessionManager.addMessage(sessionId, { role: 'assistant', content: agentResult.content });
              send('chat:stream-end', { content: agentResult.content });
            } catch (err: any) {
              // Phase 2.5: surface a useful error message. err.message can
              // be a bare "terminated" / "fetch failed" / "Invalid URL" —
              // add provider+model context so the user knows what to fix.
              const providerId = session.providerId || 'unknown';
              const modelId = session.model || 'unknown';
              const errMsg = err?.message || String(err) || 'Unknown error';
              const actionable =
                errMsg === 'terminated' || errMsg.includes('terminated')
                  ? `Connection to ${providerId}/${modelId} was terminated. Check your API key, model name, and account quota.`
                  : errMsg === 'fetch failed' || errMsg.includes('fetch failed')
                  ? `Network error calling ${providerId}/${modelId}. Check your internet connection and the provider's API URL.`
                  : errMsg.includes('Invalid URL')
                  ? `Cannot reach ${providerId}/${modelId}: no API URL configured. Open Settings → Providers to set the base URL.`
                  : errMsg;
              send('chat:stream-error', { error: actionable });
            }
          })();
          return { success: true, data: { streaming: true } };
        }

        // ── Chat mode: direct streaming via chatEngine.chatStream() ─────────
        const providerId = session.providerId;
        const model = session.model;
        if (!providerId || !model) {
          return { success: false, error: 'No provider or model selected. Please select a provider and model from the dropdowns above.' };
        }

        // Run the generator in the background and forward chunks to the renderer.
        (async () => {
          try {
            let fullResponse = '';
            // Phase 4: pass images for multi-modal support
            const chatImages = (options?.images as string[]) || undefined;
            // Phase 4.2: pass thinking effort
            const chatThinkingEffort = (options?.thinkingEffort as string) || undefined;
            // Phase 0.5: Build a system prompt for chat mode too
            const chatSystemPrompt = `You are a helpful AI assistant inside the OpenAgent-Desktop application.\nCurrent date: ${new Date().toDateString()}`;
            for await (const chunk of chatEngine.chatStream({
              model: `${providerId}/${model}`,
              messages: [
                ...session.messages.map((m: any) => ({ role: m.role, content: m.content, images: (m as any).images })),
                { role: 'user' as const, content: message, images: chatImages },
              ],
              systemPrompt: chatSystemPrompt,
              thinkingEffort: chatThinkingEffort,
            }, {
              thinkingEffort: chatThinkingEffort,
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
            // Phase 2.7: stream ended without an explicit 'done' or 'error'.
            // If we got content, finalize normally. If not, send a clear
            // error so the user isn't left with a blank bubble.
            if (fullResponse) {
              await sessionManager.addMessage(sessionId, { role: 'user', content: message });
              await sessionManager.addMessage(sessionId, { role: 'assistant', content: fullResponse });
              send('chat:stream-end', { content: fullResponse });
            } else {
              send('chat:stream-error', {
                error: `The model ${session.providerId}/${session.model} returned an empty response. Try sending again or switch to a different model.`,
              });
            }
          } catch (err: any) {
            // Phase 2.5: same actionable-error handling as the agent path.
            const providerId = session.providerId || 'unknown';
            const modelId = session.model || 'unknown';
            const errMsg = err?.message || String(err) || 'Unknown error';
            const actionable =
              errMsg === 'terminated' || errMsg.includes('terminated')
                ? `Connection to ${providerId}/${modelId} was terminated. Check your API key, model name, and account quota.`
                : errMsg === 'fetch failed' || errMsg.includes('fetch failed')
                ? `Network error calling ${providerId}/${modelId}. Check your internet connection and the provider's API URL.`
                : errMsg.includes('Invalid URL')
                ? `Cannot reach ${providerId}/${modelId}: no API URL configured. Open Settings → Providers to set the base URL.`
                : errMsg;
            send('chat:stream-error', { error: actionable });
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

  // ── Phase 4: Structured Outputs (generateObject) ──────────────────────────

  ipcMain.handle("chat:generate-object", wrapIPC(async (_event, request: any) => {
    try {
      const result = await chatEngine.generateObject({
        model: request.model,
        messages: (request.messages || []).map((m: any) => ({ role: m.role, content: m.content })),
        schema: request.schema,
        systemPrompt: request.systemPrompt,
      });
      // Track token usage if available
      if (result.usage) {
        const cost = calculateCost(
          request.model.split('/')[0],
          request.model.split('/').slice(1).join('/'),
          result.usage
        );
        return {
          success: true,
          data: {
            object: result.object,
            usage: result.usage,
            cost: cost,
          },
        };
      }
      return { success: true, data: { object: result.object } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }));

  // ── Phase 4: Embeddings (generate + search) ───────────────────────────────

  ipcMain.handle("embeddings:generate", wrapIPC(async (_event, opts: any) => {
    try {
      const { sessionId, texts, model, metadata } = opts;
      if (!sessionId || !texts || !Array.isArray(texts) || !model) {
        return { success: false, error: 'Missing sessionId, texts, or model' };
      }

      // Generate embeddings via the chat engine
      const embeddings = await chatEngine.embedMany(model, texts);

      // Store them
      const store = getEmbeddingsStore();
      const crypto = require('crypto');
      const entries = texts.map((text: string, i: number) => ({
        id: crypto.randomUUID(),
        sessionId,
        text,
        embedding: embeddings[i],
        metadata: metadata?.[i] || {},
      }));
      store.addMany(entries);

      return {
        success: true,
        data: {
          count: entries.length,
          totalInSession: store.count(sessionId),
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }));

  ipcMain.handle("embeddings:search", wrapIPC(async (_event, opts: any) => {
    try {
      const { sessionId, query, model, topK } = opts;
      if (!sessionId || !query || !model) {
        return { success: false, error: 'Missing sessionId, query, or model' };
      }

      // Generate embedding for the query
      const queryEmbedding = await chatEngine.embed(model, query);

      // Search the store
      const store = getEmbeddingsStore();
      const results = store.search(sessionId, queryEmbedding, topK || 5);

      return {
        success: true,
        data: {
          results: results.map(r => ({
            text: r.entry.text,
            score: r.score,
            metadata: r.entry.metadata,
          })),
          totalInSession: store.count(sessionId),
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }));

  ipcMain.handle("embeddings:count", wrapIPC(async (_event, sessionId: string) => {
    const store = getEmbeddingsStore();
    return { success: true, data: { count: store.count(sessionId) } };
  }));

  // ── Phase 4: Cost Estimation ──────────────────────────────────────────────

  ipcMain.handle("cost:estimate", wrapIPC(async (_event, opts: any) => {
    try {
      const { providerId, modelId, usage } = opts;
      if (!providerId || !modelId || !usage) {
        return { success: false, error: 'Missing providerId, modelId, or usage' };
      }
      const cost = calculateCost(providerId, modelId, usage);
      return {
        success: true,
        data: {
          ...cost,
          formatted: {
            input: formatCost(cost.inputCost),
            output: formatCost(cost.outputCost),
            total: formatCost(cost.totalCost),
          },
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
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
      defaultProvider: appConfig.defaultProviderId || "",
      defaultModel: appConfig.defaultModel || "",
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

    // Migrate: clear hardcoded default provider/model if they're set to the
    // old defaults ("openai" / "gpt-4o"). These should be empty now — the user
    // selects from the dropdown in the chat view.
    if (appConfig.defaultProviderId === 'openai' || appConfig.defaultModel === 'gpt-4o') {
      appConfig.defaultProviderId = '';
      appConfig.defaultModel = '';
      saveConfig(appConfig);
      logger.info('Main', 'Cleared hardcoded default provider/model from config');
    }

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
