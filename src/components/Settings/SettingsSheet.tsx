/**
 * Settings Sheet - OpenCowork Style
 *
 * Settings displayed as a slide-up bottom sheet instead of a full page view.
 * Can be opened from any view without losing context.
 * Tabbed interface for different settings categories.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppSettings, DEFAULT_SETTINGS, ProviderInfo, Toast } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────────

export type SettingsTabId =
  | 'general'
  | 'appearance'
  | 'providers'
  | 'extensions'
  | 'agents'
  | 'security'
  | 'advanced';

interface SettingsTab {
  id: SettingsTabId;
  label: string;
  icon: React.ReactNode;
}

interface SettingsSheetProps {
  /** Whether the sheet is open */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
  /** Current app settings */
  settings: AppSettings;
  /** Settings update handler */
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
  /** Providers list */
  providers: ProviderInfo[];
  /** Toast handler */
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

// ─── Tab Definitions ──────────────────────────────────────────────────────────────

const SETTINGS_TABS: SettingsTab[] = [
  {
    id: 'general',
    label: 'General',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
        <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
        <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
        <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
      </svg>
    ),
  },
  {
    id: 'providers',
    label: 'Providers',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
        <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
        <line x1="6" y1="6" x2="6.01" y2="6" />
        <line x1="6" y1="18" x2="6.01" y2="18" />
      </svg>
    ),
  },
  {
    id: 'extensions',
    label: 'Extensions',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    id: 'agents',
    label: 'Agents',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    id: 'security',
    label: 'Security',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
];

// ─── Component ────────────────────────────────────────────────────────────────────

