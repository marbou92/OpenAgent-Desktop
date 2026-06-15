/**
 * OpenAgent-Desktop Aether - Skill Registry
 *
 * Manages built-in and user-defined skills. Skills are reusable
 * workflow templates that can be triggered by the agent or user.
 * Built-in skills cover common tasks like component creation,
 * data analysis, document drafting, etc.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type SkillCategory = 'coding' | 'analysis' | 'writing' | 'automation' | 'design' | 'debugging';
export type SkillStatus = 'available' | 'running' | 'completed' | 'failed';

export interface SkillVariable {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'file';
  required: boolean;
  defaultValue?: any;
  options?: string[];  // For 'select' type
}

export interface SkillStep {
  description: string;
  action: string;
  args?: Record<string, any>;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  version: string;
  variables: SkillVariable[];
  steps: SkillStep[];
  tags?: string[];
  author?: string;
}

export interface SkillExecution {
  id: string;
  skillId: string;
  status: SkillStatus;
  inputs: Record<string, any>;
  results: any[];
  startedAt: string;
  completedAt?: string;
  error?: string;
}

// ─── Built-in Skill Definitions ─────────────────────────────────────────────────

const BUILTIN_SKILLS: SkillDefinition[] = [
  {
    id: 'create-component',
    name: 'Create Component',
    description: 'Generate a new UI component with best practices and proper structure',
    category: 'coding',
    version: '1.0.0',
    variables: [
      { name: 'componentName', description: 'Name of the component', type: 'string', required: true },
      { name: 'framework', description: 'Target framework', type: 'select', required: true, options: ['react', 'vue', 'svelte', 'angular'] },
      { name: 'includeTests', description: 'Generate test file', type: 'boolean', required: false, defaultValue: true },
      { name: 'includeStyles', description: 'Generate style file', type: 'boolean', required: false, defaultValue: true },
    ],
    steps: [
      { description: 'Analyze component requirements', action: 'analyze' },
      { description: 'Generate component code', action: 'generate' },
      { description: 'Generate test file', action: 'generate', args: { type: 'test' } },
      { description: 'Generate style file', action: 'generate', args: { type: 'style' } },
    ],
    tags: ['component', 'ui', 'frontend'],
  },
  {
    id: 'analyze-data',
    name: 'Analyze Data',
    description: 'Analyze a dataset and produce insights, statistics, and visualizations',
    category: 'analysis',
    version: '1.0.0',
    variables: [
      { name: 'dataSource', description: 'Path or URL to the data', type: 'string', required: true },
      { name: 'analysisType', description: 'Type of analysis', type: 'select', required: false, options: ['summary', 'trends', 'correlations', 'anomalies'], defaultValue: 'summary' },
    ],
    steps: [
      { description: 'Load data', action: 'load' },
      { description: 'Compute statistics', action: 'compute' },
      { description: 'Generate visualizations', action: 'visualize' },
    ],
    tags: ['data', 'statistics', 'visualization'],
  },
  {
    id: 'draft',
    name: 'Draft Document',
    description: 'Create a draft document from an outline or description',
    category: 'writing',
    version: '1.0.0',
    variables: [
      { name: 'documentType', description: 'Type of document', type: 'select', required: true, options: ['report', 'proposal', 'memo', 'article', 'readme'] },
      { name: 'topic', description: 'Document topic or title', type: 'string', required: true },
      { name: 'outline', description: 'Optional outline or key points', type: 'string', required: false },
    ],
    steps: [
      { description: 'Generate outline', action: 'plan' },
      { description: 'Write sections', action: 'write' },
      { description: 'Review and polish', action: 'review' },
    ],
    tags: ['document', 'writing', 'content'],
  },
  {
    id: 'refactor',
    name: 'Refactor Code',
    description: 'Analyze and refactor code for improved quality, readability, and performance',
    category: 'coding',
    version: '1.0.0',
    variables: [
      { name: 'filePath', description: 'Path to the file to refactor', type: 'file', required: true },
      { name: 'focus', description: 'Refactoring focus area', type: 'select', required: false, options: ['readability', 'performance', 'patterns', 'all'], defaultValue: 'all' },
    ],
    steps: [
      { description: 'Analyze code structure', action: 'analyze' },
      { description: 'Identify improvements', action: 'identify' },
      { description: 'Apply refactoring', action: 'transform' },
    ],
    tags: ['code', 'quality', 'refactoring'],
  },
  {
    id: 'debug',
    name: 'Debug Issue',
    description: 'Systematically diagnose and fix a bug or error',
    category: 'debugging',
    version: '1.0.0',
    variables: [
      { name: 'errorDescription', description: 'Description of the bug or error', type: 'string', required: true },
      { name: 'filePath', description: 'Optional file path where the error occurs', type: 'file', required: false },
      { name: 'errorMessage', description: 'Error message or stack trace', type: 'string', required: false },
    ],
    steps: [
      { description: 'Reproduce the issue', action: 'reproduce' },
      { description: 'Identify root cause', action: 'diagnose' },
      { description: 'Apply fix', action: 'fix' },
      { description: 'Verify fix', action: 'verify' },
    ],
    tags: ['debug', 'error', 'fix'],
  },
  {
    id: 'create-chart',
    name: 'Create Chart',
    description: 'Generate a data visualization chart from data',
    category: 'analysis',
    version: '1.0.0',
    variables: [
      { name: 'dataSource', description: 'Data to visualize', type: 'string', required: true },
      { name: 'chartType', description: 'Type of chart', type: 'select', required: true, options: ['bar', 'line', 'pie', 'scatter', 'heatmap', 'radar'] },
      { name: 'title', description: 'Chart title', type: 'string', required: false },
    ],
    steps: [
      { description: 'Load data', action: 'load' },
      { description: 'Prepare data for chart', action: 'prepare' },
      { description: 'Generate chart', action: 'generate' },
    ],
    tags: ['chart', 'visualization', 'data'],
  },
  {
    id: 'generate-report',
    name: 'Generate Report',
    description: 'Create a formatted report from analysis results or data',
    category: 'writing',
    version: '1.0.0',
    variables: [
      { name: 'title', description: 'Report title', type: 'string', required: true },
      { name: 'dataSources', description: 'Data or results to include', type: 'string', required: true },
      { name: 'format', description: 'Output format', type: 'select', required: false, options: ['pdf', 'docx', 'html', 'md'], defaultValue: 'pdf' },
    ],
    steps: [
      { description: 'Compile data', action: 'compile' },
      { description: 'Generate report sections', action: 'generate' },
      { description: 'Format output', action: 'format' },
    ],
    tags: ['report', 'document', 'format'],
  },
  {
    id: 'automate',
    name: 'Automate Task',
    description: 'Create an automation script for repetitive tasks',
    category: 'automation',
    version: '1.0.0',
    variables: [
      { name: 'taskDescription', description: 'Description of the task to automate', type: 'string', required: true },
      { name: 'language', description: 'Scripting language', type: 'select', required: false, options: ['python', 'bash', 'node', 'powershell'], defaultValue: 'python' },
    ],
    steps: [
      { description: 'Analyze task requirements', action: 'analyze' },
      { description: 'Generate automation script', action: 'generate' },
      { description: 'Add error handling', action: 'enhance' },
    ],
    tags: ['automation', 'script', 'task'],
  },
  {
    id: 'schedule',
    name: 'Schedule Task',
    description: 'Set up a scheduled or recurring task',
    category: 'automation',
    version: '1.0.0',
    variables: [
      { name: 'taskName', description: 'Name for the scheduled task', type: 'string', required: true },
      { name: 'schedule', description: 'Cron expression or schedule description', type: 'string', required: true },
      { name: 'command', description: 'Command or script to run', type: 'string', required: true },
    ],
    steps: [
      { description: 'Validate schedule', action: 'validate' },
      { description: 'Register scheduled task', action: 'register' },
    ],
    tags: ['schedule', 'cron', 'automation'],
  },
  {
    id: 'monitor',
    name: 'Monitor Process',
    description: 'Set up monitoring for a process, service, or metric',
    category: 'automation',
    version: '1.0.0',
    variables: [
      { name: 'target', description: 'What to monitor', type: 'string', required: true },
      { name: 'metric', description: 'Metric to track', type: 'string', required: false },
      { name: 'threshold', description: 'Alert threshold', type: 'string', required: false },
    ],
    steps: [
      { description: 'Configure monitoring', action: 'configure' },
      { description: 'Set up alerts', action: 'alert' },
    ],
    tags: ['monitor', 'alert', 'automation'],
  },
  {
    id: 'edit',
    name: 'Edit Document',
    description: 'Edit an existing document with specific changes',
    category: 'writing',
    version: '1.0.0',
    variables: [
      { name: 'filePath', description: 'Path to the document', type: 'file', required: true },
      { name: 'instructions', description: 'Edit instructions', type: 'string', required: true },
    ],
    steps: [
      { description: 'Read document', action: 'read' },
      { description: 'Apply edits', action: 'edit' },
    ],
    tags: ['edit', 'document', 'writing'],
  },
  {
    id: 'summarize',
    name: 'Summarize Content',
    description: 'Summarize a document, article, or text content',
    category: 'writing',
    version: '1.0.0',
    variables: [
      { name: 'content', description: 'Content to summarize', type: 'string', required: true },
      { name: 'length', description: 'Summary length', type: 'select', required: false, options: ['brief', 'medium', 'detailed'], defaultValue: 'medium' },
    ],
    steps: [
      { description: 'Analyze content', action: 'analyze' },
      { description: 'Generate summary', action: 'generate' },
    ],
    tags: ['summary', 'document', 'writing'],
  },
];

// ─── Skill Registry ─────────────────────────────────────────────────────────────

export class SkillRegistry extends EventEmitter {
  private skillsDir: string;
  private skills: Map<string, SkillDefinition> = new Map();
  private executions: Map<string, SkillExecution> = new Map();
  private initialized = false;

  constructor(skillsDir: string) {
    super();
    this.skillsDir = skillsDir;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load built-in skills
    for (const skill of BUILTIN_SKILLS) {
      this.skills.set(skill.id, skill);
    }

    // Ensure skills directory exists
    try {
      await fs.mkdir(this.skillsDir, { recursive: true });
    } catch {
      // Directory may already exist
    }

    // Load custom skills from disk
    try {
      const files = await fs.readdir(this.skillsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await fs.readFile(path.join(this.skillsDir, file), 'utf-8');
            const skill: SkillDefinition = JSON.parse(content);
            this.skills.set(skill.id, skill);
          } catch {
            // Skip invalid skill files
          }
        }
      }
    } catch {
      // No custom skills yet
    }

    this.initialized = true;
  }

  list(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  listByCategory(category: SkillCategory): SkillDefinition[] {
    return this.list().filter(s => s.category === category);
  }

  get(skillId: string): SkillDefinition | undefined {
    return this.skills.get(skillId);
  }

  async execute(skillId: string, inputs: Record<string, any>, _context?: Record<string, unknown>): Promise<SkillExecution> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    // Validate required variables
    for (const variable of skill.variables) {
      if (variable.required && (inputs[variable.name] === undefined || inputs[variable.name] === '')) {
        throw new Error(`Missing required variable: ${variable.name}`);
      }
    }

    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const execution: SkillExecution = {
      id: executionId,
      skillId,
      status: 'running',
      inputs,
      results: [],
      startedAt: new Date().toISOString(),
    };

    this.executions.set(executionId, execution);

    try {
      // Execute each step (simplified — in production, each step would invoke an LLM/tool)
      for (const step of skill.steps) {
        const result = {
          step: step.description,
          action: step.action,
          output: `Completed: ${step.description}`,
          inputs: { ...inputs, ...step.args },
        };
        execution.results.push(result);
      }

      execution.status = 'completed';
      execution.completedAt = new Date().toISOString();
    } catch (err: any) {
      execution.status = 'failed';
      execution.error = err?.message || String(err);
      execution.completedAt = new Date().toISOString();
    }

    this.emit('skill:executed', execution);
    return execution;
  }

  async addSkill(skill: SkillDefinition): Promise<void> {
    this.skills.set(skill.id, skill);
    // Persist to disk
    const filePath = path.join(this.skillsDir, `${skill.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(skill, null, 2), 'utf-8');
    this.emit('skill:added', skill);
  }

  async removeSkill(skillId: string): Promise<void> {
    if (!this.skills.has(skillId)) {
      throw new Error(`Skill not found: ${skillId}`);
    }
    this.skills.delete(skillId);
    try {
      const filePath = path.join(this.skillsDir, `${skillId}.json`);
      await fs.unlink(filePath);
    } catch {
      // File may not exist
    }
    this.emit('skill:removed', { skillId });
  }

  getExecution(executionId: string): SkillExecution | undefined {
    return this.executions.get(executionId);
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
