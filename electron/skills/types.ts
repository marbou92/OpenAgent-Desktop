/**
 * OpenAgent-Desktop Aether - Skills System Types
 */

export type SkillCategory = 'document' | 'code' | 'analysis' | 'automation' | 'custom';

export interface SkillParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'file';
  description: string;
  required: boolean;
  default?: unknown;
}

export interface SkillContext {
  sessionId: string;
  messageId: string;
  workingDir: string;
  args: Record<string, unknown>;
}

export interface SkillResult {
  success: boolean;
  output: string;
  artifacts?: SkillArtifact[];
  error?: string;
}

export interface SkillArtifact {
  type: 'file' | 'url';
  path: string;
  name: string;
  mimeType: string;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  parameters: SkillParameter[];
  execute(context: SkillContext): Promise<SkillResult>;
}
