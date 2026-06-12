/**
 * OpenAgent-Desktop - Project Manager
 * 
 * Manages project workspaces that group sessions, files, extensions,
 * and provider configurations together. Each project has its own
 * directory, settings, and context.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

export interface ProjectConfig {
  id: string;
  name: string;
  description?: string;
  directory: string;
  providerId?: string;
  model?: string;
  extensions: string[];
  skills: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  defaultExtensions: string[];
  defaultSkills: string[];
  providerType?: string;
  settings?: Record<string, unknown>;
}

export class ProjectManager extends EventEmitter {
  private projectsDir: string;
  private projects: Map<string, ProjectConfig> = new Map();
  private activeProjectId: string | null = null;
  private initialized = false;

  constructor(projectsDir: string) {
    super();
    this.projectsDir = projectsDir;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.projectsDir, { recursive: true });
    } catch {
      /* directory may already exist */
    }

    await this.loadProjects();
    this.initialized = true;
  }

  private async loadProjects(): Promise<void> {
    try {
      const files = await fs.readdir(this.projectsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await fs.readFile(path.join(this.projectsDir, file), 'utf-8');
            const project: ProjectConfig = JSON.parse(content);
            this.projects.set(project.id, project);
          } catch {
            // Skip invalid project files
          }
        }
      }
    } catch {
      // No projects yet
    }
  }

  private async saveProject(project: ProjectConfig): Promise<void> {
    const filePath = path.join(this.projectsDir, `${project.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(project, null, 2), 'utf-8');
  }

  list(): ProjectConfig[] {
    return Array.from(this.projects.values());
  }

  get(projectId: string): ProjectConfig | undefined {
    return this.projects.get(projectId);
  }

  async create(options: { name: string; description?: string; directory?: string; providerId?: string; model?: string; extensions?: string[]; skills?: string[] }): Promise<ProjectConfig> {
    const id = `project-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const directory = options.directory || path.join(this.projectsDir, id);

    const project: ProjectConfig = {
      id,
      name: options.name,
      description: options.description,
      directory,
      providerId: options.providerId,
      model: options.model,
      extensions: options.extensions || [],
      skills: options.skills || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Ensure project directory exists
    await fs.mkdir(directory, { recursive: true });

    this.projects.set(id, project);
    await this.saveProject(project);

    this.emit('project:created', project);
    return project;
  }

  async update(projectId: string, updates: Partial<ProjectConfig>): Promise<ProjectConfig> {
    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const updated = {
      ...project,
      ...updates,
      id: project.id, // Don't allow ID changes
      createdAt: project.createdAt, // Don't allow createdAt changes
      updatedAt: new Date().toISOString(),
    };

    this.projects.set(projectId, updated);
    await this.saveProject(updated);

    this.emit('project:updated', updated);
    return updated;
  }

  async delete(projectId: string): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    this.projects.delete(projectId);

    // Remove project file
    const filePath = path.join(this.projectsDir, `${projectId}.json`);
    try {
      await fs.unlink(filePath);
    } catch {
      // File may not exist
    }

    if (this.activeProjectId === projectId) {
      this.activeProjectId = null;
    }

    this.emit('project:deleted', { projectId });
  }

  getActive(): ProjectConfig | null {
    if (!this.activeProjectId) return null;
    return this.projects.get(this.activeProjectId) || null;
  }

  async setActive(projectId: string): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    this.activeProjectId = projectId;
    this.emit('project:activated', project);
  }

  getBuiltinTemplates(): ProjectTemplate[] {
    return [
      {
        id: 'web-development',
        name: 'Web Development',
        description: 'Full-stack web development with code tools, file access, and browser automation',
        defaultExtensions: ['developer', 'code-mode', 'auto-visualiser', 'document-generators'],
        defaultSkills: ['create-component', 'refactor', 'debug'],
        providerType: 'anthropic',
      },
      {
        id: 'data-analysis',
        name: 'Data Analysis',
        description: 'Data processing, visualization, and reporting workspace',
        defaultExtensions: ['developer', 'auto-visualiser', 'memory', 'document-generators'],
        defaultSkills: ['analyze-data', 'create-chart', 'generate-report'],
        providerType: 'openai',
      },
      {
        id: 'writing',
        name: 'Writing & Content',
        description: 'Document creation, editing, and content generation',
        defaultExtensions: ['memory', 'chat-recall', 'document-generators', 'top-of-mind'],
        defaultSkills: ['draft', 'edit', 'summarize'],
      },
      {
        id: 'automation',
        name: 'Automation',
        description: 'Task automation, scripting, and workflow building',
        defaultExtensions: ['developer', 'computer-controller', 'apps', 'todo'],
        defaultSkills: ['automate', 'schedule', 'monitor'],
        providerType: 'openai',
      },
    ];
  }
}
