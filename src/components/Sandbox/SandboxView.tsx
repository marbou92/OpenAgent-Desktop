/**
 * OpenAgent-Desktop - Sandbox View Component
 *
 * Full sandbox management view with:
 * - Sandbox type display (WSL2/Lima/Docker/Basic)
 * - Start/Stop sandbox buttons
 * - Execute command input with output display
 * - Resource usage monitoring (CPU, memory)
 * - File browser for sandbox filesystem
 */

import React, { useState, useEffect } from 'react';
import { SandboxStatus, ExecuteResult, Toast } from '../../types';

const api = (window as any).openagent;

interface SandboxViewProps {
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

// ─── File System Entry ─────────────────────────────────────────────────────────

interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
}

// ─── Sandbox Type Config ───────────────────────────────────────────────────────

const SANDBOX_TYPES: Record<string, { label: string; icon: string; color: string; description: string }> = {
  wsl2: { label: 'WSL2', icon: '🐧', color: '#f59e0b', description: 'Windows Subsystem for Linux v2' },
  lima: { label: 'Lima', icon: '🍎', color: '#22c55e', description: 'Linux virtual machines for macOS' },
  docker: { label: 'Docker', icon: '🐳', color: '#3b82f6', description: 'Docker container-based sandbox' },
  basic: { label: 'Basic', icon: '📦', color: '#6b7280', description: 'Basic process-level sandbox' },
  unknown: { label: 'Unknown', icon: '❓', color: '#6b7280', description: 'Unknown sandbox type' },
};

// ─── Component ─────────────────────────────────────────────────────────────────

