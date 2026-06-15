/**
 * OpenAgent-Desktop Aether - XLSX Skill
 *
 * Generates Excel spreadsheets (.xlsx) from user instructions.
 */

import type { SkillDefinition, SkillExecution } from '../registry';

export const xlsxSkillDefinition: SkillDefinition = {
  id: 'generate-xlsx',
  name: 'Generate XLSX',
  description: 'Create an Excel spreadsheet (.xlsx) from data or a description',
  category: 'data',
  version: '1.0.0',
  enabled: true,
  isBuiltin: true,
};

export const xlsxSkillExecution: SkillExecution = async (input, _context) => {
  const { title, data, template } = input;
  // Stub: actual spreadsheet generation handled by the agent via external tools
  return {
    status: 'completed',
    title: title ?? 'Untitled Spreadsheet',
    data: data ?? [],
    template: template ?? 'default',
    format: 'xlsx',
  };
};

export default {
  definition: xlsxSkillDefinition,
  execute: xlsxSkillExecution,
};
