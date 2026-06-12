/**
 * Unit tests for OpenCodeBridge
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenCodeBridge } from '../../electron/opencode/bridge';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OpenCodeBridge', () => {
  let bridge: OpenCodeBridge;

  beforeEach(() => {
    bridge = new OpenCodeBridge({ host: '127.0.0.1', port: 4096 });
    mockFetch.mockReset();
  });

  describe('constructor', () => {
    it('should use default config values', () => {
      const b = new OpenCodeBridge();
      expect(b).toBeDefined();
    });

    it('should accept custom config', () => {
      const b = new OpenCodeBridge({
        host: '192.168.1.100',
        port: 8080,
        username: 'test',
        password: 'secret',
        timeout: 5000,
      });
      expect(b).toBeDefined();
    });
  });

  describe('healthCheck', () => {
    it('should return status ok when server responds', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ status: 'ok', uptime: 12345 }),
      });

      const result = await bridge.healthCheck();
      expect(result.status).toBe('ok');
      expect(result.uptime).toBe(12345);
    });

    it('should return unreachable when server is down', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await bridge.healthCheck();
      expect(result.status).toBe('unreachable');
      expect(result.uptime).toBe(0);
    });
  });

  describe('sessions', () => {
    it('should list sessions', async () => {
      const mockSessions = [
        { id: 's1', title: 'Test', status: 'idle', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 0 },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockSessions),
      });

      const sessions = await bridge.listSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('s1');
    });

    it('should create a session', async () => {
      const mockSession = { id: 's2', title: 'New Session', status: 'idle', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 0 };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockSession),
      });

      const session = await bridge.createSession({ title: 'New Session' });
      expect(session.id).toBe('s2');
    });

    it('should delete a session', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers(),
        json: () => Promise.resolve(null),
        text: () => Promise.resolve(''),
      });

      await expect(bridge.deleteSession('s1')).resolves.not.toThrow();
    });
  });

  describe('messages', () => {
    it('should send a message', async () => {
      const mockMessage = { id: 'm1', sessionId: 's1', role: 'user', content: 'Hello', createdAt: new Date().toISOString() };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockMessage),
      });

      const message = await bridge.sendMessage('s1', 'Hello');
      expect(message.content).toBe('Hello');
    });
  });

  describe('files', () => {
    it('should list files', async () => {
      const mockFiles = [
        { path: '/src/index.ts', name: 'index.ts', type: 'file', language: 'typescript' },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockFiles),
      });

      const files = await bridge.listFiles();
      expect(files).toHaveLength(1);
      expect(files[0].name).toBe('index.ts');
    });
  });

  describe('tools', () => {
    it('should list tools', async () => {
      const mockTools = [
        { name: 'bash', description: 'Execute shell commands', inputSchema: {} },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockTools),
      });

      const tools = await bridge.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('bash');
    });
  });

  describe('error handling', () => {
    it('should throw on non-OK responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error'),
        headers: new Headers(),
      });

      await expect(bridge.listSessions()).rejects.toThrow('OpenCode API error 500');
    });

    it('should throw on timeout', async () => {
      const fastBridge = new OpenCodeBridge({ timeout: 1 });
      mockFetch.mockImplementationOnce(() => new Promise((_, reject) => {
        setTimeout(() => reject(new DOMException('Aborted', 'AbortError')), 100);
      }));

      await expect(fastBridge.listSessions()).rejects.toThrow();
    });
  });

  describe('auth headers', () => {
    it('should include Basic Auth when password is set', async () => {
      const authBridge = new OpenCodeBridge({ password: 'secret' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve([]),
      });

      await authBridge.listSessions();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Basic '),
          }),
        })
      );
    });
  });
});
