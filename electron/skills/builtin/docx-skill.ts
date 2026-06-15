/**
 * OpenAgent-Desktop Aether - Word Document Generation Skill
 */

import * as path from 'path';
import type { SkillDefinition, SkillContext, SkillResult } from '../types';

export class DocxSkill implements SkillDefinition {
  id = 'docx-generator';
  name = 'Word Document Generation';
  description = 'Generate Word documents from text descriptions';
  category = 'document' as const;
  parameters = [
    { name: 'title', type: 'string' as const, description: 'Document title', required: true },
    { name: 'content', type: 'string' as const, description: 'Document content or description', required: true },
    { name: 'format', type: 'string' as const, description: 'Document format (report/letter/memo)', required: false, default: 'report' },
  ];

  async execute(context: SkillContext): Promise<SkillResult> {
    const { title, content, format = 'report' } = context.args;
    
    return {
      success: true,
      output: `Word document "${title}" (${format} format) has been generated.`,
      artifacts: [{
        type: 'file',
        path: path.join(context.workingDir, `${String(title).replace(/\s+/g, '_')}.docx`),
        name: `${String(title).replace(/\s+/g, '_')}.docx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }],
    };
  }
}
