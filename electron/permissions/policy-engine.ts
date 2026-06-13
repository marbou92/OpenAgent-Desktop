/**
 * OpenAgent-Desktop - Permission Policy Engine
 *
 * Manages permission policies that combine rules, conditions, and agent modes.
 * Like Goose's SmartApprove and OpenCode's granular permissions.
 * Supports policy templates and policy inheritance.
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { PermissionLevel, PermissionRule } from './types';
import { WildcardMatcher, WildcardPattern } from './wildcard-matcher';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PolicyCondition {
  type: 'time' | 'session_count' | 'tool_count' | 'error_count' | 'custom';
  operator: 'lt' | 'gt' | 'eq' | 'lte' | 'gte' | 'between' | 'in';
  value: number | string | number[] | string[];
  /** For 'between' operator, value is [min, max] */
  secondaryValue?: number | string;
  description?: string;
  enabled: boolean;
}

export interface PermissionPolicy {
  id: string;
  name: string;
  description: string;
  rules: PolicyRule[];
  conditions: PolicyCondition[];
  agentMode: AgentMode;
  isDefault: boolean;
  isBuiltIn: boolean;
  inheritsFrom?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyRule {
  pattern: string;
  level: PermissionLevel;
  reason?: string;
  category?: string;
  priority?: number;
}

export interface PolicyTemplate {
  id: string;
  name: string;
  description: string;
  agentMode: AgentMode;
  rules: PolicyRule[];
  conditions: PolicyCondition[];
  icon: string;
  color: string;
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  level: PermissionLevel;
  policyId: string;
  policyName: string;
  matchedRule?: PolicyRule;
  conditionResults: ConditionResult[];
  explanation: string;
}

export interface ConditionResult {
  condition: PolicyCondition;
  passed: boolean;
  value: unknown;
}

export type AgentMode = 'build' | 'plan' | 'chat' | 'smart' | 'custom';

export interface EvaluationContext {
  sessionId?: string;
  sessionCount?: number;
  toolCallCount?: number;
  errorCount?: number;
  currentTime?: Date;
  customContext?: Record<string, unknown>;
}

// ─── Built-in Policy Templates ────────────────────────────────────────────────

const BUILTIN_TEMPLATES: PolicyTemplate[] = [
  {
    id: 'template-full-autonomy',
    name: 'Full Autonomy',
    description: 'Build mode — allow all tools, ask for destructive operations',
    agentMode: 'build',
    icon: '⚡',
    color: '#22c55e',
    rules: [
      { pattern: '*', level: 'allow', reason: 'Build mode: all tools allowed by default' },
      { pattern: 'bash:rm -rf *', level: 'ask', reason: 'Destructive rm commands require confirmation', category: 'bash', priority: 10 },
      { pattern: 'bash:sudo *', level: 'ask', reason: 'Sudo commands require confirmation', category: 'bash', priority: 10 },
      { pattern: 'bash:shutdown*', level: 'deny', reason: 'System shutdown is denied', category: 'bash', priority: 20 },
      { pattern: 'bash:reboot*', level: 'deny', reason: 'System reboot is denied', category: 'bash', priority: 20 },
      { pattern: 'edit:/etc/*', level: 'ask', reason: 'Editing system config requires confirmation', category: 'file', priority: 10 },
      { pattern: 'edit:/system/*', level: 'deny', reason: 'Editing system files is denied', category: 'file', priority: 20 },
      { pattern: 'write:/etc/*', level: 'ask', reason: 'Writing system config requires confirmation', category: 'file', priority: 10 },
      { pattern: 'write:/system/*', level: 'deny', reason: 'Writing system files is denied', category: 'file', priority: 20 },
    ],
    conditions: [],
  },
  {
    id: 'template-read-only',
    name: 'Read Only',
    description: 'Plan mode — deny writes, allow reads and analysis',
    agentMode: 'plan',
    icon: '📋',
    color: '#3b82f6',
    rules: [
      { pattern: '*', level: 'deny', reason: 'Plan mode: deny all by default' },
      { pattern: 'read', level: 'allow', reason: 'Reading files is safe' },
      { pattern: 'glob', level: 'allow', reason: 'Searching files is safe' },
      { pattern: 'grep', level: 'allow', reason: 'Grep is safe' },
      { pattern: 'bash:git *', level: 'allow', reason: 'Git read operations are safe' },
      { pattern: 'bash:ls *', level: 'allow', reason: 'Listing files is safe' },
      { pattern: 'bash:cat *', level: 'allow', reason: 'Reading files is safe' },
      { pattern: 'bash:find *', level: 'allow', reason: 'Finding files is safe' },
      { pattern: 'bash:head *', level: 'allow', reason: 'Reading file heads is safe' },
      { pattern: 'bash:tail *', level: 'allow', reason: 'Reading file tails is safe' },
      { pattern: 'bash:wc *', level: 'allow', reason: 'Counting is safe' },
      { pattern: 'bash:tree *', level: 'allow', reason: 'Tree is safe' },
      { pattern: 'edit', level: 'ask', reason: 'Editing requires confirmation in plan mode' },
      { pattern: 'write', level: 'ask', reason: 'Writing requires confirmation in plan mode' },
      { pattern: 'bash', level: 'ask', reason: 'Other bash commands require confirmation' },
    ],
    conditions: [],
  },
  {
    id: 'template-safe-mode',
    name: 'Safe Mode',
    description: 'Smart mode — ask for sensitive, allow safe operations',
    agentMode: 'smart',
    icon: '🛡️',
    color: '#f59e0b',
    rules: [
      { pattern: '*', level: 'ask', reason: 'Smart mode: ask for all by default' },
      { pattern: 'read', level: 'allow', reason: 'Reading files is safe' },
      { pattern: 'glob', level: 'allow', reason: 'Searching files is safe' },
      { pattern: 'grep', level: 'allow', reason: 'Grep is safe' },
      { pattern: 'bash:git status*', level: 'allow', reason: 'Git status is safe' },
      { pattern: 'bash:git diff*', level: 'allow', reason: 'Git diff is safe' },
      { pattern: 'bash:git log*', level: 'allow', reason: 'Git log is safe' },
      { pattern: 'bash:ls *', level: 'allow', reason: 'Listing files is safe' },
      { pattern: 'bash:cat *', level: 'allow', reason: 'Reading files is safe' },
      { pattern: 'bash:node --version*', level: 'allow', reason: 'Version check is safe' },
      { pattern: 'bash:python --version*', level: 'allow', reason: 'Version check is safe' },
      { pattern: 'edit', level: 'ask', reason: 'Editing requires confirmation' },
      { pattern: 'write', level: 'ask', reason: 'Writing requires confirmation' },
      { pattern: 'bash', level: 'ask', reason: 'Bash commands require confirmation' },
    ],
    conditions: [
      {
        type: 'time',
        operator: 'between',
        value: 0,
        secondaryValue: 0,
        description: 'Ask for destructive operations outside business hours (9-17)',
        enabled: false,
      },
    ],
  },
  {
    id: 'template-restricted',
    name: 'Restricted',
    description: 'Chat mode — deny all tools, conversation only',
    agentMode: 'chat',
    icon: '💬',
    color: '#8b5cf6',
    rules: [
      { pattern: '*', level: 'deny', reason: 'Chat mode: all tools denied' },
    ],
    conditions: [],
  },
  {
    id: 'template-custom',
    name: 'Custom',
    description: 'Custom policy — configure your own rules',
    agentMode: 'custom',
    icon: '⚙️',
    color: '#6b7280',
    rules: [
      { pattern: '*', level: 'ask', reason: 'Custom policy: ask for all by default' },
    ],
    conditions: [],
  },
];

// ─── PermissionPolicyEngine Class ─────────────────────────────────────────────

export class PermissionPolicyEngine extends EventEmitter {
  private policies: Map<string, PermissionPolicy> = new Map();
  private activePolicies: Map<AgentMode, string> = new Map();
  private matcher: WildcardMatcher;
  private configDir: string;
  private initialized: boolean = false;

