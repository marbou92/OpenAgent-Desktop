/**
 * OpenAgent-Desktop - Project Config View Component
 *
 * React component for managing project configuration:
 * - Current project display (directory, detected type)
 * - .openagent/ directory contents viewer
 * - Project instructions editor (markdown with preview)
 * - Extension overrides for this project
 * - Permission overrides for this project
 * - Environment variable editor (.env format)
 * - Config layer visualization: show which layer provides each value
 * - "Create .openagent/" button for new projects
 * - "Initialize AGENTS.md" button
 * - Project type detection display
 * - Suggested extensions based on project type
 * - Import/Export project config
 * - Dark theme
 */

import React, { useState, useEffect, useCallback } from 'react';

const api = (window as any).openagent;

// ─── Types ────────────────────────────────────────────────────────────────────

type ProjectType =
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

interface ProjectConfigData {
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

interface ProjectInstructions {
  filePath: string;
  content: string;
  format: 'markdown' | 'yaml' | 'json';
  lastModified: string;
}

interface EnvEntry {
  key: string;
  value: string;
}

type ConfigSource = 'project' | 'global' | 'default' | 'none';

interface ConfigLayerEntry {
  key: string;
  value: unknown;
  source: ConfigSource;
}

interface ProjectConfigViewProps {
  projectDirectory?: string;
  addToast: (toast: { type: 'success' | 'error' | 'info'; title: string; message?: string }) => void;
}

type ViewTab = 'overview' | 'instructions' | 'extensions' | 'permissions' | 'env' | 'layers';

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT_TYPE_INFO: Record<ProjectType, { label: string; icon: string; color: string }> = {
  nodejs: { label: 'Node.js', icon: '🟢', color: '#22c55e' },
  python: { label: 'Python', icon: '🐍', color: '#3b82f6' },
  rust: { label: 'Rust', icon: '🦀', color: '#f97316' },
  go: { label: 'Go', icon: '🔵', color: '#06b6d4' },
  java: { label: 'Java', icon: '☕', color: '#ef4444' },
  ruby: { label: 'Ruby', icon: '💎', color: '#dc2626' },
  dotnet: { label: '.NET', icon: '🟣', color: '#8b5cf6' },
  swift: { label: 'Swift', icon: '🍊', color: '#f97316' },
  kotlin: { label: 'Kotlin', icon: '🟣', color: '#7c3aed' },
  php: { label: 'PHP', icon: '🐘', color: '#6366f1' },
  web: { label: 'Web', icon: '🌐', color: '#14b8a6' },
  unknown: { label: 'Unknown', icon: '❓', color: '#6b7280' },
};

const AVAILABLE_EXTENSIONS = [
  { id: 'developer', name: 'Developer', description: 'Code analysis and generation' },
  { id: 'code-mode', name: 'Code Mode', description: 'Focused coding assistance' },
  { id: 'auto-visualiser', name: 'Auto Visualiser', description: 'Auto-generate visualizations' },
  { id: 'memory', name: 'Memory', description: 'Persistent memory across sessions' },
  { id: 'todo', name: 'Todo', description: 'Task management' },
  { id: 'summon', name: 'Summon', description: 'Quick access tools' },
  { id: 'chat-recall', name: 'Chat Recall', description: 'Search past conversations' },
  { id: 'document-generators', name: 'Document Generators', description: 'Generate documents' },
  { id: 'apps', name: 'Apps', description: 'Application integration' },
  { id: 'top-of-mind', name: 'Top of Mind', description: 'Keep important context' },
  { id: 'computer-controller', name: 'Computer Controller', description: 'GUI automation' },
];

// ─── Component ─────────────────────────────────────────────────────────────────

const ProjectConfigView: React.FC<ProjectConfigViewProps> = ({
  projectDirectory,
  addToast,
}) => {
  const [config, setConfig] = useState<ProjectConfigData | null>(null);
  const [instructions, setInstructions] = useState<ProjectInstructions[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ViewTab>('overview');
  const [editingInstructions, setEditingInstructions] = useState(false);
  const [instructionContent, setInstructionContent] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [envEntries, setEnvEntries] = useState<EnvEntry[]>([]);
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvValue, setNewEnvValue] = useState('');
  const [configLayers, setConfigLayers] = useState<ConfigLayerEntry[]>([]);
  const [importData, setImportData] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [hasOpenagentDir, setHasOpenagentDir] = useState(false);

  // ─── Data Loading ──────────────────────────────────────────────────────────

  const loadConfig = useCallback(async () => {
    if (!projectDirectory) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Check if .openagent/ exists
      const hasConfig = api?.projectConfig?.hasProjectConfig
        ? await api.projectConfig.hasProjectConfig(projectDirectory)
        : false;
      setHasOpenagentDir(hasConfig);

      if (hasConfig && api?.projectConfig?.loadProject) {
        const projectConfig = await api.projectConfig.loadProject(projectDirectory);
        setConfig(projectConfig);
        setInstructionContent(projectConfig.customInstructions || '');

        // Parse env overrides into entries
        const entries: EnvEntry[] = Object.entries(projectConfig.envOverrides || {}).map(
          ([key, value]) => ({ key, value }),
        );
        setEnvEntries(entries);
      } else {
        setConfig(null);
      }

      // Load instructions
      if (api?.projectConfig?.getInstructions) {
        const instrs = await api.projectConfig.getInstructions(projectDirectory);
        setInstructions(instrs);
      }

      // Load config layers
      if (api?.projectConfig?.getConfigLayers) {
        const layers = await api.projectConfig.getConfigLayers(projectDirectory);
        setConfigLayers(layers || []);
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to load project config', message: err.message });
    } finally {
      setLoading(false);
    }
  }, [projectDirectory, addToast]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // ─── Actions ───────────────────────────────────────────────────────────────

  const handleInitializeProject = async () => {
    if (!projectDirectory || !api?.projectConfig?.initializeProject) return;
    try {
      await api.projectConfig.initializeProject(projectDirectory);
      setHasOpenagentDir(true);
      await loadConfig();
      addToast({ type: 'success', title: 'Project initialized', message: 'Created .openagent/ directory' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Initialization failed', message: err.message });
    }
  };

  const handleCreateAgentsMd = async () => {
    if (!projectDirectory || !api?.projectConfig?.createInstructions) return;
    try {
      await api.projectConfig.createInstructions(projectDirectory, 'markdown');
      await loadConfig();
      addToast({ type: 'success', title: 'AGENTS.md created' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to create AGENTS.md', message: err.message });
    }
  };

  const handleSaveInstructions = async () => {
    if (!config || !api?.projectConfig?.saveProject) return;
    try {
      const updated = { ...config, customInstructions: instructionContent };
      await api.projectConfig.saveProject(updated);
      setConfig(updated);
      setEditingInstructions(false);
      addToast({ type: 'success', title: 'Instructions saved' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Save failed', message: err.message });
    }
  };

  const handleToggleExtension = async (extensionId: string) => {
    if (!config || !api?.projectConfig?.saveProject) return;
    try {
      const enabled = config.enabledExtensions.includes(extensionId)
        ? config.enabledExtensions.filter((id: string) => id !== extensionId)
        : [...config.enabledExtensions, extensionId];
      const updated = { ...config, enabledExtensions: enabled };
      await api.projectConfig.saveProject(updated);
      setConfig(updated);
      addToast({
        type: 'info',
        title: enabled.includes(extensionId) ? 'Extension enabled' : 'Extension disabled',
      });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to update extension', message: err.message });
    }
  };

  const handleAddEnvEntry = async () => {
    if (!config || !newEnvKey.trim() || !api?.projectConfig?.saveProject) return;
    try {
      const updatedEnv = { ...config.envOverrides, [newEnvKey.trim()]: newEnvValue };
      const updated = { ...config, envOverrides: updatedEnv };
      await api.projectConfig.saveProject(updated);
      setConfig(updated);
      setEnvEntries([...envEntries, { key: newEnvKey.trim(), value: newEnvValue }]);
      setNewEnvKey('');
      setNewEnvValue('');
      addToast({ type: 'success', title: 'Environment variable added' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to add env var', message: err.message });
    }
  };

  const handleRemoveEnvEntry = async (key: string) => {
    if (!config || !api?.projectConfig?.saveProject) return;
    try {
      const updatedEnv = { ...config.envOverrides };
      delete updatedEnv[key];
      const updated = { ...config, envOverrides: updatedEnv };
      await api.projectConfig.saveProject(updated);
      setConfig(updated);
      setEnvEntries(envEntries.filter((e) => e.key !== key));
      addToast({ type: 'info', title: 'Environment variable removed' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to remove env var', message: err.message });
    }
  };

  const handleExport = async () => {
    if (!projectDirectory || !api?.projectConfig?.exportProjectConfig) return;
    try {
      const data = await api.projectConfig.exportProjectConfig(projectDirectory);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `openagent-project-config-${config?.name || 'project'}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast({ type: 'success', title: 'Config exported' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Export failed', message: err.message });
    }
  };

  const handleImport = async () => {
    if (!projectDirectory || !importData.trim() || !api?.projectConfig?.importProjectConfig) return;
    try {
      await api.projectConfig.importProjectConfig(projectDirectory, importData);
      setShowImportDialog(false);
      setImportData('');
      await loadConfig();
      addToast({ type: 'success', title: 'Config imported' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Import failed', message: err.message });
    }
  };

  // ─── Render Helpers ────────────────────────────────────────────────────────

  const renderSourceBadge = (source: ConfigSource) => {
    const colors: Record<ConfigSource, { bg: string; text: string }> = {
      project: { bg: '#22c55e20', text: '#22c55e' },
      global: { bg: '#3b82f620', text: '#3b82f6' },
      default: { bg: '#6b728020', text: '#6b7280' },
      none: { bg: '#ef444420', text: '#ef4444' },
    };
    const c = colors[source];
    return (
      <span
        className="text-xs px-1.5 py-0.5 rounded font-medium"
        style={{ background: c.bg, color: c.text }}
      >
        {source}
      </span>
    );
  };

  const renderMarkdownPreview = (content: string) => {
    // Simple markdown-to-HTML for preview
    const html = content
      .replace(/^### (.+)$/gm, '<h3 style="font-size:16px;font-weight:600;margin:8px 0 4px;color:var(--color-text-primary)">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 style="font-size:18px;font-weight:600;margin:12px 0 6px;color:var(--color-text-primary)">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 style="font-size:20px;font-weight:700;margin:16px 0 8px;color:var(--color-text-primary)">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code style="background:var(--color-bg-tertiary);padding:1px 4px;border-radius:3px;font-size:12px">$1</code>')
      .replace(/^- (.+)$/gm, '<li style="margin-left:16px;color:var(--color-text-secondary)">$1</li>')
      .replace(/^<!--(.+?)-->$/gm, '<span style="color:var(--color-text-muted);font-style:italic"><!--$1--></span>')
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\n/g, '<br/>');

    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  };

  // ─── Tab Content ───────────────────────────────────────────────────────────

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Project Info Card */}
      <div
        className="rounded-xl p-5 border"
        style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}
      >
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Project Information
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Directory</span>
            <span className="text-sm font-mono" style={{ color: 'var(--color-text-primary)' }}>
              {projectDirectory || 'No project selected'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Detected Type</span>
            <div className="flex items-center gap-2">
              <span>{PROJECT_TYPE_INFO[config?.detectedType || 'unknown'].icon}</span>
              <span
                className="text-sm px-2 py-0.5 rounded"
                style={{
                  background: PROJECT_TYPE_INFO[config?.detectedType || 'unknown'].color + '20',
                  color: PROJECT_TYPE_INFO[config?.detectedType || 'unknown'].color,
                }}
              >
                {PROJECT_TYPE_INFO[config?.detectedType || 'unknown'].label}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>.openagent/ exists</span>
            <span className={`text-sm ${hasOpenagentDir ? 'text-green-400' : 'text-red-400'}`}>
              {hasOpenagentDir ? '✓ Yes' : '✗ No'}
            </span>
          </div>
          {config?.agentMode && (
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Agent Mode</span>
              <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {config.agentMode}
              </span>
            </div>
          )}
          {config?.updatedAt && (
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Last Updated</span>
              <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                {new Date(config.updatedAt).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* .openagent/ Directory Structure */}
      <div
        className="rounded-xl p-5 border"
        style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}
      >
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          .openagent/ Directory Contents
        </h3>
        <div className="space-y-1.5 font-mono text-sm">
          {hasOpenagentDir ? (
            <>
              <div className="flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                <span>📁</span> .openagent/
              </div>
              <div className="flex items-center gap-2 ml-4" style={{ color: instructions.some(i => i.filePath.includes('AGENTS.md')) ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                <span>{instructions.some(i => i.filePath.includes('AGENTS.md')) ? '📄' : '▫️'}</span>
                AGENTS.md
              </div>
              <div className="flex items-center gap-2 ml-4" style={{ color: instructions.some(i => i.filePath.includes('instructions.md')) ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                <span>{instructions.some(i => i.filePath.includes('instructions.md')) ? '📄' : '▫️'}</span>
                instructions.md
              </div>
              <div className="flex items-center gap-2 ml-4" style={{ color: config ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                <span>{config ? '⚙️' : '▫️'}</span>
                config.json
              </div>
              <div className="flex items-center gap-2 ml-4" style={{ color: (config?.enabledExtensions?.length || 0) > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                <span>{(config?.enabledExtensions?.length || 0) > 0 ? '🧩' : '▫️'}</span>
                extensions.json
              </div>
              <div className="flex items-center gap-2 ml-4" style={{ color: Object.keys(config?.permissionOverrides || {}).length > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                <span>{Object.keys(config?.permissionOverrides || {}).length > 0 ? '🔒' : '▫️'}</span>
                permissions.json
              </div>
              <div className="flex items-center gap-2 ml-4" style={{ color: Object.keys(config?.envOverrides || {}).length > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                <span>{Object.keys(config?.envOverrides || {}).length > 0 ? '🔑' : '▫️'}</span>
                .env
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <p style={{ color: 'var(--color-text-tertiary)' }}>.openagent/ directory not found</p>
              <button
                onClick={handleInitializeProject}
                className="mt-3 px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--color-accent)', color: 'white' }}
              >
                Create .openagent/ Directory
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Suggested Extensions */}
      {config?.suggestedExtensions && config.suggestedExtensions.length > 0 && (
        <div
          className="rounded-xl p-5 border"
          style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}
        >
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Suggested Extensions
          </h3>
          <div className="space-y-2">
            {config.suggestedExtensions.map((extId) => {
              const extInfo = AVAILABLE_EXTENSIONS.find((e) => e.id === extId);
              return (
                <div
                  key={extId}
                  className="flex items-center justify-between p-3 rounded-lg"
                  style={{ background: 'var(--color-bg-primary)' }}
                >
                  <div>
                    <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {extInfo?.name || extId}
                    </span>
                    <span className="text-xs ml-2" style={{ color: 'var(--color-text-tertiary)' }}>
                      {extInfo?.description || ''}
                    </span>
                  </div>
                  <button
                    onClick={() => handleToggleExtension(extId)}
                    className="px-3 py-1 rounded text-xs font-medium"
                    style={{
                      background: config.enabledExtensions.includes(extId) ? 'var(--color-accent)' : 'transparent',
                      color: config.enabledExtensions.includes(extId) ? 'white' : 'var(--color-accent)',
                      border: `1px solid var(--color-accent)`,
                    }}
                  >
                    {config.enabledExtensions.includes(extId) ? 'Enabled' : 'Enable'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div
        className="rounded-xl p-5 border"
        style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}
      >
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Quick Actions
        </h3>
        <div className="flex flex-wrap gap-2">
          {!hasOpenagentDir && (
            <button
              onClick={handleInitializeProject}
              className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
              style={{ background: 'var(--color-accent)', color: 'white' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Create .openagent/
            </button>
          )}
          <button
            onClick={handleCreateAgentsMd}
            className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
            style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-primary)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Initialize AGENTS.md
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
            style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-primary)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export Config
          </button>
          <button
            onClick={() => setShowImportDialog(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
            style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-primary)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Import Config
          </button>
        </div>
      </div>
    </div>
  );

  const renderInstructions = () => (
    <div className="space-y-4">
      {/* Instructions List */}
      {instructions.length > 0 && (
        <div
          className="rounded-xl p-5 border"
          style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}
        >
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Instruction Files
          </h3>
          <div className="space-y-2">
            {instructions.map((instr, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ background: 'var(--color-bg-primary)' }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">📄</span>
                  <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {instr.filePath.split('/').pop()}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      {instr.format} • Modified {new Date(instr.lastModified).toLocaleString()}
                    </div>
                  </div>
                </div>
                <span
                  className="text-xs px-2 py-0.5 rounded"
                  style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
                >
                  {instr.content.split('\n').length} lines
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructions Editor */}
      <div
        className="rounded-xl border"
        style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: 'var(--color-border-primary)' }}
        >
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Project Instructions
          </h3>
          <div className="flex items-center gap-2">
            {editingInstructions && (
              <>
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="px-3 py-1 rounded text-xs font-medium"
                  style={{
                    background: showPreview ? 'var(--color-accent)' : 'transparent',
                    color: showPreview ? 'white' : 'var(--color-accent)',
                    border: '1px solid var(--color-accent)',
                  }}
                >
                  Preview
                </button>
                <button
                  onClick={handleSaveInstructions}
                  className="px-3 py-1 rounded text-xs font-medium"
                  style={{ background: 'var(--color-accent)', color: 'white' }}
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditingInstructions(false);
                    setInstructionContent(config?.customInstructions || '');
                  }}
                  className="px-3 py-1 rounded text-xs font-medium"
                  style={{ background: 'transparent', color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border-primary)' }}
                >
                  Cancel
                </button>
              </>
            )}
            {!editingInstructions && (
              <button
                onClick={() => setEditingInstructions(true)}
                className="px-3 py-1 rounded text-xs font-medium"
                style={{ background: 'var(--color-accent)', color: 'white' }}
              >
                Edit
              </button>
            )}
          </div>
        </div>
        <div className="p-5">
          {editingInstructions ? (
            showPreview ? (
              <div
                className="min-h-[300px] p-4 rounded-lg"
                style={{ background: 'var(--color-bg-primary)' }}
              >
                {renderMarkdownPreview(instructionContent)}
              </div>
            ) : (
              <textarea
                value={instructionContent}
                onChange={(e) => setInstructionContent(e.target.value)}
                className="w-full min-h-[300px] p-4 rounded-lg font-mono text-sm resize-y"
                style={{
                  background: 'var(--color-bg-primary)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border-primary)',
                }}
                placeholder="# Project Instructions&#10;&#10;Add instructions for OpenAgent here..."
              />
            )
          ) : (
            <div
              className="min-h-[200px] p-4 rounded-lg"
              style={{ background: 'var(--color-bg-primary)' }}
            >
              {config?.customInstructions ? (
                renderMarkdownPreview(config.customInstructions)
              ) : (
                <p className="text-center py-8" style={{ color: 'var(--color-text-tertiary)' }}>
                  No project instructions yet.
                  <br />
                  Click "Edit" to add instructions, or click "Initialize AGENTS.md" in the Overview tab.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderExtensions = () => (
    <div className="space-y-3">
      {AVAILABLE_EXTENSIONS.map((ext) => {
        const isEnabled = config?.enabledExtensions?.includes(ext.id) || false;
        const isSuggested = config?.suggestedExtensions?.includes(ext.id) || false;
        return (
          <div
            key={ext.id}
            className="flex items-center justify-between p-4 rounded-xl border"
            style={{
              background: 'var(--color-bg-secondary)',
              borderColor: isEnabled ? 'var(--color-accent)' : 'var(--color-border-primary)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                style={{ background: isEnabled ? 'var(--color-accent-soft)' : 'var(--color-bg-primary)', color: isEnabled ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
              >
                🧩
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    {ext.name}
                  </span>
                  {isSuggested && (
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#f59e0b20', color: '#f59e0b' }}>
                      Suggested
                    </span>
                  )}
                </div>
                <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  {ext.description}
                </span>
              </div>
            </div>
            <button
              onClick={() => handleToggleExtension(ext.id)}
              className="relative w-11 h-6 rounded-full transition-colors"
              style={{
                background: isEnabled ? 'var(--color-accent)' : 'var(--color-bg-primary)',
                border: `1px solid ${isEnabled ? 'var(--color-accent)' : 'var(--color-border-primary)'}`,
              }}
            >
              <span
                className="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
                style={{
                  background: isEnabled ? 'white' : 'var(--color-text-muted)',
                  left: isEnabled ? '24px' : '2px',
                }}
              />
            </button>
          </div>
        );
      })}
    </div>
  );

  const renderPermissions = () => (
    <div className="space-y-4">
      <div
        className="rounded-xl p-5 border"
        style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}
      >
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Permission Overrides
        </h3>
        {config && Object.keys(config.permissionOverrides).length > 0 ? (
          <div className="space-y-2">
            {Object.entries(config.permissionOverrides).map(([key, value]) => (
              <div
                key={key}
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ background: 'var(--color-bg-primary)' }}
              >
                <span className="text-sm font-mono" style={{ color: 'var(--color-text-primary)' }}>{key}</span>
                <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  {JSON.stringify(value)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center py-6" style={{ color: 'var(--color-text-tertiary)' }}>
            No permission overrides for this project.
            <br />
            <span className="text-xs">Global permissions will apply.</span>
          </p>
        )}
      </div>
    </div>
  );

  const renderEnv = () => (
    <div className="space-y-4">
      {/* Existing entries */}
      <div
        className="rounded-xl border"
        style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}
      >
        <div
          className="px-5 py-3 border-b"
          style={{ borderColor: 'var(--color-border-primary)' }}
        >
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Environment Variables (.env)
          </h3>
        </div>
        <div className="p-5 space-y-2 max-h-96 overflow-y-auto">
          {envEntries.length > 0 ? (
            envEntries.map((entry) => (
              <div
                key={entry.key}
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ background: 'var(--color-bg-primary)' }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono font-medium" style={{ color: 'var(--color-accent)' }}>
                    {entry.key}
                  </span>
                  <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>=</span>
                  <span className="text-sm font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                    {entry.value.includes('key') || entry.value.includes('secret') || entry.value.includes('token')
                      ? '••••••••'
                      : entry.value}
                  </span>
                </div>
                <button
                  onClick={() => handleRemoveEnvEntry(entry.key)}
                  className="p-1 rounded transition-colors"
                  style={{ color: 'var(--color-text-muted)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-error)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                  title="Remove variable"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))
          ) : (
            <p className="text-center py-6" style={{ color: 'var(--color-text-tertiary)' }}>
              No environment variables set.
            </p>
          )}
        </div>
      </div>

      {/* Add new entry */}
      <div
        className="rounded-xl p-5 border"
        style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}
      >
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Add Variable
        </h3>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newEnvKey}
            onChange={(e) => setNewEnvKey(e.target.value)}
            placeholder="KEY"
            className="flex-1 px-3 py-2 rounded-lg font-mono text-sm"
            style={{
              background: 'var(--color-bg-primary)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border-primary)',
            }}
          />
          <span style={{ color: 'var(--color-text-muted)' }}>=</span>
          <input
            type="text"
            value={newEnvValue}
            onChange={(e) => setNewEnvValue(e.target.value)}
            placeholder="value"
            className="flex-1 px-3 py-2 rounded-lg font-mono text-sm"
            style={{
              background: 'var(--color-bg-primary)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border-primary)',
            }}
          />
          <button
            onClick={handleAddEnvEntry}
            disabled={!newEnvKey.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              background: newEnvKey.trim() ? 'var(--color-accent)' : 'var(--color-bg-primary)',
              color: newEnvKey.trim() ? 'white' : 'var(--color-text-muted)',
              border: `1px solid ${newEnvKey.trim() ? 'var(--color-accent)' : 'var(--color-border-primary)'}`,
            }}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );

  const renderLayers = () => (
    <div className="space-y-4">
      <div
        className="rounded-xl p-5 border"
        style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}
      >
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Config Layer Precedence
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
          Later layers override earlier ones. The effective value is determined by the highest-priority layer that provides it.
        </p>

        {/* Layer legend */}
        <div className="flex items-center gap-4 mb-4">
          {(['project', 'global', 'default'] as ConfigSource[]).map((source) => renderSourceBadge(source))}
        </div>

        {/* Layer entries */}
        {configLayers.length > 0 ? (
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {configLayers.map((entry, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ background: 'var(--color-bg-primary)' }}
              >
                <div className="flex items-center gap-3">
                  {renderSourceBadge(entry.source)}
                  <span className="text-sm font-mono" style={{ color: 'var(--color-text-primary)' }}>
                    {entry.key}
                  </span>
                </div>
                <span className="text-sm font-mono truncate max-w-[200px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {JSON.stringify(entry.value)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8" style={{ color: 'var(--color-text-tertiary)' }}>
            <p>No config layers loaded.</p>
            <p className="text-xs mt-1">Load a project to see its config layer breakdown.</p>
          </div>
        )}
      </div>
    </div>
  );

  // ─── Main Render ───────────────────────────────────────────────────────────

  const TABS: { id: ViewTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'overview',
      label: 'Overview',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      ),
    },
    {
      id: 'instructions',
      label: 'Instructions',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
    },
    {
      id: 'extensions',
      label: 'Extensions',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      ),
    },
    {
      id: 'permissions',
      label: 'Permissions',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      ),
    },
    {
      id: 'env',
      label: 'Environment',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      ),
    },
    {
      id: 'layers',
      label: 'Layers',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
        <div className="text-center">
          <div
            className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3"
            style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }}
          />
          <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Loading project config...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--color-bg-primary)' }}>
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Project Config</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
              {config?.name || projectDirectory || 'No project selected'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {PROJECT_TYPE_INFO[config?.detectedType || 'unknown'].icon}
            <span
              className="text-sm px-2 py-1 rounded"
              style={{
                background: PROJECT_TYPE_INFO[config?.detectedType || 'unknown'].color + '20',
                color: PROJECT_TYPE_INFO[config?.detectedType || 'unknown'].color,
              }}
            >
              {PROJECT_TYPE_INFO[config?.detectedType || 'unknown'].label}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div
          className="flex items-center gap-1 mb-6 p-1 rounded-xl"
          style={{ background: 'var(--color-bg-secondary)' }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1 justify-center"
              style={{
                background: activeTab === tab.id ? 'var(--color-bg-primary)' : 'transparent',
                color: activeTab === tab.id ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'instructions' && renderInstructions()}
        {activeTab === 'extensions' && renderExtensions()}
        {activeTab === 'permissions' && renderPermissions()}
        {activeTab === 'env' && renderEnv()}
        {activeTab === 'layers' && renderLayers()}
      </div>

      {/* Import Dialog */}
      {showImportDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
        >
          <div
            className="rounded-xl p-6 max-w-lg w-full mx-4"
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-primary)' }}
          >
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
              Import Project Config
            </h3>
            <textarea
              value={importData}
              onChange={(e) => setImportData(e.target.value)}
              placeholder="Paste exported JSON config here..."
              className="w-full h-48 p-3 rounded-lg font-mono text-sm resize-none"
              style={{
                background: 'var(--color-bg-primary)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border-primary)',
              }}
            />
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowImportDialog(false); setImportData(''); }}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-primary)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!importData.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{
                  background: importData.trim() ? 'var(--color-accent)' : 'var(--color-bg-primary)',
                  color: importData.trim() ? 'white' : 'var(--color-text-muted)',
                }}
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectConfigView;
