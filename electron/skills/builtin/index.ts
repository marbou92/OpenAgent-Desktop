/**
 * OpenAgent-Desktop Aether - Built-in Skills Index
 *
 * Re-exports all built-in skill definitions and executions.
 */

export { docxSkillDefinition, docxSkillExecution } from './docx-skill';
export { pdfSkillDefinition, pdfSkillExecution } from './pdf-skill';
export { xlsxSkillDefinition, xlsxSkillExecution } from './xlsx-skill';

import { docxSkillDefinition } from './docx-skill';
import { pdfSkillDefinition } from './pdf-skill';
import { xlsxSkillDefinition } from './xlsx-skill';
import type { SkillDefinition } from '../registry';

export const builtinSkillDefinitions: SkillDefinition[] = [
  docxSkillDefinition,
  pdfSkillDefinition,
  xlsxSkillDefinition,
];
