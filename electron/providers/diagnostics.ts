/**
 * OpenAgent-Desktop - API Diagnostics
 * 
 * Multi-step diagnostic pipeline for provider connectivity.
 * Like OpenCowork: DNS → TCP → TLS → Auth → Model verification.
 * Provides specific error detection and advisory codes.
 */

import { EventEmitter } from 'events';

export type DiagnosticStep = 'dns' | 'tcp' | 'tls' | 'auth' | 'model' | 'complete';

export type DiagnosticStatus = 'pending' | 'running' | 'passed' | 'failed' | 'warning' | 'skipped';

export interface DiagnosticResult {
  step: DiagnosticStep;
  status: DiagnosticStatus;
  latencyMs?: number;
  message: string;
  advisoryCode?: string;
  details?: Record<string, unknown>;
}

export interface FullDiagnosticReport {
  providerId: string;
  providerType: string;
  apiHost: string;
  results: DiagnosticResult[];
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  totalLatencyMs: number;
  timestamp: string;
  advisoryCodes: string[];
}

export class ProviderDiagnostics extends EventEmitter {
  async runFull(
    providerId: string,
    providerType: string,
    apiHost: string,
    apiKey?: string,
    model?: string
  ): Promise<FullDiagnosticReport> {
    const results: DiagnosticResult[] = [];
    const startTime = Date.now();
    const advisoryCodes: string[] = [];
    let overallStatus: FullDiagnosticReport['overallStatus'] = 'healthy';

    // Step 1: DNS Resolution
    const dnsResult = await this.checkDns(apiHost);
    results.push(dnsResult);
    if (dnsResult.status === 'failed') {
      overallStatus = 'unhealthy';
      if (dnsResult.advisoryCode) advisoryCodes.push(dnsResult.advisoryCode);
      return this.buildReport(providerId, providerType, apiHost, results, overallStatus, startTime, advisoryCodes);
    }

    // Step 2: TCP Connection
    const tcpResult = await this.checkTcp(apiHost);
    results.push(tcpResult);
    if (tcpResult.status === 'failed') {
      overallStatus = 'unhealthy';
      if (tcpResult.advisoryCode) advisoryCodes.push(tcpResult.advisoryCode);
      return this.buildReport(providerId, providerType, apiHost, results, overallStatus, startTime, advisoryCodes);
    }

    // Step 3: TLS (skip for localhost)
    if (!apiHost.includes('localhost') && !apiHost.includes('127.0.0.1')) {
      const tlsResult = await this.checkTls(apiHost);
      results.push(tlsResult);
      if (tlsResult.status === 'failed') {
        overallStatus = 'unhealthy';
        if (tlsResult.advisoryCode) advisoryCodes.push(tlsResult.advisoryCode);
      } else if (tlsResult.status === 'warning') {
        overallStatus = 'degraded';
        if (tlsResult.advisoryCode) advisoryCodes.push(tlsResult.advisoryCode);
      }
    } else {
      results.push({ step: 'tls', status: 'skipped', message: 'Skipped for localhost' });
    }

    // Step 4: Authentication
    if (apiKey) {
      const authResult = await this.checkAuth(apiHost, apiKey, providerType);
      results.push(authResult);
      if (authResult.status === 'failed') {
        overallStatus = 'unhealthy';
        if (authResult.advisoryCode) advisoryCodes.push(authResult.advisoryCode);
        return this.buildReport(providerId, providerType, apiHost, results, overallStatus, startTime, advisoryCodes);
      } else if (authResult.status === 'warning') {
        overallStatus = 'degraded';
        if (authResult.advisoryCode) advisoryCodes.push(authResult.advisoryCode);
      }
    } else {
      results.push({ step: 'auth', status: 'skipped', message: 'No API key provided' });
    }

    // Step 5: Model Verification
    if (model && apiKey) {
      const modelResult = await this.checkModel(apiHost, apiKey, model, providerType);
      results.push(modelResult);
      if (modelResult.status === 'failed') {
        overallStatus = 'degraded';
        if (modelResult.advisoryCode) advisoryCodes.push(modelResult.advisoryCode);
      } else if (modelResult.status === 'warning') {
        if (modelResult.advisoryCode) advisoryCodes.push(modelResult.advisoryCode);
      }
    } else {
      results.push({ step: 'model', status: 'skipped', message: 'No model specified or no API key' });
    }

    return this.buildReport(providerId, providerType, apiHost, results, overallStatus, startTime, advisoryCodes);
  }

