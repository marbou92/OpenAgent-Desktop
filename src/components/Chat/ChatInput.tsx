/**
 * OpenAgent-Desktop - Chat Input (Phase 4.8 Claude-style Redesign)
 *
 * Claude.ai-inspired composer:
 *
 *   ╭──────────────────────────────────────────────────────────╮
 *   │  Type a message...  (/ for commands)                     │
 *   │                                                          │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ [📎] [Build ▾] [Model ▾] [🧠 Medium ▾]          [➤ Send] │
 *   ╰──────────────────────────────────────────────────────────╯
 *
 * Single centered rounded card. Textarea on top, controls row at the
 * bottom INSIDE the card. All buttons retained but restyled to match
 * Claude.ai's clean ghost-button aesthetic.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { AttachedFile, SlashCommand, ProviderInfo, AgentMode, AgentDefinition } from '../../types';
import { formatFileSize } from '../../utils/format';
import { getAPI } from '../../utils/api';
import ModelSelector from './ModelSelector';
import AgentSelector from './AgentSelector';
import ThinkingEffortSelector, { ThinkingEffort } from './ThinkingEffortSelector';

const SLASH_COMMANDS: SlashCommand[] = [
  { command: '/recipe', label: '/recipe', description: 'Run a recipe' },
  { command: '/goal', label: '/goal', description: 'Set a goal for the agent' },
  { command: '/clear', label: '/clear', description: 'Clear conversation' },
  { command: '/mode', label: '/mode', description: 'Change permission mode' },
  { command: '/review', label: '/review', description: 'Code review recipe' },
  { command: '/explain', label: '/explain', description: 'Explain code recipe' },
  { command: '/test', label: '/test', description: 'Write tests recipe' },
  { command: '/refactor', label: '/refactor', description: 'Refactor code recipe' },
  { command: '/doc', label: '/doc', description: 'Generate docs recipe' },
  { command: '/audit', label: '/audit', description: 'Security audit recipe' },
  { command: '/structure', label: '/structure', description: 'Generate structured JSON output (Phase 4)' },
];

interface ChatInputProps {
  onSend: (content: string, files?: AttachedFile[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  attachedFiles: AttachedFile[];
  onRemoveFile: (index: number) => void;
  onClearFiles: () => void;
  disabled?: boolean;
  streamingThinking?: string;
  onNewSession?: () => void;
  providers?: ProviderInfo[];
  selectedProviderId?: string;
  selectedModel?: string;
  onProviderChange?: (providerId: string) => void;
  onModelChange?: (model: string) => void;
  activeMode?: AgentMode;
  onModeChange?: (mode: AgentMode) => void;
  customAgents?: AgentDefinition[];
  pendingPrompt?: string;
  onPendingPromptConsumed?: () => void;
  onImagesAttached?: (images: string[]) => void;
  onStructureCommand?: () => void;
  thinkingEffort?: ThinkingEffort;
  onThinkingEffortChange?: (effort: ThinkingEffort) => void;
  modelSupportsReasoning?: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  onStop,
  isStreaming,
  attachedFiles,
  onRemoveFile,
  onClearFiles,
  disabled = false,
  streamingThinking,
  onNewSession,
  providers = [],
  selectedProviderId = '',
  selectedModel = '',
  onProviderChange,
  onModelChange,
  activeMode,
  onModeChange,
  customAgents,
  pendingPrompt,
  onPendingPromptConsumed,
  onImagesAttached,
  onStructureCommand,
  thinkingEffort = 'medium',
  onThinkingEffortChange,
  modelSupportsReasoning = false,
}) => {
  const [input, setInput] = useState('');
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [input]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (pendingPrompt && pendingPrompt.length > 0) {
      setInput(pendingPrompt);
      onPendingPromptConsumed?.();
      setTimeout(() => {
        textareaRef.current?.focus();
        const len = textareaRef.current?.value.length || 0;
        textareaRef.current?.setSelectionRange(len, len);
      }, 30);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt]);

  const filteredCommands = SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.command.toLowerCase().includes(slashFilter.toLowerCase()) ||
      cmd.description.toLowerCase().includes(slashFilter.toLowerCase()),
  );

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed && attachedFiles.length === 0) return;
    if (isStreaming) return;

    if (trimmed === '/structure' || trimmed.startsWith('/structure ')) {
      onStructureCommand?.();
      setInput('');
      setShowSlashCommands(false);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }

    onSend(trimmed, attachedFiles.length > 0 ? attachedFiles : undefined);
    setInput('');
    setShowSlashCommands(false);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [input, attachedFiles, isStreaming, onSend, onStructureCommand]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showSlashCommands) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedSlashIndex((p) => p < filteredCommands.length - 1 ? p + 1 : 0); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedSlashIndex((p) => p > 0 ? p - 1 : filteredCommands.length - 1); return; }
        if (e.key === 'Tab' || e.key === 'Enter') {
          e.preventDefault();
          const selected = filteredCommands[selectedSlashIndex];
          if (selected) { setInput(selected.command + ' '); setShowSlashCommands(false); }
          return;
        }
        if (e.key === 'Escape') { setShowSlashCommands(false); return; }
      }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (isStreaming) onStop(); else handleSend(); return; }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSend(); return; }
    },
    [showSlashCommands, filteredCommands, selectedSlashIndex, isStreaming, handleSend, onStop],
  );

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);
    if (value.startsWith('/')) { setSlashFilter(value.slice(1).split(' ')[0]); setShowSlashCommands(true); setSelectedSlashIndex(0); }
    else setShowSlashCommands(false);
  }, []);

  const handleSlashCommandSelect = useCallback((cmd: SlashCommand) => {
    setInput(cmd.command + ' ');
    setShowSlashCommands(false);
    textareaRef.current?.focus();
  }, []);

  const handleFilePick = useCallback(() => { fileInputRef.current?.click(); }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    const promises = imageFiles.map(file => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    }));
    Promise.all(promises).then(dataUrls => onImagesAttached?.(dataUrls)).catch(err => console.error('Image read error:', err));
    e.target.value = '';
  }, [onImagesAttached]);

  const canSend = (input.trim().length > 0 || attachedFiles.length > 0) && !isStreaming;

  return (
    <div className="relative flex-shrink-0 px-4 pb-3 pt-1">
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileInputChange} />

      {/* Slash command palette */}
      {showSlashCommands && filteredCommands.length > 0 && (
        <div
          className="absolute bottom-full left-4 right-4 mb-2 rounded-xl overflow-hidden max-h-64 overflow-y-auto animate-fade-in z-20"
          style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-primary)', boxShadow: 'var(--shadow-popover)' }}
        >
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider border-b" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border-secondary)' }}>Commands</div>
          {filteredCommands.map((cmd, index) => (
            <button key={cmd.command} onClick={() => handleSlashCommandSelect(cmd)}
              className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors"
              style={{ background: index === selectedSlashIndex ? 'var(--color-accent-soft)' : 'transparent' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-hover)'; setSelectedSlashIndex(index); }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ color: 'var(--color-accent)', background: 'var(--color-accent-soft)' }}>{cmd.command}</span>
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{cmd.description}</span>
            </button>
          ))}
        </div>
      )}

      {/* Thinking indicator */}
      {streamingThinking && (
        <div className="mb-1.5 px-3 py-1 rounded-md text-[11px] flex items-center gap-2 animate-fade-in" style={{ background: 'rgba(168,85,247,0.06)', color: 'var(--color-trace-thinking)' }}>
          <span className="thinking-dots"><span /><span /><span /></span>
          <span>Thinking</span>
        </div>
      )}

      {/* Attachment chips */}
      {attachedFiles.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5 animate-fade-in">
          {attachedFiles.map((file, index) => (
            <div key={`${file.name}-${index}`} className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border" style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-secondary)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" /></svg>
              <span className="truncate max-w-[140px]">{file.name}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>{formatFileSize(file.size)}</span>
              <button onClick={() => onRemoveFile(index)} className="ml-0.5 p-0.5 rounded transition-colors" style={{ color: 'var(--color-text-muted)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-error)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          ))}
          {attachedFiles.length > 1 && (
            <button onClick={onClearFiles} className="px-2 py-1 rounded-md text-xs transition-colors" style={{ color: 'var(--color-text-tertiary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-error)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}>Clear all</button>
          )}
        </div>
      )}

      {/* ─── Claude.ai-style composer card ───────────────────────── */}
      <div className="composer-card rounded-2xl border transition-all mx-auto" style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)', boxShadow: 'var(--shadow-card)', maxWidth: '100%' }}>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Create a session to start chatting…' : 'Message OpenAgent…  ( / for commands, Shift+Enter for newline )'}
          disabled={disabled}
          rows={1}
          className="w-full resize-none text-sm bg-transparent px-4 pt-3 pb-1 outline-none"
          style={{ color: 'var(--color-text-primary)', maxHeight: '200px', minHeight: '24px', lineHeight: '1.5', outline: 'none' }}
        />

        {/* Controls row — INSIDE the card, at the bottom */}
        <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-1">
          {/* Left: attach + agent + model + thinking effort */}
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {/* Attach button */}
            <button
              onClick={handleFilePick}
              disabled={disabled || isStreaming}
              className="p-1.5 rounded-lg transition-colors flex-shrink-0 disabled:opacity-40"
              style={{ color: 'var(--color-text-tertiary)' }}
              onMouseEnter={(e) => !disabled && (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              title="Attach file"
              aria-label="Attach file"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
            </button>

            {/* Agent selector */}
            {onModeChange && activeMode !== undefined && (
              <AgentSelector activeMode={activeMode} onModeChange={onModeChange} customAgents={customAgents} disabled={disabled || isStreaming} />
            )}

            {/* Model selector */}
            {onProviderChange && onModelChange && (
              <ModelSelector providers={providers} selectedProviderId={selectedProviderId} selectedModel={selectedModel} onProviderChange={onProviderChange} onModelChange={onModelChange} disabled={disabled || isStreaming} />
            )}

            {/* Thinking effort selector */}
            {onThinkingEffortChange && (
              <ThinkingEffortSelector effort={thinkingEffort} onChange={onThinkingEffortChange} modelSupportsReasoning={modelSupportsReasoning} disabled={disabled || isStreaming} />
            )}
          </div>

          {/* Right: Send / Stop — Phase 4.9: Claude-style black square stop button */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isStreaming ? (
              <button onClick={onStop}
                className="flex items-center justify-center w-9 h-9 rounded-full transition-all flex-shrink-0"
                style={{ background: 'var(--color-text-primary)', color: 'var(--color-bg-primary)' }}
                title="Stop generating" aria-label="Stop generating"
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            ) : (
              <button onClick={handleSend} disabled={!canSend}
                className="flex items-center justify-center w-9 h-9 rounded-full transition-all flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: canSend ? 'var(--color-accent)' : 'var(--color-bg-tertiary)', color: canSend ? 'white' : 'var(--color-text-muted)' }}
                title="Send (Enter)" aria-label="Send"
                onMouseEnter={(e) => { if (canSend) e.currentTarget.style.background = 'var(--color-accent-hover)'; }}
                onMouseLeave={(e) => { if (canSend) e.currentTarget.style.background = 'var(--color-accent)'; }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
