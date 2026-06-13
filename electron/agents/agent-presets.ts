/**
 * OpenAgent-Desktop - Agent Presets System
 *
 * Pre-configured agent templates for common workflows.
 * Like Goose's recipe system and OpenCode's custom agents.
 * Provides built-in presets and allows users to create custom ones.
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AgentDefinition, AgentMode, ToolPermissions, DEFAULT_BUILD_PERMISSIONS, DEFAULT_PLAN_PERMISSIONS, DEFAULT_CHAT_PERMISSIONS, DEFAULT_SMART_PERMISSIONS } from './types';

// ─── Preset Interface ──────────────────────────────────────────────────────────

export interface AgentPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  mode: AgentMode;
  prompt: string;
  permissions: ToolPermissions;
  model?: string;
  tags: string[];
  isBuiltIn?: boolean;
}

// ─── Built-in Presets ──────────────────────────────────────────────────────────

const BUILT_IN_PRESETS: AgentPreset[] = [
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    description: 'Analyzes code for quality, patterns, and potential issues. Read-only mode that provides detailed feedback.',
    icon: '🔍',
    mode: AgentMode.plan,
    prompt: `You are a senior code reviewer. Analyze the provided code for:
- Code quality and readability
- Potential bugs or edge cases
- Performance concerns
- Security vulnerabilities
- Best practices and patterns
- Test coverage gaps

Provide constructive feedback with specific suggestions. Rate severity as: 🔴 Critical, 🟡 Warning, 🟢 Suggestion.`,
    permissions: DEFAULT_PLAN_PERMISSIONS,
    tags: ['review', 'quality', 'analysis'],
    isBuiltIn: true,
  },
  {
    id: 'bug-fixer',
    name: 'Bug Fixer',
    description: 'Diagnoses and fixes bugs with full tool access. Starts by analyzing the error, then implements the fix.',
    icon: '🐛',
    mode: AgentMode.build,
    prompt: `You are an expert bug fixer. When presented with a bug:
1. First, reproduce and understand the issue by reading relevant code and error messages
2. Identify the root cause
3. Propose a fix and explain your reasoning
4. Implement the fix
5. Verify the fix resolves the issue

Always explain what went wrong and why your fix works. Be methodical.`,
    permissions: DEFAULT_BUILD_PERMISSIONS,
    tags: ['bug', 'fix', 'debug'],
    isBuiltIn: true,
  },
  {
    id: 'documentation-writer',
    name: 'Documentation Writer',
    description: 'Generates and improves documentation. Creates README files, API docs, code comments, and guides.',
    icon: '📝',
    mode: AgentMode.plan,
    prompt: `You are a documentation specialist. Your job is to:
- Write clear, concise documentation
- Create README files with proper structure
- Document APIs with parameter descriptions and examples
- Add inline code comments where helpful
- Generate usage guides and tutorials

Follow documentation best practices: use active voice, include examples, and structure content with clear headings.`,
    permissions: DEFAULT_PLAN_PERMISSIONS,
    tags: ['documentation', 'docs', 'readme'],
    isBuiltIn: true,
  },
  {
    id: 'test-generator',
    name: 'Test Generator',
    description: 'Generates unit and integration tests for existing code. Analyzes code structure and creates comprehensive test suites.',
    icon: '🧪',
    mode: AgentMode.build,
    prompt: `You are a test engineering specialist. Your job is to:
- Analyze existing code to understand what needs testing
- Generate comprehensive unit tests covering:
  - Happy path scenarios
  - Edge cases and boundary conditions
  - Error handling
  - Type validation
- Create integration tests where appropriate
- Ensure tests are isolated, deterministic, and fast
- Use appropriate testing frameworks and patterns

Write tests that are easy to understand and maintain.`,
    permissions: DEFAULT_BUILD_PERMISSIONS,
    tags: ['test', 'testing', 'unit-test', 'integration'],
    isBuiltIn: true,
  },
  {
    id: 'code-explainer',
    name: 'Code Explainer',
    description: 'Explains code in plain language. Great for learning, onboarding, and understanding unfamiliar codebases.',
    icon: '💡',
    mode: AgentMode.chat,
    prompt: `You are a patient code explainer. Your job is to:
- Explain code in clear, plain language
- Break down complex logic step by step
- Use analogies to make concepts accessible
- Highlight important patterns and design decisions
- Explain the "why" behind code choices, not just the "what"

Adapt your explanation level to the user's expertise. Start simple, then add depth.`,
    permissions: DEFAULT_CHAT_PERMISSIONS,
    tags: ['explain', 'learn', 'understand', 'onboarding'],
    isBuiltIn: true,
  },
  {
    id: 'refactoring-assistant',
    name: 'Refactoring Assistant',
    description: 'Helps refactor code safely with step-by-step approvals. Suggests improvements while maintaining behavior.',
    icon: '🔧',
    mode: AgentMode.smart,
    prompt: `You are a refactoring specialist. Your job is to:
- Identify code smells and improvement opportunities
- Suggest refactoring patterns (Extract Method, Replace Conditional with Polymorphism, etc.)
- Make changes incrementally, one step at a time
- Ensure behavior is preserved after each change
- Explain the benefit of each refactoring

Safety first: small, verifiable changes. Never refactor multiple things at once.`,
    permissions: DEFAULT_SMART_PERMISSIONS,
    tags: ['refactor', 'clean-code', 'improve'],
    isBuiltIn: true,
  },
  {
    id: 'security-auditor',
    name: 'Security Auditor',
    description: 'Scans code for security vulnerabilities, misconfigurations, and compliance issues. Read-only analysis mode.',
    icon: '🛡️',
    mode: AgentMode.plan,
    prompt: `You are a security auditor specializing in application security. Analyze code for:
- Injection vulnerabilities (SQL, XSS, command injection)
- Authentication and authorization flaws
- Sensitive data exposure
- Insecure configurations
- Dependency vulnerabilities
- OWASP Top 10 issues
- Cryptographic weaknesses
- Input validation gaps

Rate findings as: 🔴 Critical, 🟡 High, 🟠 Medium, 🟢 Low.
Provide remediation advice for each finding.`,
    permissions: DEFAULT_PLAN_PERMISSIONS,
    tags: ['security', 'audit', 'vulnerability', 'owasp'],
    isBuiltIn: true,
  },
  {
    id: 'project-scaffolder',
    name: 'Project Scaffolder',
    description: 'Sets up new projects with best-practice configurations. Creates project structure, config files, and boilerplate.',
    icon: '🏗️',
    mode: AgentMode.build,
    prompt: `You are a project scaffolding specialist. Your job is to:
- Set up project structures following best practices
- Create configuration files (tsconfig, eslint, prettier, etc.)
- Generate boilerplate code
- Set up build and test pipelines
- Configure development environments
- Add appropriate .gitignore and README

Follow the conventions of the target framework/language. Ensure the project starts in a working state.`,
    permissions: DEFAULT_BUILD_PERMISSIONS,
    tags: ['scaffold', 'project', 'setup', 'boilerplate'],
    isBuiltIn: true,
  },
  {
    id: 'git-assistant',
    name: 'Git Assistant',
    description: 'Helps with Git operations: commit messages, branching strategies, conflict resolution, and history analysis.',
    icon: '📦',
    mode: AgentMode.smart,
    prompt: `You are a Git workflow specialist. Help with:
- Writing clear, conventional commit messages
- Analyzing git history and diffs
- Resolving merge conflicts
- Branching strategy recommendations
- Interactive rebase guidance
- Cherry-picking and reverting changes
- Repository cleanup

Always explain git commands before running them. Prefer safe operations.`,
    permissions: DEFAULT_SMART_PERMISSIONS,
    tags: ['git', 'version-control', 'commit'],
    isBuiltIn: true,
  },
  {
    id: 'api-designer',
    name: 'API Designer',
    description: 'Designs and implements REST/GraphQL APIs with proper schemas, validation, and documentation.',
    icon: '🔌',
    mode: AgentMode.build,
    prompt: `You are an API design specialist. Your job is to:
- Design RESTful or GraphQL APIs following best practices
- Implement API endpoints with proper validation
- Create request/response schemas
- Add error handling and status codes
- Write API documentation
- Implement rate limiting and security middleware
- Design idempotent operations

Follow API design principles: consistency, predictability, and developer experience.`,
    permissions: DEFAULT_BUILD_PERMISSIONS,
    tags: ['api', 'rest', 'graphql', 'backend'],
    isBuiltIn: true,
  },
];

// ─── Preset Manager ─────────────────────────────────────────────────────────────

export class AgentPresetManager extends EventEmitter {
  private presets: Map<string, AgentPreset> = new Map();
  private configDir: string;
  private presetsFile: string;

  constructor() {
    super();
    this.configDir = path.join(os.homedir(), '.openagent');
    this.presetsFile = path.join(this.configDir, 'agent-presets.json');
    this.registerBuiltIns();
  }

  private registerBuiltIns(): void {
    for (const preset of BUILT_IN_PRESETS) {
      this.presets.set(preset.id, preset);
    }
  }

  /**
   * Initialize the preset manager — load custom presets from disk.
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true });
    await this.loadCustomPresets();
  }

  private async loadCustomPresets(): Promise<void> {
    try {
      const content = await fs.readFile(this.presetsFile, 'utf-8');
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        for (const preset of data) {
          if (preset.id && preset.name && preset.mode) {
            preset.isBuiltIn = false;
            this.presets.set(preset.id, preset);
          }
        }
      }
    } catch {
      // File doesn't exist or is malformed — that's fine
    }
  }

  private async saveCustomPresets(): Promise<void> {
    const customPresets = Array.from(this.presets.values()).filter((p) => !p.isBuiltIn);
    await fs.mkdir(this.configDir, { recursive: true });
    await fs.writeFile(
      this.presetsFile,
      JSON.stringify(customPresets, null, 2),
      'utf-8',
    );
  }

  /**
   * List all presets (built-in + custom).
   */
  list(): AgentPreset[] {
    return Array.from(this.presets.values());
  }

  /**
   * List only built-in presets.
   */
  listBuiltIn(): AgentPreset[] {
    return Array.from(this.presets.values()).filter((p) => p.isBuiltIn);
  }

  /**
   * List only custom presets.
   */
  listCustom(): AgentPreset[] {
    return Array.from(this.presets.values()).filter((p) => !p.isBuiltIn);
  }

  /**
   * List presets by tag.
   */
  listByTag(tag: string): AgentPreset[] {
    return Array.from(this.presets.values()).filter((p) =>
      p.tags.some((t) => t.toLowerCase() === tag.toLowerCase()),
    );
  }

  /**
   * List presets by mode.
   */
  listByMode(mode: AgentMode): AgentPreset[] {
    return Array.from(this.presets.values()).filter((p) => p.mode === mode);
  }

  /**
   * Get a specific preset by ID.
   */
  get(presetId: string): AgentPreset | undefined {
    return this.presets.get(presetId);
  }

  /**
   * Apply a preset — convert it into an AgentDefinition suitable for the AgentRegistry.
   */
  apply(presetId: string): AgentDefinition {
    const preset = this.presets.get(presetId);
    if (!preset) {
      throw new Error(`Preset not found: ${presetId}`);
    }

    return {
      id: `preset-${preset.id}`,
      name: preset.name,
      mode: preset.mode,
      description: preset.description,
      prompt: preset.prompt,
      model: preset.model,
      permissions: { ...preset.permissions },
      isBuiltIn: false,
      color: this.getColorForMode(preset.mode),
    };
  }

  /**
   * Create a custom preset.
   */
  async createCustomPreset(preset: Omit<AgentPreset, 'isBuiltIn'>): Promise<AgentPreset> {
    if (this.presets.has(preset.id)) {
      throw new Error(`Preset already exists: ${preset.id}`);
    }

    const newPreset: AgentPreset = {
      ...preset,
      isBuiltIn: false,
    };

    this.presets.set(preset.id, newPreset);
    await this.saveCustomPresets();
    this.emit('preset:created', newPreset);
    return newPreset;
  }

  /**
   * Update a custom preset.
   */
  async update(presetId: string, updates: Partial<AgentPreset>): Promise<AgentPreset> {
    const existing = this.presets.get(presetId);
    if (!existing) {
      throw new Error(`Preset not found: ${presetId}`);
    }
    if (existing.isBuiltIn) {
      throw new Error('Cannot modify built-in presets');
    }

    const updated: AgentPreset = {
      ...existing,
      ...updates,
      id: presetId,
      isBuiltIn: false,
    };

    this.presets.set(presetId, updated);
    await this.saveCustomPresets();
    this.emit('preset:updated', updated);
    return updated;
  }

  /**
   * Delete a custom preset.
   */
  async delete(presetId: string): Promise<void> {
    const preset = this.presets.get(presetId);
    if (!preset) {
      throw new Error(`Preset not found: ${presetId}`);
    }
    if (preset.isBuiltIn) {
      throw new Error('Cannot delete built-in presets');
    }

    this.presets.delete(presetId);
    await this.saveCustomPresets();
    this.emit('preset:deleted', { presetId });
  }

  /**
   * Import presets from a JSON string.
   */
  async importPresets(jsonString: string): Promise<AgentPreset[]> {
    const data = JSON.parse(jsonString);
    const imported: AgentPreset[] = [];

    const presets = Array.isArray(data) ? data : [data];
    for (const presetData of presets) {
      if (!presetData.id || !presetData.name || !presetData.mode) {
        continue;
      }

      // Avoid overwriting built-in presets
      const existing = this.presets.get(presetData.id);
      if (existing?.isBuiltIn) {
        continue;
      }

      const preset: AgentPreset = {
        ...presetData,
        isBuiltIn: false,
      };
      this.presets.set(preset.id, preset);
      imported.push(preset);
    }

    if (imported.length > 0) {
      await this.saveCustomPresets();
      this.emit('presets:imported', imported);
    }

    return imported;
  }

  /**
   * Export presets to a JSON string.
   * @param presetIds - Specific preset IDs to export, or undefined for all custom presets.
   */
  exportPresets(presetIds?: string[]): string {
    let presets: AgentPreset[];

    if (presetIds) {
      presets = presetIds
        .map((id) => this.presets.get(id))
        .filter((p): p is AgentPreset => p !== undefined);
    } else {
      presets = this.listCustom();
    }

    return JSON.stringify(presets, null, 2);
  }

  /**
   * Search presets by name, description, or tags.
   */
  search(query: string): AgentPreset[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.presets.values()).filter((p) => {
      const nameMatch = p.name.toLowerCase().includes(lowerQuery);
      const descMatch = p.description.toLowerCase().includes(lowerQuery);
      const tagMatch = p.tags.some((t) => t.toLowerCase().includes(lowerQuery));
      return nameMatch || descMatch || tagMatch;
    });
  }

  /**
   * Get a color for a given mode (used when applying presets as agents).
   */
  private getColorForMode(mode: AgentMode): string {
    const colors: Record<AgentMode, string> = {
      [AgentMode.build]: '#22c55e',
      [AgentMode.plan]: '#3b82f6',
      [AgentMode.chat]: '#8b5cf6',
      [AgentMode.smart]: '#f59e0b',
    };
    return colors[mode] || '#8b5cf6';
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────────

let presetManagerInstance: AgentPresetManager | null = null;

export function getAgentPresetManager(): AgentPresetManager {
  if (!presetManagerInstance) {
    presetManagerInstance = new AgentPresetManager();
  }
  return presetManagerInstance;
}

export function setAgentPresetManager(manager: AgentPresetManager): void {
  presetManagerInstance = manager;
}