  constructor() {
    super();
    this.matcher = new WildcardMatcher();
    this.configDir = path.join(os.homedir(), '.openagent');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await fs.mkdir(this.configDir, { recursive: true });

    // Load saved policies
    await this.loadPolicies();

    // If no policies exist, create built-in ones from templates
    if (this.policies.size === 0) {
      this.createBuiltinPolicies();
      await this.savePolicies();
    }

    // Load active policy assignments
    await this.loadActivePolicies();

    this.initialized = true;
    this.emit('engine:initialized');
  }

  // ─── Policy CRUD ──────────────────────────────────────────────────────────

  createPolicy(policy: Omit<PermissionPolicy, 'id' | 'createdAt' | 'updatedAt'>): PermissionPolicy {
    const id = `policy-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const newPolicy: PermissionPolicy = {
      ...policy,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.policies.set(id, newPolicy);
    this.savePolicies(); // Fire-and-forget save

    this.emit('policy:created', newPolicy);
    return newPolicy;
  }

  updatePolicy(id: string, updates: Partial<Omit<PermissionPolicy, 'id' | 'createdAt'>>): PermissionPolicy | null {
    const policy = this.policies.get(id);
    if (!policy) return null;

    // Don't allow modifying built-in policies' built-in status
    if (policy.isBuiltIn && updates.isBuiltIn === false) {
      return null;
    }

    const updated: PermissionPolicy = {
      ...policy,
      ...updates,
      id: policy.id, // Preserve ID
      createdAt: policy.createdAt, // Preserve creation time
      updatedAt: new Date().toISOString(),
    };

    this.policies.set(id, updated);
    this.savePolicies(); // Fire-and-forget save

    this.emit('policy:updated', { before: policy, after: updated });
    return updated;
  }

  deletePolicy(id: string): boolean {
    const policy = this.policies.get(id);
    if (!policy) return false;

    // Cannot delete built-in policies
    if (policy.isBuiltIn) return false;

    // Remove from active policies if it's active
    for (const [mode, policyId] of this.activePolicies.entries()) {
      if (policyId === id) {
        this.activePolicies.delete(mode);
      }
    }

    this.policies.delete(id);
    this.savePolicies();
    this.saveActivePolicies();

    this.emit('policy:deleted', { id, name: policy.name });
    return true;
  }

  getPolicy(id: string): PermissionPolicy | undefined {
    return this.policies.get(id);
  }

  getAllPolicies(): PermissionPolicy[] {
    return Array.from(this.policies.values());
  }

  // ─── Active Policy Management ─────────────────────────────────────────────

  setActivePolicy(agentMode: AgentMode, policyId: string): boolean {
    const policy = this.policies.get(policyId);
    if (!policy) return false;

    this.activePolicies.set(agentMode, policyId);
    this.saveActivePolicies();

    this.emit('policy:activated', { agentMode, policyId, policyName: policy.name });
    return true;
  }

  getActivePolicy(agentMode: AgentMode): PermissionPolicy | undefined {
    const policyId = this.activePolicies.get(agentMode);
    if (!policyId) {
      // Fall back to built-in for this mode
      const builtInId = `builtin-${agentMode}`;
      return this.policies.get(builtInId);
    }
    return this.policies.get(policyId);
  }

  // ─── Evaluation ───────────────────────────────────────────────────────────

  evaluate(
    toolName: string,
    args: Record<string, unknown>,
    context: EvaluationContext = {},
  ): PolicyEvaluationResult {
    const agentMode = this.inferAgentMode(context);
    const policy = this.getActivePolicy(agentMode);

    if (!policy) {
      return {
        allowed: false,
        level: 'deny',
        policyId: 'none',
        policyName: 'No Active Policy',
        conditionResults: [],
        explanation: `No active policy found for mode "${agentMode}". Access denied by default.`,
      };
    }

    // Build tool identifier
    const toolIdentifier = this.buildToolIdentifier(toolName, args);

    // Convert policy rules to wildcard patterns
    const patterns: WildcardPattern[] = policy.rules.map((rule) => ({
      pattern: rule.pattern,
      level: rule.level,
      reason: rule.reason,
      category: rule.category,
      priority: rule.priority,
    }));

    // If policy inherits from another, merge parent rules first
    if (policy.inheritsFrom) {
      const parentPolicy = this.policies.get(policy.inheritsFrom);
      if (parentPolicy) {
        const parentPatterns: WildcardPattern[] = parentPolicy.rules.map((rule) => ({
          pattern: rule.pattern,
          level: rule.level,
          reason: rule.reason,
          category: rule.category,
          priority: rule.priority,
        }));
        // Parent rules come first (lower priority), then child rules override
        patterns.unshift(...parentPatterns);
      }
    }

    // Match using wildcard matcher
    const matchResult = this.matcher.match(toolIdentifier, patterns);

    // Evaluate conditions
    const conditionResults = this.evaluateConditions(policy.conditions, context);

    // If any condition fails, override to 'ask' for safety
    const allConditionsPass = conditionResults.every((r) => r.passed);

    let finalLevel = matchResult.level;
    let conditionOverride = false;

    if (!allConditionsPass && finalLevel === 'allow') {
      // If conditions fail, downgrade allow to ask
      finalLevel = 'ask';
      conditionOverride = true;
    }

    const matchedRule = matchResult.matchedPattern
      ? policy.rules.find((r) => r.pattern === matchResult.matchedPattern!.pattern)
      : undefined;

    const explanation = this.buildExplanation(
      toolIdentifier,
      policy,
      matchResult,
      conditionResults,
      conditionOverride,
      finalLevel,
    );

    return {
      allowed: finalLevel === 'allow',
      level: finalLevel,
      policyId: policy.id,
      policyName: policy.name,
      matchedRule,
      conditionResults,
      explanation,
    };
  }

  // ─── Templates ────────────────────────────────────────────────────────────

  getTemplates(): PolicyTemplate[] {
    return [...BUILTIN_TEMPLATES];
  }

  createFromTemplate(templateId: string, customizations?: Partial<PermissionPolicy>): PermissionPolicy | null {
    const template = BUILTIN_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return null;

    const policy = this.createPolicy({
      name: customizations?.name || template.name,
      description: customizations?.description || template.description,
      rules: customizations?.rules || [...template.rules],
      conditions: customizations?.conditions || [...template.conditions],
      agentMode: customizations?.agentMode || template.agentMode,
      isDefault: false,
      isBuiltIn: false,
      inheritsFrom: customizations?.inheritsFrom,
    });

    return policy;
  }

  // ─── Import/Export ────────────────────────────────────────────────────────

  async exportPolicies(): Promise<string> {
    const data = {
      version: 1,
      policies: Array.from(this.policies.values()),
      activePolicies: Object.fromEntries(this.activePolicies),
      exportedAt: new Date().toISOString(),
    };
    return JSON.stringify(data, null, 2);
  }

  async importPolicies(jsonString: string): Promise<{ imported: number; errors: string[] }> {
    const errors: string[] = [];
    let imported = 0;

    try {
      const data = JSON.parse(jsonString);

      if (!data.policies || !Array.isArray(data.policies)) {
        return { imported: 0, errors: ['Invalid format: missing policies array'] };
      }

      for (const policyData of data.policies) {
        try {
          // Skip built-in policies in the import
          if (policyData.isBuiltIn) continue;

          // Validate required fields
          if (!policyData.name || !policyData.agentMode) {
            errors.push(`Policy "${policyData.name || 'unnamed'}" missing required fields`);
            continue;
          }

          const policy = this.createPolicy({
            name: policyData.name,
            description: policyData.description || '',
            rules: policyData.rules || [],
            conditions: policyData.conditions || [],
            agentMode: policyData.agentMode,
            isDefault: false,
            isBuiltIn: false,
            inheritsFrom: policyData.inheritsFrom,
          });

          imported++;
        } catch (err) {
          errors.push(`Failed to import policy: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      // Restore active policy assignments
      if (data.activePolicies && typeof data.activePolicies === 'object') {
        for (const [mode, policyId] of Object.entries(data.activePolicies as Record<string, string>)) {
          if (this.policies.has(policyId)) {
            this.activePolicies.set(mode as AgentMode, policyId);
          }
        }
        await this.saveActivePolicies();
      }
    } catch (err) {
      errors.push(`Parse error: ${err instanceof Error ? err.message : 'Invalid JSON'}`);
    }

