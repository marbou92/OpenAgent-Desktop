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
import SandboxView from './components/Sandbox/SandboxView';
import ProjectsView from './components/Projects/ProjectsView';
import SkillsView from './components/Skills/SkillsView';
import HooksView from './components/Hooks/HooksView';
import FileDropZone from './components/Chat/FileDropZone';
import ThinkingTrace from './components/Chat/ThinkingTrace';
import { getAPI } from './utils/api';

const api = getAPI();

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

export const useAppStore = create<AppStore>((set, _get) => ({
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
  // Use individual selectors for frequently-changing values
  const currentView = useAppStore(s => s.currentView);
  const sidebarCollapsed = useAppStore(s => s.sidebarCollapsed);
  const currentSessionId = useAppStore(s => s.currentSessionId);
  const messages = useAppStore(s => s.messages);
  const isStreaming = useAppStore(s => s.isStreaming);
  const providers = useAppStore(s => s.providers);
  const extensions = useAppStore(s => s.extensions);
  const recipes = useAppStore(s => s.recipes);
  const sessions = useAppStore(s => s.sessions);
  const hooks = useAppStore(s => s.hooks);
  const settings = useAppStore(s => s.settings);
  const traceEntries = useAppStore(s => s.traceEntries);
  const tracePanelOpen = useAppStore(s => s.tracePanelOpen);
  const _permissionRequests = useAppStore(s => s.permissionRequests);
  const toasts = useAppStore(s => s.toasts);
  const modals = useAppStore(s => s.modals);
  const loading = useAppStore(s => s.loading);
  const version = useAppStore(s => s.version);
  const currentSession = useAppStore(s => s.currentSession);

  // Action selectors (these don't cause re-renders since functions are stable)
  const setCurrentView = useAppStore(s => s.setCurrentView);
  const toggleSidebar = useAppStore(s => s.toggleSidebar);
  const setCurrentSessionId = useAppStore(s => s.setCurrentSessionId);
  const setSessions = useAppStore(s => s.setSessions);
  const setCurrentSession = useAppStore(s => s.setCurrentSession);
  const setProviders = useAppStore(s => s.setProviders);
  const setExtensions = useAppStore(s => s.setExtensions);
  const setRecipes = useAppStore(s => s.setRecipes);
  const setHooks = useAppStore(s => s.setHooks);
  const setMessages = useAppStore(s => s.setMessages);
  const _setIsStreaming = useAppStore(s => s.setIsStreaming);
  const addTraceEntry = useAppStore(s => s.addTraceEntry);
  const toggleTracePanel = useAppStore(s => s.toggleTracePanel);
  const _addPermissionRequest = useAppStore(s => s.addPermissionRequest);
  const _removePermissionRequest = useAppStore(s => s.removePermissionRequest);
  const updateSettings = useAppStore(s => s.updateSettings);
  const addToast = useAppStore(s => s.addToast);
  const removeToast = useAppStore(s => s.removeToast);
  const addModal = useAppStore(s => s.addModal);
  const removeModal = useAppStore(s => s.removeModal);
  const setLoading = useAppStore(s => s.setLoading);
  const setVersion = useAppStore(s => s.setVersion);

  const initializedRef = useRef(false);

  // ─── Auto-initialize on mount ──────────────────────────────────────────────

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    initializeApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initializeApp = async () => {
    setLoading(true);
    try {
      // Load version
      if (api?.app?.getVersion) {
        try {
          const v = await api.app.getVersion();
          setVersion(v);
        } catch {
          setVersion('0.1.0');
        }
      }

      // Load providers
      if (api?.providers?.list) {
        try {
          const p = await api.providers.list();
          setProviders(p);
        } catch (err) {
          console.error('Failed to load providers:', err);
        }
      }

      // Load extensions
      if (api?.extensions?.list) {
        try {
          const ext = await api.extensions.list();
          setExtensions(ext);
        } catch (err) {
          console.error('Failed to load extensions:', err);
        }
      }

      // Load sessions
      if (api?.sessions?.list) {
        try {
          const s = await api.sessions.list();
          setSessions(s);
        } catch (err) {
          console.error('Failed to load sessions:', err);
        }
      }

      // Load recipes
      if (api?.recipes?.list) {
        try {
          const r = await api.recipes.list();
          setRecipes(r);
        } catch (err) {
          console.error('Failed to load recipes:', err);
        }
      }

      // Load hooks
      if (api?.hooks?.list) {
        try {
          const h = await api.hooks.list();
          setHooks(h);
        } catch (err) {
          console.error('Failed to load hooks:', err);
        }
      }

      addToast({ type: 'success', title: 'OpenAgent-Desktop initialized' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Initialization failed', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  // ─── Create new session ────────────────────────────────────────────────────

  const handleNewSession = useCallback(async () => {
    if (!api?.sessions?.create) return;

    try {
      const defaultProvider = providers.find((p) => p.isDefault) || providers[0];
      const session = await api.sessions.create({
        name: `Chat ${sessions.length + 1}`,
        providerId: defaultProvider?.id,
        model: defaultProvider?.models?.[0] || settings.defaultModel,
      });
      setCurrentSession(session);
      setCurrentSessionId(session.id);
      setMessages([]);
      useAppStore.getState().clearTraceEntries();
      setCurrentView('chat');

      // Refresh session list
      const s = await api.sessions.list();
      setSessions(s);

      addToast({ type: 'success', title: 'New session created' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to create session', message: err.message });
    }
  }, [providers, sessions, settings.defaultModel, setCurrentSession, setCurrentSessionId, setMessages, setCurrentView, setSessions, addToast]);

  // ─── Load session ──────────────────────────────────────────────────────────

  const handleLoadSession = useCallback(async (sessionId: string) => {
    if (!api?.sessions?.load) return;

    try {
      const session = await api.sessions.load(sessionId);
      setCurrentSession(session);
      setCurrentSessionId(sessionId);
      setMessages(
        session.messages.map((m: any) => ({
          ...m,
          isStreaming: false,
        }))
      );
      useAppStore.getState().clearTraceEntries();
      setCurrentView('chat');

      // Start tracing
      if (api?.trace?.start) {
        await api.trace.start(sessionId);
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to load session', message: err.message });
    }
  }, [setCurrentSession, setCurrentSessionId, setMessages, setCurrentView, addToast]);

  // ─── Delete session ────────────────────────────────────────────────────────

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    if (!api?.sessions?.delete) return;

    try {
      await api.sessions.delete(sessionId);
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null);
        setCurrentSession(null);
        setMessages([]);
      }
      const s = await api.sessions.list();
      setSessions(s);
      addToast({ type: 'success', title: 'Session deleted' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to delete session', message: err.message });
    }
  }, [currentSessionId, setCurrentSessionId, setCurrentSession, setMessages, setSessions, addToast]);

  // ─── Import recipe ─────────────────────────────────────────────────────────

  const handleRecipeImportFromUrl = useCallback(async (url: string) => {
    if (!url?.trim()) return;
    try {
      if (api?.recipes?.import) {
        await api.recipes.import(url.trim());
        const r = await api.recipes.list();
        setRecipes(r);
        addToast({ type: 'success', title: 'Recipe imported' });
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Import failed', message: err.message });
    }
  }, [setRecipes, addToast]);

  const handleImportRecipe = useCallback(async () => {
    addModal({
      title: 'Import Recipe',
      size: 'sm',
      content: 'recipe-import',
      onClose: () => {},
      data: { onImport: handleRecipeImportFromUrl },
    });
  }, [addModal, handleRecipeImportFromUrl]);

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
        setCurrentView('settings');
        return;
      }

      // Ctrl/Cmd + B: Toggle sidebar
      if (isMod && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // Ctrl/Cmd + E: Extensions
      if (isMod && e.key === 'e') {
        e.preventDefault();
        setCurrentView('extensions');
        return;
      }

      // Ctrl/Cmd + R: Recipes
      if (isMod && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        setCurrentView('recipes');
        return;
      }

      // Escape: Close modal or trace panel
      if (e.key === 'Escape') {
        if (modals.length > 0) {
          removeModal(modals[modals.length - 1].id);
        } else if (tracePanelOpen) {
          toggleTracePanel();
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNewSession, modals, tracePanelOpen, setCurrentView, toggleSidebar, removeModal, toggleTracePanel]);

  // ─── Render ────────────────────────────────────────────────────────────────

  const renderMainContent = () => {
    switch (currentView) {
      case 'chat':
        return (
          <ChatView
            sessionId={currentSessionId}
            session={currentSession}
            providers={providers}
            messages={messages}
            isStreaming={isStreaming}
            onMessagesUpdate={setMessages}
            onNewSession={handleNewSession}
            onLoadSession={handleLoadSession}
            settings={settings}
            addToast={addToast}
            addTraceEntry={addTraceEntry}
          />
        );
      case 'extensions':
        return (
          <ExtensionsView
            extensions={extensions}
            onRefresh={async () => {
              if (api?.extensions?.list) {
                const ext = await api.extensions.list();
                setExtensions(ext);
              }
            }}
            addToast={addToast}
          />
        );
      case 'recipes':
        return (
          <RecipesView
            recipes={recipes}
            onRefresh={async () => {
              if (api?.recipes?.list) {
                const r = await api.recipes.list();
                setRecipes(r);
              }
            }}
            addToast={addToast}
          />
        );
      case 'sessions':
        return (
          <SessionsView
            sessions={sessions}
            currentSessionId={currentSessionId}
            onLoadSession={handleLoadSession}
            onDeleteSession={handleDeleteSession}
            onNewSession={handleNewSession}
            addToast={addToast}
          />
        );
      case 'settings':
        return (
          <SettingsView
            providers={providers}
            settings={settings}
            onUpdateSettings={updateSettings}
            onProvidersChange={async () => {
              if (api?.providers?.list) {
                const p = await api.providers.list();
                setProviders(p);
              }
            }}
            addToast={addToast}
          />
        );
      case 'hooks':
        return (
          <HooksView
            hooks={hooks}
            onRefresh={async () => {
              if (api?.hooks?.list) {
                const h = await api.hooks.list();
                setHooks(h);
              }
            }}
            addToast={addToast}
          />
        );
      case 'sandbox':
        return (
          <SandboxView
            addToast={addToast}
          />
        );
      case 'projects':
        return (
          <ProjectsView
            addToast={addToast}
          />
        );
      case 'skills':
        return (
          <SkillsView
            addToast={addToast}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}>
      {/* Sidebar */}
      {!sidebarCollapsed && (
        <Sidebar
          currentView={currentView}
          currentSessionId={currentSessionId}
          sessions={sessions}
          providers={providers}
          version={version}
          onNavigate={setCurrentView}
          onNewSession={handleNewSession}
          onLoadSession={handleLoadSession}
          onImportRecipe={handleImportRecipe}
          onToggleSidebar={toggleSidebar}
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
            {sidebarCollapsed && (
              <button
                onClick={toggleSidebar}
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
            {currentSession && currentView === 'chat' && (
              <span className="text-xs truncate max-w-xs" style={{ color: 'var(--color-text-muted)' }}>
                {currentSession.name}
              </span>
            )}
            {currentView !== 'chat' && (
              <span className="text-xs capitalize" style={{ color: 'var(--color-text-muted)' }}>
                {currentView}
              </span>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 overflow-hidden">
            {loading ? (
              <LoadingScreen />
            ) : (
              renderMainContent()
            )}
          </div>

          {/* Thinking Trace Side Panel */}
          {tracePanelOpen && (
            <ThinkingTrace
              entries={traceEntries}
              onClose={toggleTracePanel}
            />
          )}
        </div>
      </main>

      {/* File Drop Zone */}
      <FileDropZone />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Modals */}
      <ModalContainer modals={modals} onRemove={removeModal} />
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

  // Render modal content based on type
  const renderModalContent = () => {
    if (modal.content === 'recipe-import') {
      return <RecipeImportModal data={modal.data} onClose={() => { modal.onClose?.(); onRemove(modal.id); }} />;
    }
    return <div>{modal.content}</div>;
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
        <div className="p-4">{renderModalContent()}</div>
      </div>
    </div>
  );
};

// ─── Recipe Import Modal ───────────────────────────────────────────────────────

const RecipeImportModal: React.FC<{
  data?: Record<string, any>;
  onClose: () => void;
}> = ({ data, onClose }) => {
  const [url, setUrl] = useState('');
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    if (!url.trim()) return;
    setImporting(true);
    try {
      await data?.onImport?.(url.trim());
      onClose();
    } catch {
      // Error toast is already shown by the parent handler
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>
        Recipe URL
      </label>
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Enter recipe URL or GitHub Gist URL"
        className="w-full px-3 py-2 rounded-lg border text-sm"
        style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && url.trim() && !importing) {
            handleImport();
          }
        }}
      />
      <div className="flex justify-end gap-2 mt-4">
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg text-sm transition-colors"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Cancel
        </button>
        <button
          onClick={handleImport}
          disabled={!url.trim() || importing}
          className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
          style={{ background: 'var(--color-accent)', color: 'white' }}
        >
          {importing ? 'Importing...' : 'Import'}
        </button>
      </div>
    </div>
  );
};

export default App;
