/**
 * OpenAgent-Desktop - Variable Interpolation
 * 
 * Resolves {env:VAR_NAME} patterns in config values.
 * Like OpenCode: avoids hardcoding secrets in config files.
 */

import * as os from 'os';

export class ConfigInterpolator {
  private static readonly ENV_PATTERN = /\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g;
  private static readonly HOME_PATTERN = /\{home\}/g;
  private static readonly CWD_PATTERN = /\{cwd\}/g;

  /**
   * Resolve all interpolation patterns in a string value.
   */
  static resolve(value: string, cwd?: string): string {
    let result = value;

    // Resolve {env:VAR_NAME}
    result = result.replace(this.ENV_PATTERN, (_, varName: string) => {
      const envValue = process.env[varName];
      if (envValue === undefined) {
        return ''; // Missing env vars resolve to empty string
      }
      return envValue;
    });

    // Resolve {home}
    result = result.replace(this.HOME_PATTERN, os.homedir());

    // Resolve {cwd}
    if (cwd) {
      result = result.replace(this.CWD_PATTERN, cwd);
    }

    return result;
  }

  /**
   * Recursively resolve all interpolation patterns in a config object.
   */
  static resolveDeep<T>(config: T, cwd?: string): T {
    if (typeof config === 'string') {
      return this.resolve(config, cwd) as unknown as T;
    }

    if (Array.isArray(config)) {
      return config.map((item) => this.resolveDeep(item, cwd)) as unknown as T;
    }

    if (config && typeof config === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(config)) {
        result[key] = this.resolveDeep(value, cwd);
      }
      return result as T;
    }

    return config;
  }

  /**
   * Check if a value contains any interpolation patterns.
   */
  static hasPatterns(value: string): boolean {
    return this.ENV_PATTERN.test(value) || this.HOME_PATTERN.test(value) || this.CWD_PATTERN.test(value);
  }
}
