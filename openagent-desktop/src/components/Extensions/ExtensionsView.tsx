/**
 * OpenAgent Desktop - Extensions View Component
 *
 * Grid/list of extensions with status indicators, enable/disable toggle,
 * extension detail panel, install, search/filter, categories, and settings.
 */

import React, { useState, useMemo } from 'react';
import { ExtensionInfo, ExtensionCategory, Toast } from '../../types';

const api = (window as any).openagent;

interface ExtensionsViewProps {
  extensions: ExtensionInfo[];
  onRefresh: () => Promise<void>;
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

const CATEGORIES: { value: ExtensionCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'development', label: 'Development' },
  { value: 'productivity', label: 'Productivity' },
  { value: 'browser', label: 'Browser' },
  { value: 'cloud', label: 'Cloud' },
  { value: 'database', label: 'Database' },
  { value: 'design', label: 'Design' },
  { value: 'search', label: 'Search' },
  { value: 'memory', label: 'Memory' },
  { value: 'system', label: 'System' },
  { value: 'document_generation', label: 'Documents' },
  { value: 'automation', label: 'Automation' },
];

const ExtensionsView: React.FC<ExtensionsViewProps> = ({ extensions, onRefresh, addToast }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ExtensionCategory | 'all'>('all');
  const [selectedExtension, setSelectedExtension] = useState<ExtensionInfo | null>(null);
  const [installUrl, setInstallUrl] = useState('');
  const [showInstallForm, setShowInstallForm] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const filteredExtensions = useMemo(() => {
    let result = extensions;

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
  }, [extensions, searchQuery, categoryFilter]);

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
                {enabledCount} enabled / {extensions.length} total / {builtinCount} built-in
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
              {!extensions.find((e) => e.trusted) && (
                <p className="text-xs mt-2" style={{ color: 'var(--color-warning)' }}>
                  ⚠️ Only install extensions from trusted sources. Unverified extensions may pose security risks.
                </p>
              )}
            </div>
          )}

          {/* Search & Filter */}
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
            <div className="flex gap-1 overflow-x-auto">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setCategoryFilter(cat.value)}
                  className="px-2.5 py-1 rounded-lg text-xs whitespace-nowrap transition-colors"
                  style={{
                    background: categoryFilter === cat.value ? 'var(--color-accent-soft)' : 'transparent',
                    color: categoryFilter === cat.value ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Extension Grid/List */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredExtensions.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'var(--color-text-tertiary)' }}>
              <p className="text-lg">No extensions found</p>
              <p className="text-sm mt-1">Try adjusting your search or filters</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredExtensions.map((ext) => (
                <ExtensionCard
                  key={ext.id}
                  extension={ext}
                  onToggle={handleToggleExtension}
                  onSelect={setSelectedExtension}
                  isSelected={selectedExtension?.id === ext.id}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredExtensions.map((ext) => (
                <ExtensionListItem
                  key={ext.id}
                  extension={ext}
                  onToggle={handleToggleExtension}
                  onSelect={setSelectedExtension}
                  isSelected={selectedExtension?.id === ext.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {selectedExtension && (
        <ExtensionDetailPanel
          extension={selectedExtension}
          onToggle={handleToggleExtension}
          onClose={() => setSelectedExtension(null)}
          addToast={addToast}
        />
      )}
    </div>
  );
};

// ─── Extension Card ────────────────────────────────────────────────────────────

const ExtensionCard: React.FC<{
  extension: ExtensionInfo;
  onToggle: (id: string, enabled: boolean) => void;
  onSelect: (ext: ExtensionInfo) => void;
  isSelected: boolean;
}> = ({ extension, onToggle, onSelect, isSelected }) => (
  <div
    onClick={() => onSelect(extension)}
    className="rounded-xl p-4 border cursor-pointer transition-colors"
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
    <div className="flex items-start justify-between mb-2">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-accent-soft)' }}>
          <span className="text-xs font-bold" style={{ color: 'var(--color-accent)' }}>
            {extension.name.slice(0, 2).toUpperCase()}
          </span>
        </div>
        <div>
          <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{extension.name}</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: extension.enabled ? 'var(--color-success)' : 'var(--color-text-muted)' }} />
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>v{extension.version}</span>
            {extension.builtin && (
              <span className="text-xs px-1 rounded" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}>built-in</span>
            )}
          </div>
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle(extension.id, extension.enabled);
        }}
        className="relative w-8 h-4 rounded-full flex-shrink-0"
        style={{ background: extension.enabled ? 'var(--color-accent)' : 'var(--color-bg-tertiary)' }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform"
          style={{ transform: extension.enabled ? 'translateX(16px)' : 'translateX(0)' }}
        />
      </button>
    </div>
    <p className="text-xs line-clamp-2" style={{ color: 'var(--color-text-tertiary)' }}>{extension.description}</p>
    {!extension.trusted && extension.installed && (
      <div className="mt-2 flex items-center gap-1 text-xs" style={{ color: 'var(--color-warning)' }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        Untrusted
      </div>
    )}
  </div>
);

// ─── Extension List Item ───────────────────────────────────────────────────────

const ExtensionListItem: React.FC<{
  extension: ExtensionInfo;
  onToggle: (id: string, enabled: boolean) => void;
  onSelect: (ext: ExtensionInfo) => void;
  isSelected: boolean;
}> = ({ extension, onToggle, onSelect, isSelected }) => (
  <div
    onClick={() => onSelect(extension)}
    className="flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors"
    style={{
      background: isSelected ? 'var(--color-accent-soft)' : 'var(--color-bg-secondary)',
      borderColor: isSelected ? 'var(--color-accent)' : 'var(--color-border-primary)',
    }}
  >
    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-accent-soft)' }}>
      <span className="text-xs font-bold" style={{ color: 'var(--color-accent)' }}>{extension.name.slice(0, 2).toUpperCase()}</span>
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{extension.name}</span>
        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>v{extension.version}</span>
      </div>
      <p className="text-xs truncate" style={{ color: 'var(--color-text-tertiary)' }}>{extension.description}</p>
    </div>
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle(extension.id, extension.enabled);
      }}
      className="relative w-8 h-4 rounded-full flex-shrink-0"
      style={{ background: extension.enabled ? 'var(--color-accent)' : 'var(--color-bg-tertiary)' }}
    >
      <span
        className="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform"
        style={{ transform: extension.enabled ? 'translateX(16px)' : 'translateX(0)' }}
      />
    </button>
  </div>
);

