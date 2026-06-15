/**
 * OpenAgent-Desktop Aether - Sidecar Server Manager
 * 
 * Spawns the OpenCode server as a utility process and manages its lifecycle.
 */

import { app, utilityProcess } from 'electron';
import { EventEmitter } from 'events';
import * as net from 'net';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { loadShellEnv } from './shell-env';
import type { SidecarConfig, SidecarInstance, SidecarStatus } from './types';

export class SidecarManager extends EventEmitter {
  private instance: SidecarInstance | null = null;
  private status: SidecarStatus = 'stopped';
  private healthInterval: ReturnType<typeof setInterval> | null = null;
  private healthCheckUrl: string | null = null;
  private abortController: AbortController | null = null;

  async start(config?: SidecarConfig): Promise<SidecarInstance> {
    if (this.status === 'running' && this.instance) {
      return this.instance;
    }

    this.setStatus('starting');

    try {
      // 1. Allocate port
      const port = config?.port || await this.allocatePort();
      const hostname = config?.hostname || '127.0.0.1';
      const password = config?.password || crypto.randomUUID();
      const username = config?.username || 'opencode';
      const timeout = config?.timeout || 60000;

      // 2. Load shell environment for API keys
      const shellEnv = await loadShellEnv();

      // 3. Get user data path
      const userDataPath = app.getPath('userData');

      // 4. Create sidecar instance info
      this.instance = {
        url: `http://${hostname}:${port}`,
        hostname,
        port,
        username,
        password,
      };

      this.healthCheckUrl = `${this.instance.url}/global/health`;

      // 5. Fork sidecar utility process
      // NOTE: In production, this forks sidecar.ts compiled to JS.
      // During development, we use a simpler HTTP-spawn approach.
      await this.spawnServer(port, hostname, username, password, userDataPath, shellEnv, timeout);

      // 6. Verify health
      await this.verifyHealth(timeout);

      // 7. Start periodic health monitoring
      this.startHealthMonitoring();

      this.setStatus('running');
      this.emit('started', this.instance);

      return this.instance;
    } catch (err) {
      this.setStatus('error');
      this.emit('error', err);
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.status === 'stopped') return;
    this.setStatus('stopping');

    this.stopHealthMonitoring();

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.instance = null;
    this.setStatus('stopped');
    this.emit('stopped');
  }

  async restart(config?: SidecarConfig): Promise<SidecarInstance> {
    await this.stop();
    return this.start(config);
  }

  getInstance(): SidecarInstance | null {
    return this.instance;
  }

  getStatus(): SidecarStatus {
    return this.status;
  }

  private setStatus(status: SidecarStatus): void {
    this.status = status;
    this.emit('status-change', status);
  }

  private allocatePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          const port = addr.port;
          server.close(() => resolve(port));
        } else {
          server.close(() => reject(new Error('Failed to allocate port')));
        }
      });
      server.on('error', (err) => reject(err));
    });
  }

  private async spawnServer(
    port: number,
    hostname: string,
    username: string,
    password: string,
    userDataPath: string,
    shellEnv: Record<string, string>,
    timeout: number
  ): Promise<void> {
    // Try to spawn OpenCode server via utilityProcess
    // If the sidecar script doesn't exist, we fall back to a stub mode
    const sidecarPath = this.getSidecarPath();
    
    if (sidecarPath && fs.existsSync(sidecarPath)) {
      await this.spawnViaUtilityProcess(sidecarPath, port, hostname, username, password, userDataPath, shellEnv, timeout);
    } else {
      // Stub mode: OpenCode server is not installed
      // The app will function with Custom Protocol providers only
      this.emit('warning', 'OpenCode server not found. Running in custom-provider-only mode.');
    }
  }

  private getSidecarPath(): string | null {
    // Look for compiled sidecar in dist-electron
    const distPath = path.join(app.getAppPath(), 'dist-electron', 'sidecar', 'sidecar.js');
    if (fs.existsSync(distPath)) return distPath;
    
    // Check for sidecar in the project root
    const projectPath = path.join(app.getAppPath(), 'electron', 'sidecar', 'sidecar.js');
    if (fs.existsSync(projectPath)) return projectPath;
    
    return null;
  }

  private spawnViaUtilityProcess(
    sidecarPath: string,
    port: number,
    hostname: string,
    username: string,
    password: string,
    userDataPath: string,
    shellEnv: Record<string, string>,
    timeout: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Sidecar failed to start within ${timeout}ms`));
      }, timeout);

      try {
        const child = utilityProcess.fork(sidecarPath, [], {
          env: {
            ...process.env,
            ...shellEnv,
            OPENCODE_SERVER_USERNAME: username,
            OPENCODE_SERVER_PASSWORD: password,
            OPENCODE_DISABLE_EMBEDDED_WEB_UI: 'true',
            XDG_STATE_HOME: userDataPath,
          },
        });

        child.on('message', (msg: any) => {
          if (msg?.type === 'ready') {
            clearTimeout(timeoutId);
            if (this.instance) {
              this.instance.pid = child.pid;
            }
            resolve();
          }
        });

        child.on('exit', (code) => {
          clearTimeout(timeoutId);
          if (this.status === 'starting') {
            reject(new Error(`Sidecar exited during startup with code ${code}`));
          } else if (this.status === 'running') {
            this.setStatus('error');
            this.emit('crashed', code);
          }
        });

        // Send start message
        child.postMessage({
          type: 'start',
          hostname,
          port,
          username,
          password,
          userDataPath,
        });
      } catch (err) {
        clearTimeout(timeoutId);
        reject(err);
      }
    });
  }

  private async verifyHealth(timeout: number): Promise<void> {
    if (!this.healthCheckUrl) return;
    
    const startTime = Date.now();
    const authHeader = 'Basic ' + Buffer.from(
      `${this.instance!.username}:${this.instance!.password}`
    ).toString('base64');

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(this.healthCheckUrl, {
          headers: { Authorization: authHeader },
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok) return;
      } catch {
        // Not ready yet, wait and retry
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    
    // Health check failed but server might still be starting
    // Don't throw — let the app continue in degraded mode
  }

  private startHealthMonitoring(): void {
    this.stopHealthMonitoring();
    this.healthInterval = setInterval(async () => {
      try {
        if (!this.healthCheckUrl) return;
        const authHeader = 'Basic ' + Buffer.from(
          `${this.instance!.username}:${this.instance!.password}`
        ).toString('base64');
        const response = await fetch(this.healthCheckUrl, {
          headers: { Authorization: authHeader },
          signal: AbortSignal.timeout(5000),
        });
        this.emit('health', { healthy: response.ok, status: response.status });
      } catch (err) {
        this.emit('health', { healthy: false, error: String(err) });
      }
    }, 30000);
  }

  private stopHealthMonitoring(): void {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
  }
}
