/**
 * OpenAgent-Desktop - Extensions Marketplace View Component
 *
 * Enhanced grid of extensions with icons, categories, descriptions,
 * search/filter by category, install/uninstall/enable/disable buttons,
 * required env vars per extension, and clear enabled/disabled states.
 */

import React, { useState, useMemo } from 'react';
import { ExtensionInfo, ExtensionCategory, Toast } from '../../types';

const api = (window as any).openagent;

// ─── Props ─────────────────────────────────────────────────────────────────────

interface ExtensionsViewProps {
  extensions: ExtensionInfo[];
  onRefresh: () => Promise<void>;
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

// ─── Categories ────────────────────────────────────────────────────────────────

const CATEGORIES: { value: ExtensionCategory | 'all'; label: string; icon: string }[] = [
  { value: 'all', label: 'All', icon: '📦' },
  { value: 'development', label: 'Development', icon: '💻' },
  { value: 'productivity', label: 'Productivity', icon: '⚡' },
  { value: 'browser', label: 'Browser', icon: '🌐' },
  { value: 'cloud', label: 'Cloud', icon: '☁️' },
  { value: 'database', label: 'Database', icon: '🗃️' },
  { value: 'communication', label: 'Communication', icon: '💬' },
  { value: 'design', label: 'Design', icon: '🎨' },
  { value: 'media', label: 'Media', icon: '🎬' },
  { value: 'search', label: 'Search', icon: '🔍' },
  { value: 'memory', label: 'Memory', icon: '🧠' },
  { value: 'system', label: 'System', icon: '⚙️' },
  { value: 'document_generation', label: 'Documents', icon: '📄' },
  { value: 'automation', label: 'Automation', icon: '🤖' },
  { value: 'data', label: 'Data', icon: '📊' },
];

// ─── Category Icon Colors ──────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  development: '#22c55e',
  productivity: '#f59e0b',
  browser: '#3b82f6',
  cloud: '#06b6d4',
  database: '#8b5cf6',
  communication: '#ec4899',
  design: '#f43f5e',
  media: '#a855f7',
  search: '#10b981',
  memory: '#6366f1',
  system: '#6b7280',
  document_generation: '#0ea5e9',
  automation: '#d946ef',
  data: '#14b8a6',
};

// ─── Sample Extensions for Marketplace Display ─────────────────────────────────

