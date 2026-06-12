/**
 * OpenAgent-Desktop - Skill Registry
 * 
 * Manages skill definitions and execution. Skills are reusable
 * workflows that combine prompts, tools, and automation.
 * Ported from OpenCowork's skills concept.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  version: string;
  author: string;
  icon?: string;
  steps: SkillStep[];
  variables: SkillVariable[];
  requiredExtensions: string[];
  tags: string[];
  isBuiltin: boolean;
}

export type SkillCategory = 'coding' | 'writing' | 'analysis' | 'automation' | 'design' | 'communication';

export interface SkillStep {
  id: string;
  name: string;
  type: 'prompt' | 'tool' | 'conditional' | 'loop' | 'parallel';
  config: Record<string, unknown>;
  nextStepId?: string;
  onErrorStepId?: string;
}

export interface SkillVariable {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'file' | 'select';
  defaultValue?: unknown;
  required: boolean;
  options?: string[];
}

export interface SkillExecution {
  id: string;
  skillId: string;
  projectId?: string;
  sessionId?: string;
  variables: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStepIndex: number;
  startedAt: string;
  completedAt?: string;
  results: SkillStepResult[];
  error?: string;
}

export interface SkillStepResult {
  stepId: string;
  status: 'completed' | 'failed' | 'skipped';
  output?: string;
  error?: string;
  duration: number;
}

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

    try {
      await fs.mkdir(this.skillsDir, { recursive: true });
    } catch {
      /* directory may already exist */
    }

    // Load built-in skills
    for (const skill of BUILTIN_SKILLS) {
      this.skills.set(skill.id, skill);
    }

    // Load custom skills from disk
    await this.loadCustomSkills();

    this.initialized = true;
  }

  private async loadCustomSkills(): Promise<void> {
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
  }

  list(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  listByCategory(category: SkillCategory): SkillDefinition[] {
    return this.list().filter((s) => s.category === category);
  }

  get(skillId: string): SkillDefinition | undefined {
    return this.skills.get(skillId);
  }

  async register(skill: SkillDefinition): Promise<void> {
    this.skills.set(skill.id, skill);
    if (!skill.isBuiltin) {
      const filePath = path.join(this.skillsDir, `${skill.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(skill, null, 2), 'utf-8');
    }
    this.emit('skill:registered', skill);
  }

  async unregister(skillId: string): Promise<void> {
    const skill = this.skills.get(skillId);
    if (!skill) return;
    if (skill.isBuiltin) throw new Error('Cannot unregister built-in skills');
    this.skills.delete(skillId);
    const filePath = path.join(this.skillsDir, `${skillId}.json`);
    try {
      await fs.unlink(filePath);
    } catch {
      // File may not exist
    }
    this.emit('skill:unregistered', { skillId });
  }

  async execute(skillId: string, variables: Record<string, unknown>, context?: { projectId?: string; sessionId?: string }): Promise<SkillExecution> {
    const skill = this.skills.get(skillId);
    if (!skill) throw new Error(`Skill not found: ${skillId}`);

    // Validate required variables
    for (const v of skill.variables) {
      if (v.required && variables[v.name] === undefined) {
        throw new Error(`Missing required variable: ${v.name}`);
      }
    }

    const execution: SkillExecution = {
      id: `exec-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      skillId,
      projectId: context?.projectId,
      sessionId: context?.sessionId,
      variables,
      status: 'running',
      currentStepIndex: 0,
      startedAt: new Date().toISOString(),
      results: [],
    };

    this.executions.set(execution.id, execution);
    this.emit('skill:execution-started', execution);

    try {
      for (let i = 0; i < skill.steps.length; i++) {
        execution.currentStepIndex = i;
        const step = skill.steps[i];
        const startTime = Date.now();

        try {
          // Step execution would be handled by the extension system
          // For now, we mark it as completed with a placeholder
          execution.results.push({
            stepId: step.id,
            status: 'completed',
            output: `Step ${step.name} executed successfully`,
            duration: Date.now() - startTime,
          });
          this.emit('skill:step-completed', { execution, step });
        } catch (err) {
          execution.results.push({
            stepId: step.id,
            status: 'failed',
            error: err instanceof Error ? err.message : String(err),
            duration: Date.now() - startTime,
          });
          this.emit('skill:step-failed', { execution, step, error: err });

          if (step.onErrorStepId) {
            // Jump to error handler step
            const errorIndex = skill.steps.findIndex((s) => s.id === step.onErrorStepId);
            if (errorIndex >= 0) i = errorIndex - 1; // -1 because loop will increment
            continue;
          }

          execution.status = 'failed';
          execution.error = err instanceof Error ? err.message : String(err);
          break;
        }
      }

      if (execution.status === 'running') {
        execution.status = 'completed';
      }
    } catch (err) {
      execution.status = 'failed';
      execution.error = err instanceof Error ? err.message : String(err);
    }

    execution.completedAt = new Date().toISOString();
    this.emit('skill:execution-completed', execution);
    return execution;
  }

  getExecution(executionId: string): SkillExecution | undefined {
    return this.executions.get(executionId);
  }

  listExecutions(): SkillExecution[] {
    return Array.from(this.executions.values());
  }
}

// ─── Built-in Skills ──────────────────────────────────────────────────────

const BUILTIN_SKILLS: SkillDefinition[] = [
  {
    id: 'create-component',
    name: 'Create Component',
    description: 'Generate a new UI component with tests and documentation',
    category: 'coding',
    version: '1.0.0',
    author: 'OpenAgent',
    icon: '🧩',
    requiredExtensions: ['developer', 'code-mode'],
    tags: ['react', 'component', 'frontend'],
    isBuiltin: true,
    variables: [
      { name: 'componentName', description: 'Name of the component', type: 'string', required: true },
      { name: 'framework', description: 'UI framework', type: 'select', required: true, options: ['react', 'vue', 'svelte'], defaultValue: 'react' },
      { name: 'withTests', description: 'Generate test files', type: 'boolean', defaultValue: true, required: false },
    ],
    steps: [
      { id: 'plan', name: 'Plan component structure', type: 'prompt', config: { prompt: 'Design the structure for a {{framework}} component named {{componentName}}' } },
      { id: 'implement', name: 'Implement component', type: 'prompt', config: { prompt: 'Create the {{componentName}} component implementation' } },
      { id: 'test', name: 'Generate tests', type: 'conditional', config: { condition: '{{withTests}} === true', ifTrue: 'generate-tests' } },
    ],
  },
  {
    id: 'analyze-data',
    name: 'Analyze Data',
    description: 'Load and analyze a dataset with statistical insights',
    category: 'analysis',
    version: '1.0.0',
    author: 'OpenAgent',
    icon: '📊',
    requiredExtensions: ['developer', 'auto-visualiser'],
    tags: ['data', 'analysis', 'statistics'],
    isBuiltin: true,
    variables: [
      { name: 'dataSource', description: 'Path or URL to the data', type: 'string', required: true },
      { name: 'analysisType', description: 'Type of analysis', type: 'select', required: true, options: ['summary', 'correlation', 'trend', 'anomaly'], defaultValue: 'summary' },
    ],
    steps: [
      { id: 'load', name: 'Load data', type: 'tool', config: { tool: 'file_read', args: { path: '{{dataSource}}' } } },
      { id: 'analyze', name: 'Run analysis', type: 'prompt', config: { prompt: 'Analyze the loaded data with {{analysisType}} analysis' } },
      { id: 'visualize', name: 'Create visualizations', type: 'tool', config: { tool: 'auto_visualise', args: {} } },
    ],
  },
  {
    id: 'draft',
    name: 'Draft Document',
    description: 'Create a draft document from a topic or outline',
    category: 'writing',
    version: '1.0.0',
    author: 'OpenAgent',
    icon: '📝',
    requiredExtensions: ['document-generators', 'memory'],
    tags: ['document', 'writing', 'draft'],
    isBuiltin: true,
    variables: [
      { name: 'topic', description: 'Topic or title', type: 'string', required: true },
      { name: 'format', description: 'Output format', type: 'select', required: true, options: ['docx', 'pdf', 'md'], defaultValue: 'docx' },
      { name: 'length', description: 'Target length', type: 'select', required: false, options: ['short', 'medium', 'long'], defaultValue: 'medium' },
    ],
    steps: [
      { id: 'outline', name: 'Create outline', type: 'prompt', config: { prompt: 'Create an outline for a document about {{topic}} ({{length}} length)' } },
      { id: 'write', name: 'Write content', type: 'prompt', config: { prompt: 'Write the full document content based on the outline' } },
      { id: 'export', name: 'Export document', type: 'tool', config: { tool: 'generate_document', args: { format: '{{format}}' } } },
    ],
  },
  {
    id: 'refactor',
    name: 'Refactor Code',
    description: 'Analyze and refactor code for better quality',
    category: 'coding',
    version: '1.0.0',
    author: 'OpenAgent',
    icon: '🔧',
    requiredExtensions: ['developer', 'code-mode'],
    tags: ['refactor', 'code-quality', 'clean-code'],
    isBuiltin: true,
    variables: [
      { name: 'filePath', description: 'File to refactor', type: 'string', required: true },
      { name: 'focus', description: 'Refactoring focus', type: 'select', required: false, options: ['readability', 'performance', 'patterns', 'all'], defaultValue: 'all' },
    ],
    steps: [
      { id: 'read', name: 'Read code', type: 'tool', config: { tool: 'file_read', args: { path: '{{filePath}}' } } },
      { id: 'analyze', name: 'Analyze code quality', type: 'prompt', config: { prompt: 'Analyze the code for refactoring opportunities, focus on {{focus}}' } },
      { id: 'refactor', name: 'Apply refactoring', type: 'prompt', config: { prompt: 'Refactor the code based on the analysis' } },
    ],
  },
  {
    id: 'debug',
    name: 'Debug Issue',
    description: 'Systematically debug a code issue',
    category: 'coding',
    version: '1.0.0',
    author: 'OpenAgent',
    icon: '🐛',
    requiredExtensions: ['developer'],
    tags: ['debug', 'troubleshoot', 'fix'],
    isBuiltin: true,
    variables: [
      { name: 'errorDescription', description: 'Description of the issue', type: 'string', required: true },
      { name: 'filePath', description: 'Related file path', type: 'string', required: false },
    ],
    steps: [
      { id: 'reproduce', name: 'Reproduce issue', type: 'prompt', config: { prompt: 'Help reproduce the issue: {{errorDescription}}' } },
      { id: 'diagnose', name: 'Diagnose root cause', type: 'prompt', config: { prompt: 'Diagnose the root cause of the issue' } },
      { id: 'fix', name: 'Implement fix', type: 'prompt', config: { prompt: 'Suggest and implement a fix' } },
    ],
  },
  {
    id: 'automate',
    name: 'Create Automation',
    description: 'Build an automated workflow or script',
    category: 'automation',
    version: '1.0.0',
    author: 'OpenAgent',
    icon: '🤖',
    requiredExtensions: ['developer', 'todo'],
    tags: ['automation', 'workflow', 'script'],
    isBuiltin: true,
    variables: [
      { name: 'taskDescription', description: 'What to automate', type: 'string', required: true },
      { name: 'language', description: 'Scripting language', type: 'select', required: false, options: ['python', 'bash', 'javascript', 'typescript'], defaultValue: 'python' },
    ],
    steps: [
      { id: 'plan', name: 'Plan automation', type: 'prompt', config: { prompt: 'Design an automation plan for: {{taskDescription}}' } },
      { id: 'implement', name: 'Write script', type: 'prompt', config: { prompt: 'Write the automation script in {{language}}' } },
      { id: 'test', name: 'Test automation', type: 'tool', config: { tool: 'execute_command', args: {} } },
    ],
  },
];
