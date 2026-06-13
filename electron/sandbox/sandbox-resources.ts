/**
 * OpenAgent-Desktop - Sandbox Resources
 *
 * Handles resource limit management for sandboxes:
 * - CPU limits
 * - Memory limits
 * - Disk limits
 * - Network isolation configuration
 *
 * Provides utility methods to calculate and validate resource limits
 * based on sandbox configuration.
 */

import {
  SandboxConfig,
  ResourceUsage,
  SandboxType,
} from './sandbox-strategies';

export class SandboxResources {
  /**
   * Calculate Docker CPU quota from percentage and available CPUs
   */
  static calculateDockerCpuQuota(cpuLimit: number, cpuCount: number): { period: number; quota: number } {
    const cpuPeriod = 100000;
    const cpuQuota = Math.round((cpuLimit / 100) * cpuCount * cpuPeriod);
    return { period: cpuPeriod, quota: cpuQuota };
  }

  /**
   * Calculate number of processors for WSL2/Lima from percentage
   */
  static calculateProcessorCount(cpuLimit: number): number {
    return Math.ceil(cpuLimit / 25);
  }

  /**
   * Validate a sandbox config, returning warnings for issues
   */
  static validateConfig(config: SandboxConfig): string[] {
    const warnings: string[] = [];

    if (config.cpuLimit !== undefined && (config.cpuLimit < 1 || config.cpuLimit > 100)) {
      warnings.push(`cpuLimit should be between 1 and 100, got ${config.cpuLimit}`);
    }

    if (config.memoryLimitMB !== undefined && config.memoryLimitMB < 128) {
      warnings.push(`memoryLimitMB should be at least 128MB, got ${config.memoryLimitMB}`);
    }

    if (config.diskLimitMB !== undefined && config.diskLimitMB < 256) {
      warnings.push(`diskLimitMB should be at least 256MB, got ${config.diskLimitMB}`);
    }

    return warnings;
  }

  /**
   * Get default resource limits for a given sandbox type
   */
  static getDefaultLimits(type: SandboxType): Required<Pick<SandboxConfig, 'cpuLimit' | 'memoryLimitMB' | 'diskLimitMB' | 'networkIsolation' | 'autoRestart' | 'healthCheckIntervalMs'>> {
    switch (type) {
      case 'docker':
        return {
          cpuLimit: 50,
          memoryLimitMB: 2048,
          diskLimitMB: 5120,
          networkIsolation: false,
          autoRestart: true,
          healthCheckIntervalMs: 30000,
        };
      case 'wsl2':
        return {
          cpuLimit: 50,
          memoryLimitMB: 2048,
          diskLimitMB: 5120,
          networkIsolation: false,
          autoRestart: true,
          healthCheckIntervalMs: 30000,
        };
      case 'lima':
        return {
          cpuLimit: 50,
          memoryLimitMB: 2048,
          diskLimitMB: 5120,
          networkIsolation: false,
          autoRestart: true,
          healthCheckIntervalMs: 30000,
        };
      case 'basic':
        return {
          cpuLimit: 100, // Basic sandbox can't limit CPU
          memoryLimitMB: 2048,
          diskLimitMB: 5120,
          networkIsolation: false,
          autoRestart: true,
          healthCheckIntervalMs: 60000, // Less frequent for basic
        };
      default:
        return {
          cpuLimit: 50,
          memoryLimitMB: 2048,
          diskLimitMB: 5120,
          networkIsolation: false,
          autoRestart: true,
          healthCheckIntervalMs: 30000,
        };
    }
  }

  /**
   * Create a zero/empty resource usage object
   */
  static emptyResourceUsage(): ResourceUsage {
    return {
      cpuPercent: 0,
      memoryUsedMB: 0,
      memoryLimitMB: 0,
      diskUsedMB: 0,
      diskLimitMB: 0,
    };
  }

  /**
   * Merge user config with defaults for the given sandbox type
   */
  static mergeWithDefaults(config: SandboxConfig | undefined, type: SandboxType): Required<Pick<SandboxConfig, 'cpuLimit' | 'memoryLimitMB' | 'diskLimitMB' | 'networkIsolation' | 'autoRestart' | 'healthCheckIntervalMs'>> {
    const defaults = SandboxResources.getDefaultLimits(type);
    return {
      cpuLimit: config?.cpuLimit ?? defaults.cpuLimit,
      memoryLimitMB: config?.memoryLimitMB ?? defaults.memoryLimitMB,
      diskLimitMB: config?.diskLimitMB ?? defaults.diskLimitMB,
      networkIsolation: config?.networkIsolation ?? defaults.networkIsolation,
      autoRestart: config?.autoRestart ?? defaults.autoRestart,
      healthCheckIntervalMs: config?.healthCheckIntervalMs ?? defaults.healthCheckIntervalMs,
    };
  }
}
