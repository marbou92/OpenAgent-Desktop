/**
 * OpenAgent-Desktop Aether - Settings Migration
 * 
 * Migrates from old AppConfig/AppSettings to the new unified schema.
 * Called once on first launch after upgrading to v2.0 (Aether).
 */

export interface AetherAppConfig {
  // General
  theme: 'light' | 'dark' | 'system';
  language: string;
  autoUpdate: boolean;
  minimizeToTray: boolean;
  startupBehavior: 'show' | 'hidden' | 'tray';

  // Provider / Model
  defaultModel: string;
  opencodePort: number;
  opencodeHostname: string;
  opencodeAutoStart: boolean;

  // Session
  maxConcurrentSessions: number;
  autoSave: boolean;
  sessionTimeoutMinutes: number;

  // Security
  permissionMode: string;
  sandboxMode: 'path' | 'vm';
  debugMode: boolean;

  // Skills
  skillsPath: string;
  enableBuiltinSkills: boolean;

  // Advanced
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  traceEnabled: boolean;
  crashLogRetention: number;
  developerMode: boolean;

  // Window (internal)
  windowBounds: { width: number; height: number; x?: number; y?: number };
}

/**
 * Migrate from old AppConfig (v1) to new AetherAppConfig (v2).
 */
export function migrateFromV1(oldConfig: Record<string, unknown>): AetherAppConfig {
  return {
    // General
    theme: (oldConfig.theme as any) || 'system',
    language: (oldConfig.language as string) || 'en',
    autoUpdate: oldConfig.autoUpdate as boolean ?? true,
    minimizeToTray: oldConfig.minimizeToTray as boolean ?? true,
    startupBehavior: 'show',

    // Provider / Model — map old providerId+model to new "provider/model" format
    defaultModel: migrateDefaultModel(oldConfig),
    opencodePort: 0,
    opencodeHostname: '127.0.0.1',
    opencodeAutoStart: oldConfig.autoStartSandbox as boolean ?? true,

    // Session
    maxConcurrentSessions: (oldConfig.maxConcurrentSessions as number) || 5,
    autoSave: (oldConfig.autoSave as boolean) ?? true,
    sessionTimeoutMinutes: 0,

    // Security
    permissionMode: (oldConfig.permissionMode as string) || 'smart_approve',
    sandboxMode: 'path',
    debugMode: (oldConfig.debugMode as boolean) ?? false,

    // Skills
    skillsPath: '~/.claude/skills',
    enableBuiltinSkills: true,

    // Advanced
    logLevel: (oldConfig.logLevel as any) || 'info',
    traceEnabled: (oldConfig.traceEnabled as boolean) ?? false,
    crashLogRetention: 5,
    developerMode: false,

    // Window (internal)
    windowBounds: (oldConfig.windowBounds as any) || { width: 1280, height: 800 },
  };
}

function migrateDefaultModel(oldConfig: Record<string, unknown>): string {
  const providerId = (oldConfig.defaultProviderId as string) || 'openai';
  const model = (oldConfig.defaultModel as string) || 'gpt-4o';

  const providerMap: Record<string, string> = {
    'openai': 'openai',
    'anthropic': 'anthropic',
    'openrouter': 'openrouter',
    'gemini': 'google',
    'azure_openai': 'azure',
    'gcp_vertex': 'google-vertex',
    'amazon_bedrock': 'bedrock',
    'groq': 'groq',
    'mistral': 'mistral',
    'ollama': 'ollama',
    'opencode': 'opencode',
    'github_copilot': 'github',
    'custom_openai': 'custom',
  };

  const provider = providerMap[providerId] || providerId;
  return `${provider}/${model}`;
}

/**
 * Check if a config object is from v1 (pre-Aether).
 */
export function isV1Config(config: Record<string, unknown>): boolean {
  // v1 config has defaultProviderId but NOT opencodePort
  return 'defaultProviderId' in config && !('opencodePort' in config);
}