const MARKETPLACE_EXTENSIONS: Array<{
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: ExtensionCategory;
  envVars: string[];
  capabilities: string[];
  icon: string;
  trusted: boolean;
  downloads?: number;
}> = [
  { id: 'ext-shell', name: 'Shell', description: 'Execute shell commands in the sandbox environment with full terminal support', version: '1.0.0', author: 'OpenAgent', category: 'development', envVars: [], capabilities: ['execute', 'terminal'], icon: '🖥️', trusted: true, downloads: 15420 },
  { id: 'ext-browser-use', name: 'Browser Use', description: 'Control web browsers, navigate pages, fill forms, and extract data', version: '1.2.0', author: 'OpenAgent', category: 'browser', envVars: ['BROWSER_HEADLESS'], capabilities: ['navigate', 'click', 'type', 'screenshot'], icon: '🌐', trusted: true, downloads: 12350 },
  { id: 'ext-file-editor', name: 'File Editor', description: 'Read, write, create, and modify files and directories', version: '1.1.0', author: 'OpenAgent', category: 'development', envVars: [], capabilities: ['read', 'write', 'create', 'delete'], icon: '📝', trusted: true, downloads: 18200 },
  { id: 'ext-memory', name: 'Memory', description: 'Persistent memory storage for conversations and context across sessions', version: '1.0.0', author: 'OpenAgent', category: 'memory', envVars: [], capabilities: ['store', 'recall', 'search'], icon: '🧠', trusted: true, downloads: 9800 },
  { id: 'ext-doc-generator', name: 'Document Generator', description: 'Create professional PPTs, Word docs, Excel sheets, and PDFs', version: '1.3.0', author: 'OpenAgent', category: 'document_generation', envVars: [], capabilities: ['pptx', 'docx', 'xlsx', 'pdf'], icon: '📄', trusted: true, downloads: 11200 },
  { id: 'ext-web-search', name: 'Web Search', description: 'Search the internet and retrieve real-time information from the web', version: '1.1.0', author: 'OpenAgent', category: 'search', envVars: ['SEARCH_API_KEY'], capabilities: ['search', 'scrape'], icon: '🔍', trusted: true, downloads: 14300 },
  { id: 'ext-docker', name: 'Docker', description: 'Manage Docker containers, images, and compose stacks', version: '0.9.0', author: 'Community', category: 'cloud', envVars: ['DOCKER_HOST'], capabilities: ['containers', 'images', 'compose'], icon: '🐳', trusted: false, downloads: 5600 },
  { id: 'ext-database', name: 'Database', description: 'Connect to PostgreSQL, MySQL, SQLite and other databases', version: '1.0.0', author: 'Community', category: 'database', envVars: ['DB_CONNECTION_STRING'], capabilities: ['query', 'migrate', 'schema'], icon: '🗃️', trusted: false, downloads: 4200 },
  { id: 'ext-github', name: 'GitHub', description: 'Interact with GitHub repositories, issues, pull requests, and actions', version: '1.2.0', author: 'Community', category: 'development', envVars: ['GITHUB_TOKEN'], capabilities: ['repos', 'issues', 'prs', 'actions'], icon: '🐙', trusted: false, downloads: 8900 },
  { id: 'ext-slack', name: 'Slack', description: 'Send messages, read channels, and manage Slack workspaces', version: '0.8.0', author: 'Community', category: 'communication', envVars: ['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN'], capabilities: ['message', 'channels', 'files'], icon: '💬', trusted: false, downloads: 3100 },
  { id: 'ext-image-gen', name: 'Image Generator', description: 'Generate images from text descriptions using AI models', version: '1.0.0', author: 'Community', category: 'design', envVars: ['IMAGE_API_KEY'], capabilities: ['generate', 'edit', 'variations'], icon: '🎨', trusted: false, downloads: 6700 },
  { id: 'ext-scheduler', name: 'Scheduler', description: 'Schedule tasks and recipes to run at specific times or intervals', version: '0.7.0', author: 'Community', category: 'automation', envVars: [], capabilities: ['cron', 'interval', 'delay'], icon: '⏰', trusted: false, downloads: 2800 },
  { id: 'ext-data-analyzer', name: 'Data Analyzer', description: 'Analyze datasets, create visualizations, and generate reports', version: '1.1.0', author: 'Community', category: 'data', envVars: [], capabilities: ['analyze', 'visualize', 'report'], icon: '📊', trusted: false, downloads: 4500 },
  { id: 'ext-media-handler', name: 'Media Handler', description: 'Process images, audio, and video files with ffmpeg and other tools', version: '0.9.0', author: 'Community', category: 'media', envVars: ['FFMPEG_PATH'], capabilities: ['convert', 'resize', 'trim'], icon: '🎬', trusted: false, downloads: 3600 },
  { id: 'ext-system-monitor', name: 'System Monitor', description: 'Monitor CPU, memory, disk, and network usage in real-time', version: '1.0.0', author: 'Community', category: 'system', envVars: [], capabilities: ['monitor', 'alert', 'log'], icon: '⚙️', trusted: false, downloads: 2200 },
];

// ─── Component ─────────────────────────────────────────────────────────────────

