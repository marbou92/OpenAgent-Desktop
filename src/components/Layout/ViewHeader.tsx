/**
 * OpenAgent-Desktop - View Header (Phase 3)
 *
 * A slim titlebar-height header for non-chat views (Settings, Sessions,
 * Extensions, etc.) that ALSO serves as the window drag region.
 *
 * Phase 3 merged the separate titlebar into the view headers — each view
 * now has its own header at the top which is draggable to move the window.
 * The ChatView already has its own header; this component is for the other
 * views that don't have one built-in.
 */

import React from 'react';

interface ViewHeaderProps {
  title: string;
  /** Optional right-side content (e.g. action buttons). */
  actions?: React.ReactNode;
}

const ViewHeader: React.FC<ViewHeaderProps> = ({ title, actions }) => {
  return (
    <div
      className="titlebar-drag flex items-center justify-between px-4 border-b flex-shrink-0"
      style={{
        height: 'var(--titlebar-height)',
        borderColor: 'var(--color-border-secondary)',
        background: 'var(--color-bg-secondary)',
      }}
    >
      <span
        className="titlebar-no-drag text-sm font-semibold"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {title}
      </span>
      {actions && (
        <div className="titlebar-no-drag flex items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
};

export default ViewHeader;
