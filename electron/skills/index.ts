/**
 * OpenAgent-Desktop Aether - Skills Manager
 *
 * Public API wrapper around SkillRegistry.
 */

export { SkillRegistry } from './registry';
export type { SkillDefinition } from './registry';

import { SkillRegistry } from './registry';

class SkillsManager {
  private registry: SkillRegistry;

  constructor() {
    this.registry = new SkillRegistry();
  }

  async initialize(skillsPath?: string): Promise<void> {
    await this.registry.initialize(skillsPath);
  }

  list() { return this.registry.list(); }
  get(id: string) { return this.registry.get(id); }
  register(skill: any) { return this.registry.register(skill); }
  unregister(id: string) { return this.registry.unregister(id); }
  enable(id: string) { return this.registry.enable(id); }
  disable(id: string) { return this.registry.disable(id); }
  getRegistry() { return this.registry; }
}

export default SkillsManager;
