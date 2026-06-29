/**
 * OpenAgent-Desktop — Layout Chooser Dialog (Phase 2.0.3)
 *
 * First-launch popup that lets the user pick between the Classic sidebar
 * layout and the Modern (V2) titlebar + floating-card layout.
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │              Welcome to OpenAgent-Desktop                   │
 *   │              Pick the layout that fits you.                 │
 *   │                                                             │
 *   │   ┌─────────────────┐    ┌─────────────────┐                │
 *   │   │   Classic       │    │   Modern        │                │
 *   │   │  (sidebar mock) │    │  (titlebar mock)│                │
 *   │   │                 │    │                 │                │
 *   │   │   [ Use this ]  │    │   [ Use this ]  │                │
 *   │   └─────────────────┘    └─────────────────┘                │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Choosing a card calls `onChoose('classic' | 'modern')`. The dialog renders
 * as a centered modal with a dim backdrop; Escape is intentionally NOT bound
 * — the user must make a choice (first-launch is a one-time gate).
 */

import React from 'react';

export type LayoutChoice = 'classic' | 'modern';

interface LayoutChooserDialogProps {
  /** Called with the user's choice. */
  onChoose: (layout: LayoutChoice) => void;
}

const LayoutChooserDialog: React.FC<LayoutChooserDialogProps> = ({ onChoose }) => {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="layout-chooser-title"
    >
      <div
        className="w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden"
        style={{
          background: 'var(--color-bg-elevated, var(--color-bg-secondary))',
          borderColor: 'var(--color-border-primary)',
          fontFamily: 'var(--v2-font-family-text, inherit)',
        }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-2 text-center">
          <div
            className="inline-flex items-center justify-center mb-3"
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, var(--color-accent, var(--v2-blue-600)), #6d28d9)',
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h2
            id="layout-chooser-title"
            className="text-lg font-semibold"
            style={{
              color: 'var(--color-text-primary)',
              fontWeight: 'var(--v2-font-weight-medium, 600)',
            }}
          >
            Welcome to OpenAgent-Desktop
          </h2>
          <p
            className="text-sm mt-1"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Pick the layout that fits the way you work. You can change this later in Settings.
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-6 py-4">
          <LayoutCard
            layout="classic"
            title="Classic"
            description="Sidebar navigation with stacked panels. Familiar three-pane IDE feel."
            onChoose={onChoose}
          />
          <LayoutCard
            layout="modern"
            title="Modern"
            description="Browser-style tabs in a slim titlebar with floating chat cards. Minimal & focused."
            onChoose={onChoose}
            recommended
          />
        </div>

        {/* Footer hint */}
        <div
          className="px-6 py-3 text-center text-[11px] border-t"
          style={{
            color: 'var(--color-text-muted)',
            borderColor: 'var(--color-border-secondary)',
            background: 'var(--color-bg-secondary)',
          }}
        >
          Tip: switch layouts any time from Settings → Appearance.
        </div>
      </div>
    </div>
  );
};

// ─── Layout preview card ───────────────────────────────────────────────────
interface LayoutCardProps {
  layout: LayoutChoice;
  title: string;
  description: string;
  onChoose: (layout: LayoutChoice) => void;
  recommended?: boolean;
}