const SettingsSheet: React.FC<SettingsSheetProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  providers,
  addToast,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('general');
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [hasChanges, setHasChanges] = useState(false);
  const [visible, setVisible] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  // ── Sync local settings with props ───────────────────────────────────────

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  // ── Animation on open/close ──────────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
    }
  }, [isOpen]);

  // ── Keyboard shortcut (Cmd/Ctrl+,) ───────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        }
        // Opening is handled by the parent
      }
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // ── Track changes ────────────────────────────────────────────────────────

  useEffect(() => {
    const changed = Object.keys(localSettings).some(
      (key) => (localSettings as any)[key] !== (settings as any)[key],
    );
    setHasChanges(changed);
  }, [localSettings, settings]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSettingChange = useCallback(
    (key: keyof AppSettings, value: unknown) => {
      setLocalSettings((prev) => ({
        ...prev,
        [key]: value,
      }));
    },
    [],
  );

  const handleApply = useCallback(() => {
    onUpdateSettings(localSettings);
    addToast({ type: 'success', title: 'Settings saved' });
    setHasChanges(false);
  }, [localSettings, onUpdateSettings, addToast]);

  const handleReset = useCallback(() => {
    setLocalSettings(DEFAULT_SETTINGS);
    addToast({ type: 'info', title: 'Settings reset to defaults' });
  }, [addToast]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 200); // Wait for animation
  }, [onClose]);

  // ── Don't render if not open ─────────────────────────────────────────────

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{
        background: visible ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0)',
        transition: 'background 0.2s ease',
      }}
      onClick={handleBackdropClick}
    >
      <div
        ref={sheetRef}
        className="w-full rounded-t-2xl border-t border-x overflow-hidden flex flex-col"
        style={{
          height: '70vh',
          background: 'var(--color-bg-primary)',
          borderColor: 'var(--color-border-primary)',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {/* Drag handle / Header */}
        <div
          className="flex items-center justify-between px-6 py-3 border-b"
          style={{
            borderColor: 'var(--color-border-secondary)',
            background: 'var(--color-bg-secondary)',
          }}
        >
          <div className="flex items-center gap-3">
            {/* Drag handle */}
            <div
              className="w-8 h-1 rounded-full"
              style={{ background: 'var(--color-text-muted)' }}
            />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Settings
            </h2>
            {hasChanges && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
              >
                Unsaved changes
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="px-3 py-1 text-xs rounded-lg transition-colors"
              style={{ color: 'var(--color-text-tertiary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              Reset
            </button>
            <button
              onClick={handleApply}
              disabled={!hasChanges}
              className="px-3 py-1 text-xs font-medium rounded-lg transition-all disabled:opacity-40"
              style={{
                background: hasChanges ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                color: hasChanges ? 'white' : 'var(--color-text-muted)',
              }}
            >
              Apply
            </button>
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--color-text-tertiary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              aria-label="Close settings"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tab bar + Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Tab sidebar */}
          <nav
            className="w-48 border-r py-2 px-2 flex-shrink-0 overflow-y-auto"
            style={{
              borderColor: 'var(--color-border-secondary)',
              background: 'var(--color-bg-secondary)',
            }}
          >
            {SETTINGS_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors mb-0.5"
                style={{
                  background: activeTab === tab.id ? 'var(--color-accent-soft)' : 'transparent',
                  color: activeTab === tab.id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.background = 'var(--color-bg-hover)';
                    e.currentTarget.style.color = 'var(--color-text-primary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                  }
                }}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'general' && (
              <GeneralSettings
                settings={localSettings}
                onChange={handleSettingChange}
              />
            )}
            {activeTab === 'appearance' && (
              <AppearanceSettings
                settings={localSettings}
                onChange={handleSettingChange}
              />
            )}
            {activeTab === 'providers' && (
              <ProvidersSettings providers={providers} />
            )}
            {activeTab === 'extensions' && (
              <PlaceholderTab name="Extensions" />
            )}
            {activeTab === 'agents' && (
              <PlaceholderTab name="Agents" />
            )}
            {activeTab === 'security' && (
              <PlaceholderTab name="Security" />
            )}
            {activeTab === 'advanced' && (
              <AdvancedSettings
                settings={localSettings}
                onChange={handleSettingChange}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── General Settings Tab ──────────────────────────────────────────────────────────

interface TabProps {
  settings: AppSettings;
  onChange: (key: keyof AppSettings, value: unknown) => void;
}

const GeneralSettings: React.FC<TabProps> = ({ settings, onChange }) => (
  <div className="space-y-6 max-w-lg">
    <SectionTitle title="General" description="Basic application settings" />

    <SettingRow label="Default Provider" description="Provider used for new sessions">
      <input
        type="text"
        value={settings.defaultProviderId}
        onChange={(e) => onChange('defaultProviderId', e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none border transition-colors"
        style={{
          background: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border-primary)',
          color: 'var(--color-text-primary)',
        }}
      />
    </SettingRow>

    <SettingRow label="Default Model" description="Model used for new sessions">
      <input
        type="text"
        value={settings.defaultModel}
        onChange={(e) => onChange('defaultModel', e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none border transition-colors"
        style={{
          background: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border-primary)',
          color: 'var(--color-text-primary)',
        }}
      />
    </SettingRow>

    <SettingRow label="Permission Mode" description="How tool permissions are handled">
      <select
        value={settings.permissionMode}
        onChange={(e) => onChange('permissionMode', e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none border transition-colors cursor-pointer"
        style={{
          background: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border-primary)',
          color: 'var(--color-text-primary)',
        }}
      >
        <option value="auto">Auto (all approved)</option>
        <option value="approve">Approve (all denied)</option>
        <option value="smart_approve">Smart Approve (safe auto-approved)</option>
        <option value="chat">Chat (no tools)</option>
      </select>
    </SettingRow>

    <SettingRow label="Language" description="Display language">
      <select
        value={settings.language}
        onChange={(e) => onChange('language', e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none border transition-colors cursor-pointer"
        style={{
          background: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border-primary)',
          color: 'var(--color-text-primary)',
        }}
      >
        <option value="en">English</option>
        <option value="zh">中文</option>
        <option value="ja">日本語</option>
        <option value="ko">한국어</option>
      </select>
    </SettingRow>

    <SettingRow label="Auto-Save" description="Automatically save sessions">
      <ToggleSwitch
        checked={settings.autoSave}
        onChange={(v) => onChange('autoSave', v)}
      />
    </SettingRow>

    <SettingRow label="Auto-Start Sandbox" description="Start sandbox on app launch">
      <ToggleSwitch
        checked={settings.autoStartSandbox}
        onChange={(v) => onChange('autoStartSandbox', v)}
      />
    </SettingRow>

    <SettingRow label="Minimize to Tray" description="Keep running in system tray when closed">
      <ToggleSwitch
        checked={settings.minimizeToTray}
        onChange={(v) => onChange('minimizeToTray', v)}
      />
    </SettingRow>
  </div>
);

// ─── Appearance Settings Tab ───────────────────────────────────────────────────────

const AppearanceSettings: React.FC<TabProps> = ({ settings, onChange }) => (
  <div className="space-y-6 max-w-lg">
    <SectionTitle title="Appearance" description="Customize the look and feel" />

    <SettingRow label="Theme" description="Application color theme">
      <div className="flex gap-2">
        {(['dark', 'light', 'system'] as const).map((theme) => (
          <button
            key={theme}
            onClick={() => onChange('theme', theme)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize"
            style={{
              background: settings.theme === theme ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
              color: settings.theme === theme ? 'white' : 'var(--color-text-secondary)',
            }}
          >
            {theme}
          </button>
        ))}
      </div>
    </SettingRow>
  </div>
);

// ─── Providers Settings Tab ────────────────────────────────────────────────────────

interface ProvidersTabProps {
  providers: ProviderInfo[];
}

const ProvidersSettings: React.FC<ProvidersTabProps> = ({ providers }) => (
  <div className="space-y-6 max-w-lg">
    <SectionTitle title="Providers" description="Configure AI providers" />
    {providers.length === 0 ? (
      <div className="text-center py-8">
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>No providers configured</p>
      </div>
    ) : (
      <div className="space-y-2">
        {providers.map((provider) => (
          <div
            key={provider.id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg border"
            style={{
              background: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border-primary)',
            }}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: provider.configured ? 'var(--color-success)' : 'var(--color-text-muted)' }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {provider.name}
              </div>
              <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {provider.type} · {provider.models.length} model{provider.models.length !== 1 ? 's' : ''}
              </div>
            </div>
            {provider.isDefault && (
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
                default
              </span>
            )}
          </div>
        ))}
      </div>
    )}
  </div>
);

// ─── Advanced Settings Tab ─────────────────────────────────────────────────────────

const AdvancedSettings: React.FC<TabProps> = ({ settings, onChange }) => (
  <div className="space-y-6 max-w-lg">
    <SectionTitle title="Advanced" description="Advanced configuration options" />

    <SettingRow label="Trace Enabled" description="Enable execution trace logging">
      <ToggleSwitch
        checked={settings.traceEnabled}
        onChange={(v) => onChange('traceEnabled', v)}
      />
    </SettingRow>

    <SettingRow label="Debug Mode" description="Enable verbose debug logging">
      <ToggleSwitch
        checked={settings.debugMode}
        onChange={(v) => onChange('debugMode', v)}
      />
    </SettingRow>

    <SettingRow label="Log Level" description="Minimum log level to display">
      <select
        value={settings.logLevel}
        onChange={(e) => onChange('logLevel', e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none border transition-colors cursor-pointer"
        style={{
          background: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border-primary)',
          color: 'var(--color-text-primary)',
        }}
      >
        <option value="debug">Debug</option>
        <option value="info">Info</option>
        <option value="warn">Warning</option>
        <option value="error">Error</option>
      </select>
    </SettingRow>
  </div>
);

// ─── Placeholder Tab ───────────────────────────────────────────────────────────────

const PlaceholderTab: React.FC<{ name: string }> = ({ name }) => (
  <div className="flex flex-col items-center justify-center py-16">
    <div
      className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
      style={{ background: 'var(--color-bg-tertiary)' }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    </div>
    <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
      {name} Settings
    </p>
    <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
      Configuration coming soon
    </p>
  </div>
);

// ─── Shared UI Components ──────────────────────────────────────────────────────────

const SectionTitle: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <div>
    <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</h3>
    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>{description}</p>
  </div>
);

const SettingRow: React.FC<{ label: string; description: string; children: React.ReactNode }> = ({
  label,
  description,
  children,
}) => (
  <div
    className="flex items-start justify-between gap-4 py-3 px-4 rounded-lg"
    style={{ background: 'var(--color-bg-secondary)' }}
  >
    <div className="min-w-0 flex-1">
      <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{label}</div>
      <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>{description}</div>
    </div>
    <div className="flex-shrink-0 w-48">{children}</div>
  </div>
);

const ToggleSwitch: React.FC<{ checked: boolean; onChange: (value: boolean) => void }> = ({
  checked,
  onChange,
}) => (
  <button
    onClick={() => onChange(!checked)}
    className="relative w-10 h-5 rounded-full transition-colors"
    style={{ background: checked ? 'var(--color-accent)' : 'var(--color-bg-tertiary)' }}
    role="switch"
    aria-checked={checked}
  >
    <span
      className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
      style={{ left: checked ? '22px' : '2px' }}
    />
  </button>
);

export default SettingsSheet;
