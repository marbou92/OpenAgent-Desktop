/**
 * OpenAgent-Desktop Aether - Provider Diagnostics
 *
 * Provides diagnostic tools for troubleshooting provider connections,
 * API key validation, and connectivity issues.
 */

import { EventEmitter } from 'events';

export interface DiagnosticResult {
  providerId: string;
  timestamp: string;
  checks: {
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message: string;
    details?: Record<string, unknown>;
  }[];
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
}

export class ProviderDiagnostics extends EventEmitter {
  async runDiagnostics(providerId: string, config?: Record<string, any>): Promise<DiagnosticResult> {
    const start = Date.now();
    const checks: DiagnosticResult['checks'] = [];

    // Check 1: Configuration presence
    if (config) {
      checks.push({
        name: 'Configuration',
        status: 'pass',
        message: 'Provider configuration found',
      });
    } else {
      checks.push({
        name: 'Configuration',
        status: 'fail',
        message: 'No provider configuration found',
      });
    }

    // Check 2: API key presence
    const hasApiKey = config?.apiKey && config.apiKey.trim().length > 0;
    checks.push({
      name: 'API Key',
      status: hasApiKey ? 'pass' : 'fail',
      message: hasApiKey ? 'API key is configured' : 'API key is missing or empty',
    });

    // Check 3: Base URL validity
    if (config?.baseUrl) {
      try {
        new URL(config.baseUrl);
        checks.push({ name: 'Base URL', status: 'pass', message: 'Base URL is valid' });
      } catch {
        checks.push({ name: 'Base URL', status: 'fail', message: 'Base URL is invalid' });
      }
    } else {
      checks.push({ name: 'Base URL', status: 'warn', message: 'Using default base URL' });
    }

    const failCount = checks.filter(c => c.status === 'fail').length;
    const warnCount = checks.filter(c => c.status === 'warn').length;

    const overallStatus: DiagnosticResult['overallStatus'] =
      failCount > 0 ? 'unhealthy' : warnCount > 0 ? 'degraded' : 'healthy';

    const result: DiagnosticResult = {
      providerId,
      timestamp: new Date().toISOString(),
      checks,
      overallStatus,
      latencyMs: Date.now() - start,
    };

    this.emit('diagnostics:completed', result);
    return result;
  }

  async runAllDiagnostics(providers: { id: string; config?: Record<string, any> }[]): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];
    for (const provider of providers) {
      results.push(await this.runDiagnostics(provider.id, provider.config));
    }
    return results;
  }

  async runQuick(providerId: string, type?: string, apiHost?: string, apiKey?: string): Promise<DiagnosticResult> {
    const config: Record<string, any> = {};
    if (type) config.type = type;
    if (apiHost) config.baseUrl = apiHost;
    if (apiKey) config.apiKey = apiKey;
    return this.runDiagnostics(providerId, config);
  }

  async runFull(providerId: string, type?: string, apiHost?: string, apiKey?: string, model?: string): Promise<DiagnosticResult> {
    const config: Record<string, any> = {};
    if (type) config.type = type;
    if (apiHost) config.baseUrl = apiHost;
    if (apiKey) config.apiKey = apiKey;
    if (model) config.model = model;
    const result = await this.runDiagnostics(providerId, config);
    // Full diagnostics may include additional connectivity checks
    return result;
  }
}