    this.emit('policies:imported', { imported, errors });
    return { imported, errors };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private createBuiltinPolicies(): void {
    for (const template of BUILTIN_TEMPLATES) {
      const id = `builtin-${template.agentMode}`;
      const now = new Date().toISOString();

      const policy: PermissionPolicy = {
        id,
        name: template.name,
        description: template.description,
        rules: [...template.rules],
        conditions: [...template.conditions],
        agentMode: template.agentMode,
        isDefault: true,
        isBuiltIn: true,
        createdAt: now,
        updatedAt: now,
      };

      this.policies.set(id, policy);
      this.activePolicies.set(template.agentMode, id);
    }
  }

  private buildToolIdentifier(toolName: string, args: Record<string, unknown>): string {
    if (toolName === 'bash' && args.command) {
      const cmd = String(args.command).trim();
      return `bash:${cmd}`;
    }
    if ((toolName === 'edit' || toolName === 'write') && args.path) {
      return `${toolName}:${args.path}`;
    }
    if ((toolName === 'edit' || toolName === 'write') && args.file_path) {
      return `${toolName}:${args.file_path}`;
    }
    if (toolName === 'read' && args.path) {
      return `read:${args.path}`;
    }
    return toolName;
  }

  private inferAgentMode(context: EvaluationContext): AgentMode {
    // Could be extended to read from context
    return context.customContext?.agentMode as AgentMode || 'smart';
  }

