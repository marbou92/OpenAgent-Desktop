/**
 * Unit tests for ProjectManager
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectManager } from '../../electron/projects/manager';
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

describe('ProjectManager', () => {
  let manager: ProjectManager;
  const testDir = '/tmp/test-projects';

  beforeEach(() => {
    manager = new ProjectManager(testDir);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.readdir).mockResolvedValue([]);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  });

  describe('initialize', () => {
    it('should create projects directory', async () => {
      await manager.initialize();
      expect(fs.mkdir).toHaveBeenCalledWith(testDir, { recursive: true });
    });

    it('should load existing projects from disk', async () => {
      const mockProject = {
        id: 'proj-1',
        name: 'Test Project',
        description: 'A test project',
        directory: '/tmp/test',
        extensions: [],
        skills: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      vi.mocked(fs.readdir).mockResolvedValue(['proj-1.json'] as unknown as Buffer[]);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockProject));

      await manager.initialize();
      const projects = manager.list();
      expect(projects).toHaveLength(1);
      expect(projects[0].name).toBe('Test Project');
    });
  });

  describe('create', () => {
    it('should create a new project with auto-generated ID', async () => {
      await manager.initialize();
      const project = await manager.create({ name: 'New Project', description: 'Test' });

      expect(project.id).toMatch(/^project-/);
      expect(project.name).toBe('New Project');
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should emit project:created event', async () => {
      await manager.initialize();
      const listener = vi.fn();
      manager.on('project:created', listener);

      await manager.create({ name: 'Event Test' });
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ name: 'Event Test' }));
    });
  });

  describe('delete', () => {
    it('should delete a project', async () => {
      await manager.initialize();
      const project = await manager.create({ name: 'Delete Me' });
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      await manager.delete(project.id);
      expect(manager.get(project.id)).toBeUndefined();
    });

    it('should throw when deleting non-existent project', async () => {
      await manager.initialize();
      await expect(manager.delete('non-existent')).rejects.toThrow('Project not found');
    });
  });

  describe('setActive', () => {
    it('should set the active project', async () => {
      await manager.initialize();
      const project = await manager.create({ name: 'Active Test' });
      await manager.setActive(project.id);
      expect(manager.getActive()?.id).toBe(project.id);
    });

    it('should emit project:activated event', async () => {
      await manager.initialize();
      const project = await manager.create({ name: 'Active Event' });
      const listener = vi.fn();
      manager.on('project:activated', listener);

      await manager.setActive(project.id);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ id: project.id }));
    });
  });

  describe('getBuiltinTemplates', () => {
    it('should return built-in templates', () => {
      const templates = manager.getBuiltinTemplates();
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.some((t) => t.id === 'web-development')).toBe(true);
    });
  });
});
