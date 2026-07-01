/**
 * OpenAgent-Desktop — V2 Slide-In Panel (Phase 2.0.3 → 2.8.2.2 docked)
 *
 * A reusable right-side docked panel used by the V2 (Modern) layout to host
 * the RightPanel (Trace / Context / Notes). Renders:
 *
 *   - A fixed-width panel anchored as a flex sibling next to the main content.
 *   - A header row with the panel title + a close button.
 *   - A scrollable body slot for `children`.
 *
 * Layout model:
 *   The parent (`V2AppShell`'s `<main>`) is a flex row. When the panel should
 *   be visible, the parent conditionally mounts this component as a flex
 *   sibling next to the content wrapper — so the panel PUSHES the main content
 *   instead of overlaying it. There is no backdrop, no z-index, and no slide
 *   transform; mount/unmount is driven entirely by the parent's conditional
 *   render.
 *
 * Keyboard:
 *   - Escape closes the panel (only when `open` is true).
 *
 * The `open` prop is kept (always `true` when mounted now) for the Escape
 * handler guard and the `aria-hidden` attribute. The close button + Escape
 * handler still call `onClose`, which the parent uses to unmount the panel.
 */

import React, { useEffect, useCallback } from 'react';

interface V2SlideInPanelProps {
  /** Whether the panel is currently mounted/open. */
  open: boolean;
  /** Called when the user requests the panel to close (Esc or close button). */
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

  // Docked panel — a flex sibling of the main content, not an overlay.
  return (
    <aside
      className="flex flex-col flex-shrink-0 h-full"
      style={{
        width: `${width}px`,
        background: 'var(--v2-background-bg-base)',
        borderLeft: '1px solid var(--v2-border-border-base)',
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
  );
};

export default V2SlideInPanel;
