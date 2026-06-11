/**
 * OpenAgent-Desktop - Chat Input Component
 *
 * Enhanced multi-line text input with:
 * - Auto-resize
 * - File attachment with visual badges
 * - Voice input placeholder
 * - Send button with loading state
 * - Slash command autocomplete
 * - Keyboard shortcuts
 * - New Session quick button
 * - Retry indicator
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { AttachedFile, SlashCommand } from '../../types';

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
}) => {
  const [input, setInput] = useState('');
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [input]);

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Filtered slash commands
  const filteredCommands = SLASH_COMMANDS.filter((cmd) =>
    cmd.command.toLowerCase().includes(slashFilter.toLowerCase()) ||
    cmd.description.toLowerCase().includes(slashFilter.toLowerCase())
  );

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed && attachedFiles.length === 0) return;
    if (isStreaming) return;

    onSend(trimmed, attachedFiles.length > 0 ? attachedFiles : undefined);
    setInput('');
    setShowSlashCommands(false);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, attachedFiles, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Slash command navigation
      if (showSlashCommands) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedSlashIndex((prev) =>
            prev < filteredCommands.length - 1 ? prev + 1 : 0
          );
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedSlashIndex((prev) =>
            prev > 0 ? prev - 1 : filteredCommands.length - 1
          );
          return;
        }
        if (e.key === 'Tab' || e.key === 'Enter') {
          e.preventDefault();
          const selected = filteredCommands[selectedSlashIndex];
          if (selected) {
            setInput(selected.command + ' ');
            setShowSlashCommands(false);
          }
          return;
        }
        if (e.key === 'Escape') {
          setShowSlashCommands(false);
          return;
        }
      }

      // Enter to send, Shift+Enter for newline
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (isStreaming) {
          onStop();
        } else {
          handleSend();
        }
        return;
      }

      // Ctrl+Enter also sends
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSend();
        return;
      }
    },
    [showSlashCommands, filteredCommands, selectedSlashIndex, isStreaming, handleSend, onStop]
  );

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);

    // Show slash commands when typing /
    if (value.startsWith('/')) {
      setSlashFilter(value.slice(1).split(' ')[0]);
      setShowSlashCommands(true);
      setSelectedSlashIndex(0);
    } else {
      setShowSlashCommands(false);
    }
  }, []);

  const handleSlashCommandSelect = useCallback((cmd: SlashCommand) => {
    setInput(cmd.command + ' ');
    setShowSlashCommands(false);
    textareaRef.current?.focus();
  }, []);

  const handleFilePick = useCallback(async () => {
    if (!(window as any).openagent?.files?.open) return;
    try {
      const result = await (window as any).openagent.files.open();
      if (Array.isArray(result)) {
        // Files are already handled by the drop zone
      }
    } catch (err) {
      console.error('File picker error:', err);
    }
  }, []);

  const canSend = (input.trim().length > 0 || attachedFiles.length > 0) && !isStreaming;

  return (
    <div className="relative">
      {/* Slash Command Autocomplete */}
      {showSlashCommands && filteredCommands.length > 0 && (
        <div
          className="absolute bottom-full left-0 right-0 mb-2 mx-4 rounded-xl border shadow-xl overflow-hidden max-h-64 overflow-y-auto animate-fade-in z-10"
          style={{ background: 'var(--color-bg-elevated)', borderColor: 'var(--color-border-primary)' }}
        >
          {filteredCommands.map((cmd, index) => (
            <button
              key={cmd.command}
              onClick={() => handleSlashCommandSelect(cmd)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
              style={{
                background: index === selectedSlashIndex ? 'var(--color-accent-soft)' : 'transparent',
                color: 'var(--color-text-primary)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-bg-hover)';
                setSelectedSlashIndex(index);
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span className="font-mono text-sm" style={{ color: 'var(--color-accent)' }}>
                {cmd.command}
              </span>
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {cmd.description}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Thinking indicator bar */}
      {streamingThinking && (
        <div
          className="mx-4 mb-2 px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 animate-fade-in"
          style={{ background: 'rgba(168,85,247,0.08)', color: 'var(--color-trace-thinking)', borderTop: '1px solid rgba(168,85,247,0.2)' }}
        >
          <div className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin-slow" style={{ borderColor: 'var(--color-trace-thinking)', borderTopColor: 'transparent' }} />
          Thinking...
        </div>
      )}

      {/* Attached Files */}
      {attachedFiles.length > 0 && (
        <div className="mx-4 mb-2 flex flex-wrap gap-2 animate-fade-in">
          {attachedFiles.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border"
              style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-secondary)' }}
            >
              <FileMiniIcon type={file.type} />
              <span className="truncate max-w-[120px]">{file.name}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>{formatFileSize(file.size)}</span>
              <button
                onClick={() => onRemoveFile(index)}
                className="ml-0.5 p-0.5 rounded transition-colors"
                style={{ color: 'var(--color-text-muted)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-error)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                aria-label="Remove file"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
          {attachedFiles.length > 1 && (
            <button
              onClick={onClearFiles}
              className="px-2.5 py-1 rounded-lg text-xs transition-colors"
              style={{ color: 'var(--color-text-tertiary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-error)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Input Area */}
      <div
        ref={inputContainerRef}
        className="flex items-end gap-2 p-4 border-t"
        style={{ background: 'var(--color-bg-primary)', borderColor: 'var(--color-border-secondary)' }}
      >
        {/* File attachment button */}
        <button
          onClick={handleFilePick}
          disabled={disabled || isStreaming}
          className="p-2 rounded-lg transition-colors flex-shrink-0 disabled:opacity-50"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => !disabled && (e.currentTarget.style.background = 'var(--color-bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          title="Attach file"
          aria-label="Attach file"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>

        {/* Text Input */}
        <div
          className="flex-1 rounded-xl border transition-colors"
          style={{
            background: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border-primary)',
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? 'Create a session to start chatting...' : 'Type a message... (/ for commands)'}
            disabled={disabled}
            rows={1}
            className="w-full px-4 py-2.5 rounded-xl resize-none text-sm outline-none"
            style={{
              background: 'transparent',
              color: 'var(--color-text-primary)',
              maxHeight: '200px',
              minHeight: '40px',
            }}
          />
        </div>

        {/* New Session button (only when not streaming) */}
        {onNewSession && !isStreaming && !disabled && (
          <button
            onClick={onNewSession}
            className="p-2 rounded-lg transition-colors flex-shrink-0"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-hover)';
              e.currentTarget.style.color = 'var(--color-accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--color-text-tertiary)';
            }}
            title="New session (Ctrl+N)"
            aria-label="New session"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}

        {/* Voice input button (placeholder) */}
        <button
          disabled
          className="p-2 rounded-lg transition-colors flex-shrink-0 opacity-40"
          style={{ color: 'var(--color-text-tertiary)' }}
          title="Voice input (coming soon)"
          aria-label="Voice input"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </button>

        {/* Send / Stop button */}
        {isStreaming ? (
          <button
            onClick={onStop}
            className="p-2 rounded-lg transition-colors flex-shrink-0"
            style={{ background: 'var(--color-error)', color: 'white' }}
            title="Stop generating"
            aria-label="Stop generating"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="p-2 rounded-lg transition-all flex-shrink-0 disabled:opacity-40"
            style={{
              background: canSend ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
              color: canSend ? 'white' : 'var(--color-text-muted)',
            }}
            title="Send message (Enter)"
            aria-label="Send message"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Mini File Icon ────────────────────────────────────────────────────────────

const FileMiniIcon: React.FC<{ type: string }> = ({ type }) => {
  const color = type.startsWith('image/')
    ? 'var(--color-accent)'
    : type.includes('pdf')
    ? 'var(--color-error)'
    : 'var(--color-success)';

  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  );
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default ChatInput;
