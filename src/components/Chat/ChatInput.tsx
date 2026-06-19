/**
 * OpenAgent-Desktop - Chat Input (Phase 2.2 Redesign)
 *
 * Redesigned composer inspired by open-cowork / opencode-desktop:
 *
 *   ╭──────────────────────────────────────────────────────────╮
 *   │ [📎] [Build ▾] [Model ▾]   ╭──────────────────────────╮  │
 *   │                            │ Type a message...       │  │
 *   │                            │ (/ for commands)        │  │
 *   │                            ╰──────────────────────────╯  │
 *   │                                                [➤ / ⏹]  │
 *   ╰──────────────────────────────────────────────────────────╯
 *
 * Phase 2.2 changes:
 *   - Agent (Build/Plan) selector moved INTO the composer bottom-left
 *     row, sitting next to the model selector. This matches opencode
 *     desktop, which places the agent dropdown inside the prompt input
 *     footer — NOT in the header.
 *   - Only Build and Plan are selectable. Chat is no longer a UI mode.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { AttachedFile, SlashCommand, ProviderInfo, AgentMode, AgentDefinition } from '../../types';
import { formatFileSize } from '../../utils/format';
import { getAPI } from '../../utils/api';
import ModelSelector from './ModelSelector';
import AgentSelector from './AgentSelector';

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
  // Phase 2: inline model selector props
  providers?: ProviderInfo[];
  selectedProviderId?: string;
  selectedModel?: string;
  onProviderChange?: (providerId: string) => void;
  onModelChange?: (model: string) => void;
  // Phase 2.2: inline agent (Build/Plan) selector props — moved here from
  // the chat header to match opencode desktop's composer layout.
  activeMode?: AgentMode;
  onModeChange?: (mode: AgentMode) => void;
  customAgents?: AgentDefinition[];
  // Phase 2: pre-fill support (used by empty-state prompt grid)
  pendingPrompt?: string;
  onPendingPromptConsumed?: () => void;
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

  // Pre-fill support: when ChatView passes a pendingPrompt (from the empty-
  // state suggested-prompts grid), load it into the textarea and focus.
  useEffect(() => {
    if (pendingPrompt && pendingPrompt.length > 0) {
      setInput(pendingPrompt);
      onPendingPromptConsumed?.();
      // Defer focus so the textarea has the new value first.
      setTimeout(() => {
        textareaRef.current?.focus();
        // Move cursor to end
        const len = textareaRef.current?.value.length || 0;
        textareaRef.current?.setSelectionRange(len, len);
      }, 30);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt]);

  // Filtered slash commands
  const filteredCommands = SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.command.toLowerCase().includes(slashFilter.toLowerCase()) ||
      cmd.description.toLowerCase().includes(slashFilter.toLowerCase()),
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
            prev < filteredCommands.length - 1 ? prev + 1 : 0,
          );
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedSlashIndex((prev) =>
            prev > 0 ? prev - 1 : filteredCommands.length - 1,
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
    [showSlashCommands, filteredCommands, selectedSlashIndex, isStreaming, handleSend, onStop],
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
    const fileApi = getAPI();
    if (!fileApi?.files?.open) return;
    try {
      await fileApi.files.open({} as any);
    } catch (err) {
      console.error('File picker error:', err);
    }
  }, []);

  const canSend = (input.trim().length > 0 || attachedFiles.length > 0) && !isStreaming;

  return (
    <div className="relative flex-shrink-0">
      {/* ─── Slash Command Palette ──────────────────────────────────── */}
      {showSlashCommands && filteredCommands.length > 0 && (
        <div
          className="absolute bottom-full left-4 right-4 mb-2 rounded-xl overflow-hidden max-h-64 overflow-y-auto animate-fade-in z-20"
          style={{
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-primary)',
            boxShadow: 'var(--shadow-popover)',
          }}
        >
          <div
            className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider border-b"
            style={{
              color: 'var(--color-text-muted)',
              borderColor: 'var(--color-border-secondary)',
            }}
          >
            Commands
          </div>
          {filteredCommands.map((cmd, index) => (
            <button
              key={cmd.command}
              onClick={() => handleSlashCommandSelect(cmd)}
              className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors"
              style={{
                background:
                  index === selectedSlashIndex ? 'var(--color-accent-soft)' : 'transparent',
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
              <span
                className="font-mono text-xs px-1.5 py-0.5 rounded"
                style={{
                  color: 'var(--color-accent)',
                  background: 'var(--color-accent-soft)',
                }}
              >
                {cmd.command}
              </span>
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {cmd.description}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ─── Thinking indicator (subtle, above the composer) ────────── */}
      {streamingThinking && (
        <div
          className="mx-4 mb-1.5 px-3 py-1 rounded-md text-[11px] flex items-center gap-2 animate-fade-in"
          style={{
            background: 'rgba(168,85,247,0.06)',
            color: 'var(--color-trace-thinking)',
          }}
        >
          <div
            className="w-2.5 h-2.5 border-2 border-t-transparent rounded-full animate-spin-slow"
            style={{
              borderColor: 'var(--color-trace-thinking)',
              borderTopColor: 'transparent',
            }}
          />
          <span>Thinking</span>
        </div>
      )}

      {/* ─── Attachment chips (above the composer row) ──────────────── */}
      {attachedFiles.length > 0 && (
        <div className="mx-4 mb-1.5 flex flex-wrap gap-1.5 animate-fade-in">
          {attachedFiles.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border"
              style={{
                background: 'var(--color-bg-tertiary)',
                borderColor: 'var(--color-border-primary)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <FileMiniIcon type={file.type} />
              <span className="truncate max-w-[140px]">{file.name}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>{formatFileSize(file.size)}</span>
              <button
                onClick={() => onRemoveFile(index)}
                className="ml-0.5 p-0.5 rounded transition-colors"
                style={{ color: 'var(--color-text-muted)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-error)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                aria-label="Remove file"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
          {attachedFiles.length > 1 && (
            <button
              onClick={onClearFiles}
              className="px-2 py-1 rounded-md text-xs transition-colors"
              style={{ color: 'var(--color-text-tertiary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-error)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* ─── Composer Card ──────────────────────────────────────────── */}
      <div
        ref={inputContainerRef}
        className="m-3 rounded-2xl border transition-colors"
        style={{
          background: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border-primary)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        {/* Textarea row */}
        <div className="px-3 pt-2.5">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={
              disabled
                ? 'Create a session to start chatting...'
                : 'Message OpenAgent...  ( / for commands, Shift+Enter for newline )'
            }
            disabled={disabled}
            rows={1}
            className="w-full resize-none text-sm outline-none bg-transparent"
            style={{
              color: 'var(--color-text-primary)',
              maxHeight: '200px',
              minHeight: '24px',
              lineHeight: '1.5',
            }}
          />
        </div>

        {/* Bottom row: model selector + actions */}
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* File attachment button */}
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
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>

            {/* Inline agent selector (Phase 2.2 — moved here from the header
                to match opencode desktop's composer layout). Sits BEFORE
                the model selector, so the order is: [📎] [Build ▾] [Model ▾]. */}
            {onModeChange && activeMode !== undefined && (
              <AgentSelector
                activeMode={activeMode}
                onModeChange={onModeChange}
                customAgents={customAgents}
                disabled={disabled || isStreaming}
              />
            )}

            {/* Inline model selector (Phase 2 — moved here from the header) */}
            {onProviderChange && onModelChange && (
              <ModelSelector
                providers={providers}
                selectedProviderId={selectedProviderId}
                selectedModel={selectedModel}
                onProviderChange={onProviderChange}
                onModelChange={onModelChange}
                disabled={disabled || isStreaming}
              />
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* New session button (only when not streaming and not disabled) */}
            {onNewSession && !isStreaming && !disabled && (
              <button
                onClick={onNewSession}
                className="p-1.5 rounded-lg transition-colors"
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
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            )}

            {/* Send / Stop button */}
            {isStreaming ? (
              <button
                onClick={onStop}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0"
                style={{ background: 'var(--color-error)', color: 'white' }}
                title="Stop generating"
                aria-label="Stop generating"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                <span>Stop</span>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: canSend ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                  color: canSend ? 'white' : 'var(--color-text-muted)',
                }}
                title="Send message (Enter)"
                aria-label="Send message"
                onMouseEnter={(e) => {
                  if (canSend) e.currentTarget.style.background = 'var(--color-accent-hover)';
                }}
                onMouseLeave={(e) => {
                  if (canSend) e.currentTarget.style.background = 'var(--color-accent)';
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                <span>Send</span>
              </button>
            )}
          </div>
        </div>
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
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  );
};

export default ChatInput;
