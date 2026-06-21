/**
 * OpenAgent-Desktop Aether - Settings Validator
 * 
 * Validates all settings with constraints and descriptions.
 * Every setting has a clear purpose, a sensible default, and validation.
 */

export interface SettingConstraint {
  type: 'string' | 'number' | 'boolean';
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  enum?: string[];
  description: string;
  default: unknown;
  category: string;
  since?: string;
}

export const SETTINGS_SCHEMA: Record<string, SettingConstraint> = {
  // ─── General ──────────────────────────────────────────────────
  theme: {
    type: 'string', required: true, enum: ['light', 'dark', 'system'],
    description: 'Application color theme', default: 'system', category: 'General', since: '1.0.0',
  },
  language: {
    type: 'string', required: true, enum: ['en', 'zh', 'ja', 'ko'],
    description: 'Display language for the UI', default: 'en', category: 'General', since: '2.0.0',
  },
  autoUpdate: {
    type: 'boolean', required: true,
    description: 'Automatically check for and install updates', default: true, category: 'General', since: '1.0.0',
  },
  minimizeToTray: {
    type: 'boolean', required: true,
    description: 'Keep running in system tray when closed', default: true, category: 'General', since: '1.0.0',
  },
  startupBehavior: {
    type: 'string', required: true, enum: ['show', 'hidden', 'tray'],
    description: 'How the app starts: show window, start hidden, or start in tray', default: 'show', category: 'General', since: '2.0.0',
  },

  // ─── Provider / Model ─────────────────────────────────────────
  defaultModel: {
    type: 'string', required: true,
    description: 'Default model for new sessions (provider/model format)', default: 'anthropic/claude-sonnet-4', category: 'Provider', since: '2.0.0',
  },
  opencodePort: {
    type: 'number', required: true, min: 0, max: 65535,
    description: 'Port for OpenCode server (0 = auto-assign)', default: 0, category: 'Provider', since: '2.0.0',
  },
  opencodeHostname: {
    type: 'string', required: true,
    description: 'Hostname for OpenCode server', default: '127.0.0.1', category: 'Provider', since: '2.0.0',
  },
  opencodeAutoStart: {
    type: 'boolean', required: true,
    description: 'Start OpenCode server automatically on app launch', default: true, category: 'Provider', since: '2.0.0',
  },
  catalogSource: {
    type: 'string', required: true, enum: ['models.dev', 'pi.dev', 'merged'],
    description: 'Model catalog source: models.dev (live), pi.dev (static, bundled), or merged (both)', default: 'models.dev', category: 'Provider', since: '8.1.0',
  },

  // ─── Session ──────────────────────────────────────────────────
  maxConcurrentSessions: {
    type: 'number', required: true, min: 1, max: 20,
    description: 'Maximum number of simultaneous sessions', default: 5, category: 'Session', since: '1.0.0',
  },
  autoSave: {
    type: 'boolean', required: true,
    description: 'Automatically save session messages', default: true, category: 'Session', since: '2.0.0',
  },
  sessionTimeoutMinutes: {
    type: 'number', required: true, min: 0, max: 1440,
    description: 'Minutes of inactivity before session times out (0 = never)', default: 0, category: 'Session', since: '2.0.0',
  },

  // ─── Security ─────────────────────────────────────────────────
  permissionMode: {
    type: 'string', required: true, enum: ['auto', 'approve', 'smart_approve', 'chat'],
    description: 'How tool permissions are handled: auto-approve, always ask, smart approval, or chat-only', default: 'smart_approve', category: 'Security', since: '1.0.0',
  },
  sandboxMode: {
    type: 'string', required: true, enum: ['path', 'vm'],
    description: 'Sandbox isolation level: path-based restrictions or full VM isolation', default: 'path', category: 'Security', since: '2.0.0',
  },
  debugMode: {
    type: 'boolean', required: true,
    description: 'Enable verbose debug logging for troubleshooting', default: false, category: 'Security', since: '2.0.0',
  },

  // ─── Skills ───────────────────────────────────────────────────
  skillsPath: {
    type: 'string', required: true,
    description: 'Directory path for custom skills', default: '~/.claude/skills', category: 'Skills', since: '2.0.0',
  },
  enableBuiltinSkills: {
    type: 'boolean', required: true,
    description: 'Enable built-in document generation skills (PPTX/DOCX/XLSX/PDF)', default: true, category: 'Skills', since: '2.0.0',
  },

  // ─── Advanced ─────────────────────────────────────────────────
  logLevel: {
    type: 'string', required: true, enum: ['debug', 'info', 'warn', 'error'],
    description: 'Minimum log level to record', default: 'info', category: 'Advanced', since: '2.0.0',
  },
  traceEnabled: {
    type: 'boolean', required: true,
    description: 'Record execution traces for debugging (may impact performance)', default: false, category: 'Advanced', since: '1.0.0',
  },
  crashLogRetention: {
    type: 'number', required: true, min: 0, max: 100,
    description: 'Number of crash logs to keep', default: 5, category: 'Advanced', since: '2.0.0',
  },
  developerMode: {
    type: 'boolean', required: true,
    description: 'Enable developer tools and experimental features', default: false, category: 'Advanced', since: '2.0.0',
  },
};

export function validateSetting(key: string, value: unknown): { valid: boolean; error?: string } {
  const constraint = SETTINGS_SCHEMA[key];
  if (!constraint) return { valid: false, error: `Unknown setting: ${key}` };

  // Type check
  if (typeof value !== constraint.type) {
    return { valid: false, error: `Expected ${constraint.type}, got ${typeof value}` };
  }

  // Enum check
  if (constraint.enum && !constraint.enum.includes(value as string)) {
    return { valid: false, error: `Must be one of: ${constraint.enum.join(', ')}` };
  }

  // Range check (numbers)
  if (constraint.type === 'number') {
    if (constraint.min !== undefined && (value as number) < constraint.min) {
      return { valid: false, error: `Must be at least ${constraint.min}` };
    }
    if (constraint.max !== undefined && (value as number) > constraint.max) {
      return { valid: false, error: `Must be at most ${constraint.max}` };
    }
  }

  // Pattern check (strings)
  if (constraint.pattern && typeof value === 'string') {
    const regex = new RegExp(constraint.pattern);
    if (!regex.test(value)) {
      return { valid: false, error: `Must match pattern: ${constraint.pattern}` };
    }
  }

  return { valid: true };
}

export function validateAllSettings(settings: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings)) {
    const result = validateSetting(key, value);
    if (!result.valid && result.error) {
      errors[key] = result.error;
    }
  }
  return errors;
}

export function getSettingDefaults(): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const [key, constraint] of Object.entries(SETTINGS_SCHEMA)) {
    defaults[key] = constraint.default;
  }
  return defaults;
}

export function getSettingsByCategory(category: string): Record<string, SettingConstraint> {
  const result: Record<string, SettingConstraint> = {};
  for (const [key, constraint] of Object.entries(SETTINGS_SCHEMA)) {
    if (constraint.category === category) {
      result[key] = constraint;
    }
  }
  return result;
}

export function getAllCategories(): string[] {
  const categories = new Set<string>();
  for (const constraint of Object.values(SETTINGS_SCHEMA)) {
    categories.add(constraint.category);
  }
  return Array.from(categories);
}