const ExtensionsView: React.FC<ExtensionsViewProps> = ({ extensions, onRefresh, addToast }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ExtensionCategory | 'all'>('all');
  const [selectedExtension, setSelectedExtension] = useState<ExtensionInfo | null>(null);
  const [installUrl, setInstallUrl] = useState('');
  const [showInstallForm, setShowInstallForm] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [selectedMarketplaceExt, setSelectedMarketplaceExt] = useState<typeof MARKETPLACE_EXTENSIONS[0] | null>(null);

  // Merge real extensions with marketplace data
  const allExtensions = useMemo(() => {
    const realIds = new Set(extensions.map((e) => e.id));
    const marketplaceItems = MARKETPLACE_EXTENSIONS.filter((m) => !realIds.has(m.id)).map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      version: m.version,
      author: m.author,
      enabled: false,
      installed: false,
      category: m.category,
      capabilities: m.capabilities,
      builtin: false,
      trusted: m.trusted,
    }));
    return [...extensions, ...marketplaceItems] as ExtensionInfo[];
  }, [extensions]);

  const filteredExtensions = useMemo(() => {
    let result = allExtensions;

    if (categoryFilter !== 'all') {
      result = result.filter((e) => e.category === categoryFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(query) ||
          e.description.toLowerCase().includes(query) ||
          e.id.toLowerCase().includes(query)
      );
    }

    return result;
  }, [allExtensions, searchQuery, categoryFilter]);

  const installedCount = extensions.filter((e) => e.installed).length;
  const enabledCount = extensions.filter((e) => e.enabled).length;
  const builtinCount = extensions.filter((e) => e.builtin).length;

  const handleToggleExtension = async (extensionId: string, currentlyEnabled: boolean) => {
    if (!api?.extensions) return;
    try {
      if (currentlyEnabled) {
        await api.extensions.disable(extensionId);
      } else {
        await api.extensions.enable(extensionId);
      }
      await onRefresh();
      addToast({
        type: 'success',
        title: `Extension ${currentlyEnabled ? 'disabled' : 'enabled'}`,
      });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to toggle extension', message: err.message });
    }
  };

  const handleInstall = async () => {
    if (!api?.extensions?.install || !installUrl.trim()) return;
    setInstalling(true);
    try {
      await api.extensions.install(installUrl.trim());
      await onRefresh();
      setInstallUrl('');
      setShowInstallForm(false);
      addToast({ type: 'success', title: 'Extension installed' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Installation failed', message: err.message });
    } finally {
      setInstalling(false);
    }
  };

  const handleInstallMarketplace = async (ext: typeof MARKETPLACE_EXTENSIONS[0]) => {
    if (!api?.extensions?.install) {
      addToast({ type: 'info', title: 'Install not available', message: 'Extension API not connected' });
      return;
    }
    setInstalling(true);
    try {
      await api.extensions.install(ext.id);
      await onRefresh();
      addToast({ type: 'success', title: `${ext.name} installed` });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Installation failed', message: err.message });
    } finally {
      setInstalling(false);
    }
  };

  const handleUninstall = async (extensionId: string) => {
    if (!confirm('Uninstall this extension?')) return;
    addToast({ type: 'info', title: 'Uninstall not yet supported via API' });
  };

  // Find marketplace metadata for an extension
  const getMarketplaceMeta = (extId: string) => MARKETPLACE_EXTENSIONS.find((m) => m.id === extId);

  return (
    <div className="h-full flex" style={{ background: 'var(--color-bg-primary)' }}>
      {/* Main List */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="p-4 border-b" style={{ borderColor: 'var(--color-border-secondary)' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Extensions</h1>
              <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                {enabledCount} enabled · {installedCount} installed · {builtinCount} built-in · {MARKETPLACE_EXTENSIONS.length} available
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowInstallForm(!showInstallForm)}
                className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
                style={{ background: 'var(--color-accent)', color: 'white' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Install
              </button>
              <button
                onClick={onRefresh}
                className="p-2 rounded-lg border transition-colors"
                style={{ borderColor: 'var(--color-border-primary)', color: 'var(--color-text-tertiary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              </button>
            </div>
          </div>

          {/* Install Form */}
          {showInstallForm && (
            <div className="mb-4 p-3 rounded-lg border animate-fade-in" style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={installUrl}
                  onChange={(e) => setInstallUrl(e.target.value)}
                  placeholder="Extension URL or npm package name"
                  className="flex-1 px-3 py-2 rounded-lg border text-sm"
                  style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
                  onKeyDown={(e) => e.key === 'Enter' && handleInstall()}
                />
                <button
                  onClick={handleInstall}
                  disabled={installing || !installUrl.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  style={{ background: 'var(--color-accent)', color: 'white' }}
                >
                  {installing ? 'Installing...' : 'Install'}
                </button>
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--color-warning)' }}>
                ⚠️ Only install extensions from trusted sources.
              </p>
            </div>
          )}

          {/* Search & Filter */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--color-bg-secondary)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search extensions..."
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: 'var(--color-text-primary)' }}
                />
              </div>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setCategoryFilter(cat.value)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors"
                  style={{
                    background: categoryFilter === cat.value ? 'var(--color-accent-soft)' : 'var(--color-bg-secondary)',
                    color: categoryFilter === cat.value ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                    border: categoryFilter === cat.value ? '1px solid var(--color-accent)' : '1px solid var(--color-border-primary)',
                  }}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Extension Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredExtensions.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'var(--color-text-tertiary)' }}>
              <p className="text-lg">No extensions found</p>
              <p className="text-sm mt-1">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredExtensions.map((ext) => {
                const meta = getMarketplaceMeta(ext.id);
                const categoryColor = CATEGORY_COLORS[ext.category || ''] || 'var(--color-accent)';
                return (
                  <ExtensionCardEnhanced
                    key={ext.id}
                    extension={ext}
                    categoryColor={categoryColor}
                    marketplaceMeta={meta}
                    onToggle={handleToggleExtension}
                    onInstall={meta ? () => handleInstallMarketplace(meta) : undefined}
                    onUninstall={ext.installed && !ext.builtin ? () => handleUninstall(ext.id) : undefined}
                    onSelect={() => {
                      setSelectedExtension(ext);
                      setSelectedMarketplaceExt(meta || null);
                    }}
                    isSelected={selectedExtension?.id === ext.id}
                    installing={installing}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {(selectedExtension || selectedMarketplaceExt) && (
        <ExtensionDetailPanelEnhanced
          extension={selectedExtension!}
          marketplaceMeta={selectedMarketplaceExt}
          onToggle={handleToggleExtension}
          onInstall={selectedMarketplaceExt ? () => handleInstallMarketplace(selectedMarketplaceExt) : undefined}
          onUninstall={selectedExtension?.installed && !selectedExtension?.builtin ? () => handleUninstall(selectedExtension!.id) : undefined}
          onClose={() => {
            setSelectedExtension(null);
            setSelectedMarketplaceExt(null);
          }}
          addToast={addToast}
          installing={installing}
        />
      )}
    </div>
  );
};

// ─── Enhanced Extension Card ───────────────────────────────────────────────────

const ExtensionCardEnhanced: React.FC<{
  extension: ExtensionInfo;
  categoryColor: string;
  marketplaceMeta: typeof MARKETPLACE_EXTENSIONS[0] | undefined;
  onToggle: (id: string, enabled: boolean) => void;
  onInstall?: () => void;
  onUninstall?: () => void;
  onSelect: () => void;
  isSelected: boolean;
  installing: boolean;
}> = ({ extension, categoryColor, marketplaceMeta, onToggle, onInstall, onUninstall, onSelect, isSelected, installing }) => (
  <div
    onClick={onSelect}
    className="rounded-xl p-4 border cursor-pointer transition-all group"
    style={{
      background: isSelected ? 'var(--color-accent-soft)' : 'var(--color-bg-secondary)',
      borderColor: isSelected ? 'var(--color-accent)' : 'var(--color-border-primary)',
    }}
    onMouseEnter={(e) => {
      if (!isSelected) e.currentTarget.style.borderColor = 'var(--color-accent)';
    }}
    onMouseLeave={(e) => {
      if (!isSelected) e.currentTarget.style.borderColor = 'var(--color-border-primary)';
    }}
  >
    {/* Header */}
    <div className="flex items-start justify-between mb-2">
      <div className="flex items-center gap-2.5">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
          style={{ background: `${categoryColor}15` }}
        >
          {marketplaceMeta?.icon || extension.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
              {extension.name}
            </span>
            {extension.builtin && (
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}>
                built-in
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>v{extension.version}</span>
            {extension.category && (
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${categoryColor}15`, color: categoryColor }}>
                {extension.category.replace('_', ' ')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Status indicator */}
      {extension.installed ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(extension.id, extension.enabled);
          }}
          className="relative w-9 h-5 rounded-full flex-shrink-0 transition-colors"
          style={{ background: extension.enabled ? 'var(--color-success)' : 'var(--color-bg-tertiary)' }}
        >
          <span
            className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
            style={{ transform: extension.enabled ? 'translateX(16px)' : 'translateX(0)' }}
          />
        </button>
      ) : (
        <span
          className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}
        >
          Available
        </span>
      )}
    </div>

    {/* Description */}
    <p className="text-xs line-clamp-2 mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
      {extension.description}
    </p>

    {/* Env vars badge */}
    {marketplaceMeta && marketplaceMeta.envVars.length > 0 && (
      <div className="flex items-center gap-1 mb-2">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span className="text-xs" style={{ color: 'var(--color-warning)' }}>
          {marketplaceMeta.envVars.length} env var{marketplaceMeta.envVars.length > 1 ? 's' : ''} required
        </span>
      </div>
    )}

    {/* Actions */}
    <div className="flex items-center gap-2">
      {!extension.installed && onInstall && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onInstall();
          }}
          disabled={installing}
          className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
          style={{ background: 'var(--color-accent)', color: 'white' }}
        >
          {installing ? 'Installing...' : 'Install'}
        </button>
      )}
      {extension.installed && !extension.enabled && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(extension.id, false);
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--color-success)' }}
        >
          Enable
        </button>
      )}
      {extension.installed && extension.enabled && (
        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-success)' }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Active
        </span>
      )}
      {extension.installed && !extension.builtin && onUninstall && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onUninstall();
          }}
          className="ml-auto px-2 py-1 rounded-lg text-xs transition-colors"
          style={{ color: 'var(--color-text-muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-error)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
        >
          Uninstall
        </button>
      )}
      {!extension.trusted && extension.installed && (
        <span className="ml-auto flex items-center gap-1 text-xs" style={{ color: 'var(--color-warning)' }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          Untrusted
        </span>
      )}
      {marketplaceMeta?.downloads && !extension.installed && (
        <span className="ml-auto text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {marketplaceMeta.downloads.toLocaleString()} ↓
        </span>
      )}
    </div>
  </div>
);

// ─── Enhanced Detail Panel ─────────────────────────────────────────────────────

const ExtensionDetailPanelEnhanced: React.FC<{
  extension: ExtensionInfo;
  marketplaceMeta: typeof MARKETPLACE_EXTENSIONS[0] | null;
  onToggle: (id: string, enabled: boolean) => void;
  onInstall?: () => void;
  onUninstall?: () => void;
  onClose: () => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  installing: boolean;
}> = ({ extension, marketplaceMeta, onToggle, onInstall, onUninstall, onClose, addToast, installing }) => {
  const categoryColor = CATEGORY_COLORS[extension.category || ''] || 'var(--color-accent)';

  return (
    <div
      className="w-80 border-l flex flex-col h-full"
      style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-secondary)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--color-border-secondary)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Extension Details</h3>
        <button
          onClick={onClose}
          className="p-1 rounded transition-colors"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Icon & Name */}
        <div className="flex items-center gap-3">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl"
            style={{ background: `${categoryColor}15` }}
          >
            {marketplaceMeta?.icon || extension.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{extension.name}</div>
            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              v{extension.version} by {extension.author}
            </div>
            {extension.category && (
              <span className="text-xs px-1.5 py-0.5 rounded mt-1 inline-block" style={{ background: `${categoryColor}15`, color: categoryColor }}>
                {extension.category.replace('_', ' ')}
              </span>
            )}
          </div>
        </div>

        {/* Status */}
        <div
          className="p-3 rounded-lg flex items-center gap-2"
          style={{
            background: extension.installed
              ? extension.enabled
                ? 'rgba(34,197,94,0.08)'
                : 'var(--color-bg-tertiary)'
              : 'var(--color-bg-tertiary)',
          }}
        >
          {extension.installed ? (
            extension.enabled ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--color-success)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--color-success)' }}>Enabled & Active</span>
              </>
            ) : (
              <>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--color-text-muted)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--color-text-tertiary)' }}>Installed but Disabled</span>
              </>
            )
          ) : (
            <>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--color-text-muted)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--color-text-tertiary)' }}>Not Installed</span>
            </>
          )}
        </div>

        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{extension.description}</p>

        {/* Toggle */}
        {extension.installed && (
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Enabled</span>
            <button
              onClick={() => onToggle(extension.id, extension.enabled)}
              className="relative w-10 h-5 rounded-full transition-colors"
              style={{ background: extension.enabled ? 'var(--color-success)' : 'var(--color-bg-tertiary)' }}
            >
              <span
                className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                style={{ transform: extension.enabled ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </button>
          </div>
        )}

        {/* Capabilities */}
        {extension.capabilities && extension.capabilities.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-tertiary)' }}>CAPABILITIES</h4>
            <div className="flex flex-wrap gap-1.5">
              {extension.capabilities.map((cap) => (
                <span key={cap} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
                  {cap}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Required Env Vars */}
        {marketplaceMeta && marketplaceMeta.envVars.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--color-warning)' }}>
              ⚠️ REQUIRED ENVIRONMENT VARIABLES
            </h4>
            <div className="space-y-1.5">
              {marketplaceMeta.envVars.map((envVar) => (
                <div
                  key={envVar}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{ background: 'var(--color-bg-tertiary)' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <code className="text-xs font-mono" style={{ color: 'var(--color-text-primary)' }}>{envVar}</code>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(envVar);
                      addToast({ type: 'info', title: 'Copied to clipboard' });
                    }}
                    className="ml-auto text-xs"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    Copy
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Downloads */}
        {marketplaceMeta?.downloads && (
          <div>
            <h4 className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-tertiary)' }}>DOWNLOADS</h4>
            <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
              {marketplaceMeta.downloads.toLocaleString()}
            </span>
          </div>
        )}

        {/* Trust Level */}
        <div>
          <h4 className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-tertiary)' }}>TRUST LEVEL</h4>
          <div className="flex items-center gap-2">
            {extension.trusted || extension.builtin ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span className="text-sm" style={{ color: 'var(--color-success)' }}>Trusted / Built-in</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span className="text-sm" style={{ color: 'var(--color-warning)' }}>Community / Unverified</span>
              </>
            )}
          </div>
        </div>

        <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          ID: {extension.id}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t space-y-2" style={{ borderColor: 'var(--color-border-secondary)' }}>
        {!extension.installed && onInstall && (
          <button
            onClick={onInstall}
            disabled={installing}
            className="w-full py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--color-accent)', color: 'white' }}
          >
            {installing ? 'Installing...' : 'Install Extension'}
          </button>
        )}
        {extension.installed && !extension.builtin && onUninstall && (
          <button
            onClick={onUninstall}
            className="w-full py-2 rounded-lg text-sm border transition-colors"
            style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}
          >
            Uninstall
          </button>
        )}
      </div>
    </div>
  );
};

export default ExtensionsView;
