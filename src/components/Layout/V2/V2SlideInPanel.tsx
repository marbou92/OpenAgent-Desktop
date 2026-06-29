/**
 * OpenAgent-Desktop — V2 Slide-In Panel (Phase 2.0.3)
 *
 * A reusable right-side overlay panel used by the V2 (Modern) layout to host
 * the RightPanel (Trace / Context / Notes). Renders:
 *
 *   - A semi-transparent backdrop (click to close).
 *   - A fixed-width panel anchored to the right edge that slides in/out via a
 *     CSS transform transition.
 *   - A header row with the panel title + a close button.
 *   - A scrollable body slot for `children`.
 *
 * Keyboard:
 *   - Escape closes the panel (only when `open` is true).
 *
 * The panel is `position: absolute` so it overlays its parent (the V2AppShell
 * main area) rather than the whole OS chrome — this keeps it under the V2
 * titlebar, matching the opencode-desktop "in-app right rail" feel.
 */

import React, { useEffect, useCallback } from 'react';

interface V2SlideInPanelProps {
  /** Whether the panel is currently mounted/open. */
  open: boolean;
  /** Called when the user requests the panel to close (backdrop click, Esc, or close button). */
  onClose: () => void;
  /** Panel width in pixels. Default 340. */
  width?: number;
  /** Title shown in the header row. */
  title?: string;
  /** Optional header accessory rendered to the left of the close button. */
  headerAccessory?: React.ReactNode;
  /** Panel body. */
  children?: React.ReactNode;
}

const V2SlideInPanel: React.FC<V2SlideInPanelProps> = ({
  open,
  onClose,
  width = 340,
  title,
  headerAccessory,
  children,
}) => {
  // ── Escape-to-close ───────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    },
    [open, onClose],
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  return (
    <>
      {/* Backdrop — click anywhere to close. */}
      {open && (
        <div
          className="absolute inset-0 z-40 animate-fade-in"
          style={{
            background: 'var(--v2-overlay-simple-overlay-hover, rgba(0,0,0,0.32))',
            backdropFilter: 'blur(2px)',
          }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Panel — anchored to the right edge. */}
      <aside
        className="absolute top-0 right-0 bottom-0 z-50 flex flex-col"
        style={{
          width: `${width}px`,
          maxWidth: '100%',
          background: 'var(--v2-background-bg-base)',
          borderLeft: '1px solid var(--v2-border-border-base)',
          boxShadow: open ? 'var(--v2-elevation-floating)' : 'none',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)',
          visibility: open ? 'visible' : 'hidden',
          fontFamily: 'var(--v2-font-family-text)',
        }}
        role="dialog"
        aria-label={title || 'Side panel'}
        aria-hidden={!open}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-2 px-4 flex-shrink-0"
          style={{
            height: '36px',
            borderBottom: '1px solid var(--v2-border-border-muted)',
          }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span
              className="text-[12px] font-medium truncate"
              style={{
                color: 'var(--v2-text-text-base)',
                fontWeight: 'var(--v2-font-weight-medium)',
              }}
            >
              {title}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {headerAccessory}
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center h-6 w-6 rounded-md transition-colors"
              style={{ color: 'var(--v2-icon-icon-muted)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--v2-overlay-simple-overlay-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
              aria-label="Close panel"
              title="Close panel"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
      </aside>
    </>
  );
};

export default V2SlideInPanel;
