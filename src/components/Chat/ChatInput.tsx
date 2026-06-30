/**
 * OpenAgent-Desktop - Chat Input (Phase 6.3 — OpenCowork hybrid composer)
 *
 * Matches OpenCowork's composer exactly:
 *
 *   ╭──────────────────────────────────────────────────────────────╮
 *   │ [+]  Type a message...  (/ for commands)      [Model] [⬆]  │
 *   ╰──────────────────────────────────────────────────────────────╯
 *
 * - Single rounded card (rounded-[1.75rem])
 * - Plus button on left for file attach
 * - Textarea in the middle
 * - Model display + Send/Stop button on right
 * - All on ONE ROW (not textarea on top + controls below)
 * - Send = 9x9 rounded-2xl with arrow icon, accent background
 * - Stop = 9x9 rounded-2xl with square icon, error background
 * - Controls (Agent, Model, Thinking) go BELOW the card
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { AttachedFile, SlashCommand, ProviderInfo, AgentMode, AgentDefinition } from '../../types';
import { formatFileSize } from '../../utils/format';
import ModelSelector from './ModelSelector';
import AgentSelector from './AgentSelector';
import ThinkingEffortSelector, { ThinkingEffort } from './ThinkingEffortSelector';
// Phase 2.0.4: project/folder selector.
import ProjectSelector from './ProjectSelector';

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
  // Phase 1.9: toggles for showing/hiding the selectors (both layouts).
  showAgentMode?: boolean;
  showThinkingEffort?: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSend, onStop, isStreaming, attachedFiles, onRemoveFile, onClearFiles,
  disabled = false, streamingThinking: _streamingThinking, providers = [],
  selectedProviderId = '', selectedModel = '', onProviderChange, onModelChange,
  activeMode, onModeChange, customAgents, pendingPrompt, onPendingPromptConsumed,
  onImagesAttached, onStructureCommand, thinkingEffort = 'medium',
  onThinkingEffortChange, modelSupportsReasoning = false,
  showAgentMode = true, showThinkingEffort = true,
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
  const canStop = isStreaming;

  return (
    <div className="relative flex-shrink-0 px-4 pb-2 pt-1">
      <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileInputChange} />

      {/* Slash commands */}
      {showSlashCommands && filteredCommands.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-2 rounded-lg overflow-hidden max-h-64 overflow-y-auto animate-fade-in z-20"
          style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-popover)' }}>
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
        <div className="mb-2 flex flex-wrap gap-1.5">
          {attachedFiles.map((file, index) => (
            <div key={`${file.name}-${index}`} className="flex items-center gap-1.5 px-2 py-1 rounded text-xs" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
              <span className="truncate max-w-[120px]">{file.name}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>{formatFileSize(file.size)}</span>
              <button onClick={() => onRemoveFile(index)} style={{ color: 'var(--color-text-muted)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-error)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          ))}
          {attachedFiles.length > 1 && <button onClick={onClearFiles} className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Clear all</button>}
        </div>
      )}

      {/* ─── OpenCowork-style composer: ONE row with everything ─────── */}
      <div className="composer-card flex items-end gap-2 p-3.5 mx-auto transition-all"
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          borderRadius: '1.75rem',
          boxShadow: 'var(--shadow-soft)',
        }}>

        {/* Plus button for file attach */}
        <button onClick={handleFilePick} disabled={disabled || isStreaming}
          className="w-9 h-9 rounded-2xl flex items-center justify-center transition-colors flex-shrink-0 disabled:opacity-40"
          style={{ color: 'var(--color-text-muted)' }}
          onMouseEnter={(e) => !disabled && (e.currentTarget.style.background = 'var(--color-bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          title="Attach files">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>

        {/* Textarea — flex-1, takes the middle space */}
        <textarea ref={textareaRef} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Create a session…' : 'Type a message…  ( / for commands, Shift+Enter for newline )'}
          disabled={disabled} rows={1}
          className="flex-1 resize-none bg-transparent border-none text-sm py-2"
          style={{ color: 'var(--color-text-primary)', maxHeight: '200px', minHeight: '24px', lineHeight: '1.5', outline: 'none' }} />

        {/* Right side: model badge + send/stop */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Model badge */}
          {selectedModel && (
            <span className="hidden sm:inline-flex px-2.5 py-1 rounded-full text-xs"
              style={{ border: '1px solid var(--color-border-secondary)', background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}>
              {selectedModel.length > 20 ? selectedModel.slice(0, 20) + '…' : selectedModel}
            </span>
          )}

          {/* Stop button */}
          {canStop && (
            <button onClick={onStop}
              className="w-9 h-9 rounded-2xl flex items-center justify-center transition-colors flex-shrink-0"
              style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-error)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
              title="Stop">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            </button>
          )}

          {/* Send button */}
          {!isStreaming && (
            <button onClick={handleSend} disabled={!canSend}
              className="w-9 h-9 rounded-2xl flex items-center justify-center transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: canSend ? 'var(--color-accent)' : 'transparent', color: canSend ? 'white' : 'var(--color-text-muted)' }}
              onMouseEnter={(e) => { if (canSend) e.currentTarget.style.background = 'var(--color-accent-hover)'; }}
              onMouseLeave={(e) => { if (canSend) e.currentTarget.style.background = 'var(--color-accent)'; }}
              title="Send (Enter)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* Controls row — BELOW the card (Agent, Model, Thinking) */}
      <div className="flex items-center gap-1 px-3 pt-1.5 mx-auto justify-center">
        {showAgentMode && onModeChange && activeMode !== undefined && (<AgentSelector activeMode={activeMode} onModeChange={onModeChange} customAgents={customAgents} disabled={disabled || isStreaming} />)}
        {onProviderChange && onModelChange && (<ModelSelector providers={providers} selectedProviderId={selectedProviderId} selectedModel={selectedModel} onProviderChange={onProviderChange} onModelChange={onModelChange} disabled={disabled || isStreaming} />)}
        {showThinkingEffort && onThinkingEffortChange && (<ThinkingEffortSelector effort={thinkingEffort} onChange={onThinkingEffortChange} modelSupportsReasoning={modelSupportsReasoning} disabled={disabled || isStreaming} />)}
        <ProjectSelector />
      </div>
    </div>
  );
};

export default ChatInput;
