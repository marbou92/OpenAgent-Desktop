/**
 * Three-Panel Layout - OpenCowork Style
 *
 * Resizable 3-panel layout: Sidebar | Main Content | Right Panel
 * Panels can be collapsed/expanded with drag-to-resize dividers.
 * Mobile-responsive: collapses to single panel on narrow screens.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────────

export interface PanelState {
  leftWidth: number;
  centerWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
}

interface ThreePanelLayoutProps {
  /** Content for the left sidebar panel */
  leftPanel: React.ReactNode;
  /** Content for the center/main panel */
  centerPanel: React.ReactNode;
  /** Content for the right trace/context panel */
  rightPanel: React.ReactNode;

  /** Initial width of left panel in pixels (default 260) */
  leftWidth?: number;
  /** Initial width of center panel in pixels (auto-calculated if omitted) */
  centerWidth?: number;
  /** Initial width of right panel in pixels (default 320) */
  rightWidth?: number;

  /** Callback when panels are resized */
  onResize?: (state: PanelState) => void;

  /** Whether the left panel is initially collapsed */
  leftCollapsed?: boolean;
  /** Whether the right panel is initially collapsed */
  rightCollapsed?: boolean;

  /** Called when left panel collapse state changes */
  onLeftCollapse?: (collapsed: boolean) => void;
  /** Called when right panel collapse state changes */
  onRightCollapse?: (collapsed: boolean) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────────

const MIN_LEFT_WIDTH = 200;
const MIN_CENTER_WIDTH = 400;
const MIN_RIGHT_WIDTH = 250;
const MAX_LEFT_WIDTH = 400;
const MAX_RIGHT_WIDTH = 500;
const DIVIDER_WIDTH = 4;
const MOBILE_BREAKPOINT = 768;
const COLLAPSED_WIDTH = 48;

// ─── Component ────────────────────────────────────────────────────────────────────

