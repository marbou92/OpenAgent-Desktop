/**
 * OpenAgent-Desktop - Project Config Manager
 *
 * Manages .openagent/ project-level configuration.
 * Like OpenCode's project instructions and Goose's project config.
 * Supports AGENTS.md-style project instructions.
 *
 * .openagent/ directory structure:
 *   config.json       - Main config (provider/model/agent overrides)
 *   AGENTS.md         - Project instructions (like OpenCode)
 *   instructions.md   - Additional instructions
 *   extensions.json   - Extension overrides
 *   permissions.json  - Permission overrides
 *   .env              - Environment variables
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { LayeredConfig } from './layered-config';
import { ConfigInterpolator } from './interpolation';

// ─── Type Definitions ─────────────────────────────────────────────────────────

export interface ProjectConfig {
  id: string;
  name: string;
  directory: string;
  providerOverrides: Record<string, unknown>;
  modelOverrides: Record<string, unknown>;
  agentMode?: string;
  customInstructions: string;
  enabledExtensions: string[];
  permissionOverrides: Record<string, unknown>;
  envOverrides: Record<string, string>;
  detectedType?: ProjectType;
  suggestedExtensions?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectInstructions {
  filePath: string;
  content: string;
  format: 'markdown' | 'yaml' | 'json';
  lastModified: string;
}

export type ProjectType =
  | 'nodejs'
  | 'python'
  | 'rust'
  | 'go'
  | 'java'
  | 'ruby'
  | 'dotnet'
  | 'swift'
  | 'kotlin'
  | 'php'
  | 'web'
  | 'unknown';

export interface ProjectTypeDetection {
  type: ProjectType;
  confidence: number;
  indicators: string[];
}

export interface EnvFileEntry {
  key: string;
  value: string;
  comment?: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const OPENAGENT_DIR = '.openagent';
const CONFIG_FILE = 'config.json';
const AGENTS_MD = 'AGENTS.md';
const INSTRUCTIONS_MD = 'instructions.md';
const EXTENSIONS_FILE = 'extensions.json';
const PERMISSIONS_FILE = 'permissions.json';
const ENV_FILE = '.env';

const PROJECT_TYPE_INDICATORS: Record<ProjectType, { files: string[]; dirs: string[] }> = {
  nodejs: {
    files: ['package.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', '.nvmrc', '.node-version'],
    dirs: ['node_modules'],
  },
  python: {
    files: ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile', 'poetry.lock', '.python-version', 'conda.yaml'],
    dirs: ['__pycache__', '.venv', 'venv'],
  },
  rust: {
    files: ['Cargo.toml', 'Cargo.lock'],
    dirs: ['src'],
  },
  go: {
    files: ['go.mod', 'go.sum'],
    dirs: [],
  },
  java: {
    files: ['pom.xml', 'build.gradle', 'build.gradle.kts', '.gradle'],
    dirs: [],
  },
  ruby: {
    files: ['Gemfile', 'Rakefile', '.ruby-version'],
    dirs: [],
  },
  dotnet: {
    files: ['*.csproj', '*.fsproj', 'global.json', 'Directory.Build.props'],
    dirs: [],
  },
  swift: {
    files: ['Package.swift', 'Podfile', '*.xcodeproj'],
    dirs: [],
  },
  kotlin: {
    files: ['build.gradle.kts'],
    dirs: [],
  },
  php: {
    files: ['composer.json', 'composer.lock', 'artisan'],
    dirs: [],
  },
  web: {
    files: ['index.html', 'style.css'],
    dirs: [],
  },
  unknown: {
    files: [],
    dirs: [],
  },
};

const TYPE_SUGGESTED_EXTENSIONS: Record<ProjectType, string[]> = {
  nodejs: ['developer', 'code-mode', 'auto-visualiser'],
  python: ['developer', 'code-mode', 'auto-visualiser'],
  rust: ['developer', 'code-mode'],
  go: ['developer', 'code-mode'],
  java: ['developer', 'code-mode'],
  ruby: ['developer', 'code-mode'],
  dotnet: ['developer', 'code-mode'],
  swift: ['developer', 'code-mode'],
  kotlin: ['developer', 'code-mode'],
  php: ['developer', 'code-mode'],
  web: ['developer', 'code-mode', 'auto-visualiser'],
  unknown: ['developer'],
};

// ─── Project Config Manager ────────────────────────────────────────────────────

export class ProjectConfigManager extends EventEmitter {
  private configs: Map<string, ProjectConfig> = new Map();
  private watchers: Map<string, any> = new Map();
  private layeredConfig: LayeredConfig;

  constructor(layeredConfig?: LayeredConfig) {
    super();
    this.layeredConfig = layeredConfig || new LayeredConfig();
  }

  // ─── Load / Save ───────────────────────────────────────────────────────────

  /**
   * Load project config from .openagent/ directory.
   * Creates a default config if the directory doesn't exist yet.
   */
  async loadProject(directory: string): Promise<ProjectConfig> {
    const cached = this.configs.get(directory);
    if (cached) return cached;

    const openagentDir = path.join(directory, OPENAGENT_DIR);
    const now = new Date().toISOString();

    const config: ProjectConfig = {
      id: this.generateId(directory),
      name: path.basename(directory),
      directory,
      providerOverrides: {},
      modelOverrides: {},
      agentMode: undefined,
      customInstructions: '',
      enabledExtensions: [],
      permissionOverrides: {},
      envOverrides: {},
      createdAt: now,
      updatedAt: now,
    };

    // Detect project type
    const detection = await this.detectProjectType(directory);
    config.detectedType = detection.type;
    config.suggestedExtensions = TYPE_SUGGESTED_EXTENSIONS[detection.type];

    // Load config.json
    try {
      const content = await fs.readFile(path.join(openagentDir, CONFIG_FILE), 'utf-8');
      const data = JSON.parse(content);
      config.providerOverrides = data.providers || {};
      config.modelOverrides = data.models || {};
      config.agentMode = data.agentMode;
      config.name = data.name || config.name;
      config.createdAt = data.createdAt || now;
      config.updatedAt = data.updatedAt || now;
    } catch {
      // No config file yet
    }

    // Load AGENTS.md
    try {
      config.customInstructions = await fs.readFile(
        path.join(openagentDir, AGENTS_MD),
        'utf-8',
      );
    } catch {
      // Also check instructions.md
      try {
        config.customInstructions = await fs.readFile(
          path.join(openagentDir, INSTRUCTIONS_MD),
          'utf-8',
        );
      } catch {
        // No instructions file
      }
    }

    // Load extensions.json
    try {
      const content = await fs.readFile(path.join(openagentDir, EXTENSIONS_FILE), 'utf-8');
      const data = JSON.parse(content);
      config.enabledExtensions = data.enabled || [];
    } catch {
      // No extensions override
    }

    // Load permissions.json
    try {
      const content = await fs.readFile(path.join(openagentDir, PERMISSIONS_FILE), 'utf-8');
      config.permissionOverrides = JSON.parse(content);
    } catch {
      // No permissions override
    }

    // Load .env
    try {
      const content = await fs.readFile(path.join(openagentDir, ENV_FILE), 'utf-8');
      config.envOverrides = this.parseEnvFile(content);
    } catch {
      // No .env file
    }

    // Resolve interpolation in all config values
    this.resolveInterpolations(config, directory);

    this.configs.set(directory, config);
    this.emit('project:loaded', config);

    return config;
  }

  /**
   * Save project config back to .openagent/ directory.
   */
  async saveProject(config: ProjectConfig): Promise<void> {
    const openagentDir = path.join(config.directory, OPENAGENT_DIR);
    await fs.mkdir(openagentDir, { recursive: true });

    config.updatedAt = new Date().toISOString();

    // Save config.json
    const configData = {
      name: config.name,
      providers: config.providerOverrides,
      models: config.modelOverrides,
      agentMode: config.agentMode,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
    await fs.writeFile(
      path.join(openagentDir, CONFIG_FILE),
      JSON.stringify(configData, null, 2),
      'utf-8',
    );

    // Save AGENTS.md
    if (config.customInstructions) {
      await fs.writeFile(
        path.join(openagentDir, AGENTS_MD),
        config.customInstructions,
        'utf-8',
      );
    }

    // Save extensions.json
    if (config.enabledExtensions.length > 0) {
      await fs.writeFile(
        path.join(openagentDir, EXTENSIONS_FILE),
        JSON.stringify({ enabled: config.enabledExtensions }, null, 2),
        'utf-8',
      );
    }

    // Save permissions.json
    if (Object.keys(config.permissionOverrides).length > 0) {
      await fs.writeFile(
        path.join(openagentDir, PERMISSIONS_FILE),
        JSON.stringify(config.permissionOverrides, null, 2),
        'utf-8',
      );
    }

    // Save .env
    if (Object.keys(config.envOverrides).length > 0) {
      await fs.writeFile(
        path.join(openagentDir, ENV_FILE),
        this.serializeEnvFile(config.envOverrides),
        'utf-8',
      );
    }

    // Update cache
    this.configs.set(config.directory, config);

    // Update layered config project layer
    this.layeredConfig.setLayer({
      name: 'project',
      source: 'project',
      data: {
        ...config.providerOverrides,
        ...config.modelOverrides,
        agents: config.agentMode ? { defaultMode: config.agentMode } : {},
      },
      filePath: path.join(openagentDir, CONFIG_FILE),
    });

    this.emit('project:saved', config);
  }

  // ─── Instructions ──────────────────────────────────────────────────────────

  /**
   * Get all project instruction files.
   */
  async getInstructions(directory: string): Promise<ProjectInstructions[]> {
    const openagentDir = path.join(directory, OPENAGENT_DIR);
    const instructions: ProjectInstructions[] = [];

    const instructionFiles: { name: string; format: 'markdown' | 'yaml' | 'json' }[] = [
      { name: AGENTS_MD, format: 'markdown' },
      { name: INSTRUCTIONS_MD, format: 'markdown' },
      { name: 'instructions.yaml', format: 'yaml' },
      { name: 'instructions.json', format: 'json' },
    ];

    for (const { name, format } of instructionFiles) {
      const filePath = path.join(openagentDir, name);
      try {
        const stat = await fs.stat(filePath);
        if (stat.isFile()) {
          const content = await fs.readFile(filePath, 'utf-8');
          instructions.push({
            filePath,
            content,
            format,
            lastModified: stat.mtime.toISOString(),
          });
        }
      } catch {
        // File doesn't exist
      }
    }

    // Also check root CLAUDE.md for compatibility
    const claudeMdPath = path.join(directory, 'CLAUDE.md');
    try {
      const stat = await fs.stat(claudeMdPath);
      if (stat.isFile()) {
        const content = await fs.readFile(claudeMdPath, 'utf-8');
        instructions.push({
          filePath: claudeMdPath,
          content,
          format: 'markdown',
          lastModified: stat.mtime.toISOString(),
        });
      }
    } catch {
      // File doesn't exist
    }

    return instructions;
  }

  /**
   * Create an instructions file in .openagent/ directory.
   */
  async createInstructions(
    directory: string,
    format: 'markdown' | 'yaml' | 'json',
  ): Promise<void> {
    const openagentDir = path.join(directory, OPENAGENT_DIR);
    await fs.mkdir(openagentDir, { recursive: true });

    let fileName: string;
    let defaultContent: string;

    switch (format) {
      case 'markdown':
        fileName = AGENTS_MD;
        defaultContent = [
          `# ${path.basename(directory)} Project Instructions`,
          '',
          'This file contains project-specific instructions for OpenAgent.',
          '',
          '## Project Overview',
          '',
          '<!-- Describe your project here -->',
          '',
          '## Coding Standards',
          '',
          '<!-- Add your coding standards here -->',
          '',
          '## Architecture',
          '',
          '<!-- Describe the architecture here -->',
          '',
          '## Important Notes',
          '',
          '<!-- Any special notes for the AI assistant -->',
          '',
        ].join('\n');
        break;
      case 'yaml':
        fileName = 'instructions.yaml';
        defaultContent = [
          `# ${path.basename(directory)} Project Instructions`,
          'overview: |',
          '  Describe your project here',
          'coding_standards: |',
          '  Add your coding standards here',
          'architecture: |',
          '  Describe the architecture here',
          'important_notes: |',
          '  Any special notes for the AI assistant',
          '',
        ].join('\n');
        break;
      case 'json':
        fileName = 'instructions.json';
        defaultContent = JSON.stringify(
          {
            name: path.basename(directory),
            overview: 'Describe your project here',
            codingStandards: 'Add your coding standards here',
            architecture: 'Describe the architecture here',
            importantNotes: 'Any special notes for the AI assistant',
          },
          null,
          2,
        );
        break;
    }

    const filePath = path.join(openagentDir, fileName);

    // Don't overwrite existing files
    try {
      await fs.access(filePath);
      // File exists, don't overwrite
    } catch {
      await fs.writeFile(filePath, defaultContent, 'utf-8');
    }

    this.emit('instructions:created', { directory, fileName, format });
  }

  // ─── Watch ─────────────────────────────────────────────────────────────────

  /**
   * Watch for config changes in a project directory.
   * Uses polling-based watching (chokidar-compatible API).
   */
  watchProject(directory: string): void {
    if (this.watchers.has(directory)) {
      return; // Already watching
    }

    const openagentDir = path.join(directory, OPENAGENT_DIR);
    const watcher: {
      directory: string;
      interval: ReturnType<typeof setInterval>;
      lastModified: Map<string, number>;
      active: boolean;
    } = {
      directory,
      interval: null!,
      lastModified: new Map(),
      active: true,
    };

    // Poll for changes every 2 seconds
    watcher.interval = setInterval(async () => {
      if (!watcher.active) return;

      try {
        const files = [
          CONFIG_FILE,
          AGENTS_MD,
          INSTRUCTIONS_MD,
          EXTENSIONS_FILE,
          PERMISSIONS_FILE,
          ENV_FILE,
        ];

        for (const file of files) {
          const filePath = path.join(openagentDir, file);
          try {
            const stat = await fs.stat(filePath);
            const mtime = stat.mtimeMs;
            const lastMtime = watcher.lastModified.get(file);

            if (lastMtime !== undefined && mtime > lastMtime) {
              // File changed - reload config
              this.configs.delete(directory);
              const config = await this.loadProject(directory);
              this.emit('project:changed', config, file);
            }

            watcher.lastModified.set(file, mtime);
          } catch {
            // File may have been deleted
            if (watcher.lastModified.has(file)) {
              watcher.lastModified.delete(file);
              this.configs.delete(directory);
              const config = await this.loadProject(directory);
              this.emit('project:changed', config, file);
            }
          }
        }
      } catch {
        // Directory may not exist
      }
    }, 2000);

    this.watchers.set(directory, watcher);
    this.emit('project:watching', directory);
  }

  /**
   * Stop watching a project directory.
   */
  unwatchProject(directory: string): void {
    const watcher = this.watchers.get(directory);
    if (watcher) {
      watcher.active = false;
      clearInterval(watcher.interval);
      this.watchers.delete(directory);
      this.emit('project:unwatched', directory);
    }
  }

  // ─── Config Resolution ─────────────────────────────────────────────────────

  /**
   * Resolve a config value through the layered config system.
   * Checks project → global → defaults.
   */
  resolveConfig(directory: string, key: string): unknown {
    const config = this.configs.get(directory);
    if (!config) {
      return this.layeredConfig.get(key);
    }

    // Check project overrides first
    const projectValue = this.getNestedValue(
      { ...config.providerOverrides, ...config.modelOverrides },
      key,
    );
    if (projectValue !== undefined) {
      return projectValue;
    }

    // Fall through to layered config
    return this.layeredConfig.get(key);
  }

  /**
   * Get which layer provides a specific config key.
   */
  getConfigSource(directory: string, key: string): 'project' | 'global' | 'default' | 'session' | 'none' {
    const config = this.configs.get(directory);

    // Check project layer
    if (config) {
      const projectValue = this.getNestedValue(
        { ...config.providerOverrides, ...config.modelOverrides },
        key,
      );
      if (projectValue !== undefined) return 'project';
    }

    // Check layered config
    const layers = this.layeredConfig.getAllLayers();
    for (const layer of layers) {
      const value = this.getNestedValue(layer.data, key);
      if (value !== undefined) {
        return layer.source;
      }
    }

    return 'none';
  }

  // ─── Import / Export ───────────────────────────────────────────────────────

  /**
   * Export project config as JSON string.
   */
  async exportProjectConfig(directory: string): Promise<string> {
    const config = this.configs.get(directory) || (await this.loadProject(directory));
    const instructions = await this.getInstructions(directory);

    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      config: {
        id: config.id,
        name: config.name,
        providerOverrides: config.providerOverrides,
        modelOverrides: config.modelOverrides,
        agentMode: config.agentMode,
        enabledExtensions: config.enabledExtensions,
        permissionOverrides: config.permissionOverrides,
        envOverrides: config.envOverrides,
        detectedType: config.detectedType,
      },
      instructions: instructions.map((i) => ({
        fileName: path.basename(i.filePath),
        format: i.format,
        content: i.content,
      })),
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import project config from a JSON string.
   */
  async importProjectConfig(directory: string, data: string): Promise<void> {
    const parsed = JSON.parse(data);

    if (!parsed.config) {
      throw new Error('Invalid project config export: missing config section');
    }

    const openagentDir = path.join(directory, OPENAGENT_DIR);
    await fs.mkdir(openagentDir, { recursive: true });

    const now = new Date().toISOString();
    const config: ProjectConfig = {
      id: this.generateId(directory),
      name: parsed.config.name || path.basename(directory),
      directory,
      providerOverrides: parsed.config.providerOverrides || {},
      modelOverrides: parsed.config.modelOverrides || {},
      agentMode: parsed.config.agentMode,
      customInstructions: '',
      enabledExtensions: parsed.config.enabledExtensions || [],
      permissionOverrides: parsed.config.permissionOverrides || {},
      envOverrides: parsed.config.envOverrides || {},
      detectedType: parsed.config.detectedType,
      createdAt: now,
      updatedAt: now,
    };

    // Import instructions
    if (parsed.instructions && Array.isArray(parsed.instructions)) {
      for (const instr of parsed.instructions) {
        if (instr.format === 'markdown') {
          config.customInstructions += instr.content + '\n';
        }
        const filePath = path.join(openagentDir, instr.fileName);
        await fs.writeFile(filePath, instr.content, 'utf-8');
      }
    }

    await this.saveProject(config);
    this.emit('project:imported', config);
  }

  // ─── Project Type Detection ────────────────────────────────────────────────

  /**
   * Auto-detect project type from directory contents.
   */
  async detectProjectType(directory: string): Promise<ProjectTypeDetection> {
    const scores: Map<ProjectType, { score: number; indicators: string[] }> = new Map();

    // Initialize all types
    for (const type of Object.keys(PROJECT_TYPE_INDICATORS) as ProjectType[]) {
      scores.set(type, { score: 0, indicators: [] });
    }

    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      const fileNames = entries.filter((e) => e.isFile()).map((e) => e.name);
      const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);

      for (const [type, indicators] of Object.entries(PROJECT_TYPE_INDICATORS)) {
        if (type === 'unknown') continue;
        const entry = scores.get(type as ProjectType)!;

        for (const file of indicators.files) {
          if (file.includes('*')) {
            // Glob-like matching for patterns like *.csproj
            const ext = file.replace('*.', '.');
            if (fileNames.some((f) => f.endsWith(ext))) {
              entry.score += 2;
              entry.indicators.push(file);
            }
          } else if (fileNames.includes(file)) {
            entry.score += 2;
            entry.indicators.push(file);
          }
        }

        for (const dir of indicators.dirs) {
          if (dirNames.includes(dir)) {
            entry.score += 1;
            entry.indicators.push(dir);
          }
        }
      }
    } catch {
      // Can't read directory
    }

    // Find the type with highest score
    let bestType: ProjectType = 'unknown';
    let bestScore = 0;
    let bestIndicators: string[] = [];

    for (const [type, data] of scores) {
      if (data.score > bestScore) {
        bestScore = data.score;
        bestType = type;
        bestIndicators = data.indicators;
      }
    }

    // Special: if both nodejs and web indicators, prefer nodejs
    if (bestType === 'web') {
      const nodeScore = scores.get('nodejs')!.score;
      if (nodeScore > 0) {
        bestType = 'nodejs';
        bestIndicators = scores.get('nodejs')!.indicators;
      }
    }

    // Normalize confidence 0-1
    const maxPossible = 4; // A single file match gives 2
    const confidence = Math.min(bestScore / maxPossible, 1);

    return {
      type: bestType,
      confidence,
      indicators: bestIndicators,
    };
  }

  /**
   * Get suggested extensions based on project type.
   */
  getSuggestedExtensions(projectType: ProjectType): string[] {
    return TYPE_SUGGESTED_EXTENSIONS[projectType] || [];
  }

  // ─── Utility Methods ───────────────────────────────────────────────────────

  /**
   * Check if a project has .openagent/ directory.
   */
  async hasProjectConfig(directory: string): Promise<boolean> {
    try {
      const stat = await fs.stat(path.join(directory, OPENAGENT_DIR));
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Create the .openagent/ directory structure for a project.
   */
  async initializeProject(directory: string): Promise<ProjectConfig> {
    const openagentDir = path.join(directory, OPENAGENT_DIR);
    await fs.mkdir(openagentDir, { recursive: true });

    const config = await this.loadProject(directory);
    await this.saveProject(config);

    this.emit('project:initialized', config);
    return config;
  }

  /**
   * Get all loaded project configs.
   */
  getAllProjects(): ProjectConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * Get a cached project config.
   */
  getProject(directory: string): ProjectConfig | undefined {
    return this.configs.get(directory);
  }

  /**
   * Clear the in-memory cache.
   */
  clearCache(): void {
    this.configs.clear();
  }

  /**
   * Stop all watchers.
   */
  stopAllWatchers(): void {
    for (const directory of this.watchers.keys()) {
      this.unwatchProject(directory);
    }
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private generateId(directory: string): string {
    const hash = directory.split('').reduce((acc, char) => {
      return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
    }, 0);
    return `proj-${Math.abs(hash).toString(36)}-${Date.now().toString(36)}`;
  }

  private parseEnvFile(content: string): Record<string, string> {
    const result: Record<string, string> = {};

    for (const line of content.split('\n')) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) continue;

      const equalIndex = trimmed.indexOf('=');
      if (equalIndex === -1) continue;

      const key = trimmed.slice(0, equalIndex).trim();
      let value = trimmed.slice(equalIndex + 1).trim();

      // Remove quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      result[key] = value;
    }

    return result;
  }

  private serializeEnvFile(entries: Record<string, string>): string {
    const lines: string[] = [
      '# OpenAgent Project Environment Variables',
      '# This file is managed by OpenAgent-Desktop',
      '',
    ];

    for (const [key, value] of Object.entries(entries)) {
      // Quote values that contain spaces or special chars
      if (value.includes(' ') || value.includes('#') || value.includes('"')) {
        lines.push(`${key}="${value.replace(/"/g, '\\"')}"`);
      } else {
        lines.push(`${key}=${value}`);
      }
    }

    lines.push('');
    return lines.join('\n');
  }

  private resolveInterpolations(config: ProjectConfig, directory: string): void {
    // Resolve {env:VAR} in provider overrides
    for (const [key, value] of Object.entries(config.providerOverrides)) {
      if (typeof value === 'string') {
        config.providerOverrides[key] = ConfigInterpolator.resolve(value, directory);
      }
    }

    // Resolve in model overrides
    for (const [key, value] of Object.entries(config.modelOverrides)) {
      if (typeof value === 'string') {
        config.modelOverrides[key] = ConfigInterpolator.resolve(value, directory);
      }
    }
  }

  private getNestedValue(obj: Record<string, unknown>, key: string): unknown {
    const keys = key.split('.');
    let current: unknown = obj;

    for (const k of keys) {
      if (current && typeof current === 'object' && k in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[k];
      } else {
        return undefined;
      }
    }

    return current;
  }
}
