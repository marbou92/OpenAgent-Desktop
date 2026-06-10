/**
 * OpenAgent-Desktop - Main App Component
 *
 * Root component with Zustand store, sidebar + main content layout,
 * view routing, toast notifications, modal system, keyboard shortcuts,
 * and auto-initialization.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { create } from 'zustand';
import {
  ViewType,
  Toast,
  Modal,
  ProviderInfo,
  ExtensionInfo,
  SessionInfo,
  RecipeInfo,
  HookInfo,
  SessionData,
  AppSettings,
  DEFAULT_SETTINGS,
  ChatMessage,
  TraceEntry,
  PermissionRequest,
} from './types';
import Sidebar from './components/Layout/Sidebar';
import ChatView from './components/Chat/ChatView';
import ExtensionsView from './components/Extensions/ExtensionsView';
import RecipesView from './components/Recipes/RecipesView';
import SessionsView from './components/Session/SessionsView';
import SettingsView from './components/Settings/SettingsView';
import FileDropZone from './components/Chat/FileDropZone';
import ThinkingTrace from './components/Chat/ThinkingTrace';

const api = (window as any).openagent;

// ─── Zustand Store ─────────────────────────────────────────────────────────────

interface AppStore {
  // Navigation
  currentView: ViewType;
  sidebarCollapsed: boolean;
  setCurrentView: (view: ViewType) => void;
  toggleSidebar: () => void;

  // Session
  currentSessionId: string | null;
  currentSession: SessionData | null;
  sessions: SessionInfo[];
  setCurrentSessionId: (id: string | null) => void;
  setSessions: (sessions: SessionInfo[]) => void;
  setCurrentSession: (session: SessionData | null) => void;

  // Data
  providers: ProviderInfo[];
  extensions: ExtensionInfo[];
  recipes: RecipeInfo[];
  hooks: HookInfo[];
  setProviders: (providers: ProviderInfo[]) => void;
  setExtensions: (extensions: ExtensionInfo[]) => void;
  setRecipes: (recipes: RecipeInfo[]) => void;
  setHooks: (hooks: HookInfo[]) => void;

  // Chat
  messages: ChatMessage[];
  isStreaming: boolean;
  traceEntries: TraceEntry[];
  tracePanelOpen: boolean;
  setMessages: (messages: ChatMessage[]) => void;
  setIsStreaming: (streaming: boolean) => void;
  addTraceEntry: (entry: TraceEntry) => void;
  clearTraceEntries: () => void;
  toggleTracePanel: () => void;

  // Permission requests
  permissionRequests: PermissionRequest[];
  addPermissionRequest: (request: PermissionRequest) => void;
  removePermissionRequest: (id: string) => void;

  // Settings
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;

  // UI
  toasts: Toast[];
  modals: Modal[];
  loading: boolean;
  version: string;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  addModal: (modal: Omit<Modal, 'id'>) => void;
  removeModal: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setVersion: (version: string) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  // Navigation
  currentView: 'chat',
  sidebarCollapsed: false,
  setCurrentView: (view) => set({ currentView: view }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  // Session
  currentSessionId: null,
  currentSession: null,
  sessions: [],
  setCurrentSessionId: (id) => set({ currentSessionId: id }),
  setSessions: (sessions) => set({ sessions }),
  setCurrentSession: (session) => set({ currentSession: session }),

  // Data
  providers: [],
  extensions: [],
  recipes: [],
  hooks: [],
  setProviders: (providers) => set({ providers }),
  setExtensions: (extensions) => set({ extensions }),
  setRecipes: (recipes) => set({ recipes }),
  setHooks: (hooks) => set({ hooks }),

  // Chat
  messages: [],
  isStreaming: false,
  traceEntries: [],
  tracePanelOpen: false,
  setMessages: (messages) => set({ messages }),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  addTraceEntry: (entry) => set((state) => ({ traceEntries: [...state.traceEntries, entry] })),
  clearTraceEntries: () => set({ traceEntries: [] }),
  toggleTracePanel: () => set((state) => ({ tracePanelOpen: !state.tracePanelOpen })),

  // Permission requests
  permissionRequests: [],
  addPermissionRequest: (request) =>
    set((state) => ({ permissionRequests: [...state.permissionRequests, request] })),
  removePermissionRequest: (id) =>
    set((state) => ({ permissionRequests: state.permissionRequests.filter((r) => r.id !== id) })),

  // Settings
  settings: DEFAULT_SETTINGS,
  updateSettings: (updates) =>
    set((state) => ({ settings: { ...state.settings, ...updates } })),

  // UI
  toasts: [],
  modals: [],
  loading: true,
  version: '0.0.0',
  addToast: (toast) => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    const duration = toast.duration ?? 4000;
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }, duration);
    }
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  addModal: (modal) => {
    const id = crypto.randomUUID();
    set((state) => ({ modals: [...state.modals, { ...modal, id }] }));
  },
  removeModal: (id) =>
    set((state) => ({ modals: state.modals.filter((m) => m.id !== id) })),
  setLoading: (loading) => set({ loading }),
  setVersion: (version) => set({ version }),
}));

// ─── Main App Component ────────────────────────────────────────────────────────

const App: React.FC = () => {
  const store = useAppStore();
  const initializedRef = useRef(false);

  // ─── Auto-initialize on mount ──────────────────────────────────────────────

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    initializeApp();
  }, []);

  const initializeApp = async () => {
    store.setLoading(true);
    try {
      // Load version
      if (api?.app?.getVersion) {
        try {
          const version = await api.app.getVersion();
          store.setVersion(version);
        } catch {
          store.setVersion('0.1.0');
        }
      }

      // Load providers
      if (api?.providers?.list) {
        try {
          const providers = await api.providers.list();
          store.setProviders(providers);
        } catch (err) {
          console.error('Failed to load providers:', err);
        }
      }

      // Load extensions
      if (api?.extensions?.list) {
        try {
          const extensions = await api.extensions.list();
          store.setExtensions(extensions);
        } catch (err) {
          console.error('Failed to load extensions:', err);
        }
      }

      // Load sessions
      if (api?.sessions?.list) {
        try {
          const sessions = await api.sessions.list();
          store.setSessions(sessions);
        } catch (err) {
          console.error('Failed to load sessions:', err);
        }
      }

      // Load recipes
      if (api?.recipes?.list) {
        try {
          const recipes = await api.recipes.list();
          store.setRecipes(recipes);
        } catch (err) {
          console.error('Failed to load recipes:', err);
        }
      }

      // Load hooks
      if (api?.hooks?.list) {
        try {
          const hooks = await api.hooks.list();
          store.setHooks(hooks);
        } catch (err) {
          console.error('Failed to load hooks:', err);
        }
      }

      store.addToast({ type: 'success', title: 'OpenAgent-Desktop initialized' });
    } catch (err: any) {
      store.addToast({ type: 'error', title: 'Initialization failed', message: err.message });
    } finally {
      store.setLoading(false);
    }
  };

  // ─── Create new session ────────────────────────────────────────────────────

  const handleNewSession = useCallback(async () => {
    if (!api?.sessions?.create) return;

    try {
      const defaultProvider = store.providers.find((p) => p.isDefault) || store.providers[0];
      const session = await api.sessions.create({
        name: `Chat ${store.sessions.length + 1}`,
        providerId: defaultProvider?.id,
        model: defaultProvider?.models?.[0] || store.settings.defaultModel,
      });
      store.setCurrentSession(session);
      store.setCurrentSessionId(session.id);
      store.setMessages([]);
      store.clearTraceEntries();
      store.setCurrentView('chat');

      // Refresh session list
      const sessions = await api.sessions.list();
      store.setSessions(sessions);

      store.addToast({ type: 'success', title: 'New session created' });
    } catch (err: any) {
      store.addToast({ type: 'error', title: 'Failed to create session', message: err.message });
    }
  }, [store.providers, store.sessions, store.settings.defaultModel]);

  // ─── Load session ──────────────────────────────────────────────────────────

  const handleLoadSession = useCallback(async (sessionId: string) => {
    if (!api?.sessions?.load) return;

    try {
      const session = await api.sessions.load(sessionId);
      store.setCurrentSession(session);
      store.setCurrentSessionId(sessionId);
      store.setMessages(
        session.messages.map((m) => ({
          ...m,
          isStreaming: false,
        }))
      );
      store.clearTraceEntries();
      store.setCurrentView('chat');

      // Start tracing
      if (api?.trace?.start) {
        await api.trace.start(sessionId);
      }
    } catch (err: any) {
      store.addToast({ type: 'error', title: 'Failed to load session', message: err.message });
    }
  }, []);

  // ─── Delete session ────────────────────────────────────────────────────────

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    if (!api?.sessions?.delete) return;

    try {
      await api.sessions.delete(sessionId);
      if (store.currentSessionId === sessionId) {
        store.setCurrentSessionId(null);
        store.setCurrentSession(null);
        store.setMessages([]);
      }
      const sessions = await api.sessions.list();
      store.setSessions(sessions);
      store.addToast({ type: 'success', title: 'Session deleted' });
    } catch (err: any) {
      store.addToast({ type: 'error', title: 'Failed to delete session', message: err.message });
    }
  }, [store.currentSessionId]);

  // ─── Import recipe ─────────────────────────────────────────────────────────

  const handleImportRecipe = useCallback(async () => {
    const url = prompt('Enter recipe URL or paste JSON:');
    if (!url || !api?.recipes?.import) return;

    try {
      await api.recipes.import(url);
      const recipes = await api.recipes.list();
      store.setRecipes(recipes);
      store.addToast({ type: 'success', title: 'Recipe imported' });
    } catch (err: any) {
      store.addToast({ type: 'error', title: 'Failed to import recipe', message: err.message });
    }
  }, []);

  // ─── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      // Ctrl/Cmd + N: New session
      if (isMod && e.key === 'n') {
        e.preventDefault();
        handleNewSession();
        return;
      }

      // Ctrl/Cmd + ,: Settings
      if (isMod && e.key === ',') {
        e.preventDefault();
        store.setCurrentView('settings');
        return;
      }

      // Ctrl/Cmd + B: Toggle sidebar
      if (isMod && e.key === 'b') {
        e.preventDefault();
        store.toggleSidebar();
        return;
      }

      // Ctrl/Cmd + E: Extensions
      if (isMod && e.key === 'e') {
        e.preventDefault();
        store.setCurrentView('extensions');
        return;
      }

      // Ctrl/Cmd + R: Recipes
      if (isMod && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        store.setCurrentView('recipes');
        return;
      }

      // Escape: Close modal or trace panel
      if (e.key === 'Escape') {
        if (store.modals.length > 0) {
          store.removeModal(store.modals[store.modals.length - 1].id);
        } else if (store.tracePanelOpen) {
          store.toggleTracePanel();
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNewSession, store.modals, store.tracePanelOpen]);

  // ─── Render ────────────────────────────────────────────────────────────────

  const renderMainContent = () => {
    switch (store.currentView) {
      case 'chat':
        return (
          <ChatView
            sessionId={store.currentSessionId}
            session={store.currentSession}
            providers={store.providers}
            messages={store.messages}
            isStreaming={store.isStreaming}
            onMessagesUpdate={store.setMessages}
            onNewSession={handleNewSession}
            onLoadSession={handleLoadSession}
            settings={store.settings}
            addToast={store.addToast}
            addTraceEntry={store.addTraceEntry}
          />
        );
      case 'extensions':
        return (
          <ExtensionsView
            extensions={store.extensions}
            onRefresh={async () => {
              if (api?.extensions?.list) {
                const extensions = await api.extensions.list();
                store.setExtensions(extensions);
              }
            }}
            addToast={store.addToast}
          />
        );
      case 'recipes':
        return (
          <RecipesView
            recipes={store.recipes}
            onRefresh={async () => {
              if (api?.recipes?.list) {
                const recipes = await api.recipes.list();
                store.setRecipes(recipes);
              }
            }}
            addToast={store.addToast}
          />
        );
      case 'sessions':
        return (
          <SessionsView
            sessions={store.sessions}
            currentSessionId={store.currentSessionId}
            onLoadSession={handleLoadSession}
            onDeleteSession={handleDeleteSession}
            onNewSession={handleNewSession}
            addToast={store.addToast}
          />
        );
      case 'settings':
        return (
          <SettingsView
            providers={store.providers}
            settings={store.settings}
            onUpdateSettings={store.updateSettings}
            onProvidersChange={async () => {
              if (api?.providers?.list) {
                const providers = await api.providers.list();
                store.setProviders(providers);
              }
            }}
            addToast={store.addToast}
          />
        );
      case 'hooks':
        return (
          <HooksView
            hooks={store.hooks}
            onRefresh={async () => {
              if (api?.hooks?.list) {
                const hooks = await api.hooks.list();
                store.setHooks(hooks);
              }
            }}
            addToast={store.addToast}
          />
        );
      case 'sandbox':
        return (
          <SandboxView
            addToast={store.addToast}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}>
      {/* Sidebar */}
      {!store.sidebarCollapsed && (
        <Sidebar
          currentView={store.currentView}
          currentSessionId={store.currentSessionId}
          sessions={store.sessions}
          providers={store.providers}
          version={store.version}
          onNavigate={store.setCurrentView}
          onNewSession={handleNewSession}
          onLoadSession={handleLoadSession}
          onImportRecipe={handleImportRecipe}
          onToggleSidebar={store.toggleSidebar}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Titlebar area */}
        <div
          className="titlebar-drag flex items-center justify-between px-4 border-b"
          style={{
            height: 'var(--titlebar-height)',
            background: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border-secondary)',
          }}
        >
          <div className="titlebar-no-drag flex items-center gap-2">
            {store.sidebarCollapsed && (
              <button
                onClick={store.toggleSidebar}
                className="p-1.5 rounded-md transition-colors"
                style={{ color: 'var(--color-text-tertiary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                aria-label="Toggle sidebar"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
            )}
            <span className="text-sm font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
              OpenAgent
            </span>
          </div>
          <div className="titlebar-no-drag flex items-center gap-2">
            {store.currentSession && store.currentView === 'chat' && (
              <span className="text-xs truncate max-w-xs" style={{ color: 'var(--color-text-muted)' }}>
                {store.currentSession.name}
              </span>
            )}
            {store.currentView !== 'chat' && (
              <span className="text-xs capitalize" style={{ color: 'var(--color-text-muted)' }}>
                {store.currentView}
              </span>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 overflow-hidden">
            {store.loading ? (
              <LoadingScreen />
            ) : (
              renderMainContent()
            )}
          </div>

          {/* Thinking Trace Side Panel */}
          {store.tracePanelOpen && (
            <ThinkingTrace
              entries={store.traceEntries}
              onClose={store.toggleTracePanel}
            />
          )}
        </div>
      </main>

      {/* File Drop Zone */}
      <FileDropZone />

      {/* Toast Notifications */}
      <ToastContainer toasts={store.toasts} onRemove={store.removeToast} />

      {/* Modals */}
      <ModalContainer modals={store.modals} onRemove={store.removeModal} />
    </div>
  );
};

// ─── Loading Screen ────────────────────────────────────────────────────────────

const LoadingScreen: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-full gap-4">
    <div className="relative">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--color-accent), #6d28d9)' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>
      <div className="absolute inset-0 rounded-xl animate-pulse-glow" />
    </div>
    <div className="typing-indicator">
      <div className="dot" />
      <div className="dot" />
      <div className="dot" />
    </div>
    <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Initializing OpenAgent-Desktop...</p>
  </div>
);

