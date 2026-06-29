/**
 * OpenAgent-Desktop — V2 Composer (Phase 1.4 + 1.8 + 1.9 + 2.0.3)
 *
 * The Modern-layout composer. A rounded-xl card with raised shadow:
 * - Textarea (auto-growing, max 180px) with the V2 placeholder
 * - Bottom control row: + attach, agent mode, thinking effort, model selector, project selector, send
 * - Slash command dropdown
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { AttachedFile, ProviderInfo, AgentMode, AgentDefinition, SlashCommand } from '../../../types';
import ModelSelector from '../../Chat/ModelSelector';
import ThinkingEffortSelector, { ThinkingEffort } from '../../Chat/ThinkingEffortSelector';
import AgentSelector from '../../Chat/AgentSelector';
import ProjectSelector from '../../Chat/ProjectSelector';

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

interface V2ComposerProps {
  onSend: (content: string, files?: AttachedFile[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  providers: ProviderInfo[];
  selectedProviderId: string;
  selectedModel: string;
  onProviderChange: (providerId: string) => void;
  onModelChange: (model: string) => void;
  onImagesAttached?: (images: string[]) => void;
  autoFocus?: boolean;
  thinkingEffort?: ThinkingEffort;
  onThinkingEffortChange?: (effort: ThinkingEffort) => void;
  modelSupportsReasoning?: boolean;
  showThinkingEffort?: boolean;
  activeMode?: AgentMode;
  onModeChange?: (mode: AgentMode) => void;
  customAgents?: AgentDefinition[];
  showAgentMode?: boolean;
}

const V2Composer: React.FC<V2ComposerProps> = ({
  onSend, onStop, isStreaming,
  providers, selectedProviderId, selectedModel,
  onProviderChange, onModelChange, onImagesAttached,
  autoFocus = false,
  thinkingEffort = 'medium', onThinkingEffortChange,
  modelSupportsReasoning = false, showThinkingEffort = true,
  activeMode = 'build', onModeChange, customAgents,
  showAgentMode = true,
}) => {
  const [input, setInput] = useState('');
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = textareaRef.current; if (!t) return;
    t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight, 180)}px`;
  }, [input]);

  useEffect(() => { if (autoFocus) textareaRef.current?.focus(); }, [autoFocus]);

  const filteredCommands = SLASH_COMMANDS.filter((cmd) =>
    cmd.command.toLowerCase().includes(slashFilter.toLowerCase()) ||
    cmd.description.toLowerCase().includes(slashFilter.toLowerCase()));

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setInput(''); setShowSlashCommands(false);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [input, isStreaming, onSend]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value; setInput(v);
    if (v.startsWith('/')) { setSlashFilter(v.slice(1).split(' ')[0]); setShowSlashCommands(true); setSelectedSlashIndex(0); }
    else setShowSlashCommands(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showSlashCommands) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedSlashIndex((p) => p < filteredCommands.length - 1 ? p + 1 : 0); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedSlashIndex((p) => p > 0 ? p - 1 : filteredCommands.length - 1); return; }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); const cmd = filteredCommands[selectedSlashIndex]; if (cmd) { setInput(cmd.command + ' '); setShowSlashCommands(false); } return; }
      if (e.key === 'Escape') { e.preventDefault(); setShowSlashCommands(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (isStreaming) onStop(); else handleSend(); }
  }, [showSlashCommands, filteredCommands, selectedSlashIndex, isStreaming, handleSend, onStop]);

  const handleFilePick = useCallback(() => { fileInputRef.current?.click(); }, []);
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/')); if (imageFiles.length === 0) return;
    Promise.all(imageFiles.map(file => new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.onerror = reject; reader.readAsDataURL(file);
    }))).then(dataUrls => onImagesAttached?.(dataUrls)).catch(() => {});
    e.target.value = '';
  }, [onImagesAttached]);

  const canSend = input.trim().length > 0 && !isStreaming;

  return (
    <div className="relative w-full" style={{
      background: 'var(--v2-background-bg-base)',
      borderRadius: 'var(--v2-radius-xl)',
      boxShadow: 'var(--v2-elevation-raised)',
    }}>
      <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileInputChange} />

      {showSlashCommands && filteredCommands.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-2 rounded-[10px] overflow-hidden max-h-64 overflow-y-auto animate-fade-in z-50"
          style={{ background: 'var(--v2-background-bg-base)', boxShadow: 'var(--v2-elevation-floating)', padding: '4px' }}>
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--v2-text-text-faint)', fontFamily: 'var(--v2-font-family-text)' }}>Commands</div>
          {filteredCommands.map((cmd, index) => (
            <button key={cmd.command} onClick={() => { setInput(cmd.command + ' '); setShowSlashCommands(false); textareaRef.current?.focus(); }}
              className="w-full flex items-center gap-3 px-2 py-2 text-left rounded-[6px] transition-colors"
              style={{ background: index === selectedSlashIndex ? 'var(--v2-overlay-simple-overlay-hover)' : 'transparent' }}
              onMouseEnter={() => setSelectedSlashIndex(index)}>
              <span className="font-mono text-xs" style={{ color: 'var(--color-accent, var(--v2-blue-400))' }}>{cmd.command}</span>
              <span className="text-[11px]" style={{ color: 'var(--v2-text-text-muted)', fontFamily: 'var(--v2-font-family-text)' }}>{cmd.description}</span>
            </button>
          ))}
        </div>
      )}

      <div className="px-4 pt-4 pb-2">
        <textarea ref={textareaRef} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown}
          placeholder="Ask anything, / for commands, @ for context..." rows={1}
          className="w-full bg-transparent outline-none resize-none text-[13px] leading-5 no-scrollbar"
          style={{ color: 'var(--v2-text-text-base)', fontFamily: 'var(--v2-font-family-text)', fontWeight: 'var(--v2-font-weight-regular)', minHeight: '52px', maxHeight: '180px', outline: 'none', boxShadow: 'none', border: 'none' }} />
      </div>

      <div className="flex items-center gap-1 px-2 h-11" style={{ borderTop: '1px solid var(--v2-border-border-muted)' }}>
        <button onClick={handleFilePick} className="flex items-center justify-center h-7 w-7 rounded-md transition-colors"
          style={{ color: 'var(--v2-icon-icon-muted)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          aria-label="Attach file" title="Attach file">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>

        {showAgentMode && onModeChange && (<AgentSelector activeMode={activeMode} onModeChange={onModeChange} customAgents={customAgents} />)}
        {showThinkingEffort && onThinkingEffortChange && modelSupportsReasoning && (<ThinkingEffortSelector effort={thinkingEffort} onChange={onThinkingEffortChange} modelSupportsReasoning={modelSupportsReasoning} />)}

        <div className="flex-1 min-w-0">
          <ModelSelector providers={providers} selectedProviderId={selectedProviderId} selectedModel={selectedModel} onProviderChange={onProviderChange} onModelChange={onModelChange} />
        </div>

        <ProjectSelector />

        <button onClick={() => { if (isStreaming) onStop(); else handleSend(); }} disabled={!canSend && !isStreaming}
          className="flex items-center justify-center h-7 w-7 rounded-md flex-shrink-0 transition-all disabled:opacity-40"
          style={{ background: 'var(--color-accent, var(--v2-blue-600))', color: 'white' }}
          aria-label={isStreaming ? 'Stop' : 'Send'} title={isStreaming ? 'Stop' : 'Send'}>
          {isStreaming ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
          )}
        </button>
      </div>
    </div>
  );
};

export default V2Composer;
