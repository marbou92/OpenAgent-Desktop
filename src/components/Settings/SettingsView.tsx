/**
 * OpenAgent-Desktop - Settings View Component
 *
 * Tabbed settings view with General, Providers, Sandbox, Advanced, About tabs.
 */

import React, { useState, useEffect } from 'react';
import { ProviderInfo, AppSettings, DEFAULT_SETTINGS, Toast, HookInfo } from '../../types';
import ProviderForm from './ProviderForm';
import AppearanceView from './AppearanceView';
import HookEditorView, { HookLogView } from './HookEditorView';

const api = (window as any).openagent;

interface SettingsViewProps {
  providers: ProviderInfo[];
  settings: AppSettings;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
  onProvidersChange: () => Promise<void>;
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

type SettingsTab = 'general' | 'appearance' | 'providers' | 'hooks' | 'sandbox' | 'advanced' | 'about';

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
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
    id: 'hooks',
    label: 'Hooks',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
  {
    id: 'sandbox',
    label: 'Sandbox',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <path d="M12 12h.01" />
        <path d="M17 12h.01" />
        <path d="M7 12h.01" />
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
  {
    id: 'about',
    label: 'About',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
];

const SettingsView: React.FC<SettingsViewProps> = ({
  providers,
  settings,
  onUpdateSettings,
  onProvidersChange,
  addToast,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderInfo | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [hooks, setHooks] = useState<HookInfo[]>([]);
  const [editingHook, setEditingHook] = useState<HookInfo | null>(null);
  const [showHookEditor, setShowHookEditor] = useState(false);

  const handleTestProvider = async (providerId: string) => {
    if (!api?.providers?.test) return;
    setTestingProvider(providerId);
    try {
      const result = await api.providers.test(providerId);
      if (result.working) {
        addToast({ type: 'success', title: 'Connection successful', message: `Latency: ${result.latency}ms` });
      } else {
        addToast({ type: 'error', title: 'Connection failed' });
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Test failed', message: err.message });
    } finally {
      setTestingProvider(null);
    }
  };

  const handleDeleteProvider = async (providerId: string) => {
    if (!api?.providers?.remove) return;
    if (!confirm('Are you sure you want to remove this provider?')) return;
    try {
      await api.providers.remove(providerId);
      await onProvidersChange();
      addToast({ type: 'success', title: 'Provider removed' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to remove provider', message: err.message });
    }
  };

  const handleSetDefaultProvider = async (providerId: string, model: string) => {
    if (!api?.providers?.setDefault) return;
    try {
      await api.providers.setDefault(providerId, model);
      onUpdateSettings({ defaultProviderId: providerId, defaultModel: model });
      await onProvidersChange();
      addToast({ type: 'success', title: 'Default provider updated' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to set default', message: err.message });
    }
  };

  // ─── Hook Handlers ──────────────────────────────────────────────────────────

  const loadHooks = async () => {
    if (!api?.hooks?.list) return;
    try {
      const result = await api.hooks.list();
      if (Array.isArray(result)) {
        setHooks(result);
      }
    } catch { /* ignore */ }
  };

  const handleToggleHook = async (hookId: string, currentlyEnabled: boolean) => {
    if (!api?.hooks) return;
    try {
      if (currentlyEnabled) {
        // To disable, remove and re-add with enabled=false
        const existingHook = hooks.find((h) => h.id === hookId);
        if (existingHook) {
          await api.hooks.remove(hookId);
          await api.hooks.add({ ...existingHook, enabled: false, id: undefined });
          await loadHooks();
          addToast({ type: 'success', title: 'Hook disabled' });
        }
      } else {
        const existingHook = hooks.find((h) => h.id === hookId);
        if (existingHook) {
          await api.hooks.remove(hookId);
          await api.hooks.add({ ...existingHook, enabled: true, id: undefined });
          await loadHooks();
          addToast({ type: 'success', title: 'Hook enabled' });
        }
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to toggle hook', message: err.message });
    }
  };

  const handleSaveHook = async (hookData: Omit<HookInfo, 'id'>) => {
    if (!api?.hooks?.add) return;
    try {
      if (editingHook) {
        // Remove old hook first
        await api.hooks.remove(editingHook.id);
      }
      await api.hooks.add(hookData);
      await loadHooks();
      setShowHookEditor(false);
      setEditingHook(null);
      addToast({ type: 'success', title: editingHook ? 'Hook updated' : 'Hook created' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to save hook', message: err.message });
    }
  };

  const handleDeleteHook = async (hookId: string) => {
    if (!api?.hooks?.remove) return;
    if (!confirm('Delete this hook?')) return;
    try {
      await api.hooks.remove(hookId);
      await loadHooks();
      addToast({ type: 'success', title: 'Hook deleted' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to delete hook', message: err.message });
    }
  };

  // Load hooks when the hooks tab is activated
  useEffect(() => {
    if (activeTab === 'hooks' && hooks.length === 0 && api?.hooks?.list) {
      api.hooks.list().then((result: HookInfo[]) => {
        if (Array.isArray(result)) {
          setHooks(result);
        }
      }).catch(() => {});
    }
  }, [activeTab, hooks.length]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div className="space-y-6">
            {/* Theme */}
            <SettingsSection title="Appearance">
              <SettingsRow label="Theme" description="Choose the application theme">
                <select
                  value={settings.theme}
                  onChange={(e) => onUpdateSettings({ theme: e.target.value as any })}
                  className="px-3 py-2 rounded-lg border text-sm"
                  style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="system">System</option>
                </select>
              </SettingsRow>
              <SettingsRow label="Language" description="Application language">
                <select
                  value={settings.language}
                  onChange={(e) => onUpdateSettings({ language: e.target.value })}
                  className="px-3 py-2 rounded-lg border text-sm"
                  style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
                >
                  <option value="en">English</option>
                  <option value="zh">中文</option>
                  <option value="ja">日本語</option>
                </select>
              </SettingsRow>
            </SettingsSection>

            {/* Chat */}
            <SettingsSection title="Chat">
              <SettingsRow label="Permission Mode" description="How the agent handles tool calls">
                <select
                  value={settings.permissionMode}
                  onChange={(e) => onUpdateSettings({ permissionMode: e.target.value as any })}
                  className="px-3 py-2 rounded-lg border text-sm"
                  style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
                >
                  <option value="auto">Auto-approve all</option>
                  <option value="approve">Approve each</option>
                  <option value="smart_approve">Smart approve</option>
                  <option value="chat">Chat only</option>
                </select>
              </SettingsRow>
              <SettingsRow label="Auto-save" description="Automatically save sessions">
                <ToggleSwitch checked={settings.autoSave} onChange={(v) => onUpdateSettings({ autoSave: v })} />
              </SettingsRow>
              <SettingsRow label="Default Model" description="Default model for new sessions">
                <input
                  type="text"
                  value={settings.defaultModel}
                  onChange={(e) => onUpdateSettings({ defaultModel: e.target.value })}
                  className="px-3 py-2 rounded-lg border text-sm"
                  style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
                />
              </SettingsRow>
            </SettingsSection>

            {/* Startup */}
            <SettingsSection title="Startup">
              <SettingsRow label="Auto-start sandbox" description="Start sandbox on app launch">
                <ToggleSwitch checked={settings.autoStartSandbox} onChange={(v) => onUpdateSettings({ autoStartSandbox: v })} />
              </SettingsRow>
              <SettingsRow label="Minimize to tray" description="Keep running in system tray">
                <ToggleSwitch checked={settings.minimizeToTray} onChange={(v) => onUpdateSettings({ minimizeToTray: v })} />
              </SettingsRow>
            </SettingsSection>
          </div>
        );

      case 'appearance':
        return <AppearanceView />;

      case 'providers':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>AI Providers</h2>
              <button
                onClick={() => {
                  setEditingProvider(null);
                  setShowProviderForm(true);
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
                style={{ background: 'var(--color-accent)', color: 'white' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Provider
              </button>
            </div>

            {providers.length === 0 ? (
              <div className="text-center py-12" style={{ color: 'var(--color-text-tertiary)' }}>
                <p className="text-lg">No providers configured</p>
                <p className="text-sm mt-1">Add an AI provider to start chatting</p>
              </div>
            ) : (
              <div className="space-y-3">
                {providers.map((provider) => (
                  <div
                    key={provider.id}
                    className="rounded-xl p-4 border"
                    style={{ background: 'var(--color-bg-secondary)', borderColor: provider.isDefault ? 'var(--color-accent)' : 'var(--color-border-primary)' }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-accent-soft)' }}>
                          <span className="text-xs font-bold uppercase" style={{ color: 'var(--color-accent)' }}>
                            {provider.type.slice(0, 2)}
                          </span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{provider.name}</span>
                            {provider.isDefault && (
                              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>Default</span>
                            )}
                            <span className="w-2 h-2 rounded-full" style={{ background: provider.configured ? 'var(--color-success)' : 'var(--color-error)' }} />
                          </div>
                          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{provider.type}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleTestProvider(provider.id)}
                          disabled={testingProvider === provider.id}
                          className="px-3 py-1.5 rounded-lg text-xs border transition-colors disabled:opacity-50"
                          style={{ borderColor: 'var(--color-border-primary)', color: 'var(--color-text-secondary)' }}
                        >
                          {testingProvider === provider.id ? 'Testing...' : 'Test'}
                        </button>
                        {!provider.isDefault && provider.models.length > 0 && (
                          <button
                            onClick={() => handleSetDefaultProvider(provider.id, provider.models[0])}
                            className="px-3 py-1.5 rounded-lg text-xs transition-colors"
                            style={{ color: 'var(--color-accent)' }}
                          >
                            Set Default
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setEditingProvider(provider);
                            setShowProviderForm(true);
                          }}
                          className="p-1.5 rounded transition-colors"
                          style={{ color: 'var(--color-text-tertiary)' }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteProvider(provider.id)}
                          className="p-1.5 rounded transition-colors"
                          style={{ color: 'var(--color-text-tertiary)' }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-error)')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {provider.models.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {provider.models.slice(0, 5).map((model) => (
                          <span key={model} className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}>
                            {model}
                          </span>
                        ))}
                        {provider.models.length > 5 && (
                          <span className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--color-text-muted)' }}>
                            +{provider.models.length - 5} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Provider Form Modal */}
            {showProviderForm && (
              <ProviderForm
                provider={editingProvider}
                onClose={() => {
                  setShowProviderForm(false);
                  setEditingProvider(null);
                }}
                onSave={async () => {
                  setShowProviderForm(false);
                  setEditingProvider(null);
                  await onProvidersChange();
                }}
                addToast={addToast}
              />
            )}
          </div>
        );

      case 'hooks':
        return (
          <div className="space-y-6">
            {showHookEditor ? (
              <HookEditorView
                hook={editingHook || undefined}
                onSave={handleSaveHook}
                onCancel={() => {
                  setShowHookEditor(false);
                  setEditingHook(null);
                }}
              />
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>Lifecycle Hooks</h2>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                      Shell commands that run at specific points in the agent lifecycle
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingHook(null);
                      setShowHookEditor(true);
                    }}
                    className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
                    style={{ background: 'var(--color-accent)', color: 'white' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add Hook
                  </button>
                </div>

                {hooks.length === 0 ? (
                  <div className="text-center py-12" style={{ color: 'var(--color-text-tertiary)' }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                    <p className="text-lg">No hooks configured</p>
                    <p className="text-sm mt-1">Add a hook to customize agent behavior</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {hooks.map((hook) => (
                      <div
                        key={hook.id}
                        className="rounded-xl p-4 border"
                        style={{ background: 'var(--color-bg-secondary)', borderColor: hook.enabled ? 'var(--color-border-primary)' : 'var(--color-border-primary)', opacity: hook.enabled ? 1 : 0.7 }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: hook.enabled ? 'var(--color-accent-soft)' : 'var(--color-bg-tertiary)' }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={hook.enabled ? 'var(--color-accent)' : 'var(--color-text-muted)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                              </svg>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>{hook.name}</span>
                                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}>
                                  {hook.type}
                                </span>
                              </div>
                              <code className="text-xs font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
                                {hook.command}
                              </code>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Enable/Disable Toggle */}
                            <button
                              onClick={() => handleToggleHook(hook.id, hook.enabled)}
                              className="relative w-10 h-5 rounded-full transition-colors"
                              style={{ background: hook.enabled ? 'var(--color-success)' : 'var(--color-bg-tertiary)' }}
                            >
                              <span
                                className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                                style={{ transform: hook.enabled ? 'translateX(20px)' : 'translateX(0)' }}
                              />
                            </button>
                            {/* Edit Button */}
                            <button
                              onClick={() => {
                                setEditingHook(hook);
                                setShowHookEditor(true);
                              }}
                              className="p-1.5 rounded transition-colors"
                              style={{ color: 'var(--color-text-tertiary)' }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
                              title="Edit hook"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            {/* Delete Button */}
                            <button
                              onClick={() => handleDeleteHook(hook.id)}
                              className="p-1.5 rounded transition-colors"
                              style={{ color: 'var(--color-text-tertiary)' }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-error)')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
                              title="Delete hook"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* Conditions summary */}
                        {(hook.conditions?.toolName || hook.conditions?.extensionId || hook.conditions?.pattern) && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {hook.conditions.toolName && (
                              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}>
                                Tool: {hook.conditions.toolName}
                              </span>
                            )}
                            {hook.conditions.extensionId && (
                              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}>
                                Ext: {hook.conditions.extensionId}
                              </span>
                            )}
                            {hook.conditions.pattern && (
                              <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}>
                                /{hook.conditions.pattern}/
                              </span>
                            )}
                            {hook.timeout && (
                              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}>
                                {hook.timeout}s timeout
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Hook Execution Log */}
                <HookLogView />
              </>
            )}
          </div>
        );

      case 'sandbox':
        return (
          <div className="space-y-6">
            <SettingsSection title="Sandbox Configuration">
              <SettingsRow label="Sandbox Type" description="Type of sandboxing environment">
                <select className="px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}>
                  <option value="wsl2">WSL2</option>
                  <option value="lima">Lima</option>
                  <option value="basic">Basic</option>
                  <option value="none">None</option>
                </select>
              </SettingsRow>
            </SettingsSection>
            <SettingsSection title="Resource Limits">
              <SettingsRow label="CPU Limit (%)" description="Maximum CPU usage">
                <input type="number" defaultValue={50} min={10} max={100} className="px-3 py-2 rounded-lg border text-sm w-24" style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }} />
              </SettingsRow>
              <SettingsRow label="Memory Limit (MB)" description="Maximum memory allocation">
                <input type="number" defaultValue={2048} min={512} max={16384} step={256} className="px-3 py-2 rounded-lg border text-sm w-32" style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }} />
              </SettingsRow>
              <SettingsRow label="Disk Limit (MB)" description="Maximum disk space">
                <input type="number" defaultValue={5120} min={1024} max={51200} step={512} className="px-3 py-2 rounded-lg border text-sm w-32" style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }} />
              </SettingsRow>
            </SettingsSection>
            <SettingsSection title="Network">
              <SettingsRow label="Network Isolation" description="Restrict network access in sandbox">
                <ToggleSwitch checked={false} onChange={() => {}} />
              </SettingsRow>
            </SettingsSection>
          </div>
        );

      case 'advanced':
        return (
          <div className="space-y-6">
            <SettingsSection title="Debug">
              <SettingsRow label="Debug Mode" description="Enable verbose logging and debug features">
                <ToggleSwitch checked={settings.debugMode} onChange={(v) => onUpdateSettings({ debugMode: v })} />
              </SettingsRow>
              <SettingsRow label="Log Level" description="Minimum log level to display">
                <select
                  value={settings.logLevel}
                  onChange={(e) => onUpdateSettings({ logLevel: e.target.value as any })}
                  className="px-3 py-2 rounded-lg border text-sm"
                  style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
                >
                  <option value="debug">Debug</option>
                  <option value="info">Info</option>
                  <option value="warn">Warning</option>
                  <option value="error">Error</option>
                </select>
              </SettingsRow>
              <SettingsRow label="Trace Enabled" description="Record thinking and tool call traces">
                <ToggleSwitch checked={settings.traceEnabled} onChange={(v) => onUpdateSettings({ traceEnabled: v })} />
              </SettingsRow>
            </SettingsSection>

            <SettingsSection title="ACP (Agent Client Protocol)">
              <SettingsRow label="ACP Server URL" description="Connect to an external ACP server">
                <input
                  type="text"
                  placeholder="ws://localhost:8080"
                  className="px-3 py-2 rounded-lg border text-sm flex-1"
                  style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
                />
              </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Danger Zone">
              <div className="p-4 rounded-lg border" style={{ borderColor: 'var(--color-error)', background: 'rgba(239,68,68,0.05)' }}>
                <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--color-error)' }}>Reset Settings</h3>
                <p className="text-xs mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
                  This will reset all settings to their default values.
                </p>
                <button
                  className="px-4 py-1.5 rounded-lg text-sm font-medium"
                  style={{ background: 'var(--color-error)', color: 'white' }}
                  onClick={() => {
                    if (confirm('Are you sure you want to reset all settings?')) {
                      onUpdateSettings(DEFAULT_SETTINGS);
                      addToast({ type: 'warning', title: 'Settings reset to defaults' });
                    }
                  }}
                >
                  Reset to Defaults
                </button>
              </div>
            </SettingsSection>
          </div>
        );

      case 'about':
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--color-accent), #6d28d9)' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>OpenAgent-Desktop</h2>
                <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>AI-powered desktop agent</p>
              </div>
            </div>

            <SettingsSection title="Information">
              <SettingsRow label="Version" description="Current application version">
                <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>0.1.0</span>
              </SettingsRow>
              <SettingsRow label="Electron" description="Electron framework version">
                <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>28.x</span>
              </SettingsRow>
              <SettingsRow label="Platform" description="Operating system">
                <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{navigator.platform}</span>
              </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Links">
              <div className="space-y-2">
                {[
                  { label: 'Documentation', url: '#' },
                  { label: 'GitHub', url: '#' },
                  { label: 'Report a Bug', url: '#' },
                  { label: 'Discord', url: '#' },
                ].map((link) => (
                  <a
                    key={link.label}
                    href={link.url}
                    className="flex items-center gap-2 text-sm transition-colors"
                    style={{ color: 'var(--color-accent)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                    {link.label}
                  </a>
                ))}
              </div>
            </SettingsSection>
          </div>
        );
    }
  };

  return (
    <div className="h-full flex" style={{ background: 'var(--color-bg-primary)' }}>
      {/* Tab Sidebar */}
      <div className="w-48 border-r py-4 px-2 space-y-0.5" style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-secondary)' }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
            style={{
              background: activeTab === tab.id ? 'var(--color-accent-soft)' : 'transparent',
              color: activeTab === tab.id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              fontWeight: activeTab === tab.id ? 600 : 400,
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
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
};

// ─── Helper Components ─────────────────────────────────────────────────────────

const SettingsSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>{title}</h3>
    <div className="space-y-3">{children}</div>
  </div>
);

const SettingsRow: React.FC<{
  label: string;
  description: string;
  children: React.ReactNode;
}> = ({ label, description, children }) => (
  <div className="flex items-center justify-between gap-4">
    <div className="flex-1 min-w-0">
      <div className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{label}</div>
      <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{description}</div>
    </div>
    <div className="flex-shrink-0">{children}</div>
  </div>
);

const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (value: boolean) => void;
}> = ({ checked, onChange }) => (
  <button
    onClick={() => onChange(!checked)}
    className="relative w-10 h-5 rounded-full transition-colors"
    style={{ background: checked ? 'var(--color-accent)' : 'var(--color-bg-tertiary)' }}
  >
    <span
      className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
      style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
    />
  </button>
);

export default SettingsView;
