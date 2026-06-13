/**
 * OpenAgent-Desktop - Marketplace View Component
 *
 * Browse and install community extensions from the marketplace.
 * Features: search, categories, featured carousel, ratings, verified badges,
 * install/uninstall, extension detail modal.
 */

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { ExtensionInfo, ExtensionCategory, Toast } from '../../types';

const api = (window as any).openagent;

// ─── Marketplace Extension Type ─────────────────────────────────────────────

interface MarketplaceExtension {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  tags: string[];
  rating: number;
  downloads: number;
  verified: boolean;
  homepage: string;
  repository: string;
  installSource: string;
  lastUpdated: string;
  compatibility: { nodeVersion: string; platforms: string[] };
  icon?: string;
  requiredEnvVars: string[];
  optionalEnvVars: string[];
  permissions: { level: string; reason: string }[];
  changelog?: string;
  longDescription?: string;
  screenshots?: string[];
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface MarketplaceViewProps {
  extensions: ExtensionInfo[];
  onRefresh: () => Promise<void>;
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

// ─── Category Config ────────────────────────────────────────────────────────

const MARKETPLACE_CATEGORIES: { value: string; label: string; icon: string }[] = [
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
  { value: 'automation', label: 'Automation', icon: '🤖' },
];

type SortField = 'rating' | 'downloads' | 'name' | 'lastUpdated';
type TabView = 'browse' | 'installed';

// ─── Category Colors ─────────────────────────────────────────────────────────

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
  automation: '#d946ef',
};

// ─── Star Rating Component ──────────────────────────────────────────────────

const StarRating: React.FC<{ rating: number; onRate?: (r: number) => void; size?: number }> = ({
  rating,
  onRate,
  size = 14,
}) => (
  <div className="flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((star) => (
      <svg
        key={star}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={star <= Math.round(rating) ? '#f59e0b' : 'none'}
        stroke={star <= Math.round(rating) ? '#f59e0b' : '#4a4a5a'}
        strokeWidth="2"
        className={onRate ? 'cursor-pointer' : ''}
        onClick={() => onRate?.(star)}
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ))}
    <span className="text-xs ml-1" style={{ color: 'var(--color-text-tertiary)' }}>
      {rating.toFixed(1)}
    </span>
  </div>
);

// ─── Verified Badge ──────────────────────────────────────────────────────────

const VerifiedBadge: React.FC = () => (
  <span
    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium"
    style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
  >
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    Verified
  </span>
);

// ─── Main Component ─────────────────────────────────────────────────────────

