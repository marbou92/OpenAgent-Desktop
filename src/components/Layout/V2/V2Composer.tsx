/**
 * OpenAgent-Desktop — V2 Composer (Phase 1.4)
 *
 * The Modern-layout composer. A rounded-xl card with raised shadow:
 *
 *   ╭──────────────────────────────────────────────────────────────╮
 *   │                                                              │
 *   │  Ask anything, / for commands, @ for context...              │
 *   │                                                              │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ [+]  [OpenAI ▾]                              [⬆]            │
 *   ╰──────────────────────────────────────────────────────────────╯
 *
 * - Textarea (auto-growing, max 180px) with the V2 placeholder
 * - Bottom control row: + attach button, model selector, send button
 * - Send = contrast bg with arrow icon; becomes stop (square) when streaming
 * - Reuses the existing ModelSelector component for provider/model picking
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { AttachedFile, ProviderInfo } from '../../../types';
import ModelSelector from '../../Chat/ModelSelector';

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
  /** Optional autofocus (true for new-session view). */
  autoFocus?: boolean;
}

const V2Composer: React.FC<V2ComposerProps> = ({
  onSend,
  onStop,
  isStreaming,
  providers,
  selectedProviderId,
  selectedModel,
  onProviderChange,
  onModelChange,
  onImagesAttached,
  autoFocus = false,
}) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-grow textarea
  useEffect(() => {
    const t = textareaRef.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight, 180)}px`;
  }, [input]);

  // Autofocus on mount
  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [input, isStreaming, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming) onStop();
      else handleSend();
    }
  }, [isStreaming, handleSend, onStop]);

  const handleFilePick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    Promise.all(imageFiles.map(file => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    }))).then(dataUrls => onImagesAttached?.(dataUrls)).catch(err => console.error('Image read error:', err));
    e.target.value = '';
  }, [onImagesAttached]);

  const canSend = input.trim().length > 0 && !isStreaming;

  return (
    <div
      className="relative w-full"
      style={{
        background: 'var(--v2-background-bg-base)',
        borderRadius: 'var(--v2-radius-xl)',
        boxShadow: 'var(--v2-elevation-raised)',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      {/* Textarea area */}
      <div className="px-4 pt-4 pb-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything, / for commands, @ for context..."
          rows={1}
          className="w-full bg-transparent outline-none resize-none text-[13px] leading-5 no-scrollbar"
          style={{
            color: 'var(--v2-text-text-base)',
            fontFamily: 'var(--v2-font-family-text)',
            fontWeight: 'var(--v2-font-weight-regular)',
            minHeight: '52px',
            maxHeight: '180px',
          }}
        />
      </div>

      {/* Bottom control row */}
      <div
        className="flex items-center gap-1 px-2 h-11"
        style={{ borderTop: '1px solid var(--v2-border-border-muted)' }}
      >
        {/* + Attach button */}
        <button
          onClick={handleFilePick}
          className="flex items-center justify-center h-7 w-7 rounded-md transition-colors"
          style={{ color: 'var(--v2-icon-icon-muted)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          aria-label="Attach file"
          title="Attach file"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        {/* Model selector (reuses existing component) */}
        <div className="flex-1 min-w-0">
          <ModelSelector
            providers={providers}
            selectedProviderId={selectedProviderId}
            selectedModel={selectedModel}
            onProviderChange={onProviderChange}
            onModelChange={onModelChange}
          />
        </div>

        {/* Send / Stop button */}
        <button
          onClick={() => {
            if (isStreaming) onStop();
            else handleSend();
          }}
          disabled={!canSend && !isStreaming}
          className="flex items-center justify-center h-7 w-7 rounded-md flex-shrink-0 transition-all disabled:opacity-40"
          style={{
            background: 'var(--v2-background-bg-contrast)',
            color: 'var(--v2-text-text-inverse)',
            boxShadow: 'var(--v2-elevation-button-contrast)',
          }}
          aria-label={isStreaming ? 'Stop' : 'Send'}
          title={isStreaming ? 'Stop' : 'Send'}
        >
          {isStreaming ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
};

export default V2Composer;