// ─── Hooks View ────────────────────────────────────────────────────────────────

const HooksView: React.FC<{
  hooks: HookInfo[];
  onRefresh: () => Promise<void>;
  addToast: (toast: Omit<Toast, 'id'>) => void;
}> = ({ hooks, onRefresh, addToast }) => {
  const [newHookName, setNewHookName] = useState('');
  const [newHookType, setNewHookType] = useState<HookInfo['type']>('PreToolUse');
  const [newHookCommand, setNewHookCommand] = useState('');

  const handleAddHook = async () => {
    if (!api?.hooks?.add || !newHookName || !newHookCommand) return;
    try {
      await api.hooks.add({
        name: newHookName,
        type: newHookType,
        command: newHookCommand,
        enabled: true,
        conditions: {},
      });
      setNewHookName('');
      setNewHookCommand('');
      await onRefresh();
      addToast({ type: 'success', title: 'Hook added' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to add hook', message: err.message });
    }
  };

  const handleRemoveHook = async (hookId: string) => {
    if (!api?.hooks?.remove) return;
    try {
      await api.hooks.remove(hookId);
      await onRefresh();
      addToast({ type: 'success', title: 'Hook removed' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to remove hook', message: err.message });
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6" style={{ background: 'var(--color-bg-primary)' }}>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--color-text-primary)' }}>Hooks</h1>

        {/* Add Hook Form */}
        <div className="rounded-xl p-4 mb-6 border" style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>Add New Hook</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <input
              type="text"
              value={newHookName}
              onChange={(e) => setNewHookName(e.target.value)}
              placeholder="Hook name"
              className="px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
            />
            <select
              value={newHookType}
              onChange={(e) => setNewHookType(e.target.value as any)}
              className="px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
            >
              <option value="PreToolUse">PreToolUse</option>
              <option value="PostToolUse">PostToolUse</option>
              <option value="UserPromptSubmit">UserPromptSubmit</option>
              <option value="PreSession">PreSession</option>
              <option value="PostSession">PostSession</option>
            </select>
            <input
              type="text"
              value={newHookCommand}
              onChange={(e) => setNewHookCommand(e.target.value)}
              placeholder="Shell command"
              className="px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
            />
          </div>
          <button
            onClick={handleAddHook}
            disabled={!newHookName || !newHookCommand}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
            style={{ background: 'var(--color-accent)', color: 'white' }}
          >
            Add Hook
          </button>
        </div>

        {/* Hook List */}
        <div className="space-y-3">
          {hooks.length === 0 && (
            <div className="text-center py-12" style={{ color: 'var(--color-text-tertiary)' }}>
              <p className="text-lg">No hooks configured</p>
              <p className="text-sm mt-1">Add a hook above to customize agent behavior</p>
            </div>
          )}
          {hooks.map((hook) => (
            <div
              key={hook.id}
              className="rounded-xl p-4 border flex items-center justify-between"
              style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: hook.enabled ? 'var(--color-success)' : 'var(--color-text-muted)' }}
                  />
                  <span className="font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                    {hook.name}
                  </span>
                  <span
                    className="px-2 py-0.5 rounded text-xs font-medium"
                    style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
                  >
                    {hook.type}
                  </span>
                </div>
                <p className="text-xs mt-1 font-mono truncate" style={{ color: 'var(--color-text-tertiary)' }}>
                  {hook.command}
                </p>
              </div>
              <button
                onClick={() => handleRemoveHook(hook.id)}
                className="ml-3 p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--color-error)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                aria-label="Remove hook"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Sandbox View ──────────────────────────────────────────────────────────────

const SandboxView: React.FC<{
  addToast: (toast: Omit<Toast, 'id'>) => void;
}> = ({ addToast }) => {
  const [status, setStatus] = useState<any>(null);
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState('');
  const [executing, setExecuting] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    if (!api?.sandbox?.status) return;
    try {
      const s = await api.sandbox.status();
      setStatus(s);
    } catch (err) {
      console.error('Failed to load sandbox status:', err);
    }
  };

  const handleStart = async () => {
    if (!api?.sandbox?.start) return;
    try {
      await api.sandbox.start({ cpuLimit: 50, memoryLimitMB: 2048, diskLimitMB: 5120, networkIsolation: false });
      await loadStatus();
      addToast({ type: 'success', title: 'Sandbox started' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to start sandbox', message: err.message });
    }
  };

  const handleStop = async () => {
    if (!api?.sandbox?.stop) return;
    try {
      await api.sandbox.stop();
      await loadStatus();
      addToast({ type: 'success', title: 'Sandbox stopped' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to stop sandbox', message: err.message });
    }
  };

  const handleExecute = async () => {
    if (!api?.sandbox?.execute || !command.trim()) return;
    setExecuting(true);
    setOutput('');
    try {
      const result = await api.sandbox.execute(command);
      setOutput(
        `Exit Code: ${result.exitCode}${result.timedOut ? ' (timed out)' : ''}\nDuration: ${result.duration}ms\n\n--- STDOUT ---\n${result.stdout}\n\n--- STDERR ---\n${result.stderr}`
      );
    } catch (err: any) {
      setOutput(`Error: ${err.message}`);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6" style={{ background: 'var(--color-bg-primary)' }}>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--color-text-primary)' }}>Sandbox</h1>

        {/* Status Card */}
        <div className="rounded-xl p-4 mb-6 border" style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span
                className="w-3 h-3 rounded-full"
                style={{ background: status?.running ? 'var(--color-success)' : 'var(--color-text-muted)' }}
              />
              <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {status?.running ? 'Running' : 'Stopped'}
              </span>
              {status?.type && (
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}>
                  {status.type}
                </span>
              )}
              {status?.health && (
                <span className="text-xs px-2 py-0.5 rounded" style={{
                  background: status.health === 'healthy' ? 'rgba(34,197,94,0.1)' : status.health === 'degraded' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                  color: status.health === 'healthy' ? 'var(--color-success)' : status.health === 'degraded' ? 'var(--color-warning)' : 'var(--color-error)',
                }}>
                  {status.health}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {!status?.running ? (
                <button onClick={handleStart} className="px-4 py-1.5 rounded-lg text-sm font-medium" style={{ background: 'var(--color-success)', color: 'white' }}>
                  Start
                </button>
              ) : (
                <button onClick={handleStop} className="px-4 py-1.5 rounded-lg text-sm font-medium" style={{ background: 'var(--color-error)', color: 'white' }}>
                  Stop
                </button>
              )}
              <button onClick={loadStatus} className="px-3 py-1.5 rounded-lg text-sm border" style={{ borderColor: 'var(--color-border-primary)', color: 'var(--color-text-secondary)' }}>
                Refresh
              </button>
            </div>
          </div>

          {/* Resource Usage */}
          {status?.resourceUsage && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'CPU', value: `${status.resourceUsage.cpuPercent}%` },
                { label: 'Memory', value: `${status.resourceUsage.memoryUsedMB} / ${status.resourceUsage.memoryLimitMB} MB` },
                { label: 'Disk', value: `${status.resourceUsage.diskUsedMB} / ${status.resourceUsage.diskLimitMB} MB` },
                { label: 'Started', value: status.startedAt ? new Date(status.startedAt).toLocaleTimeString() : 'N/A' },
              ].map((item) => (
                <div key={item.label} className="rounded-lg p-3" style={{ background: 'var(--color-bg-tertiary)' }}>
                  <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{item.label}</div>
                  <div className="text-sm font-medium mt-0.5" style={{ color: 'var(--color-text-primary)' }}>{item.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Execute Command */}
        <div className="rounded-xl p-4 mb-6 border" style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}>
          <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>Execute Command</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleExecute()}
              placeholder="Enter a command..."
              className="flex-1 px-3 py-2 rounded-lg border text-sm font-mono"
              style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
            />
            <button
              onClick={handleExecute}
              disabled={!command.trim() || executing || !status?.running}
              className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ background: 'var(--color-accent)', color: 'white' }}
            >
              {executing ? 'Running...' : 'Run'}
            </button>
          </div>
          {output && (
            <pre
              className="mt-3 p-3 rounded-lg text-xs font-mono overflow-auto max-h-64"
              style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-secondary)' }}
            >
              {output}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Toast Container ───────────────────────────────────────────────────────────

const ToastContainer: React.FC<{
  toasts: Toast[];
  onRemove: (id: string) => void;
}> = ({ toasts, onRemove }) => {
  if (toasts.length === 0) return null;

  const iconForType = (type: Toast['type']) => {
    switch (type) {
      case 'success':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        );
      case 'error':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        );
      case 'warning':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        );
      case 'info':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        );
    }
  };

  const colorForType = (type: Toast['type']) => {
    switch (type) {
      case 'success': return 'var(--color-success)';
      case 'error': return 'var(--color-error)';
      case 'warning': return 'var(--color-warning)';
      case 'info': return 'var(--color-info)';
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="animate-slide-in-right rounded-lg p-3 border shadow-lg flex items-start gap-3"
          style={{
            background: 'var(--color-bg-elevated)',
            borderColor: 'var(--color-border-primary)',
          }}
        >
          <div className="flex-shrink-0 mt-0.5" style={{ color: colorForType(toast.type) }}>
            {iconForType(toast.type)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{toast.title}</p>
            {toast.message && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{toast.message}</p>
            )}
            {toast.action && (
              <button
                onClick={toast.action.onClick}
                className="text-xs font-medium mt-1"
                style={{ color: 'var(--color-accent)' }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
          <button
            onClick={() => onRemove(toast.id)}
            className="flex-shrink-0 p-0.5 rounded transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
            aria-label="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
};

// ─── Modal Container ───────────────────────────────────────────────────────────

const ModalContainer: React.FC<{
  modals: Modal[];
  onRemove: (id: string) => void;
}> = ({ modals, onRemove }) => {
  if (modals.length === 0) return null;

  const modal = modals[modals.length - 1];
  const sizeClasses: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-full mx-4',
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div
        className={`animate-fade-in rounded-xl border shadow-2xl w-full ${sizeClasses[modal.size || 'md']}`}
        style={{ background: 'var(--color-bg-elevated)', borderColor: 'var(--color-border-primary)' }}
      >
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--color-border-secondary)' }}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>{modal.title}</h2>
          {modal.closable !== false && (
            <button
              onClick={() => {
                modal.onClose?.();
                onRemove(modal.id);
              }}
              className="p-1 rounded transition-colors"
              style={{ color: 'var(--color-text-tertiary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              aria-label="Close modal"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <div className="p-4">{modal.content}</div>
      </div>
    </div>
  );
};

export default App;
