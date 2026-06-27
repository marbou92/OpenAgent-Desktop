/**
 * OpenAgent-Desktop — V2 Slide-In Panel (Phase 1.2)
 *
 * A reusable slide-in panel that overlays the main content from the right edge.
 * Used for the trace/context panel in Modern layout mode. The panel slides in
 * with a CSS transform animation and has a semi-transparent backdrop.
 *
 * Inspired by opencode V2's review side panel — overlays the chat card rather
 * than pushing it (keeps the chat card at a stable width).
 */

import React, { useEffect } from 'react';

interface V2SlideInPanelProps {
  /** Whether the panel is open. */
  open: boolean;
  /** Called when the panel requests to close (backdrop click or close button). */
  onClose: () => void;
  /** Panel width in pixels (default 340). */
  width?: number;
  /** Panel title (shown in the header). */
  title?: string;
  /** Content inside the panel. */
  children: React.ReactNode;
}

const V2SlideInPanel: React.FC<V2SlideInPanelProps> = ({
  open,
  onClose,
  width = 340,
  title,
  children,
}) => {
  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop — semi-transparent, click to close */}
      <div
        className="absolute inset-0 animate-fade-in"
        style={{ background: 'rgba(0,0,0,0.3)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative h-full flex flex-col animate-slide-in-right"
        style={{
          width,
          background: 'var(--v2-background-bg-base)',
          boxShadow: 'var(--v2-elevation-floating)',
          borderLeft: '1px solid var(--v2-border-border-base)',
        }}
      >
        {/* Header */}
        {title && (
          <div
            className="flex items-center justify-between px-4 flex-shrink-0"
            style={{
              height: '36px',
              borderBottom: '1px solid var(--v2-border-border-muted)',
              background: 'var(--v2-background-bg-layer-01)',
            }}
          >
            <span
              className="text-[13px] font-medium"
              style={{ color: 'var(--v2-text-text-base)', fontFamily: 'var(--v2-font-family-text)' }}
            >
              {title}
            </span>
            <button
              onClick={onClose}
              className="p-1 rounded transition-colors"
              style={{ color: 'var(--v2-icon-icon-muted)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              aria-label="Close panel"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
};

export default V2SlideInPanel;
