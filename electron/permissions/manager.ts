/**
 * OpenAgent-Desktop - Permission Manager
 * 
 * Manages persistent permission rules per agent/mode.
 * Handles user confirmation responses (allow_once, always_allow, deny_once, always_deny).
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PermissionLevel, PermissionRule, PermissionSet, PermissionConfirmation, PermissionCheckResult } from './types';
import { PermissionEvaluator, ToolPermissions } from './evaluator';

export class PermissionManager extends EventEmitter {
  private permissionSets: Map<string, PermissionSet> = new Map();
  private confirmations: PermissionConfirmation[] = [];
  private configDir: string;
  private evaluators: Map<string, PermissionEvaluator> = new Map();

  constructor() {
    super();
    this.configDir = path.join(os.homedir(), '.openagent');
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true });
    await this.loadPermissionSets();
  }

  private async loadPermissionSets(): Promise<void> {
    try {
      const filePath = path.join(this.configDir, 'permissions.json');
      const content = await fs.readFile(filePath, 'utf-8');
      const sets: PermissionSet[] = JSON.parse(content);
      for (const set of sets) {
        this.permissionSets.set(set.id, set);
      }
    } catch {
      // No saved permissions
    }
  }

  private async savePermissionSets(): Promise<void> {
    const filePath = path.join(this.configDir, 'permissions.json');
    await fs.writeFile(filePath, JSON.stringify(Array.from(this.permissionSets.values()), null, 2), 'utf-8');
  }

  getOrCreateEvaluator(agentId: string, defaultPermissions: ToolPermissions): PermissionEvaluator {
    if (!this.evaluators.has(agentId)) {
      const set = this.permissionSets.get(agentId);
      const permissions: ToolPermissions = set
        ? Object.fromEntries(set.rules.map((r) => [r.pattern, r.level]))
        : defaultPermissions;
      this.evaluators.set(agentId, new PermissionEvaluator(permissions));
    }
    return this.evaluators.get(agentId)!;
  }

  async recordConfirmation(confirmation: Omit<PermissionConfirmation, 'timestamp'>): Promise<void> {
    const full: PermissionConfirmation = {
      ...confirmation,
      timestamp: new Date().toISOString(),
    };
    this.confirmations.push(full);

    // Handle "always" responses by updating permission rules
    if (full.userResponse === 'always_allow' || full.userResponse === 'always_deny') {
      const level: PermissionLevel = full.userResponse === 'always_allow' ? 'allow' : 'deny';
      await this.addRule(confirmation.toolName.split(':')[0], {
        pattern: confirmation.toolName,
        level,
        reason: `User granted ${level} on ${new Date().toLocaleDateString()}`,
        createdAt: new Date().toISOString(),
      });
    }

    this.emit('confirmation:recorded', full);
  }

  async addRule(agentId: string, rule: PermissionRule): Promise<void> {
    let set = this.permissionSets.get(agentId);
    if (!set) {
      set = {
        id: agentId,
        name: agentId,
        rules: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.permissionSets.set(agentId, set);
    }
    
    set.rules.push(rule);
    set.updatedAt = new Date().toISOString();
    
    // Invalidate cached evaluator
    this.evaluators.delete(agentId);
    
    await this.savePermissionSets();
    this.emit('rule:added', { agentId, rule });
  }

  async removeRule(agentId: string, pattern: string): Promise<void> {
    const set = this.permissionSets.get(agentId);
    if (!set) return;
    
    set.rules = set.rules.filter((r) => r.pattern !== pattern);
    set.updatedAt = new Date().toISOString();
    
    this.evaluators.delete(agentId);
    
    await this.savePermissionSets();
    this.emit('rule:removed', { agentId, pattern });
  }

  getRules(agentId: string): PermissionRule[] {
    const set = this.permissionSets.get(agentId);
    return set?.rules || [];
  }

  getConfirmations(limit: number = 50): PermissionConfirmation[] {
    return this.confirmations.slice(-limit);
  }
}
