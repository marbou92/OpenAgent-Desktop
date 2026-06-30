/**
 * OpenAgent-Desktop - Appearance Settings View
 *
 * Complete theme customization UI with:
 * - Theme mode toggle (light/dark/system)
 * - Palette selection (6 built-in + custom accent)
 * - Font size slider
 * - Interface density selector
 * - Advanced options (border radius, animation speed)
 */

import React, { useState, useMemo } from 'react';
import { useTheme, ThemeMode, InterfaceDensity } from '../Theme/ThemeProvider';
import { BUILT_IN_PALETTES } from '../Theme/palettes';
import { generatePalette, meetsWCAGAA } from '../Theme/palette-generator';
// Phase 2.4.5: access settings store for sidebar/panel editor.
import { useAppStore } from '../../App';

// ─── Icons ───────────────────────────────────────────────────────────────────

const SunIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const MoonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const MonitorIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);

const PaletteIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
    <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
    <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
    <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontSize: '0.8125rem',
        fontWeight: 600,
        color: 'var(--color-text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: '12px',
      }}
    >
      {children}
    </h3>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--color-bg-secondary)',
        borderRadius: 'var(--border-radius-base, 8px)',
        border: '1px solid var(--color-border)',
        padding: '16px',
        marginBottom: '16px',
      }}
    >
      {children}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AppearanceView() {
  const theme = useTheme();
  // Phase 2.4.5: settings store for sidebar/panel editor.
  const settings = useAppStore(s => s.settings);
  const updateSettings = useAppStore(s => s.updateSettings);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customColorInput, setCustomColorInput] = useState(theme.customAccent || 'var(--color-accent)');

  // Generate preview palette for custom accent
  const customPreviewPalette = useMemo(() => {
    if (!customColorInput) return null;
    try {
      return generatePalette(customColorInput);
    } catch {
      return null;
    }
  }, [customColorInput]);

  const contrastOk = useMemo(() => {
    if (!customPreviewPalette) return false;
    const darkColors = customPreviewPalette.colors.dark;
    return meetsWCAGAA(darkColors.foreground, darkColors.background);
  }, [customPreviewPalette]);

  // ─── Theme Mode Section ──────────────────────────────────────────

  const modeOptions: { id: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { id: 'light', label: 'Light', icon: <SunIcon /> },
    { id: 'dark', label: 'Dark', icon: <MoonIcon /> },
    { id: 'system', label: 'System', icon: <MonitorIcon /> },
  ];

  // ─── Density options ─────────────────────────────────────────────

  const densityOptions: { id: InterfaceDensity; label: string; description: string }[] = [
    { id: 'compact', label: 'Compact', description: 'Tighter spacing' },
    { id: 'comfortable', label: 'Comfortable', description: 'Balanced spacing' },
    { id: 'spacious', label: 'Spacious', description: 'Generous spacing' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {/* ─── Theme Mode ──────────────────────────────────────────────── */}
      <SectionTitle>Theme Mode</SectionTitle>
      <SectionCard>
        <div style={{ display: 'flex', gap: '8px' }}>
          {modeOptions.map((opt) => {
            const isActive = theme.mode === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => theme.setMode(opt.id)}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 8px',
                  borderRadius: 'var(--border-radius-base, 8px)',
                  border: `2px solid ${isActive ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  background: isActive ? 'var(--color-accent-muted)' : 'var(--color-bg-tertiary)',
                  color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  outline: 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = 'var(--color-border-hover)';
                    e.currentTarget.style.background = 'var(--color-bg-hover)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                    e.currentTarget.style.background = 'var(--color-bg-tertiary)';
                  }
                }}
              >
                {opt.icon}
                <span style={{ fontSize: '0.8125rem', fontWeight: isActive ? 600 : 400 }}>
                  {opt.label}
                </span>
                {isActive && (
                  <span
                    style={{
                      width: '4px',
                      height: '4px',
                      borderRadius: '50%',
                      background: 'var(--color-accent)',
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
        {theme.mode === 'system' && (
          <div
            style={{
              marginTop: '8px',
              padding: '8px 12px',
              borderRadius: '6px',
              background: 'var(--color-accent-muted)',
              color: 'var(--color-accent)',
              fontSize: '0.75rem',
            }}
          >
            Currently using: <strong>{theme.resolvedMode}</strong> mode
            (based on your system preference)
          </div>
        )}
      </SectionCard>

      {/* ─── Sidebar Editor (Phase 2.4.5) ──────────────────────────────── */}
      <SectionTitle>Sidebar & Panels</SectionTitle>
      <SectionCard>
        {/* Right panel tabs */}
        <div className="text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
          Right panel tabs
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {(['trace', 'context', 'notes', 'todo'] as const).map((tab) => {
            const enabled = settings.rightPanelTabs?.includes(tab) ?? true;
            return (
              <label key={tab} className="flex items-center gap-1.5 text-[12px] cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => {
                    const current = settings.rightPanelTabs ?? ['trace', 'context', 'notes', 'todo'];
                    const next = e.target.checked
                      ? [...current, tab]
                      : current.filter(t => t !== tab);
                    updateSettings({ rightPanelTabs: next });
                  }}
                  className="cursor-pointer"
                />
                <span style={{ textTransform: 'capitalize' }}>{tab}</span>
              </label>
            );
          })}
        </div>

        {/* Left sidebar nav items */}
        <div className="text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
          Left sidebar items (Classic layout)
        </div>
        <div className="flex flex-wrap gap-2">
          {(['chat', 'sessions', 'settings', 'extensions', 'recipes', 'hooks', 'sandbox', 'projects', 'skills'] as const).map((item) => {
            const enabled = settings.sidebarItems?.includes(item) ?? true;
            return (
              <label key={item} className="flex items-center gap-1.5 text-[12px] cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => {
                    const current = settings.sidebarItems ?? ['chat', 'sessions', 'settings', 'extensions', 'recipes', 'hooks', 'sandbox', 'projects', 'skills'];
                    const next = e.target.checked
                      ? [...current, item]
                      : current.filter(t => t !== item);
                    updateSettings({ sidebarItems: next });
                  }}
                  className="cursor-pointer"
                />
                <span style={{ textTransform: 'capitalize' }}>{item}</span>
              </label>
            );
          })}
        </div>
        <p className="text-[11px] mt-2" style={{ color: 'var(--color-text-muted)' }}>
          Hidden items are completely invisible. Restart the app for changes to take effect.
        </p>
      </SectionCard>

      {/* ─── Color Palette ───────────────────────────────────────────── */}
      <SectionTitle>Color Palette</SectionTitle>
      <SectionCard>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '10px',
          }}
        >
          {BUILT_IN_PALETTES.map((p) => {
            const isActive = !theme.customAccent && theme.palette.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => {
                  theme.setPalette(p.id);
                  setCustomColorInput(p.accent);
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '12px 8px',
                  borderRadius: 'var(--border-radius-base, 8px)',
                  border: `2px solid ${isActive ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  background: isActive ? 'var(--color-accent-muted)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  outline: 'none',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = 'var(--color-border-hover)';
                    e.currentTarget.style.background = 'var(--color-bg-tertiary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                {/* Palette swatch circle */}
                <div style={{ position: 'relative' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: p.accent,
                      border: `2px solid ${isActive ? 'var(--color-accent)' : 'transparent'}`,
                      boxShadow: isActive
                        ? `0 0 0 3px var(--color-accent-muted)`
                        : 'none',
                    }}
                  />
                  {isActive && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <CheckIcon />
                    </div>
                  )}
                </div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                    textAlign: 'center',
                    lineHeight: 1.2,
                  }}
                >
                  {p.name}
                </span>
                <span
                  style={{
                    fontSize: '0.625rem',
                    color: 'var(--color-text-tertiary)',
                    textAlign: 'center',
                    lineHeight: 1.2,
                  }}
                >
                  {p.description}
                </span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      {/* ─── Custom Accent Color ─────────────────────────────────────── */}
      <SectionTitle>Custom Accent Color</SectionTitle>
      <SectionCard>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Color picker */}
            <div style={{ position: 'relative' }}>
              <input
                type="color"
                value={customColorInput}
                onChange={(e) => {
                  setCustomColorInput(e.target.value);
                  theme.setCustomAccent(e.target.value);
                }}
                style={{
                  width: '40px',
                  height: '40px',
                  border: '2px solid var(--color-border)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  padding: '2px',
                  background: 'var(--color-bg-tertiary)',
                }}
              />
            </div>

            {/* Hex input */}
            <div style={{ flex: 1 }}>
              <input
                type="text"
                value={customColorInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomColorInput(val);
                  if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                    theme.setCustomAccent(val);
                  }
                }}
                placeholder="var(--color-accent)"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-input)',
                  color: 'var(--color-foreground)',
                  fontSize: '0.875rem',
                  fontFamily: 'monospace',
                  outline: 'none',
                }}
              />
            </div>

            {/* Reset button */}
            {theme.customAccent && (
              <button
                onClick={() => {
                  theme.setCustomAccent(null);
                  setCustomColorInput(theme.palette.accent);
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-tertiary)',
                  color: 'var(--color-text-secondary)',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Reset
              </button>
            )}
          </div>

          {/* Palette preview */}
          {customPreviewPalette && theme.customAccent && (
            <div
              style={{
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-tertiary)',
              }}
            >
              <div
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--color-text-secondary)',
                  marginBottom: '8px',
                  fontWeight: 500,
                }}
              >
                Auto-generated palette preview
              </div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {(() => {
                  const colors = theme.resolvedMode === 'dark'
                    ? customPreviewPalette.colors.dark
                    : customPreviewPalette.colors.light;
                  const swatches = [
                    { label: 'BG', color: colors.background },
                    { label: 'BG2', color: colors.backgroundSecondary },
                    { label: 'FG', color: colors.foreground },
                    { label: 'FG2', color: colors.foregroundSecondary },
                    { label: 'Acc', color: colors.accent },
                    { label: 'Brd', color: colors.border },
                    { label: 'Crd', color: colors.card },
                  ];
                  return swatches.map((s, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '2px',
                      }}
                    >
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '6px',
                          background: s.color,
                          border: '1px solid var(--color-border)',
                        }}
                      />
                      <span
                        style={{
                          fontSize: '0.5625rem',
                          color: 'var(--color-text-tertiary)',
                        }}
                      >
                        {s.label}
                      </span>
                    </div>
                  ));
                })()}
              </div>
              {contrastOk && (
                <div
                  style={{
                    marginTop: '8px',
                    fontSize: '0.6875rem',
                    color: 'var(--color-success)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  WCAG AA contrast check passed
                </div>
              )}
              {!contrastOk && (
                <div
                  style={{
                    marginTop: '8px',
                    fontSize: '0.6875rem',
                    color: 'var(--color-warning)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  Contrast may not meet WCAG AA standards
                </div>
              )}
            </div>
          )}
        </div>
      </SectionCard>

      {/* ─── Font Size ───────────────────────────────────────────────── */}
      <SectionTitle>Font Size</SectionTitle>
      <SectionCard>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>A</span>
            <input
              type="range"
              min={12}
              max={20}
              step={1}
              value={theme.fontSize}
              onChange={(e) => theme.setFontSize(parseInt(e.target.value, 10))}
              style={{
                flex: 1,
                accentColor: 'var(--color-accent)',
                height: '4px',
                cursor: 'pointer',
              }}
            />
            <span style={{ fontSize: '18px', color: 'var(--color-text-tertiary)' }}>A</span>
            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--color-accent)',
                fontWeight: 600,
                minWidth: '36px',
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {theme.fontSize}px
            </span>
          </div>
          {/* Preview text */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '6px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-tertiary)',
            }}
          >
            <p style={{ color: 'var(--color-foreground)', lineHeight: 1.5 }}>
              The quick brown fox jumps over the lazy dog.
            </p>
            <p
              style={{
                color: 'var(--color-foreground-secondary)',
                fontSize: '0.875em',
                marginTop: '4px',
                lineHeight: 1.5,
              }}
            >
              0123456789 — Preview text at your chosen size
            </p>
          </div>
        </div>
      </SectionCard>

      {/* ─── Interface Density ───────────────────────────────────────── */}
      <SectionTitle>Interface Density</SectionTitle>
      <SectionCard>
        <div style={{ display: 'flex', gap: '8px' }}>
          {densityOptions.map((opt) => {
            const isActive = theme.density === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => theme.setDensity(opt.id)}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '10px 8px',
                  borderRadius: 'var(--border-radius-base, 8px)',
                  border: `2px solid ${isActive ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  background: isActive ? 'var(--color-accent-muted)' : 'transparent',
                  color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  outline: 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = 'var(--color-border-hover)';
                    e.currentTarget.style.background = 'var(--color-bg-tertiary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <span style={{ fontSize: '0.8125rem', fontWeight: isActive ? 600 : 400 }}>
                  {opt.label}
                </span>
                <span style={{ fontSize: '0.6875rem', opacity: 0.7 }}>
                  {opt.description}
                </span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      {/* ─── Advanced Settings ───────────────────────────────────────── */}
      <SectionTitle>Advanced</SectionTitle>
      <div
        style={{
          borderRadius: 'var(--border-radius-base, 8px)',
          border: '1px solid var(--color-border)',
          overflow: 'hidden',
          marginBottom: '16px',
        }}
      >
        {/* Accordion trigger */}
        <button
          onClick={() => setAdvancedOpen(!advancedOpen)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            background: 'var(--color-bg-secondary)',
            border: 'none',
            color: 'var(--color-foreground)',
            cursor: 'pointer',
            fontSize: '0.8125rem',
            fontWeight: 500,
            outline: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PaletteIcon />
            <span>Advanced Customization</span>
          </div>
          <div
            style={{
              transform: advancedOpen ? 'rotate(180deg)' : 'rotate(0)',
              transition: 'transform 0.15s ease',
              color: 'var(--color-text-tertiary)',
            }}
          >
            <ChevronDownIcon />
          </div>
        </button>

        {/* Accordion content */}
        {advancedOpen && (
          <div
            style={{
              padding: '16px',
              background: 'var(--color-bg-tertiary)',
              borderTop: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {/* Border Radius */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '6px',
                }}
              >
                <label
                  style={{
                    fontSize: '0.8125rem',
                    color: 'var(--color-foreground)',
                    fontWeight: 500,
                  }}
                >
                  Border Radius
                </label>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-accent)',
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {theme.borderRadius}px
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={16}
                step={1}
                value={theme.borderRadius}
                onChange={(e) => theme.setBorderRadius(parseInt(e.target.value, 10))}
                style={{
                  width: '100%',
                  accentColor: 'var(--color-accent)',
                  height: '4px',
                  cursor: 'pointer',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>Sharp</span>
                <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>Round</span>
              </div>
              {/* Preview */}
              <div
                style={{
                  marginTop: '8px',
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '24px',
                    borderRadius: `${theme.borderRadius}px`,
                    background: 'var(--color-accent)',
                  }}
                />
                <div
                  style={{
                    width: '40px',
                    height: '24px',
                    borderRadius: `${theme.borderRadius}px`,
                    border: '2px solid var(--color-border)',
                  }}
                />
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: `${theme.borderRadius}px`,
                    background: 'var(--color-accent-muted)',
                    border: '1px solid var(--color-accent)',
                  }}
                />
              </div>
            </div>

            {/* Animation Speed */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '6px',
                }}
              >
                <label
                  style={{
                    fontSize: '0.8125rem',
                    color: 'var(--color-foreground)',
                    fontWeight: 500,
                  }}
                >
                  Animation Speed
                </label>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-accent)',
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {theme.animationSpeed}x
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={2}
                step={0.25}
                value={theme.animationSpeed}
                onChange={(e) => theme.setAnimationSpeed(parseFloat(e.target.value))}
                style={{
                  width: '100%',
                  accentColor: 'var(--color-accent)',
                  height: '4px',
                  cursor: 'pointer',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>No animations</span>
                <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>Fast</span>
              </div>
            </div>

            {/* Reset to defaults */}
            <div
              style={{
                paddingTop: '8px',
                borderTop: '1px solid var(--color-border)',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                onClick={() => {
                  theme.setMode('dark');
                  theme.setPalette('violet');
                  theme.setCustomAccent(null);
                  theme.setFontSize(14);
                  theme.setDensity('comfortable');
                  theme.setBorderRadius(8);
                  theme.setAnimationSpeed(1);
                  setCustomColorInput('var(--color-accent)');
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-destructive)',
                  background: 'transparent',
                  color: 'var(--color-destructive)',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--color-destructive)';
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--color-destructive)';
                }}
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
