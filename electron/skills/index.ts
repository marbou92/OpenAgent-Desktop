/**
 * OpenAgent-Desktop Aether - Skills Module Index
 */

export { SkillRegistry } from './registry';
export type {
  SkillCategory,
  SkillStatus,
  SkillVariable,
  SkillStep,
  SkillDefinition,
  SkillExecution,
} from './registry';

/**
 * SkillsManager - High-level manager for the skills subsystem.
 * Wraps SkillRegistry and provides lifecycle management.
 */
import { SkillRegistry } from './registry';
import type { SkillDefinition, SkillExecution, SkillCategory } from './registry';
import { EventEmitter } from 'events';

export class SkillsManager extends EventEmitter {
  private registry: SkillRegistry;
  private activeExecutions: Map<string, SkillExecution> = new Map();

  constructor(skillsDir: string) {
    super();
    this.registry = new SkillRegistry(skillsDir);
  }

  async initialize(): Promise<void> {
    await this.registry.initialize();
    this.emit('initialized');
  }

  listSkills() {
    return this.registry.list();
  }

  listSkillsByCategory(category: SkillCategory) {
    return this.registry.listByCategory(category);
  }

  getSkill(id: string) {
    return this.registry.get(id);
  }

  async executeSkill(skillId: string, inputs: Record<string, any>): Promise<SkillExecution> {
    const execution = await this.registry.execute(skillId, inputs);
    this.activeExecutions.set(execution.id, execution);
    if (execution.status === 'completed' || execution.status === 'failed') {
      this.activeExecutions.delete(execution.id);
    }
    this.emit('skill:executed', execution);
    return execution;
  }

  async addSkill(skill: SkillDefinition): Promise<void> {
    await this.registry.addSkill(skill);
    this.emit('skill:added', skill);
  }

  async removeSkill(skillId: string): Promise<void> {
    await this.registry.removeSkill(skillId);
    this.emit('skill:removed', { skillId });
  }

  getRegistry(): SkillRegistry {
    return this.registry;
  }

  getActiveExecutions(): SkillExecution[] {
    return Array.from(this.activeExecutions.values());
  }
}