  private evaluateConditions(conditions: PolicyCondition[], context: EvaluationContext): ConditionResult[] {
    return conditions
      .filter((c) => c.enabled)
      .map((condition) => {
        let actualValue: unknown;

        switch (condition.type) {
          case 'time': {
            const now = context.currentTime || new Date();
            const hour = now.getHours();
            actualValue = hour;

            if (condition.operator === 'between') {
              const min = Number(condition.value);
              const max = Number(condition.secondaryValue);
              return {
                condition,
                passed: hour >= min && hour < max,
                value: hour,
              };
            }
            break;
          }
          case 'session_count':
            actualValue = context.sessionCount ?? 0;
            break;
          case 'tool_count':
            actualValue = context.toolCallCount ?? 0;
            break;
          case 'error_count':
            actualValue = context.errorCount ?? 0;
            break;
          case 'custom':
            actualValue = context.customContext?.[condition.description || ''];
            break;
        }

        const passed = this.evaluateOperator(actualValue, condition.operator, condition.value);
        return { condition, passed, value: actualValue };
      });
  }

  private evaluateOperator(actual: unknown, operator: string, expected: unknown): boolean {
    const a = Number(actual);
    const b = Number(expected);

    if (isNaN(a) || isNaN(b)) {
      // String comparison fallback
      const sa = String(actual);
      const sb = String(expected);

      switch (operator) {
        case 'eq': return sa === sb;
        case 'in': return Array.isArray(expected) && expected.includes(sa);
        default: return false;
      }
    }

    switch (operator) {
      case 'lt': return a < b;
      case 'gt': return a > b;
      case 'eq': return a === b;
      case 'lte': return a <= b;
      case 'gte': return a >= b;
      case 'in': return Array.isArray(expected) && expected.includes(a);
      default: return false;
    }
  }