const MarketplaceView: React.FC<MarketplaceViewProps> = ({ extensions, onRefresh, addToast }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortField>('rating');
  const [activeTab, setActiveTab] = useState<TabView>('browse');
  const [marketplaceExtensions, setMarketplaceExtensions] = useState<MarketplaceExtension[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [selectedExtension, setSelectedExtension] = useState<MarketplaceExtension | null>(null);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch marketplace extensions
  useEffect(() => {
    const fetchMarketplace = async () => {
      setLoading(true);
      try {
        if (api?.marketplace?.search) {
          const results = await api.marketplace.search();
          if (Array.isArray(results)) {
            setMarketplaceExtensions(results);
          }
        }
      } catch {
        // Marketplace not available — use empty
      } finally {
        setLoading(false);
      }
    };
    fetchMarketplace();
  }, []);

  // Auto-rotate featured carousel
  useEffect(() => {
    const featured = getFeatured();
    if (featured.length === 0) return;
    const interval = setInterval(() => {
      setFeaturedIndex((prev) => (prev + 1) % featured.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [marketplaceExtensions]);

  const installedIds = useMemo(() => new Set(extensions.map((e) => e.id)), [extensions]);

  const getFeatured = useCallback((): MarketplaceExtension[] => {
    return marketplaceExtensions
      .filter((ext) => ext.verified && ext.rating >= 4.5)
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, 8);
  }, [marketplaceExtensions]);

  const filteredExtensions = useMemo(() => {
    let results = marketplaceExtensions;

    // Tab filter
    if (activeTab === 'installed') {
      results = results.filter((ext) => installedIds.has(ext.id));
    }

    // Category filter
    if (categoryFilter !== 'all') {
      results = results.filter((ext) => ext.category === categoryFilter);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      results = results.filter(
        (ext) =>
          ext.name.toLowerCase().includes(q) ||
          ext.description.toLowerCase().includes(q) ||
          ext.tags.some((t) => t.toLowerCase().includes(q)) ||
          ext.author.toLowerCase().includes(q),
      );
    }

    // Sort
    return [...results].sort((a, b) => {
      switch (sortBy) {
        case 'rating':
          return b.rating - a.rating;
        case 'downloads':
          return b.downloads - a.downloads;
        case 'name':
          return a.name.localeCompare(b.name);
        case 'lastUpdated':
          return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
        default:
          return 0;
      }
    });
  }, [marketplaceExtensions, activeTab, categoryFilter, searchQuery, sortBy, installedIds]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (!query.trim() || !api?.marketplace?.search) return;

    searchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await api.marketplace.search(query);
        if (Array.isArray(results)) {
          setMarketplaceExtensions(results);
        }
      } catch {
        // Silent fail
      }
    }, 300);
  }, []);

  const handleInstall = async (ext: MarketplaceExtension) => {
    if (!api?.marketplace?.install) {
      addToast({ type: 'error', title: 'Marketplace not available' });
      return;
    }
    setInstalling(ext.id);
    try {
      await api.marketplace.install(ext.id);
      addToast({ type: 'success', title: `${ext.name} installed successfully` });
      await onRefresh();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Install failed', message: err.message });
    } finally {
      setInstalling(null);
    }
  };

  const handleUninstall = async (ext: MarketplaceExtension) => {
    if (!confirm(`Uninstall ${ext.name}?`)) return;
    if (!api?.marketplace?.uninstall) return;
    try {
      await api.marketplace.uninstall(ext.id);
      addToast({ type: 'success', title: `${ext.name} uninstalled` });
      await onRefresh();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Uninstall failed', message: err.message });
    }
  };

  const handleRate = async (extensionId: string, rating: number) => {
    if (!api?.marketplace?.rate) return;
    try {
      await api.marketplace.rate(extensionId, rating);
      addToast({ type: 'success', title: `Rated ${rating} stars` });
    } catch {
      // Silent
    }
  };

  const featured = getFeatured();
  const currentFeatured = featured[featuredIndex] || null;

  return (
    <div className="h-full flex" style={{ background: 'var(--color-bg-primary)' }}>
      {/* Category Sidebar */}
      <div
        className="w-48 flex-shrink-0 border-r p-3 overflow-y-auto hidden md:block"
        style={{ borderColor: 'var(--color-border-secondary)', background: 'var(--color-bg-secondary)' }}
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-muted)' }}>
          Categories
        </h3>
        <div className="space-y-0.5">
          {MARKETPLACE_CATEGORIES.map((cat) => {
            const count =
              cat.value === 'all'
                ? marketplaceExtensions.length
                : marketplaceExtensions.filter((e) => e.category === cat.value).length;
            return (
              <button
                key={cat.value}
                onClick={() => setCategoryFilter(cat.value)}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors text-left"
                style={{
                  background: categoryFilter === cat.value ? 'var(--color-accent-soft)' : 'transparent',
                  color: categoryFilter === cat.value ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                }}
              >
                <span>{cat.icon}</span>
                <span className="flex-1 truncate">{cat.label}</span>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="p-4 border-b" style={{ borderColor: 'var(--color-border-secondary)' }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                Marketplace
              </h1>
              <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                {marketplaceExtensions.length} extensions available · {extensions.length} installed
              </p>
            </div>
            <button
              onClick={onRefresh}
              className="p-2 rounded-lg border transition-colors"
              style={{ borderColor: 'var(--color-border-primary)', color: 'var(--color-text-tertiary)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
          </div>

          {/* Search & Controls */}
          <div className="flex items-center gap-3 mb-3">
            <div
              className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ background: 'var(--color-bg-secondary)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search marketplace..."
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: 'var(--color-text-primary)' }}
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortField)}
              className="px-3 py-2 rounded-lg border text-sm outline-none cursor-pointer"
              style={{
                background: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border-primary)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <option value="rating">Top Rated</option>
              <option value="downloads">Most Downloaded</option>
              <option value="name">Name A-Z</option>
              <option value="lastUpdated">Recently Updated</option>
            </select>
          </div>

          {/* Tab Toggle */}
          <div className="flex items-center gap-2">
            {(['browse', 'installed'] as TabView[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: activeTab === tab ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                  color: activeTab === tab ? 'white' : 'var(--color-text-tertiary)',
                  border: activeTab === tab ? '1px solid var(--color-accent)' : '1px solid var(--color-border-primary)',
                }}
              >
                {tab === 'browse' ? 'Browse' : 'My Extensions'}
              </button>
            ))}
          </div>

          {/* Mobile Category Pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 mt-3 md:hidden">
            {MARKETPLACE_CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setCategoryFilter(cat.value)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors"
                style={{
                  background: categoryFilter === cat.value ? 'var(--color-accent-soft)' : 'var(--color-bg-secondary)',
                  color: categoryFilter === cat.value ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                  border:
                    categoryFilter === cat.value
                      ? '1px solid var(--color-accent)'
                      : '1px solid var(--color-border-primary)',
                }}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Featured Carousel (only in browse tab) */}
        {activeTab === 'browse' && currentFeatured && (
          <div className="px-4 pt-4">
            <div
              className="rounded-xl p-5 border relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, var(--color-bg-secondary), var(--color-bg-tertiary))',
                borderColor: 'var(--color-border-primary)',
              }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl flex-shrink-0"
                  style={{ background: `${CATEGORY_COLORS[currentFeatured.category] || '#8b5cf6'}20` }}
                >
                  {currentFeatured.icon || currentFeatured.name.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-accent)' }}>
                      Featured
                    </span>
                    {currentFeatured.verified && <VerifiedBadge />}
                  </div>
                  <h3 className="text-lg font-bold mt-0.5" style={{ color: 'var(--color-text-primary)' }}>
                    {currentFeatured.name}
                  </h3>
                  <p className="text-sm mt-1 line-clamp-2" style={{ color: 'var(--color-text-secondary)' }}>
                    {currentFeatured.description}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <StarRating rating={currentFeatured.rating} />
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {currentFeatured.downloads.toLocaleString()} downloads
                    </span>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {installedIds.has(currentFeatured.id) ? (
                    <button
                      onClick={() => handleUninstall(currentFeatured)}
                      className="px-4 py-2 rounded-lg text-sm font-medium border"
                      style={{
                        borderColor: 'var(--color-destructive)',
                        color: 'var(--color-destructive)',
                        background: 'transparent',
                      }}
                    >
                      Uninstall
                    </button>
                  ) : (
                    <button
                      onClick={() => handleInstall(currentFeatured)}
                      disabled={installing === currentFeatured.id}
                      className="px-4 py-2 rounded-lg text-sm font-medium"
                      style={{
                        background: 'var(--color-accent)',
                        color: 'white',
                        opacity: installing === currentFeatured.id ? 0.5 : 1,
                      }}
                    >
                      {installing === currentFeatured.id ? 'Installing...' : 'Install'}
                    </button>
                  )}
                </div>
              </div>
              {/* Carousel dots */}
              {featured.length > 1 && (
                <div className="flex items-center justify-center gap-1.5 mt-3">
                  {featured.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setFeaturedIndex(i)}
                      className="w-1.5 h-1.5 rounded-full transition-all"
                      style={{
                        background: i === featuredIndex ? 'var(--color-accent)' : 'var(--color-border-primary)',
                        width: i === featuredIndex ? '12px' : '6px',
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Extension Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div
                className="w-6 h-6 border-2 rounded-full animate-spin"
                style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }}
              />
              <span className="ml-3 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                Loading marketplace...
              </span>
            </div>
          ) : filteredExtensions.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'var(--color-text-tertiary)' }}>
              <p className="text-lg">No extensions found</p>
              <p className="text-sm mt-1">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredExtensions.map((ext) => (
                <MarketplaceCard
                  key={ext.id}
                  extension={ext}
                  isInstalled={installedIds.has(ext.id)}
                  isInstalling={installing === ext.id}
                  onInstall={() => handleInstall(ext)}
                  onUninstall={() => handleUninstall(ext)}
                  onSelect={() => setSelectedExtension(ext)}
                  onRate={(r) => handleRate(ext.id, r)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedExtension && (
        <ExtensionDetailModal
          extension={selectedExtension}
          isInstalled={installedIds.has(selectedExtension.id)}
          isInstalling={installing === selectedExtension.id}
          onInstall={() => handleInstall(selectedExtension)}
          onUninstall={() => handleUninstall(selectedExtension)}
          onClose={() => setSelectedExtension(null)}
          onRate={(r) => handleRate(selectedExtension.id, r)}
        />
      )}
    </div>
  );
};

// ─── Marketplace Card ────────────────────────────────────────────────────────

const MarketplaceCard: React.FC<{
  extension: MarketplaceExtension;
  isInstalled: boolean;
  isInstalling: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onSelect: () => void;
  onRate: (rating: number) => void;
}> = ({ extension, isInstalled, isInstalling, onInstall, onUninstall, onSelect, onRate }) => {
  const categoryColor = CATEGORY_COLORS[extension.category] || '#8b5cf6';

  return (
    <div
      className="rounded-xl p-4 border transition-all group"
      style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
          style={{ background: `${categoryColor}15` }}
        >
          {extension.icon || extension.name.slice(0, 2)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className="text-sm font-semibold truncate cursor-pointer hover:underline"
              style={{ color: 'var(--color-text-primary)' }}
              onClick={onSelect}
            >
              {extension.name}
            </span>
            {extension.verified && <VerifiedBadge />}
          </div>
          <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--color-text-secondary)' }}>
            {extension.description}
          </p>

          {/* Rating & Downloads */}
          <div className="flex items-center gap-2 mt-2">
            <StarRating rating={extension.rating} size={12} onRate={onRate} />
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              {extension.downloads.toLocaleString()} installs
            </span>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1 mt-2">
            {extension.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-3">
            {isInstalled ? (
              <>
                <span
                  className="text-xs px-2 py-1 rounded flex items-center gap-1"
                  style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Installed
                </span>
                <button
                  onClick={onUninstall}
                  className="text-xs px-2 py-1 rounded border"
                  style={{
                    borderColor: 'var(--color-destructive)',
                    color: 'var(--color-destructive)',
                    background: 'transparent',
                  }}
                >
                  Uninstall
                </button>
              </>
            ) : (
              <button
                onClick={onInstall}
                disabled={isInstalling}
                className="text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{
                  background: 'var(--color-accent)',
                  color: 'white',
                  opacity: isInstalling ? 0.5 : 1,
                }}
              >
                {isInstalling ? (
                  <span className="flex items-center gap-1">
                    <svg
                      className="animate-spin"
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 019.95 9" />
                    </svg>
                    Installing...
                  </span>
                ) : (
                  'Install'
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Extension Detail Modal ──────────────────────────────────────────────────

const ExtensionDetailModal: React.FC<{
  extension: MarketplaceExtension;
  isInstalled: boolean;
  isInstalling: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onClose: () => void;
  onRate: (rating: number) => void;
}> = ({ extension, isInstalled, isInstalling, onInstall, onUninstall, onClose, onRate }) => {
  const categoryColor = CATEGORY_COLORS[extension.category] || '#8b5cf6';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div
        className="w-full max-w-2xl max-h-[80vh] rounded-xl border overflow-hidden flex flex-col"
        style={{ background: 'var(--color-bg-primary)', borderColor: 'var(--color-border-primary)' }}
      >
        {/* Header */}
        <div className="p-5 border-b flex items-start gap-4" style={{ borderColor: 'var(--color-border-secondary)' }}>
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl flex-shrink-0"
            style={{ background: `${categoryColor}20` }}
          >
            {extension.icon || extension.name.slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {extension.name}
              </h2>
              {extension.verified && <VerifiedBadge />}
            </div>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              by {extension.author} · v{extension.version}
            </p>
            <div className="flex items-center gap-3 mt-2">
              <StarRating rating={extension.rating} onRate={onRate} />
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {extension.downloads.toLocaleString()} downloads
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Description */}
          <div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
              Description
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              {extension.longDescription || extension.description}
            </p>
          </div>

          {/* Permissions */}
          <div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
              Permissions
            </h3>
            <div className="space-y-1.5">
              {extension.permissions.map((perm, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-xs p-2 rounded-lg"
                  style={{ background: 'var(--color-bg-secondary)' }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={perm.level === 'admin' ? '#ef4444' : perm.level === 'write' ? '#f59e0b' : '#22c55e'}
                    strokeWidth="2"
                    className="flex-shrink-0 mt-0.5"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                  <div>
                    <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {perm.level.toUpperCase()}
                    </span>
                    <span className="ml-2" style={{ color: 'var(--color-text-tertiary)' }}>
                      {perm.reason}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Required Environment Variables */}
          {extension.requiredEnvVars.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
                Required Environment Variables
              </h3>
              <div className="space-y-1">
                {extension.requiredEnvVars.map((env) => (
                  <div
                    key={env}
                    className="text-xs px-2.5 py-1.5 rounded font-mono"
                    style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-warning)' }}
                  >
                    {env}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Changelog */}
          {extension.changelog && (
            <div>
              <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
                Changelog
              </h3>
              <pre
                className="text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap"
                style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)' }}
              >
                {extension.changelog}
              </pre>
            </div>
          )}

          {/* Compatibility */}
          <div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
              Compatibility
            </h3>
            <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              <span>Node.js {extension.compatibility.nodeVersion}</span>
              <span>·</span>
              <span>{extension.compatibility.platforms.join(', ')}</span>
            </div>
          </div>

          {/* Links */}
          <div className="flex items-center gap-3">
            {extension.homepage && (
              <a
                href={extension.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs flex items-center gap-1 hover:underline"
                style={{ color: 'var(--color-accent)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                Homepage
              </a>
            )}
            {extension.repository && (
              <a
                href={extension.repository}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs flex items-center gap-1 hover:underline"
                style={{ color: 'var(--color-accent)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22" />
                </svg>
                Repository
              </a>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex items-center justify-between" style={{ borderColor: 'var(--color-border-secondary)' }}>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Last updated {new Date(extension.lastUpdated).toLocaleDateString()}
          </span>
          <div className="flex items-center gap-2">
            {isInstalled ? (
              <button
                onClick={onUninstall}
                className="px-4 py-2 rounded-lg text-sm font-medium border"
                style={{
                  borderColor: 'var(--color-destructive)',
                  color: 'var(--color-destructive)',
                  background: 'transparent',
                }}
              >
                Uninstall
              </button>
            ) : (
              <button
                onClick={onInstall}
                disabled={isInstalling}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{
                  background: 'var(--color-accent)',
                  color: 'white',
                  opacity: isInstalling ? 0.5 : 1,
                }}
              >
                {isInstalling ? 'Installing...' : 'Install'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketplaceView;
