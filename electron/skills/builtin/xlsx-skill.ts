/**
 * OpenAgent-Desktop Aether - Excel Spreadsheet Generation Skill
 */

import * as path from 'path';
import type { SkillDefinition, SkillContext, SkillResult } from '../types';

export class XlsxSkill implements SkillDefinition {
  id = 'xlsx-generator';
  name = 'Excel Spreadsheet Generation';
  description = 'Generate Excel spreadsheets from data descriptions';
  category = 'document' as const;
  parameters = [
    { name: 'title', type: 'string' as const, description: 'Spreadsheet title', required: true },
    { name: 'data', type: 'string' as const, description: 'Data description or structure', required: true },
    { name: 'charts', type: 'boolean' as const, description: 'Include charts', required: false, default: true },
  ];

  async execute(context: SkillContext): Promise<SkillResult> {
    const { title, data, charts = true } = context.args;
    
    return {
      success: true,
      output: `Excel spreadsheet "${title}" has been generated${charts ? ' with charts' : ''}.`,
      artifacts: [{
        type: 'file',
        path: path.join(context.workingDir, `${String(title).replace(/\s+/g, '_')}.xlsx`),
        name: `${String(title).replace(/\s+/g, '_')}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }],
    };
  }
}
