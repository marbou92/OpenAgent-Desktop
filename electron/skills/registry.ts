/**
 * OpenAgent-Desktop - Skill Registry
 *
 * Central registry for managing and executing skills (reusable automation templates).
 * Skills are persisted as JSON files on disk and can be parameterized with variables.
 * Built-in skills are registered automatically on initialize().
 *
 * API:
 *   new SkillRegistry(storagePath)  — create a registry rooted at the given directory
 *   .initialize()                   — scan disk, load skill definitions, register built-ins
 *   .list()                         — return all registered skills
 *   .listByCategory(category)       — return skills filtered by category
 *   .get(id)                        — look up a single skill by id
 *   .execute(id, variables, ctx?)   — instantiate and run a skill with the given variables
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SkillStep {
  id: string;
  label: string;
  action: string;
  params: Record<string, unknown>;
  condition?: string;
  delaySeconds?: number;
  continueOnError?: boolean;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  category?: string;
  tags?: string[];
  variables?: SkillVariable[];
  steps: SkillStep[];
  isBuiltIn?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SkillVariable {
  name: string;
  label?: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  default?: unknown;
  required?: boolean;
  options?: string[];
  description?: string;
}

export interface SkillExecution {
  executionId: string;
  skillId: string;
  variables: Record<string, unknown>;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  results: SkillStepResult[];
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

export interface SkillStepResult {
  stepId: string;
  status: 'success' | 'failure' | 'skipped';
  output?: unknown;
  error?: string;
  durationMs?: number;
}

// ─── Built-in Skill Definitions ────────────────────────────────────────────────

const BUILT_IN_SKILLS: SkillDefinition[] = [
  {
    id: 'create-component',
    name: 'Create Component',
    description: 'Generate a new UI component with the specified framework and styling',
    version: '1.0.0',
    author: 'OpenAgent',
    category: 'coding',
    tags: ['component', 'ui', 'scaffold'],
    isBuiltIn: true,
    variables: [
      { name: 'componentName', label: 'Component Name', type: 'string', required: true, description: 'Name of the component to create' },
      { name: 'framework', label: 'Framework', type: 'select', options: ['react', 'vue', 'svelte', 'angular'], required: true, description: 'UI framework to use' },
      { name: 'styling', label: 'Styling', type: 'select', options: ['css', 'tailwind', 'styled-components', 'css-modules'], default: 'tailwind', description: 'Styling approach' },
    ],
    steps: [
      { id: 'plan', label: 'Plan Component', action: 'plan', params: { prompt: 'Create a {{componentName}} component using {{framework}} with {{styling}} styling' } },
      { id: 'generate', label: 'Generate Code', action: 'write-file', params: { path: 'src/components/{{componentName}}.tsx', content: '{{componentCode}}' } },
      { id: 'test', label: 'Generate Test', action: 'write-file', params: { path: 'src/components/__tests__/{{componentName}}.test.tsx', content: '{{testCode}}' } },
      { id: 'index', label: 'Update Index', action: 'append-file', params: { path: 'src/components/index.ts', content: "export { default as {{componentName}} } from './{{componentName}}';" } },
    ],
  },
  {
    id: 'analyze-data',
    name: 'Analyze Data',
    description: 'Analyze a dataset and generate insights, statistics, and visualizations',
    version: '1.0.0',
    author: 'OpenAgent',
    category: 'analysis',
    tags: ['data', 'analysis', 'statistics'],
    isBuiltIn: true,
    variables: [
      { name: 'dataPath', label: 'Data Path', type: 'string', required: true, description: 'Path to the data file' },
      { name: 'analysisType', label: 'Analysis Type', type: 'select', options: ['summary', 'correlation', 'trend', 'anomaly'], default: 'summary', description: 'Type of analysis to perform' },
    ],
    steps: [
      { id: 'load', label: 'Load Data', action: 'read-file', params: { path: '{{dataPath}}' } },
      { id: 'profile', label: 'Profile Data', action: 'analyze', params: { type: '{{analysisType}}' } },
      { id: 'visualize', label: 'Create Visualizations', action: 'generate-chart', params: { format: 'png' } },
      { id: 'report', label: 'Generate Report', action: 'write-file', params: { path: 'analysis-report.md', content: '{{reportContent}}' } },
    ],
  },
  {
    id: 'draft',
    name: 'Draft Document',
    description: 'Draft a document from a template with variable substitution',
    version: '1.0.0',
    author: 'OpenAgent',
    category: 'writing',
    tags: ['document', 'template', 'writing'],
    isBuiltIn: true,
    variables: [
      { name: 'templateName', label: 'Template', type: 'select', options: ['readme', 'changelog', 'api-doc', 'design-doc', 'prd'], required: true, description: 'Document template to use' },
      { name: 'title', label: 'Title', type: 'string', required: true, description: 'Document title' },
    ],
    steps: [
      { id: 'template', label: 'Load Template', action: 'load-template', params: { name: '{{templateName}}' } },
      { id: 'fill', label: 'Fill Template', action: 'substitute', params: { title: '{{title}}' } },
      { id: 'save', label: 'Save Document', action: 'write-file', params: { path: '{{title}}.md', content: '{{documentContent}}' } },
    ],
  },
  {
    id: 'debug-error',
    name: 'Debug Error',
    description: 'Analyze an error message and suggest fixes',
    version: '1.0.0',
    author: 'OpenAgent',
    category: 'coding',
    tags: ['debug', 'error', 'fix'],
    isBuiltIn: true,
    variables: [
      { name: 'errorMessage', label: 'Error Message', type: 'string', required: true, description: 'The error message to debug' },
      { name: 'language', label: 'Language', type: 'select', options: ['typescript', 'python', 'rust', 'go', 'java'], default: 'typescript', description: 'Programming language' },
    ],
    steps: [
      { id: 'analyze', label: 'Analyze Error', action: 'analyze', params: { error: '{{errorMessage}}', language: '{{language}}' } },
      { id: 'search', label: 'Search Solutions', action: 'web-search', params: { query: '{{errorMessage}} {{language}} fix' } },
      { id: 'suggest', label: 'Suggest Fix', action: 'generate', params: { prompt: 'Suggest fix for {{errorMessage}} in {{language}}' } },
    ],
  },
  {
    id: 'code-review',
    name: 'Code Review',
    description: 'Review code changes and provide feedback',
    version: '1.0.0',
    author: 'OpenAgent',
    category: 'coding',
    tags: ['review', 'quality', 'feedback'],
    isBuiltIn: true,
    variables: [
      { name: 'filePath', label: 'File Path', type: 'string', required: true, description: 'Path to the file to review' },
      { name: 'focus', label: 'Focus Area', type: 'select', options: ['security', 'performance', 'readability', 'all'], default: 'all', description: 'Review focus area' },
    ],
    steps: [
      { id: 'read', label: 'Read Code', action: 'read-file', params: { path: '{{filePath}}' } },
      { id: 'review', label: 'Review Code', action: 'analyze', params: { focus: '{{focus}}' } },
      { id: 'feedback', label: 'Generate Feedback', action: 'generate', params: { prompt: 'Review the code in {{filePath}} focusing on {{focus}}' } },
    ],
  },
  {
    id: 'summarize',
    name: 'Summarize Content',
    description: 'Summarize long-form content into key points',
    version: '1.0.0',
    author: 'OpenAgent',
    category: 'analysis',
    tags: ['summary', 'content', 'distill'],
    isBuiltIn: true,
    variables: [
      { name: 'sourcePath', label: 'Source Path', type: 'string', required: true, description: 'Path or URL to the content' },
      { name: 'length', label: 'Summary Length', type: 'select', options: ['brief', 'medium', 'detailed'], default: 'medium', description: 'Desired summary length' },
    ],
    steps: [
      { id: 'load', label: 'Load Content', action: 'read-file', params: { path: '{{sourcePath}}' } },
      { id: 'summarize', label: 'Summarize', action: 'generate', params: { prompt: 'Summarize the content in {{length}} form' } },
      { id: 'save', label: 'Save Summary', action: 'write-file', params: { path: 'summary.md', content: '{{summaryContent}}' } },
    ],
  },
];

// ─── Registry ──────────────────────────────────────────────────────────────────

export class SkillRegistry extends EventEmitter {
  private storagePath: string;
  private skills: Map<string, SkillDefinition> = new Map();

  constructor(storagePath: string) {
    super();
    this.storagePath = storagePath;
  }

  async initialize(): Promise<void> {
    for (const skill of BUILT_IN_SKILLS) {
      if (!this.skills.has(skill.id)) {
        this.skills.set(skill.id, {
          ...skill,
          createdAt: skill.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    try {
      await fs.mkdir(this.storagePath, { recursive: true });
    } catch {
      // Directory may already exist
    }

    const files = await fs.readdir(this.storagePath).catch(() => [] as string[]);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(this.storagePath, file), 'utf-8');
        const def: SkillDefinition = JSON.parse(raw);
        if (def.id) {
          this.skills.set(def.id, def);
        }
      } catch {
        // Skip malformed skill files silently
      }
    }

    this.emit('initialized', { count: this.skills.size });
  }

  list(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  listByCategory(category: string): SkillDefinition[] {
    return this.list().filter((s) => s.category === category);
  }

  get(skillId: string): SkillDefinition | undefined {
    return this.skills.get(skillId);
  }

  async execute(
    skillId: string,
    variables: Record<string, unknown> = {},
    context?: Record<string, unknown>,
  ): Promise<SkillExecution> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    if (skill.variables) {
      for (const v of skill.variables) {
        if (v.required && !(v.name in variables) && v.default === undefined) {
          throw new Error(`Missing required variable: ${v.name}`);
        }
      }
    }

    const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const execution: SkillExecution = {
      executionId,
      skillId,
      variables,
      status: 'running',
      results: [],
      startedAt: new Date().toISOString(),
    };

    this.emit('execution:started', { executionId, skillId });

    for (const step of skill.steps) {
      if (step.condition) {
        try {
          const shouldRun = this.evaluateCondition(step.condition, variables);
          if (!shouldRun) {
            execution.results.push({ stepId: step.id, status: 'skipped' });
            continue;
          }
        } catch {
          execution.results.push({ stepId: step.id, status: 'skipped' });
          continue;
        }
      }

      if (step.delaySeconds && step.delaySeconds > 0) {
        await new Promise((resolve) => setTimeout(resolve, step.delaySeconds! * 1000));
      }

      const startMs = Date.now();
      try {
        const resolvedParams = this.substituteVariables(step.params, variables);
        execution.results.push({
          stepId: step.id,
          status: 'success',
          output: { action: step.action, params: resolvedParams, context: context ?? null },
          durationMs: Date.now() - startMs,
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        execution.results.push({
          stepId: step.id,
          status: 'failure',
          error: errorMsg,
          durationMs: Date.now() - startMs,
        });

        if (!step.continueOnError) {
          execution.status = 'failed';
          execution.error = `Step ${step.id} failed: ${errorMsg}`;
          break;
        }
      }
    }

    if (execution.status === 'running') {
      execution.status = 'completed';
    }
    execution.finishedAt = new Date().toISOString();

    this.emit('execution:completed', { executionId, skillId, status: execution.status });
    return execution;
  }

  async register(definition: SkillDefinition): Promise<void> {
    const def = {
      ...definition,
      createdAt: definition.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.skills.set(def.id, def);
    await this.persist(def);
    this.emit('skill:registered', { skillId: def.id });
  }

  async unregister(skillId: string): Promise<boolean> {
    if (!this.skills.has(skillId)) return false;
    this.skills.delete(skillId);
    try {
      await fs.unlink(path.join(this.storagePath, `${skillId}.json`));
    } catch {
      // File may already be gone
    }
    this.emit('skill:unregistered', { skillId });
    return true;
  }

  private async persist(def: SkillDefinition): Promise<void> {
    await fs.mkdir(this.storagePath, { recursive: true });
    await fs.writeFile(
      path.join(this.storagePath, `${def.id}.json`),
      JSON.stringify(def, null, 2),
      'utf-8',
    );
  }

  private substituteVariables(value: unknown, variables: Record<string, unknown>): unknown {
    if (typeof value === 'string') {
      return value.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
        return key in variables ? String(variables[key]) : `{{${key}}}`;
      });
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.substituteVariables(item, variables));
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        result[k] = this.substituteVariables(v, variables);
      }
      return result;
    }
    return value;
  }

  private evaluateCondition(condition: string, variables: Record<string, unknown>): boolean {
    const match = condition.match(/^\{\{(\w+)\}\}$/);
    if (match) {
      const val = variables[match[1]];
      return !!val;
    }
    return condition.toLowerCase() !== 'false';
  }
}