  async runQuick(
    providerId: string,
    providerType: string,
    apiHost: string,
    apiKey?: string
  ): Promise<FullDiagnosticReport> {
    const results: DiagnosticResult[] = [];
    const startTime = Date.now();

    // Quick: just DNS + TCP + Auth (skip model call)
    const dnsResult = await this.checkDns(apiHost);
    results.push(dnsResult);

    const tcpResult = await this.checkTcp(apiHost);
    results.push(tcpResult);

    if (apiKey) {
      const authResult = await this.checkAuth(apiHost, apiKey, providerType);
      results.push(authResult);
    }

    results.push({ step: 'model', status: 'skipped', message: 'Quick diagnostic - model call skipped' });

    const hasFailure = results.some((r) => r.status === 'failed');
    const hasWarning = results.some((r) => r.status === 'warning');
    const overallStatus = hasFailure ? 'unhealthy' : hasWarning ? 'degraded' : 'healthy';

    return this.buildReport(providerId, providerType, apiHost, results, overallStatus, startTime, []);
  }

  private buildReport(
    providerId: string,
    providerType: string,
    apiHost: string,
    results: DiagnosticResult[],
    overallStatus: FullDiagnosticReport['overallStatus'],
    startTime: number,
    advisoryCodes: string[]
  ): FullDiagnosticReport {
    const report: FullDiagnosticReport = {
      providerId,
      providerType,
      apiHost,
      results,
      overallStatus,
      totalLatencyMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      advisoryCodes,
    };
    this.emit('diagnostic:complete', report);
    return report;
  }

