/**
 * OpenAgent-Desktop Aether - Skill Executor
 * 
 * Executes skills with context and handles errors.
 */

import type { SkillDefinition, SkillContext, SkillResult } from './types';

export class SkillExecutor {
  async execute(skill: SkillDefinition, context: SkillContext): Promise<SkillResult> {
    try {
      // Validate required parameters
      for (const param of skill.parameters) {
        if (param.required && !(param.name in context.args)) {
          return {
            success: false,
            output: `Missing required parameter: ${param.name}`,
            error: `Missing required parameter: ${param.name}`,
          };
        }
      }

      const result = await skill.execute(context);
      return result;
    } catch (err) {
      return {
        success: false,
        output: `Skill execution failed: ${err instanceof Error ? err.message : String(err)}`,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
