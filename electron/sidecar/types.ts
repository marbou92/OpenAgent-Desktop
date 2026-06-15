/**
 * OpenAgent-Desktop Aether - Sidecar Types
 */

export interface SidecarConfig {
  port?: number;       // default: 0 (random available port)
  hostname?: string;   // default: '127.0.0.1'
  password?: string;   // default: random UUID
  username?: string;   // default: 'opencode'
  timeout?: number;    // default: 60000 (60s)
}

export interface SidecarInstance {
  url: string;
  hostname: string;
  port: number;
  username: string;
  password: string;
  pid?: number;
}

export type SidecarStatus = 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
