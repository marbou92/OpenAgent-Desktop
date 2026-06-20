/**
 * OpenAgent-Desktop - Theme Provider
 *
 * Central theme management with React context. Handles:
 * - Light/dark/system mode detection
 * - Palette selection and custom accent colors
 * - CSS variable application to document root
 * - Persistence to localStorage
 * - Sync with main process via IPC
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { ThemePalette, BUILT_IN_PALETTES } from './palettes';
import { generatePalette } from './palette-generator';

export type ThemeMode = 'light' | 'dark' | 'system';
export type InterfaceDensity = 'compact' | 'comfortable' | 'spacious';

export interface ThemeContextValue {
  mode: ThemeMode;
  resolvedMode: 'light' | 'dark';
  palette: ThemePalette;
  customAccent: string | null;
  fontSize: number;
  density: InterfaceDensity;
  borderRadius: number;
  animationSpeed: number;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  setPalette: (paletteId: string) => void;
  setCustomAccent: (color: string | null) => void;
  setFontSize: (size: number) => void;
  setDensity: (density: InterfaceDensity) => void;
  setBorderRadius: (radius: number) => void;
  setAnimationSpeed: (speed: number) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// ─── Local Storage Keys ──────────────────────────────────────────────────────

const STORAGE_KEYS = {
  mode: 'openagent-theme-mode',
  paletteId: 'openagent-theme-palette',
  customAccent: 'openagent-theme-custom-accent',
  fontSize: 'openagent-theme-font-size',
  density: 'openagent-theme-density',
  borderRadius: 'openagent-theme-border-radius',
  animationSpeed: 'openagent-theme-animation-speed',
} as const;

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_FONT_SIZE = 14;
const DEFAULT_DENSITY: InterfaceDensity = 'comfortable';
const DEFAULT_BORDER_RADIUS = 8;
const DEFAULT_ANIMATION_SPEED = 1;

// ─── Helper: Resolve system preference ───────────────────────────────────────

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// ─── Helper: Apply CSS variables ─────────────────────────────────────────────

function applyCSSTokens(palette: ThemePalette, resolvedMode: 'light' | 'dark') {
  const root = document.documentElement;
  const colors = resolvedMode === 'dark' ? palette.colors.dark : palette.colors.light;

  // Map palette colors to CSS custom properties
  const tokenMap: Record<string, string> = {
    '--color-background': colors.background,
    '--color-background-secondary': colors.backgroundSecondary,
    '--color-background-tertiary': colors.backgroundTertiary,
    '--color-foreground': colors.foreground,
    '--color-foreground-secondary': colors.foregroundSecondary,
    '--color-foreground-muted': colors.foregroundMuted,
    '--color-accent': colors.accent,
    '--color-accent-hover': colors.accentHover,
    '--color-accent-muted': colors.accentMuted,
    '--color-border': colors.border,
    '--color-border-hover': colors.borderHover,
    '--color-card': colors.card,
    '--color-card-hover': colors.cardHover,
    '--color-input': colors.input,
    '--color-destructive': colors.destructive,
    '--color-destructive-hover': colors.destructiveHover,
    '--color-success': colors.success,
    '--color-warning': colors.warning,
    '--color-error': colors.error,
    '--color-info': colors.info,

    // Legacy variable mapping for existing code
    '--color-bg-primary': colors.background,
    '--color-bg-secondary': colors.backgroundSecondary,
    '--color-bg-tertiary': colors.backgroundTertiary,
    '--color-bg-elevated': colors.card,
    '--color-bg-hover': colors.borderHover,
    '--color-bg-active': colors.accentMuted,
    '--color-text-primary': colors.foreground,
    '--color-text-secondary': colors.foregroundSecondary,
    '--color-text-tertiary': colors.foregroundMuted,
    '--color-text-muted': colors.foregroundMuted,
    '--color-border-primary': colors.border,
    '--color-border-secondary': colors.backgroundTertiary,
    '--color-border-focus': colors.accent,
    '--color-accent-soft': colors.accentMuted,

    // Phase 6: Trace colors + shadows (not palette-dependent but need to be set
    // here because applyCSSTokens overrides ALL CSS variables at runtime)
    '--color-trace-thinking': resolvedMode === 'dark' ? '#c490d1' : '#9d70b8',
    '--color-trace-action': resolvedMode === 'dark' ? '#6b8caf' : '#4a7ca8',
    '--color-trace-tool-call': colors.success,
    '--color-trace-tool-result': colors.warning,
    '--color-trace-error': colors.error,
    '--color-trace-info': colors.foregroundMuted,

    // Shadows — warm-tinted
    '--shadow-soft': resolvedMode === 'dark'
      ? '0 1px 4px rgba(0, 0, 0, 0.24)'
      : '0 1px 4px rgba(0, 0, 0, 0.04)',
    '--shadow-card': resolvedMode === 'dark'
      ? '0 1px 2px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(255, 245, 232, 0.03)'
      : '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
    '--shadow-elevated': resolvedMode === 'dark'
      ? '0 8px 24px rgba(0, 0, 0, 0.34), 0 0 0 1px rgba(255, 245, 232, 0.04)'
      : '0 4px 12px rgba(0, 0, 0, 0.1)',
    '--shadow-popover': resolvedMode === 'dark'
      ? '0 8px 16px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(255, 245, 232, 0.04)'
      : '0 4px 12px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)',

    // Radius scale
    '--radius-sm': '6px',
    '--radius-md': '8px',
    '--radius-lg': '10px',
    '--radius-xl': '14px',
    '--radius-2xl': '16px',
  };

  Object.entries(tokenMap).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

// ─── Provider Component ──────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initialize from localStorage or defaults
  const [mode, setModeState] = useState<ThemeMode>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEYS.mode) as ThemeMode) || 'dark';
    } catch {
      return 'dark';
    }
  });

  const [paletteId, setPaletteId] = useState<string>(() => {
    try {
      // Phase 6: Default to 'warm' palette. If the user previously selected
      // 'violet' (the old default), migrate them to 'warm' automatically.
      const stored = localStorage.getItem(STORAGE_KEYS.paletteId);
      if (!stored || stored === 'violet') return 'warm';
      return stored;
    } catch {
      return 'warm';
    }
  });

  const [customAccent, setCustomAccentState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.customAccent);
    } catch {
      return null;
    }
  });

  const [fontSize, setFontSizeState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.fontSize);
      return saved ? parseInt(saved, 10) : DEFAULT_FONT_SIZE;
    } catch {
      return DEFAULT_FONT_SIZE;
    }
  });

  const [density, setDensityState] = useState<InterfaceDensity>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEYS.density) as InterfaceDensity) || DEFAULT_DENSITY;
    } catch {
      return DEFAULT_DENSITY;
    }
  });

  const [borderRadius, setBorderRadiusState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.borderRadius);
      return saved ? parseInt(saved, 10) : DEFAULT_BORDER_RADIUS;
    } catch {
      return DEFAULT_BORDER_RADIUS;
    }
  });

  const [animationSpeed, setAnimationSpeedState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.animationSpeed);
      return saved ? parseFloat(saved) : DEFAULT_ANIMATION_SPEED;
    } catch {
      return DEFAULT_ANIMATION_SPEED;
    }
  });

  // Resolve the actual theme mode (system -> light/dark)
  const resolvedMode = useMemo(() => {
    if (mode === 'system') return getSystemTheme();
    return mode;
  }, [mode]);

  // Resolve the active palette
  const palette = useMemo<ThemePalette>(() => {
    if (customAccent) {
      return generatePalette(customAccent);
    }
    const found = BUILT_IN_PALETTES.find((p) => p.id === paletteId);
    return found || BUILT_IN_PALETTES[0];
  }, [paletteId, customAccent]);

  // ─── Apply theme to DOM ──────────────────────────────────────────────

  useEffect(() => {
    const root = document.documentElement;

    // Set data-theme attribute
    root.setAttribute('data-theme', resolvedMode);

    // Apply CSS variables
    applyCSSTokens(palette, resolvedMode);

    // Apply font size
    root.style.setProperty('--font-size-base', `${fontSize}px`);
    root.style.fontSize = `${fontSize}px`;

    // Apply density spacing
    const densitySpacing =
      density === 'compact'
        ? '0.5'
        : density === 'spacious'
          ? '1.5'
          : '1';
    root.style.setProperty('--density-scale', densitySpacing);

    // Apply border radius
    root.style.setProperty('--border-radius-base', `${borderRadius}px`);

    // Apply animation speed
    root.style.setProperty('--animation-speed', `${animationSpeed}`);

    // Set color-scheme for native element styling
    root.style.setProperty('color-scheme', resolvedMode);
  }, [resolvedMode, palette, fontSize, density, borderRadius, animationSpeed]);

  // ─── Listen for system theme changes ─────────────────────────────────

  useEffect(() => {
    if (mode !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      // Force re-render by toggling mode
      setModeState('system');
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [mode]);

  // ─── Sync with main process ──────────────────────────────────────────

  useEffect(() => {
    try {
      const api = (window as any).openagent;
      if (api?.app?.updateConfig) {
        api.app.updateConfig({
          theme: mode,
          paletteId,
          customAccent,
          fontSize,
          density,
          borderRadius,
          animationSpeed,
        });
      }
    } catch {
      // Main process not available (e.g. in browser dev)
    }
  }, [mode, paletteId, customAccent, fontSize, density, borderRadius, animationSpeed]);

  // ─── Setter functions ────────────────────────────────────────────────

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem(STORAGE_KEYS.mode, newMode);
    } catch { /* ignore */ }
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === 'dark' ? 'light' : mode === 'light' ? 'dark' : 'dark');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const setPalette = useCallback((id: string) => {
    setPaletteId(id);
    // Clear custom accent when selecting a built-in palette
    setCustomAccentState(null);
    try {
      localStorage.setItem(STORAGE_KEYS.paletteId, id);
      localStorage.removeItem(STORAGE_KEYS.customAccent);
    } catch { /* ignore */ }
  }, []);

  const setCustomAccent = useCallback((color: string | null) => {
    setCustomAccentState(color);
    if (color) {
      try {
        localStorage.setItem(STORAGE_KEYS.customAccent, color);
      } catch { /* ignore */ }
    } else {
      try {
        localStorage.removeItem(STORAGE_KEYS.customAccent);
      } catch { /* ignore */ }
    }
  }, []);

  const setFontSize = useCallback((size: number) => {
    setFontSizeState(size);
    try {
      localStorage.setItem(STORAGE_KEYS.fontSize, size.toString());
    } catch { /* ignore */ }
  }, []);

  const setDensity = useCallback((newDensity: InterfaceDensity) => {
    setDensityState(newDensity);
    try {
      localStorage.setItem(STORAGE_KEYS.density, newDensity);
    } catch { /* ignore */ }
  }, []);

  const setBorderRadius = useCallback((radius: number) => {
    setBorderRadiusState(radius);
    try {
      localStorage.setItem(STORAGE_KEYS.borderRadius, radius.toString());
    } catch { /* ignore */ }
  }, []);

  const setAnimationSpeed = useCallback((speed: number) => {
    setAnimationSpeedState(speed);
    try {
      localStorage.setItem(STORAGE_KEYS.animationSpeed, speed.toString());
    } catch { /* ignore */ }
  }, []);

  // ─── Context value ───────────────────────────────────────────────────

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolvedMode,
      palette,
      customAccent,
      fontSize,
      density,
      borderRadius,
      animationSpeed,
      setMode,
      toggleMode,
      setPalette,
      setCustomAccent,
      setFontSize,
      setDensity,
      setBorderRadius,
      setAnimationSpeed,
    }),
    [
      mode, resolvedMode, palette, customAccent, fontSize, density,
      borderRadius, animationSpeed, setMode, toggleMode, setPalette,
      setCustomAccent, setFontSize, setDensity, setBorderRadius, setAnimationSpeed,
    ]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