const SandboxView: React.FC<SandboxViewProps> = ({ addToast }) => {
  const [status, setStatus] = useState<SandboxStatus | null>(null);
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState('');
  const [executing, setExecuting] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Resource monitoring
  const [_resourceHistory, setResourceHistory] = useState<Array<{ time: number; cpu: number; memory: number }>>([]);

  // File browser
  const [currentPath, setCurrentPath] = useState('/home/user');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [_showFileBrowser, _setShowFileBrowser] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState<'overview' | 'terminal' | 'files'>('overview');

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Track resource history
  useEffect(() => {
    if (status?.running && status.resourceUsage) {
      setResourceHistory((prev) => {
        const updated = [...prev, { time: Date.now(), cpu: status.resourceUsage!.cpuPercent, memory: status.resourceUsage!.memoryUsedMB }];
        // Keep last 30 data points
        return updated.slice(-30);
      });
    }
  }, [status]);

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
    if (!confirm('Are you sure you want to stop the sandbox? Running processes will be terminated.')) return;
    try {
      await api.sandbox.stop();
      await loadStatus();
      addToast({ type: 'success', title: 'Sandbox stopped' });
      setResourceHistory([]);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to stop sandbox', message: err.message });
    }
  };

  const handleExecute = async () => {
    if (!api?.sandbox?.execute || !command.trim()) return;
    setExecuting(true);
    setOutput('');
    const cmd = command.trim();
    setCommandHistory((prev) => [...prev, cmd]);
    setHistoryIndex(-1);
    try {
      const result: ExecuteResult = await api.sandbox.execute(cmd);
      setOutput(
        `$ ${cmd}\n\n${result.stdout}${result.stderr ? `\n[stderr]\n${result.stderr}` : ''}\n\nExit Code: ${result.exitCode}${result.timedOut ? ' (TIMED OUT)' : ''} | Duration: ${result.duration}ms`
      );
    } catch (err: any) {
      setOutput(`$ ${cmd}\n\nError: ${err.message}`);
    } finally {
      setExecuting(false);
      setCommand('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleExecute();
    }
    // Command history navigation
    if (e.key === 'ArrowUp' && !command) {
      e.preventDefault();
      const newIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex;
      setHistoryIndex(newIndex);
      if (commandHistory[commandHistory.length - 1 - newIndex]) {
        setCommand(commandHistory[commandHistory.length - 1 - newIndex]);
      }
    }
    if (e.key === 'ArrowDown' && historyIndex >= 0) {
      e.preventDefault();
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      if (newIndex < 0) {
        setCommand('');
      } else if (commandHistory[commandHistory.length - 1 - newIndex]) {
        setCommand(commandHistory[commandHistory.length - 1 - newIndex]);
      }
    }
  };

  const loadFiles = async (path: string) => {
    if (!api?.sandbox?.execute) return;
    setLoadingFiles(true);
    setCurrentPath(path);
    try {
      const result = await api.sandbox.execute(`ls -la "${path}"`, { timeout: 5000 });
      // Parse ls output to create file entries
      const lines = result.stdout.split('\n').filter((l: string) => l.trim() && !l.startsWith('total'));
      const entries: FileEntry[] = lines.map((line: string) => {
        const parts = line.split(/\s+/);
        if (parts.length < 9) return null;
        const isDir = parts[0].startsWith('d');
        const name = parts.slice(8).join(' ');
        if (name === '.' || name === '..') return null;
        return {
          name,
          path: path === '/' ? `/${name}` : `${path}/${name}`,
          type: isDir ? 'directory' as const : 'file' as const,
          size: isDir ? undefined : parseInt(parts[4]) || 0,
          modified: parts[5] + ' ' + parts[6] + ' ' + parts[7],
        };
      }).filter(Boolean) as FileEntry[];
      setFiles(entries);
    } catch (err: any) {
      setFiles([]);
      addToast({ type: 'error', title: 'Failed to list files', message: err.message });
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleNavigate = (entry: FileEntry) => {
    if (entry.type === 'directory') {
      loadFiles(entry.path);
    }
  };

  const handleNavigateUp = () => {
    const parts = currentPath.split('/').filter(Boolean);
    if (parts.length > 0) {
      parts.pop();
      loadFiles('/' + parts.join('/'));
    }
  };

  // ─── Sandbox type info
  const sandboxType = SANDBOX_TYPES[status?.type || 'unknown'] || SANDBOX_TYPES.unknown;

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--color-bg-primary)' }}>
      <div className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--color-text-primary)' }}>Sandbox</h1>

        {/* Status Card */}
        <div className="rounded-xl border mb-6 overflow-hidden" style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}>
          {/* Status Header */}
          <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border-secondary)' }}>
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl"
                style={{ background: `${sandboxType.color}15` }}
              >
                {sandboxType.icon}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    {sandboxType.label} Sandbox
                  </span>
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: status?.running ? 'var(--color-success)' : 'var(--color-text-muted)' }}
                  />
                  <span className="text-sm font-medium" style={{ color: status?.running ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                    {status?.running ? 'Running' : 'Stopped'}
                  </span>
                </div>
                <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                  {sandboxType.description}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {status?.health && status.running && (
                <span
                  className="text-xs px-2.5 py-1 rounded-lg font-medium"
                  style={{
                    background: status.health === 'healthy' ? 'rgba(34,197,94,0.1)' : status.health === 'degraded' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                    color: status.health === 'healthy' ? 'var(--color-success)' : status.health === 'degraded' ? 'var(--color-warning)' : 'var(--color-error)',
                  }}
                >
                  {status.health}
                </span>
              )}
              {!status?.running ? (
                <button
                  onClick={handleStart}
                  className="px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
                  style={{ background: 'var(--color-success)', color: 'white' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Start
                </button>
              ) : (
                <button
                  onClick={handleStop}
                  className="px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
                  style={{ background: 'var(--color-error)', color: 'white' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                  Stop
                </button>
              )}
              <button
                onClick={loadStatus}
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

          {/* Resource Usage */}
          {status?.resourceUsage && status.running && (
            <div className="p-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  {
                    label: 'CPU',
                    value: `${status.resourceUsage.cpuPercent}%`,
                    percent: status.resourceUsage.cpuPercent,
                    icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
                        <rect x="9" y="9" width="6" height="6" />
                        <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
                        <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
                        <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
                        <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
                      </svg>
                    ),
                    color: 'var(--color-accent)',
                  },
                  {
                    label: 'Memory',
                    value: `${status.resourceUsage.memoryUsedMB} / ${status.resourceUsage.memoryLimitMB} MB`,
                    percent: (status.resourceUsage.memoryUsedMB / status.resourceUsage.memoryLimitMB) * 100,
                    icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="6" width="20" height="12" rx="2" />
                        <path d="M6 12h.01" /><path d="M10 12h.01" /><path d="M14 12h.01" /><path d="M18 12h.01" />
                      </svg>
                    ),
                    color: 'var(--color-success)',
                  },
                  {
                    label: 'Disk',
                    value: `${status.resourceUsage.diskUsedMB} / ${status.resourceUsage.diskLimitMB} MB`,
                    percent: (status.resourceUsage.diskUsedMB / status.resourceUsage.diskLimitMB) * 100,
                    icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-info)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <ellipse cx="12" cy="5" rx="9" ry="3" />
                        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                      </svg>
                    ),
                    color: 'var(--color-info)',
                  },
                  {
                    label: 'Uptime',
                    value: status.startedAt ? formatUptime(status.startedAt) : 'N/A',
                    percent: 0,
                    icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    ),
                    color: 'var(--color-warning)',
                  },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg p-4" style={{ background: 'var(--color-bg-tertiary)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      {item.icon}
                      <span className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{item.label}</span>
                    </div>
                    <div className="text-sm font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>{item.value}</div>
                    {item.percent > 0 && (
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-bg-primary)' }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(item.percent, 100)}%`,
                            background: item.percent > 80 ? 'var(--color-error)' : item.color,
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 mb-4 border-b" style={{ borderColor: 'var(--color-border-secondary)' }}>
          {[
            { id: 'overview' as const, label: 'Terminal', icon: '🖥️' },
            { id: 'terminal' as const, label: 'Command History', icon: '📜' },
            { id: 'files' as const, label: 'File Browser', icon: '📁' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === 'files' && files.length === 0 && status?.running) {
                  loadFiles(currentPath);
                }
              }}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2"
              style={{
                color: activeTab === tab.id ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                borderColor: activeTab === tab.id ? 'var(--color-accent)' : 'transparent',
              }}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="rounded-xl border" style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}>
            {/* Terminal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--color-border-secondary)' }}>
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full" style={{ background: '#ff5f57' }} />
                  <div className="w-3 h-3 rounded-full" style={{ background: '#febc2e' }} />
                  <div className="w-3 h-3 rounded-full" style={{ background: '#28c840' }} />
                </div>
                <span className="text-xs font-mono ml-2" style={{ color: 'var(--color-text-muted)' }}>
                  {status?.running ? 'sandbox' : 'sandbox (stopped)'}
                </span>
              </div>
              {output && (
                <button
                  onClick={() => navigator.clipboard.writeText(output)}
                  className="text-xs px-2 py-1 rounded transition-colors"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
                >
                  Copy Output
                </button>
              )}
            </div>

            {/* Output Display */}
            <div
              className="p-4 max-h-72 overflow-y-auto"
              style={{ background: 'var(--color-bg-primary)' }}
            >
              {output ? (
                <pre className="text-xs font-mono whitespace-pre-wrap" style={{ color: 'var(--color-text-secondary)' }}>
                  {output}
                </pre>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    {status?.running ? 'Enter a command below to execute in the sandbox' : 'Start the sandbox to execute commands'}
                  </p>
                </div>
              )}
            </div>

            {/* Command Input */}
            <div className="flex items-center gap-2 px-4 py-3 border-t" style={{ borderColor: 'var(--color-border-secondary)' }}>
              <span className="text-xs font-mono" style={{ color: 'var(--color-success)' }}>$</span>
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={status?.running ? 'Enter a command...' : 'Sandbox not running'}
                disabled={!status?.running || executing}
                className="flex-1 bg-transparent text-sm font-mono outline-none"
                style={{ color: 'var(--color-text-primary)' }}
              />
              <button
                onClick={handleExecute}
                disabled={!command.trim() || executing || !status?.running}
                className="px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: 'var(--color-accent)', color: 'white' }}
              >
                {executing ? 'Running...' : 'Run'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'terminal' && (
          <div className="rounded-xl border p-4" style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>Command History</h3>
            {commandHistory.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No commands executed yet</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {[...commandHistory].reverse().map((cmd, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setCommand(cmd);
                      setActiveTab('overview');
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-mono transition-colors"
                    style={{ color: 'var(--color-text-secondary)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    $ {cmd}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'files' && (
          <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}>
            {/* Path Bar */}
            <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border-secondary)' }}>
              <button
                onClick={handleNavigateUp}
                disabled={currentPath === '/'}
                className="p-1 rounded transition-colors disabled:opacity-30"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <div className="flex-1 flex items-center gap-1 px-3 py-1.5 rounded-lg" style={{ background: 'var(--color-bg-tertiary)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span className="text-xs font-mono" style={{ color: 'var(--color-text-primary)' }}>{currentPath}</span>
              </div>
              <button
                onClick={() => loadFiles(currentPath)}
                className="p-1 rounded transition-colors"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              </button>
            </div>

            {/* File List */}
            <div className="max-h-80 overflow-y-auto">
              {!status?.running ? (
                <div className="p-8 text-center">
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Start the sandbox to browse files</p>
                </div>
              ) : loadingFiles ? (
                <div className="p-8 text-center">
                  <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin-slow mx-auto mb-2" style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading files...</p>
                </div>
              ) : files.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No files found or unable to list directory</p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'var(--color-border-secondary)' }}>
                  {files.map((file, i) => (
                    <button
                      key={`${file.name}-${i}`}
                      onClick={() => handleNavigate(file)}
                      disabled={file.type !== 'directory'}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors disabled:cursor-default"
                      style={{ color: 'var(--color-text-secondary)' }}
                      onMouseEnter={(e) => {
                        if (file.type === 'directory') e.currentTarget.style.background = 'var(--color-bg-hover)';
                      }}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      {file.type === 'directory' ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-warning)" stroke="var(--color-warning)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                          <polyline points="13 2 13 9 20 9" />
                        </svg>
                      )}
                      <span className="text-sm flex-1" style={{ color: 'var(--color-text-primary)' }}>{file.name}</span>
                      {file.size !== undefined && (
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{formatFileSize(file.size)}</span>
                      )}
                      {file.type === 'directory' && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Not Running State */}
        {!status?.running && (
          <div className="mt-6 rounded-xl border p-8 text-center" style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--color-bg-tertiary)' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <path d="M12 12h.01" />
                <path d="M17 12h.01" />
                <path d="M7 12h.01" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>Sandbox Not Running</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--color-text-tertiary)' }}>
              Start the sandbox to execute commands, browse files, and run AI agent tasks in an isolated environment.
            </p>
            <button
              onClick={handleStart}
              className="px-6 py-2.5 rounded-lg text-sm font-medium"
              style={{ background: 'var(--color-accent)', color: 'white' }}
            >
              Start Sandbox
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatUptime(startedAt: string): string {
  try {
    const start = new Date(startedAt).getTime();
    const now = Date.now();
    const diffMs = now - start;
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  } catch {
    return 'N/A';
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default SandboxView;
