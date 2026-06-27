/**
 * OpenAgent-Desktop — Layout Chooser Dialog (Phase 1.1)
 *
 * Shown on first launch (when layoutChoiceShown === false). Lets the user pick
 * between the Classic (3-panel) and Modern (opencode V2 card-based) layouts.
 * The choice is persisted via onUpdateSettings, and layoutChoiceShown is set
 * so the popup never appears again.
 */

import React, { useState } from 'react';

interface LayoutChooserDialogProps {
  /** Called with the chosen layout when the user clicks Start. */
  onChoose: (layout: 'classic' | 'modern') => void;
}

const LayoutOptionCard: React.FC<{
  id: 'classic' | 'modern';
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
  preview: React.ReactNode;
}> = ({ id: _id, title, description, selected, onSelect, preview }) => (
  <button
    onClick={onSelect}
    className="flex-1 text-left rounded-xl transition-all p-5"
    style={{
      background: selected ? 'var(--color-accent-soft)' : 'var(--color-bg-primary)',
      border: `1.5px solid ${selected ? 'var(--color-accent)' : 'var(--color-border-secondary)'}`,
      cursor: 'pointer',
    }}
    onMouseEnter={(e) => {
      if (!selected) e.currentTarget.style.borderColor = 'var(--color-border-primary)';
    }}
    onMouseLeave={(e) => {
      if (!selected) e.currentTarget.style.borderColor = 'var(--color-border-secondary)';
    }}
  >
    {/* Mini preview swatch */}
    <div
      className="rounded-lg mb-3 overflow-hidden"
      style={{
        background: 'var(--color-bg-tertiary)',
        border: '1px solid var(--color-border-secondary)',
        height: '90px',
      }}
    >
      {preview}
    </div>
    <div className="flex items-center gap-2 mb-1">
      <span
        className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
        style={{
          border: `1.5px solid ${selected ? 'var(--color-accent)' : 'var(--color-text-muted)'}`,
          background: selected ? 'var(--color-accent)' : 'transparent',
        }}
      >
        {selected && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
      <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
        {title}
      </span>
    </div>
    <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
      {description}
    </p>
  </button>
);

// ─── Mini preview swatches (visual representations of each layout) ───────────

const ClassicPreview = () => (
  <div className="flex h-full w-full gap-0.5 p-1">
    <div className="w-1/5 bg-[var(--color-accent)] opacity-60 rounded-sm" />
    <div className="flex-1 bg-[var(--color-bg-secondary)] rounded-sm" />
    <div className="w-1/4 bg-[var(--color-bg-secondary)] rounded-sm" />
  </div>
);

const ModernPreview = () => (
  <div className="flex flex-col h-full w-full p-1 gap-0.5">
    <div className="h-3 bg-[var(--color-bg-secondary)] rounded-sm" />
    <div className="flex-1 flex items-center justify-center p-2">
      <div className="w-3/4 h-full bg-[var(--color-accent)] opacity-60 rounded-md" />
    </div>
  </div>
);

const LayoutChooserDialog: React.FC<LayoutChooserDialogProps> = ({ onChoose }) => {
  const [selected, setSelected] = useState<'classic' | 'modern'>('modern');

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-fade-in"
        style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-primary)' }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center">
          <div className="flex justify-center mb-3">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 9h6v6H9z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Welcome to OpenAgent Desktop
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Choose how you want the app to look. You can change this anytime in Settings → Appearance.
          </p>
        </div>

        {/* Options */}
        <div className="flex gap-4 px-6 pb-4">
          <LayoutOptionCard
            id="classic"
            title="Classic"
            description="Three resizable panels — sidebar, chat, and trace. The layout you're familiar with."
            selected={selected === 'classic'}
            onSelect={() => setSelected('classic')}
            preview={<ClassicPreview />}
          />
          <LayoutOptionCard
            id="modern"
            title="Modern"
            description="Clean card-based design with a browser-style tab strip. Floating panels on a deep background."
            selected={selected === 'modern'}
            onSelect={() => setSelected('modern')}
            preview={<ModernPreview />}
          />
        </div>

        {/* Footer */}
        <div
          className="flex justify-end gap-2 px-6 py-4"
          style={{ background: 'var(--color-bg-tertiary)', borderTop: '1px solid var(--color-border-secondary)' }}
        >
          <button
            onClick={() => onChoose(selected)}
            className="px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ background: 'var(--color-accent)', color: 'white' }}
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
};

export default LayoutChooserDialog;