// ─── Extension Detail Panel ────────────────────────────────────────────────────

const ExtensionDetailPanel: React.FC<{
  extension: ExtensionInfo;
  onToggle: (id: string, enabled: boolean) => void;
  onClose: () => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
}> = ({ extension, onToggle, onClose, addToast }) => (
  <div
    className="w-80 border-l flex flex-col h-full"
    style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-secondary)' }}
  >
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
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-accent-soft)' }}>
          <span className="text-sm font-bold" style={{ color: 'var(--color-accent)' }}>{extension.name.slice(0, 2).toUpperCase()}</span>
        </div>
        <div>
          <div className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{extension.name}</div>
          <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>v{extension.version} by {extension.author}</div>
        </div>
      </div>
      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{extension.description}</p>
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Enabled</span>
        <button
          onClick={() => onToggle(extension.id, extension.enabled)}
          className="relative w-10 h-5 rounded-full"
          style={{ background: extension.enabled ? 'var(--color-accent)' : 'var(--color-bg-tertiary)' }}
        >
          <span
            className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
            style={{ transform: extension.enabled ? 'translateX(20px)' : 'translateX(0)' }}
          />
        </button>
      </div>
      {extension.capabilities && extension.capabilities.length > 0 && (
        <div>
          <h4 className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-tertiary)' }}>CAPABILITIES</h4>
          <div className="flex flex-wrap gap-1">
            {extension.capabilities.map((cap) => (
              <span key={cap} className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
                {cap}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        ID: {extension.id}
      </div>
    </div>
  </div>
);

export default ExtensionsView;
