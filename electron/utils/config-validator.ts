/**
 * OpenAgent-Desktop - Configuration Validation Utilities
 *
 * Validates provider configs and app-level configs before they are persisted
 * or used. Returns structured results with errors (blocking) and warnings
 * (non-blocking) so callers can decide how to handle issues.
 *
 * Usage:
 *   import { validateProviderConfig, validateAppConfig } from './config-validator';
 *   const result = validateProviderConfig(someConfig);
 *   if (!result.valid) { ... handle errors ... }
 *   if (result.warnings.length > 0) { ... show warnings ... }
 */

// ─── Validation Result ────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ─── Provider Config Validation ───────────────────────────────────────────────

/**
 * Validate a provider configuration object.
 * Returns errors (must-fix) and warnings (advisory).
 */
export function validateProviderConfig(config: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config || typeof config !== 'object') {
    errors.push('Config must be an object');
    return { valid: false, errors, warnings };
  }

  // Required fields
  if (!config.type || typeof config.type !== 'string') {
    errors.push('Provider type is required and must be a string');
  } else {
    const validTypes = [
      'openai',
      'anthropic',
      'gemini',
      'groq',
      'mistral',
      'ollama',
      'openrouter',
      'azure-openai',
      'amazon-bedrock',
      'gcp-vertex',
      'github-copilot',
      'opencode',
    ];
    if (!validTypes.includes(config.type.toLowerCase())) {
      warnings.push(`Unknown provider type: "${config.type}". It may not be supported.`);
    }
  }

  if (!config.name || typeof config.name !== 'string') {
    errors.push('Provider name is required and must be a string');
  } else if (config.name.trim().length === 0) {
    errors.push('Provider name must not be empty');
  } else if (config.name.length > 100) {
    warnings.push('Provider name is very long; consider shortening it');
  }

  // Optional fields with type checks
  if (config.apiKey !== undefined && typeof config.apiKey !== 'string') {
    warnings.push('API key should be a string');
  }

  if (config.apiKey !== undefined && typeof config.apiKey === 'string' && config.apiKey.trim().length === 0) {
    warnings.push('API key is empty; the provider may not authenticate');
  }

  if (config.baseUrl !== undefined && typeof config.baseUrl !== 'string') {
    errors.push('Base URL must be a string if provided');
  } else if (config.baseUrl && typeof config.baseUrl === 'string') {
    try {
      new URL(config.baseUrl);
    } catch {
      errors.push('Base URL is not a valid URL');
    }
  }

  if (config.models !== undefined) {
    if (!Array.isArray(config.models)) {
      errors.push('Models must be an array if provided');
    } else {
      for (const model of config.models) {
        if (typeof model !== 'string') {
          errors.push('Each model must be a string');
          break;
        }
      }
    }
  }

  if (config.enabled !== undefined && typeof config.enabled !== 'boolean') {
    warnings.push('Enabled flag should be a boolean');
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── App Config Validation ────────────────────────────────────────────────────

/**
 * Validate the top-level application configuration.
 * Returns errors (must-fix) and warnings (advisory).
 */
export function validateAppConfig(config: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config || typeof config !== 'object') {
    errors.push('Config must be an object');
    return { valid: false, errors, warnings };
  }

  // Window bounds
  if (config.windowBounds !== undefined) {
    if (typeof config.windowBounds !== 'object' || config.windowBounds === null) {
      errors.push('windowBounds must be an object');
    } else {
      if (typeof config.windowBounds.width !== 'number' || config.windowBounds.width < 800) {
        warnings.push('Window width should be at least 800');
      }
      if (typeof config.windowBounds.height !== 'number' || config.windowBounds.height < 600) {
        warnings.push('Window height should be at least 600');
      }
    }
  }

  // Theme
  if (config.theme !== undefined) {
    const validThemes = ['light', 'dark', 'system'];
    if (!validThemes.includes(config.theme)) {
      errors.push(`Theme must be one of: ${validThemes.join(', ')}`);
    }
  }

  // Default provider and model
  if (config.defaultProviderId !== undefined && typeof config.defaultProviderId !== 'string') {
    errors.push('defaultProviderId must be a string');
  }

  if (config.defaultModel !== undefined && typeof config.defaultModel !== 'string') {
    errors.push('defaultModel must be a string');
  }

  // Numeric settings
  if (config.maxConcurrentSessions !== undefined) {
    if (typeof config.maxConcurrentSessions !== 'number' || config.maxConcurrentSessions < 1) {
      errors.push('maxConcurrentSessions must be a positive number');
    } else if (config.maxConcurrentSessions > 50) {
      warnings.push('maxConcurrentSessions is very high; this may impact performance');
    }
  }

  // Boolean settings
  const booleanFields = [
    'autoStartSandbox',
    'traceEnabled',
    'autoUpdate',
    'minimizeToTray',
  ];
  for (const field of booleanFields) {
    if (config[field] !== undefined && typeof config[field] !== 'boolean') {
      errors.push(`${field} must be a boolean`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