  private buildExplanation(
    toolIdentifier: string,
    policy: PermissionPolicy,
    matchResult: { matched: boolean; level: PermissionLevel; matchedPattern?: WildcardPattern; explanation: string },
    conditionResults: ConditionResult[],
    conditionOverride: boolean,
    finalLevel: PermissionLevel,
  ): string {
    const parts: string[] = [];

    parts.push(`Policy "${policy.name}" evaluated tool "${toolIdentifier}":`);

    if (matchResult.matchedPattern) {
      parts.push(`  Matched rule: "${matchResult.matchedPattern.pattern}" → ${matchResult.level}`);
      if (matchResult.matchedPattern.reason) {
        parts.push(`  Reason: ${matchResult.matchedPattern.reason}`);
      }
    } else {
      parts.push(`  No matching rule found, defaulting to ask`);
    }

    if (conditionResults.length > 0) {
      const failedConditions = conditionResults.filter((r) => !r.passed);
      if (failedConditions.length > 0) {
        parts.push(`  ⚠ ${failedConditions.length} condition(s) not met:`);
        for (const fc of failedConditions) {
          parts.push(`    - ${fc.condition.description || fc.condition.type}: expected ${fc.condition.operator} ${fc.condition.value}, got ${fc.value}`);
        }
      }
    }

    if (conditionOverride) {
      parts.push(`  ⚠ Condition failure downgraded permission from allow to ask`);
    }

    parts.push(`  Final decision: ${finalLevel.toUpperCase()}`);

    return parts.join('\n');
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  private async loadPolicies(): Promise<void> {
    try {
      const filePath = path.join(this.configDir, 'permission-policies.json');
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      const policies: PermissionPolicy[] = data.policies || data;

      for (const policy of policies) {
        this.policies.set(policy.id, policy);
      }
    } catch {
      // No saved policies — will create built-ins
    }
  }

  private async savePolicies(): Promise<void> {
    try {
      const filePath = path.join(this.configDir, 'permission-policies.json');
      const data = {
        version: 1,
        policies: Array.from(this.policies.values()),
      };
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      this.emit('error', new Error(`Failed to save policies: ${err instanceof Error ? err.message : 'Unknown error'}`));
    }
  }

  private async loadActivePolicies(): Promise<void> {
    try {
      const filePath = path.join(this.configDir, 'active-policies.json');
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      for (const [mode, policyId] of Object.entries(data)) {
        this.activePolicies.set(mode as AgentMode, policyId as string);
      }
    } catch {
      // Use defaults
    }
  }

  private async saveActivePolicies(): Promise<void> {
    try {
      const filePath = path.join(this.configDir, 'active-policies.json');
      const data = Object.fromEntries(this.activePolicies);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      this.emit('error', new Error(`Failed to save active policies: ${err instanceof Error ? err.message : 'Unknown error'}`));
    }
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const policyEngine = new PermissionPolicyEngine();
