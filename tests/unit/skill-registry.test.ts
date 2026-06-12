/**
 * Unit tests for SkillRegistry
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillRegistry } from '../../electron/skills/registry';
import { promises as fs } from 'fs';

// Mock fs.promises namespace (source imports { promises as fs } from 'fs')
vi.mock('fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('fs')>();
  return {
    ...original,
    promises: {
      mkdir: vi.fn().mockResolvedValue(undefined),
      readdir: vi.fn().mockResolvedValue([]),
      readFile: vi.fn(),
      writeFile: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
    },
  };
});

describe('SkillRegistry', () => {
  let registry: SkillRegistry;
  const testDir = '/tmp/test-skills';

  beforeEach(() => {
    registry = new SkillRegistry(testDir);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.readdir).mockResolvedValue([]);
  });

  describe('initialize', () => {
    it('should load built-in skills', async () => {
      await registry.initialize();
      const skills = registry.list();
      expect(skills.length).toBeGreaterThan(0);
      expect(skills.some((s) => s.id === 'create-component')).toBe(true);
      expect(skills.some((s) => s.id === 'analyze-data')).toBe(true);
      expect(skills.some((s) => s.id === 'draft')).toBe(true);
    });
  });

  describe('list', () => {
    it('should list all skills', async () => {
      await registry.initialize();
      const skills = registry.list();
      expect(skills.length).toBeGreaterThanOrEqual(6);
    });

    it('should filter by category', async () => {
      await registry.initialize();
      const codingSkills = registry.listByCategory('coding');
      expect(codingSkills.length).toBeGreaterThan(0);
      expect(codingSkills.every((s) => s.category === 'coding')).toBe(true);
    });
  });

  describe('get', () => {
    it('should return a skill by ID', async () => {
      await registry.initialize();
      const skill = registry.get('create-component');
      expect(skill).toBeDefined();
      expect(skill?.name).toBe('Create Component');
    });

    it('should return undefined for non-existent skill', async () => {
      await registry.initialize();
      const skill = registry.get('non-existent');
      expect(skill).toBeUndefined();
    });
  });

  describe('execute', () => {
    it('should execute a skill and return results', async () => {
      await registry.initialize();
      const execution = await registry.execute('create-component', {
        componentName: 'Button',
        framework: 'react',
      });
      expect(execution.status).toBe('completed');
      expect(execution.results.length).toBeGreaterThan(0);
    });

    it('should throw for missing required variables', async () => {
      await registry.initialize();
      await expect(registry.execute('create-component', {})).rejects.toThrow('Missing required variable');
    });

    it('should throw for non-existent skill', async () => {
      await registry.initialize();
      await expect(registry.execute('non-existent', {})).rejects.toThrow('Skill not found');
    });
  });
});
