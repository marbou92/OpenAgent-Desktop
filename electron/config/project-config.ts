/**
 * OpenAgent-Desktop - Project Configuration
 * 
 * Scans and loads .openagent/ directory from project roots.
 * Like OpenCode: AGENTS.md for project instructions, config.json for overrides.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

export interface ProjectConfig {
  instructions?: string;
  config?: Record<string, unknown>;
  customTools?: string[];
}

export class ProjectConfigLoader extends EventEmitter {
  async loadFromDirectory(projectDir: string): Promise<ProjectConfig> {
    const openagentDir = path.join(projectDir, '.openagent');
    const result: ProjectConfig = {};

    // Load AGENTS.md instructions
    const agentsMdPath = path.join(openagentDir, 'agents.md');
    try {
      result.instructions = await fs.readFile(agentsMdPath, 'utf-8');
    } catch {
      // Also check CLAUDE.md (Claude Code compatibility)
      const claudeMdPath = path.join(projectDir, 'CLAUDE.md');
      try {
        result.instructions = await fs.readFile(claudeMdPath, 'utf-8');
      } catch {
        // No instructions file
      }
    }

    // Load config.json overrides
    const configPath = path.join(openagentDir, 'config.json');
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      result.config = JSON.parse(content);
    } catch {
      // No project config
    }

    // Discover custom tools
    const toolsDir = path.join(openagentDir, 'tools');
    try {
      const files = await fs.readdir(toolsDir);
      result.customTools = files
        .filter((f) => f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.mjs'))
        .map((f) => path.join(toolsDir, f));
    } catch {
      // No custom tools directory
    }

    return result;
  }

  async createAgentsMd(projectDir: string, content: string): Promise<void> {
    const openagentDir = path.join(projectDir, '.openagent');
    await fs.mkdir(openagentDir, { recursive: true });
    await fs.writeFile(path.join(openagentDir, 'agents.md'), content, 'utf-8');
  }

  async createProjectConfig(projectDir: string, config: Record<string, unknown>): Promise<void> {
    const openagentDir = path.join(projectDir, '.openagent');
    await fs.mkdir(openagentDir, { recursive: true });
    await fs.writeFile(path.join(openagentDir, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
  }

  async hasProjectConfig(projectDir: string): Promise<boolean> {
    const openagentDir = path.join(projectDir, '.openagent');
    try {
      const stat = await fs.stat(openagentDir);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }
}
