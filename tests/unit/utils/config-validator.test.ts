import { describe, it, expect } from 'vitest';
import { validateProviderConfig, validateAppConfig } from '../../../electron/utils/config-validator';

describe('Config Validator', () => {
  it('should validate correct provider config', () => {
    const result = validateProviderConfig({ type: 'openai', name: 'My OpenAI', apiKey: 'sk-test' });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject config without type', () => {
    const result = validateProviderConfig({ name: 'Test' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Provider type is required'))).toBe(true);
  });

  it('should reject config without name', () => {
    const result = validateProviderConfig({ type: 'openai' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Provider name is required'))).toBe(true);
  });

  it('should reject null config', () => {
    const result = validateProviderConfig(null);
    expect(result.valid).toBe(false);
  });

  it('should validate app config', () => {
    const result = validateAppConfig({
      theme: 'dark',
      windowBounds: { width: 1280, height: 800 },
    });
    expect(result.valid).toBe(true);
  });
});