const LayoutCard: React.FC<LayoutCardProps> = ({
  layout,
  title,
  description,
  onChoose,
  recommended = false,
}) => {
  return (
    <button
      type="button"
      onClick={() => onChoose(layout)}
      className="group relative flex flex-col text-left rounded-xl border overflow-hidden transition-all"
      style={{
        background: 'var(--color-bg-primary)',
        borderColor: recommended
          ? 'var(--color-accent)'
          : 'var(--color-border-primary)',
        boxShadow: recommended
          ? '0 0 0 3px var(--color-accent-soft)'
          : 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-accent)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = recommended
          ? 'var(--color-accent)'
          : 'var(--color-border-primary)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
      aria-label={`Choose ${title} layout`}
    >
      {recommended && (
        <span
          className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full text-[10px] font-medium"
          style={{
            background: 'var(--color-accent)',
            color: 'white',
          }}
        >
          Recommended
        </span>
      )}

      {/* Preview mock */}
      <div
        className="px-4 pt-4 pb-3"
        style={{
          background: 'var(--color-bg-secondary)',
          borderBottom: '1px solid var(--color-border-secondary)',
        }}
      >
        {layout === 'classic' ? <ClassicMock /> : <ModernMock />}
      </div>

      {/* Text */}
      <div className="px-4 py-3 flex-1 flex flex-col">
        <div
          className="text-sm font-semibold mb-1"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {title}
        </div>
        <div
          className="text-[12px] flex-1"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {description}
        </div>
        <div
          className="mt-3 inline-flex items-center justify-center h-8 px-3 rounded-md text-[12px] font-medium transition-colors"
          style={{
            background: 'var(--color-accent)',
            color: 'white',
          }}
        >
          Use this layout
        </div>
      </div>
    </button>
  );
};

// ─── Classic mock — sidebar + main + right panel ───────────────────────────
const ClassicMock: React.FC = () => (
  <div className="flex w-full h-20 rounded-md overflow-hidden border" style={{ borderColor: 'var(--color-border-secondary)' }}>
    {/* Sidebar */}
    <div
      className="flex flex-col gap-1 p-1.5 flex-shrink-0"
      style={{ width: '28px', background: 'var(--color-bg-tertiary)' }}
    >
      <div className="h-2 rounded-sm" style={{ background: 'var(--color-accent)' }} />
      <div className="h-1.5 rounded-sm" style={{ background: 'var(--color-border-primary)' }} />
      <div className="h-1.5 rounded-sm" style={{ background: 'var(--color-border-primary)' }} />
      <div className="h-1.5 rounded-sm" style={{ background: 'var(--color-border-primary)' }} />
    </div>
    {/* Main */}
    <div className="flex-1 p-2 flex flex-col gap-1" style={{ background: 'var(--color-bg-primary)' }}>
      <div className="h-1.5 rounded-sm w-1/2" style={{ background: 'var(--color-border-primary)' }} />
      <div className="h-1.5 rounded-sm w-3/4" style={{ background: 'var(--color-border-secondary)' }} />
      <div className="h-1.5 rounded-sm w-2/3" style={{ background: 'var(--color-border-secondary)' }} />
      <div className="mt-auto h-3 rounded-sm" style={{ background: 'var(--color-bg-hover)' }} />
    </div>
    {/* Right panel */}
    <div
      className="flex-shrink-0 p-1.5 flex flex-col gap-1"
      style={{ width: '24px', background: 'var(--color-bg-secondary)', borderLeft: '1px solid var(--color-border-secondary)' }}
    >
      <div className="h-1.5 rounded-sm" style={{ background: 'var(--color-border-primary)' }} />
      <div className="h-1.5 rounded-sm" style={{ background: 'var(--color-border-secondary)' }} />
      <div className="h-1.5 rounded-sm" style={{ background: 'var(--color-border-secondary)' }} />
    </div>
  </div>
);

// ─── Modern mock — titlebar with tabs + floating card ──────────────────────
const ModernMock: React.FC = () => (
  <div className="flex flex-col w-full h-20 rounded-md overflow-hidden border" style={{ borderColor: 'var(--color-border-secondary)' }}>
    {/* Titlebar */}
    <div
      className="flex items-center gap-1 px-1.5 flex-shrink-0"
      style={{ height: '14px', background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border-secondary)' }}
    >
      <div className="h-1.5 w-1.5 rounded-sm" style={{ background: 'var(--color-border-primary)' }} />
      <div className="h-1.5 w-6 rounded-sm" style={{ background: 'var(--color-accent-soft)' }} />
      <div className="h-1.5 w-5 rounded-sm" style={{ background: 'var(--color-border-primary)' }} />
      <div className="ml-auto h-1.5 w-1.5 rounded-sm" style={{ background: 'var(--color-border-primary)' }} />
    </div>
    {/* Floating card */}
    <div className="flex-1 p-2 flex items-center justify-center" style={{ background: 'var(--color-bg-secondary)' }}>
      <div
        className="w-full h-full rounded-md px-2 py-1.5 flex flex-col gap-1"
        style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border-secondary)' }}
      >
        <div className="h-1.5 rounded-sm w-1/2" style={{ background: 'var(--color-border-primary)' }} />
        <div className="h-1.5 rounded-sm w-2/3" style={{ background: 'var(--color-border-secondary)' }} />
        <div className="mt-auto h-2.5 rounded-sm self-end w-1/3" style={{ background: 'var(--color-accent)' }} />
      </div>
    </div>
  </div>
);

export default LayoutChooserDialog;
