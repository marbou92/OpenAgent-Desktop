/**
 * OpenAgent-Desktop Aether - Skill Loader
 * 
 * Loads skill definitions from the .claude/skills/ directory.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { SkillDefinition } from './types';

export class SkillLoader {
  private skillsPath: string;

  constructor(skillsPath: string) {
    this.skillsPath = skillsPath;
  }

  async loadAll(): Promise<SkillDefinition[]> {
    const skills: SkillDefinition[] = [];

    if (!fs.existsSync(this.skillsPath)) {
      return skills;
    }

    try {
      const entries = fs.readdirSync(this.skillsPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skill = await this.loadSkill(path.join(this.skillsPath, entry.name));
          if (skill) skills.push(skill);
        }
      }
    } catch (err) {
      console.error('[SkillLoader] Failed to load skills:', err);
    }

    return skills;
  }

  private async loadSkill(skillDir: string): Promise<SkillDefinition | null> {
    const manifestPath = path.join(skillDir, 'manifest.json');
    const entryPath = path.join(skillDir, 'index.js');

    if (!fs.existsSync(manifestPath)) return null;

    try {
      const raw = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw);

      return {
        id: manifest.id || path.basename(skillDir),
        name: manifest.name || path.basename(skillDir),
        description: manifest.description || '',
        category: manifest.category || 'custom',
        parameters: manifest.parameters || [],
        execute: async (context) => {
          // Try to load and execute the skill's index.js
          if (fs.existsSync(entryPath)) {
            try {
              const skillModule = await import(entryPath);
              if (typeof skillModule.execute === 'function') {
                return skillModule.execute(context);
              }
            } catch {
              // Fall through to default execution
            }
          }
          return {
            success: false,
            output: `Skill "${manifest.name}" is defined but has no executable module.`,
          };
        },
      };
    } catch {
      return null;
    }
  }

  watchForChanges(callback: () => void): () => void {
    // Basic file watching — could be enhanced with chokidar
    if (!fs.existsSync(this.skillsPath)) return () => {};

    try {
      const watcher = fs.watch(this.skillsPath, { recursive: true }, () => {
        callback();
      });
      return () => watcher.close();
    } catch {
      return () => {};
    }
  }
}