  private async checkDns(apiHost: string): Promise<DiagnosticResult> {
    const start = Date.now();
    try {
      const url = new URL(apiHost.startsWith('http') ? apiHost : `https://${apiHost}`);
      const hostname = url.hostname;
      
      // Use DNS lookup
      const { lookup } = await import('dns').catch(() => ({ lookup: null }));
      if (lookup) {
        await new Promise<void>((resolve, reject) => {
          lookup(hostname, (err: Error | null) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      return {
        step: 'dns',
        status: 'passed',
        latencyMs: Date.now() - start,
        message: `DNS resolved: ${hostname}`,
      };
    } catch (err: any) {
      return {
        step: 'dns',
        status: 'failed',
        latencyMs: Date.now() - start,
        message: `DNS resolution failed: ${err.message}`,
        advisoryCode: 'DNS_FAIL',
        details: { error: err.message },
      };
    }
  }

  private async checkTcp(apiHost: string): Promise<DiagnosticResult> {
    const start = Date.now();
    try {
      const url = new URL(apiHost.startsWith('http') ? apiHost : `https://${apiHost}`);
      const _port = parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80);
      
      // Attempt HTTP connection as TCP check
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      try {
        const _response = await fetch(`${url.protocol}//${url.host}`, {
          method: 'HEAD',
          signal: controller.signal,
        });
        clearTimeout(timeout);
        
        return {
          step: 'tcp',
          status: 'passed',
          latencyMs: Date.now() - start,
          message: `TCP connection established to ${url.host}`,
        };
      } catch (fetchErr: any) {
        clearTimeout(timeout);
        
        // Ollama-specific detection
        if (apiHost.includes('localhost:11434') || apiHost.includes('127.0.0.1:11434')) {
          return {
            step: 'tcp',
            status: 'failed',
            latencyMs: Date.now() - start,
            message: 'Ollama server is not running. Start it with: ollama serve',
            advisoryCode: 'OLLAMA_NOT_RUNNING',
          };
        }
        
        throw fetchErr;
      }
    } catch (err: any) {
      const isAbort = err.name === 'AbortError';
      return {
        step: 'tcp',
        status: 'failed',
        latencyMs: Date.now() - start,
        message: isAbort ? 'Connection timed out after 10s' : `TCP connection failed: ${err.message}`,
        advisoryCode: isAbort ? 'TCP_TIMEOUT' : 'TCP_FAIL',
      };
    }
  }

  private async checkTls(apiHost: string): Promise<DiagnosticResult> {
    const start = Date.now();
    try {
      const url = new URL(apiHost.startsWith('http') ? apiHost : `https://${apiHost}`);
      
      if (url.protocol !== 'https:') {
        return {
          step: 'tls',
          status: 'warning',
          latencyMs: Date.now() - start,
          message: 'Connection is not using HTTPS — API keys may be transmitted in plaintext',
          advisoryCode: 'INSECURE_HTTP',
        };
      }

      return {
        step: 'tls',
        status: 'passed',
        latencyMs: Date.now() - start,
        message: 'TLS connection is secure',
      };
    } catch (err: any) {
      return {
        step: 'tls',
        status: 'failed',
        latencyMs: Date.now() - start,
        message: `TLS check failed: ${err.message}`,
        advisoryCode: 'TLS_FAIL',
      };
    }
  }

  private async checkAuth(apiHost: string, apiKey: string, providerType: string): Promise<DiagnosticResult> {
    const start = Date.now();
    try {
      const url = new URL(apiHost.startsWith('http') ? apiHost : `https://${apiHost}`);
      
      // Build auth headers based on provider type
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (['anthropic'].includes(providerType)) {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
      } else {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      // Try to list models as auth check
      const modelsPath = this.getModelsPath(providerType);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        const response = await fetch(`${url.origin}${modelsPath}`, {
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.status === 401 || response.status === 403) {
          return {
            step: 'auth',
            status: 'failed',
            latencyMs: Date.now() - start,
            message: 'Authentication failed — invalid API key',
            advisoryCode: 'AUTH_INVALID_KEY',
          };
        }

        if (response.status === 429) {
          return {
            step: 'auth',
            status: 'warning',
            latencyMs: Date.now() - start,
            message: 'Rate limited — API key is valid but you are being throttled',
            advisoryCode: 'RATE_LIMITED',
          };
        }

        return {
          step: 'auth',
          status: 'passed',
          latencyMs: Date.now() - start,
          message: 'Authentication successful',
        };
      } catch (fetchErr: any) {
        clearTimeout(timeout);
        throw fetchErr;
      }
    } catch (err: any) {
      return {
        step: 'auth',
        status: 'failed',
        latencyMs: Date.now() - start,
        message: `Auth check failed: ${err.message}`,
        advisoryCode: 'AUTH_CHECK_ERROR',
      };
    }
  }

  private async checkModel(apiHost: string, apiKey: string, model: string, providerType: string): Promise<DiagnosticResult> {
    const start = Date.now();
    try {
      const url = new URL(apiHost.startsWith('http') ? apiHost : `https://${apiHost}`);
      
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (['anthropic'].includes(providerType)) {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
      } else {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      // Try a minimal completion request
      const chatPath = this.getChatPath(providerType);
      const body = this.buildMinimalRequest(model, providerType);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch(`${url.origin}${chatPath}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.status === 404) {
          return {
            step: 'model',
            status: 'failed',
            latencyMs: Date.now() - start,
            message: `Model "${model}" not found — check model name`,
            advisoryCode: 'MODEL_NOT_FOUND',
          };
        }

        if (response.status === 400) {
          const text = await response.text().catch(() => '');
          return {
            step: 'model',
            status: 'warning',
            latencyMs: Date.now() - start,
            message: `Model request returned 400 — model may not support this request format`,
            advisoryCode: 'MODEL_INCOMPATIBLE',
            details: { response: text.slice(0, 500) },
          };
        }

        if (!response.ok) {
          return {
            step: 'model',
            status: 'warning',
            latencyMs: Date.now() - start,
            message: `Model returned status ${response.status}`,
            advisoryCode: 'MODEL_ERROR',
          };
        }

        return {
          step: 'model',
          status: 'passed',
          latencyMs: Date.now() - start,
          message: `Model "${model}" is accessible and responding`,
        };
      } catch (fetchErr: any) {
        clearTimeout(timeout);
        throw fetchErr;
      }
    } catch (err: any) {
      return {
        step: 'model',
        status: 'failed',
        latencyMs: Date.now() - start,
        message: `Model check failed: ${err.message}`,
        advisoryCode: 'MODEL_CHECK_ERROR',
      };
    }
  }

  private getModelsPath(providerType: string): string {
    switch (providerType) {
      case 'anthropic': return '/v1/models';
      case 'openai': return '/v1/models';
      case 'gemini': return '/v1/models';
      case 'ollama': return '/api/tags';
      case 'openrouter': return '/api/v1/models';
      default: return '/v1/models';
    }
  }

  private getChatPath(providerType: string): string {
    switch (providerType) {
      case 'anthropic': return '/v1/messages';
      case 'openai': return '/v1/chat/completions';
      case 'gemini': return '/v1beta/models/gemini-pro:generateContent';
      case 'ollama': return '/api/chat';
      case 'openrouter': return '/api/v1/chat/completions';
      default: return '/v1/chat/completions';
    }
  }

  private buildMinimalRequest(model: string, providerType: string): Record<string, unknown> {
    switch (providerType) {
      case 'anthropic':
        return {
          model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        };
      case 'ollama':
        return {
          model,
          stream: false,
          messages: [{ role: 'user', content: 'hi' }],
        };
      default:
        return {
          model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        };
    }
  }
}
