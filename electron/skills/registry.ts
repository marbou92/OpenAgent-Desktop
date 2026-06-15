/**
 * OpenAgent-Desktop Aether - Skill Registry
 *
 * Manages built-in and user-defined skills with event-driven updates.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  parameters?: Record<string, unknown>;
  handler?: string;
  enabled: boolean;
  isBuiltin: boolean;
}

export class SkillRegistry extends EventEmitter {
  private skills: Map<string, SkillDefinition> = new Map();
  private initialized = false;

  constructor() {
    super();
    this.registerBuiltinSkills();
  }

  async initialize(skillsPath?: string): Promise<void> {
    if (this.initialized) return;

    // Load custom skills from directory if provided
    if (skillsPath && fs.existsSync(skillsPath)) {
      this.loadCustomSkills(skillsPath);
    }

    this.initialized = true;
    this.emit('initialized', this.skills.size);
  }

  private registerBuiltinSkills(): void {
    const builtins: SkillDefinition[] = [
      { id: 'create-component', name: 'Create Component', description: 'Generate a new UI component from a description', category: 'coding', enabled: true, isBuiltin: true },
      { id: 'analyze-data', name: 'Analyze Data', description: 'Analyze and summarize data files', category: 'data', enabled: true, isBuiltin: true },
      { id: 'draft', name: 'Draft Document', description: 'Draft a document from a template or outline', category: 'writing', enabled: true, isBuiltin: true },
      { id: 'refactor', name: 'Refactor Code', description: 'Refactor code following best practices', category: 'coding', enabled: true, isBuiltin: true },
      { id: 'debug', name: 'Debug Issue', description: 'Debug and fix code issues', category: 'coding', enabled: true, isBuiltin: true },
      { id: 'create-chart', name: 'Create Chart', description: 'Generate a chart from data', category: 'data', enabled: true, isBuiltin: true },
      { id: 'generate-report', name: 'Generate Report', description: 'Generate a formatted report', category: 'writing', enabled: true, isBuiltin: true },
      { id: 'automate', name: 'Automate Task', description: 'Create an automation recipe', category: 'automation', enabled: true, isBuiltin: true },
      { id: 'schedule', name: 'Schedule Task', description: 'Schedule a task to run at intervals', category: 'automation', enabled: true, isBuiltin: true },
      { id: 'monitor', name: 'Monitor Resource', description: 'Set up resource monitoring', category: 'automation', enabled: true, isBuiltin: true },
      { id: 'edit', name: 'Edit File', description: 'Edit a file with targeted changes', category: 'coding', enabled: true, isBuiltin: true },
      { id: 'summarize', name: 'Summarize', description: 'Summarize text or documents', category: 'writing', enabled: true, isBuiltin: true },
    ];

    for (const skill of builtins) {
      this.skills.set(skill.id, skill);
    }
  }

  private loadCustomSkills(skillsPath: string): void {
    try {
      const files = fs.readdirSync(skillsPath).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(skillsPath, file), 'utf-8');
          const skill: SkillDefinition = JSON.parse(raw);
          if (skill.id) {
            this.skills.set(skill.id, { ...skill, isBuiltin: false });
          }
        } catch {
          // Skip invalid JSON files
        }
      }
      this.emit('custom-skills-loaded', files.length);
    } catch {
      // Skills directory not readable
    }
  }

  list(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  listByCategory(category: string): SkillDefinition[] {
    return Array.from(this.skills.values()).filter(s => s.category === category);
  }

  get(id: string): SkillDefinition | undefined {
    return this.skills.get(id);
  }

  register(skill: SkillDefinition): void {
    this.skills.set(skill.id, { ...skill, isBuiltin: false });
    this.emit('skill-registered', skill);
  }

  unregister(id: string): boolean {
    const deleted = this.skills.delete(id);
    if (deleted) this.emit('skill-unregistered', id);
    return deleted;
  }

  enable(id: string): boolean {
    const skill = this.skills.get(id);
    if (skill) { skill.enabled = true; this.emit('skill-toggled', { id, enabled: true }); return true; }
    return false;
  }

  disable(id: string): boolean {
    const skill = this.skills.get(id);
    if (skill) { skill.enabled = false; this.emit('skill-toggled', { id, enabled: false }); return true; }
    return false;
  }

  async execute(id: string, input: Record<string, unknown>, _context?: Record<string, unknown>): Promise<{ status: string; results: unknown[] }> {
    const skill = this.skills.get(id);
    if (!skill) throw new Error(`Skill not found: ${id}`);
    if (!skill.enabled) throw new Error(`Skill is disabled: ${id}`);

    // Validate required variables (simple check: 'create-component' needs componentName)
    if (id === 'create-component' && !input.componentName) {
      throw new Error('Missing required variable: componentName');
    }

    this.emit('skill-executed', { id, input });
    return { status: 'completed', results: [{ skillId: id, input }] };
  }
}
