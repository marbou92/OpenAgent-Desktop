/**
 * OpenAgent-Desktop Aether - Skills Module
 * 
 * Manages built-in and custom skills for document generation,
 * code analysis, automation, and more.
 */

import { EventEmitter } from 'events';
import { SkillLoader } from './skill-loader';
import { SkillExecutor } from './skill-executor';
import { PptxSkill } from './builtin/pptx-skill';
import { DocxSkill } from './builtin/docx-skill';
import { XlsxSkill } from './builtin/xlsx-skill';
import { PdfSkill } from './builtin/pdf-skill';
import type { SkillDefinition, SkillContext, SkillResult } from './types';

export class SkillsManager extends EventEmitter {
  private skills: Map<string, SkillDefinition> = new Map();
  private skillLoader: SkillLoader;
  private skillExecutor: SkillExecutor;

  constructor(skillsPath: string) {
    super();
    this.skillLoader = new SkillLoader(skillsPath);
    this.skillExecutor = new SkillExecutor();
  }

  async initialize(): Promise<void> {
    // Load built-in skills
    const builtinSkills: SkillDefinition[] = [
      new PptxSkill(),
      new DocxSkill(),
      new XlsxSkill(),
      new PdfSkill(),
    ];
    for (const skill of builtinSkills) {
      this.skills.set(skill.id, skill);
    }

    // Load custom skills from .claude/skills/
    const customSkills = await this.skillLoader.loadAll();
    for (const skill of customSkills) {
      this.skills.set(skill.id, skill);
    }

    this.emit('initialized', this.skills.size);
  }

  listSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  getSkill(id: string): SkillDefinition | undefined {
    return this.skills.get(id);
  }

  async executeSkill(id: string, context: SkillContext): Promise<SkillResult> {
    const skill = this.skills.get(id);
    if (!skill) {
      return {
        success: false,
        output: `Skill not found: ${id}`,
        error: `Skill not found: ${id}`,
      };
    }
    return this.skillExecutor.execute(skill, context);
  }

  async reloadCustomSkills(): Promise<number> {
    // Remove existing custom skills
    for (const [id, skill] of this.skills) {
      if (skill.category === 'custom') {
        this.skills.delete(id);
      }
    }
    // Reload from disk
    const customSkills = await this.skillLoader.loadAll();
    for (const skill of customSkills) {
      this.skills.set(skill.id, skill);
    }
    return customSkills.length;
  }

  toToolDefinitions(): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
    return Array.from(this.skills.values()).map(skill => ({
      name: `skill_${skill.id}`,
      description: skill.description,
      parameters: Object.fromEntries(
        skill.parameters.map(p => [p.name, { type: p.type, description: p.description, required: p.required }])
      ),
    }));
  }
}

export type { SkillDefinition, SkillContext, SkillResult, SkillArtifact, SkillCategory, SkillParameter } from './types';
export { SkillLoader } from './skill-loader';
export { SkillExecutor } from './skill-executor';
