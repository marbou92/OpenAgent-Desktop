/**
 * OpenAgent-Desktop - Agent Registry
 * 
 * Central registry for all agent definitions (built-in + custom).
 * Manages agent lifecycle, persistence, and switching.
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AgentDefinition, AgentMode } from './types';
import { buildAgent, planAgent, chatAgent, smartAgent } from './builtin';

export class AgentRegistry extends EventEmitter {
  private agents: Map<string, AgentDefinition> = new Map();
  private activeAgentId: string = 'build';
  private configDir: string;
  private customAgentsDir: string;

  constructor() {
    super();
    this.configDir = path.join(os.homedir(), '.openagent');
    this.customAgentsDir = path.join(this.configDir, 'agents');
    this.registerBuiltIns();
  }

  private registerBuiltIns(): void {
    const builtIns = [buildAgent, planAgent, chatAgent, smartAgent];
    for (const agent of builtIns) {
      this.agents.set(agent.id, agent);
    }
  }

  async initialize(): Promise<void> {
    // Ensure config directory exists
    await fs.mkdir(this.customAgentsDir, { recursive: true });
    
    // Load custom agents from disk
    await this.loadCustomAgents();
  }

  private async loadCustomAgents(): Promise<void> {
    try {
      const files = await fs.readdir(this.customAgentsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await fs.readFile(path.join(this.customAgentsDir, file), 'utf-8');
            const agent: AgentDefinition = JSON.parse(content);
            if (agent.id && agent.name && agent.mode) {
              agent.isBuiltIn = false;
              this.agents.set(agent.id, agent);
            }
          } catch {
            // Skip malformed agent files
          }
        }
      }
    } catch {
      // Directory doesn't exist yet, that's fine
    }
  }

  list(): AgentDefinition[] {
    return Array.from(this.agents.values()).filter((a) => !a.hidden);
  }

  listAll(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  get(agentId: string): AgentDefinition | undefined {
    return this.agents.get(agentId);
  }

  getActive(): AgentDefinition {
    return this.agents.get(this.activeAgentId) || buildAgent;
  }

  getActiveId(): string {
    return this.activeAgentId;
  }

  setActive(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    const previousId = this.activeAgentId;
    this.activeAgentId = agentId;
    this.emit('agent:switched', { from: previousId, to: agentId, agent });
  }

  async create(agent: AgentDefinition): Promise<void> {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent already exists: ${agent.id}`);
    }
    if (agent.isBuiltIn) {
      throw new Error('Cannot create a built-in agent');
    }
    
    agent.isBuiltIn = false;
    this.agents.set(agent.id, agent);
    await this.saveCustomAgent(agent);
    this.emit('agent:created', agent);
  }

  async update(agentId: string, updates: Partial<AgentDefinition>): Promise<void> {
    const existing = this.agents.get(agentId);
    if (!existing) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    if (existing.isBuiltIn) {
      throw new Error('Cannot modify built-in agents');
    }
    
    const updated = { ...existing, ...updates, id: agentId, isBuiltIn: false };
    this.agents.set(agentId, updated);
    await this.saveCustomAgent(updated);
    this.emit('agent:updated', updated);
  }

  async delete(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    if (agent.isBuiltIn) {
      throw new Error('Cannot delete built-in agents');
    }
    if (this.activeAgentId === agentId) {
      this.activeAgentId = 'build';
    }
    
    this.agents.delete(agentId);
    
    // Remove from disk
    try {
      await fs.unlink(path.join(this.customAgentsDir, `${agentId}.json`));
    } catch {
      // File might not exist
    }
    
    this.emit('agent:deleted', { agentId });
  }

  private async saveCustomAgent(agent: AgentDefinition): Promise<void> {
    await fs.mkdir(this.customAgentsDir, { recursive: true });
    const filePath = path.join(this.customAgentsDir, `${agent.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(agent, null, 2), 'utf-8');
  }

  getByMode(mode: AgentMode): AgentDefinition[] {
    return Array.from(this.agents.values()).filter((a) => a.mode === mode);
  }

  getDefaultForMode(mode: AgentMode): AgentDefinition {
    const agents = this.getByMode(mode);
    return agents.find((a) => a.isBuiltIn) || agents[0] || buildAgent;
  }
}

// Singleton
let registryInstance: AgentRegistry | null = null;

export function getAgentRegistry(): AgentRegistry {
  if (!registryInstance) {
    registryInstance = new AgentRegistry();
  }
  return registryInstance;
}

export function setAgentRegistry(registry: AgentRegistry): void {
  registryInstance = registry;
}
