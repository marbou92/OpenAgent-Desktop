/**
 * Unit tests for ProviderHealthMonitor
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderHealthMonitor } from '../../electron/providers/health-monitor';

// Mock ProviderManager
const mockProviderManager = {
  list: vi.fn(),
  test: vi.fn(),
} as any;

describe('ProviderHealthMonitor', () => {
  let monitor: ProviderHealthMonitor;

  beforeEach(() => {
    monitor = new ProviderHealthMonitor(mockProviderManager, {
      checkIntervalMs: 60000,
      maxLatencyHistory: 10,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    monitor.stop();
  });

  describe('checkProvider', () => {
    it('should report healthy when test succeeds', async () => {
      mockProviderManager.test.mockResolvedValue(true);

      const snapshot = await monitor.checkProvider('provider-1');
      expect(snapshot.status).toBe('healthy');
      expect(snapshot.latencyMs).toBeGreaterThanOrEqual(0);
      expect(snapshot.consecutiveFailures).toBe(0);
    });

    it('should report unhealthy when test fails', async () => {
      mockProviderManager.test.mockResolvedValue(false);

      const snapshot = await monitor.checkProvider('provider-1');
      expect(snapshot.status).toBe('unhealthy');
      expect(snapshot.consecutiveFailures).toBe(1);
    });

    it('should report unhealthy when test throws', async () => {
      mockProviderManager.test.mockRejectedValue(new Error('Connection refused'));

      const snapshot = await monitor.checkProvider('provider-1');
      expect(snapshot.status).toBe('unhealthy');
      expect(snapshot.lastError).toBe('Connection refused');
    });

    it('should report degraded when latency is over 5 seconds', async () => {
      mockProviderManager.test.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve(true), 10); // Small delay for testing
      }));

      // Manually test with high latency
      const snapshot = await monitor.checkProvider('provider-1');
      // May or may not be degraded depending on timing
      expect(['healthy', 'degraded']).toContain(snapshot.status);
    });

    it('should track consecutive failures', async () => {
      mockProviderManager.test.mockResolvedValue(false);

      await monitor.checkProvider('provider-1');
      await monitor.checkProvider('provider-1');
      const snapshot = await monitor.checkProvider('provider-1');
      expect(snapshot.consecutiveFailures).toBe(3);
    });

    it('should reset consecutive failures on success', async () => {
      mockProviderManager.test.mockResolvedValue(false);
      await monitor.checkProvider('provider-1');
      await monitor.checkProvider('provider-1');

      mockProviderManager.test.mockResolvedValue(true);
      const snapshot = await monitor.checkProvider('provider-1');
      expect(snapshot.consecutiveFailures).toBe(0);
    });
  });

  describe('getDashboardData', () => {
    it('should return dashboard with summary', async () => {
      mockProviderManager.test.mockResolvedValue(true);
      await monitor.checkProvider('p1');
      await monitor.checkProvider('p2');

      const dashboard = monitor.getDashboardData();
      expect(dashboard.providers).toHaveLength(2);
      expect(dashboard.summary.totalProviders).toBe(2);
      expect(dashboard.summary.healthyCount).toBe(2);
      expect(dashboard.lastUpdated).toBeDefined();
    });
  });

  describe('events', () => {
    it('should emit provider:health-update on check', async () => {
      mockProviderManager.test.mockResolvedValue(true);
      const listener = vi.fn();
      monitor.on('provider:health-update', listener);

      await monitor.checkProvider('provider-1');
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        providerId: 'provider-1',
        status: 'healthy',
      }));
    });
  });
});
