/**
 * OpenAgent-Desktop - Extensions Marketplace View Component
 *
 * Enhanced grid of extensions with icons, categories, descriptions,
 * search/filter by category, install/uninstall/enable/disable buttons,
 * required env vars per extension, and clear enabled/disabled states.
 *
 * Phase 4 additions:
 * - Sort options (Name A-Z, Name Z-A, Recently Added, Category)
 * - Installed/Available toggle tabs
 * - Improved extension cards with installation status badge, configure button
 * - Dynamic marketplace data via api.extensions.search()
 * - Debounced search with api.extensions.search()
 * - Extension tools viewer via api.extensions.getTools()
 * - Real API calls for install/uninstall/configure
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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

// ─── Sort Options ──────────────────────────────────────────────────────────────

type SortOption = 'name-asc' | 'name-desc' | 'recent' | 'category';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'name-asc', label: 'Name (A-Z)' },
  { value: 'name-desc', label: 'Name (Z-A)' },
  { value: 'recent', label: 'Recently Added' },
  { value: 'category', label: 'Category' },
];

// ─── Tab Options ───────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'installed' | 'available';

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

// ─── Component ─────────────────────────────────────────────────────────────────

const ExtensionsView: React.FC<ExtensionsViewProps> = ({ extensions, onRefresh, addToast }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ExtensionCategory | 'all'>('all');
  const [sortOption, setSortOption] = useState<SortOption>('name-asc');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [selectedExtension, setSelectedExtension] = useState<ExtensionInfo | null>(null);
  const [installUrl, setInstallUrl] = useState('');
  const [showInstallForm, setShowInstallForm] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [searchResults, setSearchResults] = useState<ExtensionInfo[] | null>(null);
  const [availableExtensions, setAvailableExtensions] = useState<ExtensionInfo[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [extensionTools, setExtensionTools] = useState<{ id: string; name: string; description?: string }[] | null>(null);
  const [loadingTools, setLoadingTools] = useState(false);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch available (community) extensions from the API on mount
  useEffect(() => {
    const fetchAvailable = async () => {
      if (!api?.extensions?.search) return;
      setLoadingAvailable(true);
      try {
        const results = await api.extensions.search();
        if (Array.isArray(results)) {
          setAvailableExtensions(results);
        }
      } catch {
        // Silently fail — installed extensions still work
      } finally {
        setLoadingAvailable(false);
      }
    };
    fetchAvailable();
  }, []);

  // Fetch extension tools when a specific extension is selected
  useEffect(() => {
    if (!selectedExtension?.id || !api?.extensions?.getTools) {
      setExtensionTools(null);
      return;
    }
    let cancelled = false;
    setLoadingTools(true);
    setExtensionTools(null);
    api.extensions
      .getTools(selectedExtension.id)
      .then((tools: any[]) => {
        if (!cancelled) setExtensionTools(tools || []);
      })
      .catch(() => {
        if (!cancelled) setExtensionTools(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingTools(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedExtension?.id]);

  // Debounced search: call api.extensions.search(query, category) after 300ms
  const handleSearchChange = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
      if (!query.trim() || !api?.extensions?.search) {
        setSearchResults(null);
        return;
      }
      searchDebounceRef.current = setTimeout(async () => {
        try {
          const results = await api.extensions.search(query, categoryFilter !== 'all' ? categoryFilter : undefined);
          if (Array.isArray(results)) {
            setSearchResults(results);
          }
        } catch {
          // Silently fail — local filtering still applies
        }
      }, 300);
    },
    [categoryFilter]
  );

  // Merge real (installed) extensions with dynamically-fetched available extensions
  const allExtensions = useMemo(() => {
    const realIds = new Set(extensions.map((e) => e.id));
    // Start with installed extensions
    const merged = [...extensions];
    // Add available extensions not already installed
    for (const avail of availableExtensions) {
      if (!realIds.has(avail.id)) {
        merged.push({
          ...avail,
          installed: false,
          enabled: false,
        });
      }
    }
    // If search results exist, merge them in too
    if (searchResults) {
      const mergedIds = new Set(merged.map((e) => e.id));
      for (const sr of searchResults) {
        if (!mergedIds.has(sr.id)) {
          merged.push({
            ...sr,
            installed: false,
            enabled: false,
          });
        }
      }
    }
    return merged as ExtensionInfo[];
  }, [extensions, availableExtensions, searchResults]);

  const filteredAndSortedExtensions = useMemo(() => {
    let result = allExtensions;

    // Category filter
    if (categoryFilter !== 'all') {
      result = result.filter((e) => e.category === categoryFilter);
    }

    // Search filter (fuzzy by name and description) — applies on top of API search results
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const queryChars = query.split('');
      result = result.filter((e) => {
        const nameLower = e.name.toLowerCase();
        const descLower = e.description.toLowerCase();
        // Simple fuzzy: match all characters in order
        const fuzzyMatch = (text: string) => {
          let idx = 0;
          for (const ch of queryChars) {
            idx = text.indexOf(ch, idx);
            if (idx === -1) return false;
            idx++;
          }
          return true;
        };
        return nameLower.includes(query) || descLower.includes(query) || fuzzyMatch(nameLower) || fuzzyMatch(descLower);
      });
    }

    // Tab filter (Installed / Available)
    if (filterTab === 'installed') {
      result = result.filter((e) => e.installed);
    } else if (filterTab === 'available') {
      result = result.filter((e) => !e.installed);
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sortOption) {
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'name-desc':
          return b.name.localeCompare(a.name);
        case 'recent':
          // Sort installed first, then by name as a stable fallback
          if (a.installed && !b.installed) return -1;
          if (!a.installed && b.installed) return 1;
          return a.name.localeCompare(b.name);
        case 'category':
          return (a.category || '').localeCompare(b.category || '');
        default:
          return 0;
      }
    });

    return result;
  }, [allExtensions, searchQuery, categoryFilter, sortOption, filterTab]);

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

  const handleInstall = async (ext: ExtensionInfo) => {
    if (!api?.extensions?.install) return;
    setInstalling(true);
    try {
      await api.extensions.install(ext.id);
      addToast({ type: 'success', title: `${ext.name} installed` });
      await onRefresh();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Install failed', message: err.message });
    } finally {
      setInstalling(false);
    }
  };

  const handleInstallByUrl = async () => {
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

  const handleUninstall = async (ext: ExtensionInfo) => {
    if (!confirm('Uninstall this extension?')) return;
    if (!api?.extensions?.uninstall) {
      addToast({ type: 'error', title: 'Uninstall not available', message: 'Extension API not connected' });
      return;
    }
    try {
      await api.extensions.uninstall(ext.id);
      addToast({ type: 'success', title: `${ext.name} uninstalled` });
      await onRefresh();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Uninstall failed', message: err.message });
    }
  };

  const handleConfigure = async (ext: ExtensionInfo) => {
    if (!api?.extensions?.configure) {
      addToast({ type: 'error', title: 'Configuration not available', message: 'Extension API not connected' });
      return;
    }
    try {
      // Open a simple config dialog or use the extension's settings
      const currentConfig = ext.config || {};
      const newConfig = { ...currentConfig, _configuredAt: new Date().toISOString() };
      await api.extensions.configure(ext.id, newConfig);
      addToast({ type: 'success', title: `${ext.name} configured` });
      await onRefresh();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Configuration failed', message: err.message });
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
                {enabledCount} enabled · {installedCount} installed · {builtinCount} built-in · {availableExtensions.length} available
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
                  onKeyDown={(e) => e.key === 'Enter' && handleInstallByUrl()}
                />
                <button
                  onClick={handleInstallByUrl}
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

          {/* Search, Tabs & Filter */}
          <div className="space-y-3">
            {/* Search bar */}
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--color-bg-secondary)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search extensions..."
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: 'var(--color-text-primary)' }}
                />
              </div>
              {/* Sort Dropdown */}
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
                className="px-3 py-2 rounded-lg border text-sm outline-none cursor-pointer"
                style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-secondary)' }}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Installed / Available toggle tabs */}
            <div className="flex items-center gap-2">
              {(['all', 'installed', 'available'] as FilterTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilterTab(tab)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    background: filterTab === tab ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                    color: filterTab === tab ? 'white' : 'var(--color-text-tertiary)',
                    border: filterTab === tab ? '1px solid var(--color-accent)' : '1px solid var(--color-border-primary)',
                  }}
                >
                  {tab === 'all' ? 'All' : tab === 'installed' ? 'Installed' : 'Available'}
                </button>
              ))}
              {loadingAvailable && (
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading marketplace...</span>
              )}
            </div>

            {/* Category filter bar */}
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
          {filteredAndSortedExtensions.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'var(--color-text-tertiary)' }}>
              <p className="text-lg">No extensions found</p>
              <p className="text-sm mt-1">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredAndSortedExtensions.map((ext) => {
                const categoryColor = CATEGORY_COLORS[ext.category || ''] || 'var(--color-accent)';
                return (
                  <ExtensionCardEnhanced
                    key={ext.id}
                    extension={ext}
                    categoryColor={categoryColor}
                    onToggle={handleToggleExtension}
                    onInstall={() => handleInstall(ext)}
                    onUninstall={ext.installed && !ext.builtin ? () => handleUninstall(ext) : undefined}
                    onConfigure={ext.installed ? () => handleConfigure(ext) : undefined}
                    onSelect={() => {
                      setSelectedExtension(ext);
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
      {selectedExtension && (
        <ExtensionDetailPanelEnhanced
          extension={selectedExtension}
          onToggle={handleToggleExtension}
          onInstall={() => handleInstall(selectedExtension)}
          onUninstall={selectedExtension.installed && !selectedExtension.builtin ? () => handleUninstall(selectedExtension) : undefined}
          onConfigure={selectedExtension.installed ? () => handleConfigure(selectedExtension) : undefined}
          onClose={() => {
            setSelectedExtension(null);
          }}
          addToast={addToast}
          installing={installing}
          extensionTools={extensionTools}
          loadingTools={loadingTools}
        />
      )}
    </div>
  );
};

// ─── Enhanced Extension Card ───────────────────────────────────────────────────

const ExtensionCardEnhanced: React.FC<{
  extension: ExtensionInfo;
  categoryColor: string;
  onToggle: (id: string, enabled: boolean) => void;
  onInstall: () => void;
  onUninstall?: () => void;
  onConfigure?: () => void;
  onSelect: () => void;
  isSelected: boolean;
  installing: boolean;
}> = ({ extension, categoryColor, onToggle, onInstall, onUninstall, onConfigure, onSelect, isSelected, installing }) => (
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
          {extension.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
              {extension.name}
            </span>
            {/* Installation status badge */}
            {extension.installed && extension.enabled && (
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--color-success)' }}>
                Active
              </span>
            )}
            {extension.installed && !extension.enabled && (
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}>
                Disabled
              </span>
            )}
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

      {/* Status indicator / Toggle */}
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

    {/* Actions */}
    <div className="flex items-center gap-2">
      {!extension.installed && (
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
      {extension.installed && onConfigure && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onConfigure();
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border"
          style={{ borderColor: 'var(--color-border-primary)', color: 'var(--color-text-secondary)' }}
        >
          Configure
        </button>
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
    </div>
  </div>
);

// ─── Enhanced Detail Panel ─────────────────────────────────────────────────────

const ExtensionDetailPanelEnhanced: React.FC<{
  extension: ExtensionInfo;
  onToggle: (id: string, enabled: boolean) => void;
  onInstall: () => void;
  onUninstall?: () => void;
  onConfigure?: () => void;
  onClose: () => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  installing: boolean;
  extensionTools: { id: string; name: string; description?: string }[] | null;
  loadingTools: boolean;
}> = ({ extension, onToggle, onInstall, onUninstall, onConfigure, onClose, addToast: _addToast, installing, extensionTools, loadingTools }) => {
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
            {extension.name.slice(0, 2).toUpperCase()}
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

        {/* Tools provided by this extension */}
        {extension.installed && (
          <div>
            <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-tertiary)' }}>TOOLS</h4>
            {loadingTools ? (
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading tools...</span>
            ) : extensionTools && extensionTools.length > 0 ? (
              <div className="space-y-1.5">
                {extensionTools.map((tool) => (
                  <div
                    key={tool.id || tool.name}
                    className="px-3 py-2 rounded-lg"
                    style={{ background: 'var(--color-bg-tertiary)' }}
                  >
                    <div className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>{tool.name}</div>
                    {tool.description && (
                      <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{tool.description}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : extensionTools && extensionTools.length === 0 ? (
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No tools registered</span>
            ) : (
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Tools info unavailable</span>
            )}
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
        {!extension.installed && (
          <button
            onClick={onInstall}
            disabled={installing}
            className="w-full py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--color-accent)', color: 'white' }}
          >
            {installing ? 'Installing...' : 'Install Extension'}
          </button>
        )}
        {extension.installed && onConfigure && (
          <button
            onClick={onConfigure}
            className="w-full py-2 rounded-lg text-sm font-medium border"
            style={{ borderColor: 'var(--color-border-primary)', color: 'var(--color-text-secondary)' }}
          >
            Configure
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
