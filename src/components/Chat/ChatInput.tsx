/**
 * OpenAgent-Desktop - Chat Input (Phase 6.1 — OpenCowork-style)
 *
 * OpenCowork-style composer:
 *   - Single rounded card at bottom
 *   - Textarea on top
 *   - Controls row below: [📎] [Build ▾] [Model ▾] [🧠 ▾] on left, small arrow send icon on right
 *   - Send = small arrow icon (NOT a big circular button)
 *   - Stop = small dark square icon (NOT a big circular button)
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
  { command: '/goal', label: '/goal', description: 'Set a goal' },
  { command: '/clear', label: '/clear', description: 'Clear conversation' },
  { command: '/mode', label: '/mode', description: 'Change permission mode' },
  { command: '/review', label: '/review', description: 'Code review' },
  { command: '/explain', label: '/explain', description: 'Explain code' },
  { command: '/test', label: '/test', description: 'Write tests' },
  { command: '/refactor', label: '/refactor', description: 'Refactor code' },
  { command: '/doc', label: '/doc', description: 'Generate docs' },
  { command: '/audit', label: '/audit', description: 'Security audit' },
  { command: '/structure', label: '/structure', description: 'Structured JSON output' },
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
  onSend, onStop, isStreaming, attachedFiles, onRemoveFile, onClearFiles,
  disabled = false, streamingThinking, providers = [],
  selectedProviderId = '', selectedModel = '', onProviderChange, onModelChange,
  activeMode, onModeChange, customAgents, pendingPrompt, onPendingPromptConsumed,
  onImagesAttached, onStructureCommand, thinkingEffort = 'medium',
  onThinkingEffortChange, modelSupportsReasoning = false,
}) => {
  const [input, setInput] = useState('');
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = textareaRef.current; if (!t) return;
    t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight, 200)}px`;
  }, [input]);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  useEffect(() => {
    if (pendingPrompt && pendingPrompt.length > 0) {
      setInput(pendingPrompt); onPendingPromptConsumed?.();
      setTimeout(() => { textareaRef.current?.focus(); const len = textareaRef.current?.value.length || 0; textareaRef.current?.setSelectionRange(len, len); }, 30);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt]);

  const filteredCommands = SLASH_COMMANDS.filter((cmd) =>
    cmd.command.toLowerCase().includes(slashFilter.toLowerCase()) || cmd.description.toLowerCase().includes(slashFilter.toLowerCase()));

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed && attachedFiles.length === 0) return;
    if (isStreaming) return;
    if (trimmed === '/structure' || trimmed.startsWith('/structure ')) {
      onStructureCommand?.(); setInput(''); setShowSlashCommands(false);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }
    onSend(trimmed, attachedFiles.length > 0 ? attachedFiles : undefined);
    setInput(''); setShowSlashCommands(false);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [input, attachedFiles, isStreaming, onSend, onStructureCommand]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showSlashCommands) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedSlashIndex((p) => p < filteredCommands.length - 1 ? p + 1 : 0); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedSlashIndex((p) => p > 0 ? p - 1 : filteredCommands.length - 1); return; }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); const s = filteredCommands[selectedSlashIndex]; if (s) { setInput(s.command + ' '); setShowSlashCommands(false); } return; }
      if (e.key === 'Escape') { setShowSlashCommands(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (isStreaming) onStop(); else handleSend(); return; }
  }, [showSlashCommands, filteredCommands, selectedSlashIndex, isStreaming, handleSend, onStop]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value; setInput(v);
    if (v.startsWith('/')) { setSlashFilter(v.slice(1).split(' ')[0]); setShowSlashCommands(true); setSelectedSlashIndex(0); } else setShowSlashCommands(false);
  }, []);

  const handleFilePick = useCallback(() => { fileInputRef.current?.click(); }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/')); if (imageFiles.length === 0) return;
    Promise.all(imageFiles.map(file => new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.onerror = reject; reader.readAsDataURL(file);
    }))).then(dataUrls => onImagesAttached?.(dataUrls)).catch(err => console.error('Image read error:', err));
    e.target.value = '';
  }, [onImagesAttached]);

  const canSend = (input.trim().length > 0 || attachedFiles.length > 0) && !isStreaming;

  return (
    <div className="relative flex-shrink-0 px-4 pb-2 pt-1">
      <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileInputChange} />

      {/* Slash commands */}
      {showSlashCommands && filteredCommands.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-2 rounded-lg overflow-hidden max-h-64 overflow-y-auto animate-fade-in z-20"
          style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-primary)', boxShadow: 'var(--shadow-popover)' }}>
          {filteredCommands.map((cmd, index) => (
            <button key={cmd.command} onClick={() => { setInput(cmd.command + ' '); setShowSlashCommands(false); textareaRef.current?.focus(); }}
              className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors"
              style={{ background: index === selectedSlashIndex ? 'var(--color-accent-soft)' : 'transparent' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-hover)'; setSelectedSlashIndex(index); }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              <span className="font-mono text-xs" style={{ color: 'var(--color-accent)' }}>{cmd.command}</span>
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{cmd.description}</span>
            </button>
          ))}
        </div>
      )}

      {/* Attachment chips */}
      {attachedFiles.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {attachedFiles.map((file, index) => (
            <div key={`${file.name}-${index}`} className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
              <span className="truncate max-w-[120px]">{file.name}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>{formatFileSize(file.size)}</span>
              <button onClick={() => onRemoveFile(index)} className="ml-0.5" style={{ color: 'var(--color-text-muted)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-error)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          ))}
          {attachedFiles.length > 1 && <button onClick={onClearFiles} className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Clear all</button>}
        </div>
      )}

      {/* Composer card — OpenCowork style */}
      <div className="composer-card rounded-xl border transition-all mx-auto" style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-primary)' }}>

        {/* Textarea + send button on same row */}
        <div className="flex items-end gap-2 px-3 pt-2.5">
          <textarea ref={textareaRef} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown}
            placeholder={disabled ? 'Create a session…' : 'Message OpenAgent…  ( / for commands, Shift+Enter for newline )'}
            disabled={disabled} rows={1}
            className="flex-1 resize-none text-sm bg-transparent outline-none"
            style={{ color: 'var(--color-text-primary)', maxHeight: '200px', minHeight: '24px', lineHeight: '1.5' }} />

          {/* Send / Stop — small icon, NOT big circular */}
          {isStreaming ? (
            <button onClick={onStop}
              className="flex items-center justify-center p-1.5 rounded-md transition-all flex-shrink-0"
              style={{ background: 'var(--color-text-primary)', color: 'var(--color-bg-primary)' }}
              title="Stop" aria-label="Stop">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            </button>
          ) : (
            <button onClick={handleSend} disabled={!canSend}
              className="flex items-center justify-center p-1.5 rounded-md transition-all flex-shrink-0 disabled:opacity-30"
              style={{ background: canSend ? 'var(--color-accent)' : 'transparent', color: canSend ? 'white' : 'var(--color-text-muted)' }}
              title="Send (Enter)" aria-label="Send"
              onMouseEnter={(e) => { if (canSend) e.currentTarget.style.background = 'var(--color-accent-hover)'; }}
              onMouseLeave={(e) => { if (canSend) e.currentTarget.style.background = 'var(--color-accent)'; }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            </button>
          )}
        </div>

        {/* Controls row — below textarea, inside card */}
        <div className="flex items-center gap-1 px-3 pb-2 pt-1">
          <button onClick={handleFilePick} disabled={disabled || isStreaming}
            className="p-1 rounded transition-colors flex-shrink-0 disabled:opacity-40"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => !disabled && (e.currentTarget.style.background = 'var(--color-bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')} title="Attach">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
          </button>
          {onModeChange && activeMode !== undefined && (<AgentSelector activeMode={activeMode} onModeChange={onModeChange} customAgents={customAgents} disabled={disabled || isStreaming} />)}
          {onProviderChange && onModelChange && (<ModelSelector providers={providers} selectedProviderId={selectedProviderId} selectedModel={selectedModel} onProviderChange={onProviderChange} onModelChange={onModelChange} disabled={disabled || isStreaming} />)}
          {onThinkingEffortChange && (<ThinkingEffortSelector effort={thinkingEffort} onChange={onThinkingEffortChange} modelSupportsReasoning={modelSupportsReasoning} disabled={disabled || isStreaming} />)}
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