const ThreePanelLayout: React.FC<ThreePanelLayoutProps> = ({
  leftPanel,
  centerPanel,
  rightPanel,
  leftWidth = 260,
  rightWidth = 320,
  leftCollapsed: leftCollapsedProp,
  rightCollapsed: rightCollapsedProp,
  onResize,
  onLeftCollapse,
  onRightCollapse,
}) => {
  // ── State ────────────────────────────────────────────────────────────────

  const [leftW, setLeftW] = useState(leftWidth);
  const [rightW, setRightW] = useState(rightWidth);
  const [leftCollapsed, setLeftCollapsed] = useState(leftCollapsedProp ?? false);
  const [rightCollapsed, setRightCollapsed] = useState(rightCollapsedProp ?? false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'left' | 'center' | 'right'>('center');

  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<'left' | 'right' | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // ── Responsive detection ─────────────────────────────────────────────────

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (mobile) {
        setLeftCollapsed(true);
        setRightCollapsed(true);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // ── Sync with prop-driven collapse state ─────────────────────────────────

  useEffect(() => {
    if (leftCollapsedProp !== undefined) setLeftCollapsed(leftCollapsedProp);
  }, [leftCollapsedProp]);

  useEffect(() => {
    if (rightCollapsedProp !== undefined) setRightCollapsed(rightCollapsedProp);
  }, [rightCollapsedProp]);

  // ── Persist panel state ──────────────────────────────────────────────────

  useEffect(() => {
    try {
      const state: PanelState = {
        leftWidth: leftW,
        centerWidth: 0, // computed
        rightWidth: rightW,
        leftCollapsed,
        rightCollapsed,
      };
      localStorage.setItem('openagent-panel-state', JSON.stringify(state));
      onResize?.(state);
    } catch {
      // Ignore storage errors
    }
  }, [leftW, rightW, leftCollapsed, rightCollapsed, onResize]);

  // ── Load persisted state on mount ────────────────────────────────────────

  useEffect(() => {
    try {
      const saved = localStorage.getItem('openagent-panel-state');
      if (saved) {
        const state: PanelState = JSON.parse(saved);
        if (state.leftWidth >= MIN_LEFT_WIDTH && state.leftWidth <= MAX_LEFT_WIDTH) {
          setLeftW(state.leftWidth);
        }
        if (state.rightWidth >= MIN_RIGHT_WIDTH && state.rightWidth <= MAX_RIGHT_WIDTH) {
          setRightW(state.rightWidth);
        }
        if (!isMobile) {
          if (state.leftCollapsed !== undefined) setLeftCollapsed(state.leftCollapsed);
          if (state.rightCollapsed !== undefined) setRightCollapsed(state.rightCollapsed);
        }
      }
    } catch {
      // Ignore
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Drag resize handlers ─────────────────────────────────────────────────

  const handleDividerMouseDown = useCallback(
    (divider: 'left' | 'right', e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = divider;
      startXRef.current = e.clientX;
      startWidthRef.current = divider === 'left' ? leftW : rightW;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [leftW, rightW],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;

      const delta = e.clientX - startXRef.current;

      if (draggingRef.current === 'left') {
        const newWidth = Math.max(MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, startWidthRef.current + delta));
        setLeftW(newWidth);
      } else {
        const newWidth = Math.max(MIN_RIGHT_WIDTH, Math.min(MAX_RIGHT_WIDTH, startWidthRef.current - delta));
        setRightW(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (draggingRef.current) {
        draggingRef.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // ── Toggle handlers ──────────────────────────────────────────────────────

  const toggleLeft = useCallback(() => {
    const next = !leftCollapsed;
    setLeftCollapsed(next);
    onLeftCollapse?.(next);
  }, [leftCollapsed, onLeftCollapse]);

  const toggleRight = useCallback(() => {
    const next = !rightCollapsed;
    setRightCollapsed(next);
    onRightCollapse?.(next);
  }, [rightCollapsed, onRightCollapse]);

  // ── Computed widths ──────────────────────────────────────────────────────

  const effectiveLeftW = leftCollapsed ? COLLAPSED_WIDTH : leftW;
  const effectiveRightW = rightCollapsed ? COLLAPSED_WIDTH : rightW;

  // ── Mobile Layout ────────────────────────────────────────────────────────

  if (isMobile) {
    return (
      <div className="flex flex-col h-full w-full" style={{ background: 'var(--color-bg-primary)' }}>
        {/* Mobile header with panel toggles */}
        <div
          className="flex items-center justify-between px-2 py-1 border-b"
          style={{ borderColor: 'var(--color-border-secondary)', background: 'var(--color-bg-secondary)' }}
        >
          <button
            onClick={() => setMobilePanel(mobilePanel === 'left' ? 'center' : 'left')}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: mobilePanel === 'left' ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}
            aria-label="Toggle sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <div className="flex items-center gap-1">
            {(['left', 'center', 'right'] as const).map((panel) => (
              <button
                key={panel}
                onClick={() => setMobilePanel(panel)}
                className="px-2 py-0.5 rounded text-xs font-medium transition-colors capitalize"
                style={{
                  background: mobilePanel === panel ? 'var(--color-accent-soft)' : 'transparent',
                  color: mobilePanel === panel ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                }}
              >
                {panel}
              </button>
            ))}
          </div>

          <button
            onClick={() => setMobilePanel(mobilePanel === 'right' ? 'center' : 'right')}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: mobilePanel === 'right' ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}
            aria-label="Toggle trace panel"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
          </button>
        </div>

        {/* Active mobile panel */}
        <div className="flex-1 overflow-hidden">
          {mobilePanel === 'left' && leftPanel}
          {mobilePanel === 'center' && centerPanel}
          {mobilePanel === 'right' && rightPanel}
        </div>
      </div>
    );
  }

  // ── Desktop Layout ───────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full overflow-hidden"
      style={{ background: 'var(--color-bg-primary)' }}
    >
      {/* Left Panel (Sidebar) */}
      <div
        className="flex-shrink-0 h-full overflow-hidden transition-[width] duration-200 ease-out"
        style={{
          width: effectiveLeftW,
          background: 'var(--color-bg-secondary)',
          borderRight: '1px solid var(--color-border-secondary)',
        }}
      >
        {leftCollapsed ? (
          <div className="flex flex-col items-center pt-3 h-full" style={{ background: 'var(--color-bg-secondary)' }}>
            <button
              onClick={toggleLeft}
              className="p-2 rounded-lg transition-colors mb-3"
              style={{ color: 'var(--color-text-tertiary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              aria-label="Expand sidebar"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>
            <div
              className="flex-1 flex items-center justify-center"
              style={{ writingMode: 'vertical-lr' }}
            >
              <span className="text-xs font-medium tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                NAV
              </span>
            </div>
          </div>
        ) : (
          leftPanel
        )}
      </div>

      {/* Left Divider */}
      {!leftCollapsed && (
        <div
          className="flex-shrink-0 cursor-col-resize group relative"
          style={{ width: DIVIDER_WIDTH }}
          onMouseDown={(e) => handleDividerMouseDown('left', e)}
        >
          <div
            className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 transition-colors group-hover:w-1 group-hover:rounded-full"
            style={{
              background: 'var(--color-border-primary)',
            }}
          />
          {/* Hover highlight */}
          <div
            className="absolute inset-y-0 left-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'var(--color-accent-soft)' }}
          />
        </div>
      )}

      {/* Center Panel (Main Content) */}
      <div
        className="flex-1 h-full overflow-hidden min-w-0"
        style={{ minWidth: MIN_CENTER_WIDTH }}
      >
        {centerPanel}
      </div>

      {/* Right Divider */}
      {!rightCollapsed && (
        <div
          className="flex-shrink-0 cursor-col-resize group relative"
          style={{ width: DIVIDER_WIDTH }}
          onMouseDown={(e) => handleDividerMouseDown('right', e)}
        >
          <div
            className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 transition-colors group-hover:w-1 group-hover:rounded-full"
            style={{
              background: 'var(--color-border-primary)',
            }}
          />
          <div
            className="absolute inset-y-0 left-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'var(--color-accent-soft)' }}
          />
        </div>
      )}

      {/* Right Panel (Trace/Context) */}
      <div
        className="flex-shrink-0 h-full overflow-hidden transition-[width] duration-200 ease-out"
        style={{
          width: effectiveRightW,
          background: 'var(--color-bg-primary)',
          borderLeft: rightCollapsed ? '1px solid var(--color-border-secondary)' : 'none',
        }}
      >
        {rightCollapsed ? (
          <div className="flex flex-col items-center pt-3 h-full" style={{ background: 'var(--color-bg-secondary)' }}>
            <button
              onClick={toggleRight}
              className="p-2 rounded-lg transition-colors mb-3"
              style={{ color: 'var(--color-text-tertiary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              aria-label="Expand trace panel"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="15" y1="3" x2="15" y2="21" />
              </svg>
            </button>
            <div
              className="flex-1 flex items-center justify-center"
              style={{ writingMode: 'vertical-lr' }}
            >
              <span className="text-xs font-medium tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                TRACE
              </span>
            </div>
          </div>
        ) : (
          rightPanel
        )}
      </div>
    </div>
  );
};

export default ThreePanelLayout;
