/**
 * OpenAgent-Desktop - Theme Palettes
 *
 * Defines the ThemePalette type system and 6 built-in color palettes.
 * Each palette provides complete dark and light mode color sets
 * with WCAG AA contrast compliance.
 */

export interface ThemePalette {
  id: string;
  name: string;
  accent: string;
  description: string;
  colors: {
    dark: {
      background: string;
      backgroundSecondary: string;
      backgroundTertiary: string;
      foreground: string;
      foregroundSecondary: string;
      foregroundMuted: string;
      accent: string;
      accentHover: string;
      accentMuted: string;
      border: string;
      borderHover: string;
      card: string;
      cardHover: string;
      input: string;
      destructive: string;
      destructiveHover: string;
      success: string;
      warning: string;
      error: string;
      info: string;
    };
    light: {
      background: string;
      backgroundSecondary: string;
      backgroundTertiary: string;
      foreground: string;
      foregroundSecondary: string;
      foregroundMuted: string;
      accent: string;
      accentHover: string;
      accentMuted: string;
      border: string;
      borderHover: string;
      card: string;
      cardHover: string;
      input: string;
      destructive: string;
      destructiveHover: string;
      success: string;
      warning: string;
      error: string;
      info: string;
    };
  };
}

export const BUILT_IN_PALETTES: ThemePalette[] = [
  {
    id: 'warm',
    name: 'Warm (Default)',
    accent: '#d67a52',
    description: 'Claude-inspired warm neutral palette with terracotta accent',
    colors: {
      dark: {
        background: '#171614',
        backgroundSecondary: '#1d1b18',
        backgroundTertiary: '#22201d',
        foreground: '#f1ece4',
        foregroundSecondary: '#b6ada2',
        foregroundMuted: '#8c8378',
        accent: '#d67a52',
        accentHover: '#c56c46',
        accentMuted: 'rgba(214,122,82,0.14)',
        border: '#34302a',
        borderHover: '#4a443c',
        card: '#22201d',
        cardHover: '#2a2723',
        input: '#22201d',
        destructive: '#ef4444',
        destructiveHover: '#dc2626',
        success: '#22c55e',
        warning: '#eab308',
        error: '#ef4444',
        info: '#6b8caf',
      },
      light: {
        background: '#f5f3ed',
        backgroundSecondary: '#f0eee8',
        backgroundTertiary: '#faf9f4',
        foreground: '#1a1a1a',
        foregroundSecondary: '#5c5c5c',
        foregroundMuted: '#8c8c8c',
        accent: '#d97757',
        accentHover: '#c46849',
        accentMuted: '#fef3ee',
        border: '#e2dfd9',
        borderHover: '#d4d0c8',
        card: '#faf9f4',
        cardHover: '#f5f3ed',
        input: '#faf9f4',
        destructive: '#dc2626',
        destructiveHover: '#b91c1c',
        success: '#16a34a',
        warning: '#ca8a04',
        error: '#dc2626',
        info: '#2563eb',
      },
    },
  },
  {
    id: 'violet',
    name: 'Violet',
    accent: '#8b5cf6',
    description: 'The original purple accent',
    colors: {
      dark: {
        background: '#0a0a0f',
        backgroundSecondary: '#111118',
        backgroundTertiary: '#1a1a24',
        foreground: '#f0f0f5',
        foregroundSecondary: '#a0a0b0',
        foregroundMuted: '#6a6a7a',
        accent: '#8b5cf6',
        accentHover: '#7c3eed',
        accentMuted: 'rgba(139,92,246,0.15)',
        border: '#2a2a38',
        borderHover: '#3a3a4a',
        card: '#15151f',
        cardHover: '#1a1a28',
        input: '#1e1e2e',
        destructive: '#ef4444',
        destructiveHover: '#dc2626',
        success: '#22c55e',
        warning: '#f59e0b',
        error: '#ef4444',
        info: '#3b82f6',
      },
      light: {
        background: '#ffffff',
        backgroundSecondary: '#f8f9fa',
        backgroundTertiary: '#f0f1f3',
        foreground: '#1a1a2e',
        foregroundSecondary: '#4a4a5e',
        foregroundMuted: '#7a7a8e',
        accent: '#7c3aed',
        accentHover: '#6d28d9',
        accentMuted: 'rgba(124,58,237,0.1)',
        border: '#e2e4e8',
        borderHover: '#c8ccd0',
        card: '#ffffff',
        cardHover: '#f8f9fa',
        input: '#f0f1f3',
        destructive: '#dc2626',
        destructiveHover: '#b91c1c',
        success: '#16a34a',
        warning: '#d97706',
        error: '#dc2626',
        info: '#2563eb',
      },
    },
  },
  {
    id: 'oceanBlue',
    name: 'Ocean Blue',
    accent: '#3b82f6',
    description: 'Calm and professional blue tones',
    colors: {
      dark: {
        background: '#0a0e14',
        backgroundSecondary: '#0f1520',
        backgroundTertiary: '#161e2e',
        foreground: '#e8edf5',
        foregroundSecondary: '#8e9bb0',
        foregroundMuted: '#5a6a80',
        accent: '#3b82f6',
        accentHover: '#2563eb',
        accentMuted: 'rgba(59,130,246,0.15)',
        border: '#1e2a3a',
        borderHover: '#2a3a4e',
        card: '#111a28',
        cardHover: '#152030',
        input: '#141e2e',
        destructive: '#ef4444',
        destructiveHover: '#dc2626',
        success: '#22c55e',
        warning: '#f59e0b',
        error: '#ef4444',
        info: '#60a5fa',
      },
      light: {
        background: '#ffffff',
        backgroundSecondary: '#f5f8fc',
        backgroundTertiary: '#edf1f7',
        foreground: '#0f172a',
        foregroundSecondary: '#3b4f6b',
        foregroundMuted: '#6b7d96',
        accent: '#2563eb',
        accentHover: '#1d4ed8',
        accentMuted: 'rgba(37,99,235,0.1)',
        border: '#dce3ed',
        borderHover: '#bcc8d8',
        card: '#ffffff',
        cardHover: '#f5f8fc',
        input: '#edf1f7',
        destructive: '#dc2626',
        destructiveHover: '#b91c1c',
        success: '#16a34a',
        warning: '#d97706',
        error: '#dc2626',
        info: '#3b82f6',
      },
    },
  },
  {
    id: 'emerald',
    name: 'Emerald',
    accent: '#10b981',
    description: 'Fresh and natural green accent',
    colors: {
      dark: {
        background: '#0a0f0d',
        backgroundSecondary: '#101814',
        backgroundTertiary: '#182420',
        foreground: '#e5f0ea',
        foregroundSecondary: '#8eaa9a',
        foregroundMuted: '#5a7568',
        accent: '#10b981',
        accentHover: '#059669',
        accentMuted: 'rgba(16,185,129,0.15)',
        border: '#1e2e26',
        borderHover: '#2a3e32',
        card: '#121e18',
        cardHover: '#162820',
        input: '#142018',
        destructive: '#ef4444',
        destructiveHover: '#dc2626',
        success: '#34d399',
        warning: '#f59e0b',
        error: '#ef4444',
        info: '#3b82f6',
      },
      light: {
        background: '#ffffff',
        backgroundSecondary: '#f3faf6',
        backgroundTertiary: '#e8f4ee',
        foreground: '#0a2e1c',
        foregroundSecondary: '#2d5a42',
        foregroundMuted: '#5e8a72',
        accent: '#059669',
        accentHover: '#047857',
        accentMuted: 'rgba(5,150,105,0.1)',
        border: '#d2e8dc',
        borderHover: '#b0d4c0',
        card: '#ffffff',
        cardHover: '#f3faf6',
        input: '#e8f4ee',
        destructive: '#dc2626',
        destructiveHover: '#b91c1c',
        success: '#16a34a',
        warning: '#d97706',
        error: '#dc2626',
        info: '#2563eb',
      },
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    accent: '#f59e0b',
    description: 'Warm amber and golden tones',
    colors: {
      dark: {
        background: '#0f0c08',
        backgroundSecondary: '#181410',
        backgroundTertiary: '#221e16',
        foreground: '#f5f0e5',
        foregroundSecondary: '#b0a48e',
        foregroundMuted: '#7a6e58',
        accent: '#f59e0b',
        accentHover: '#d97706',
        accentMuted: 'rgba(245,158,11,0.15)',
        border: '#2e2820',
        borderHover: '#3e3628',
        card: '#1a1610',
        cardHover: '#201c14',
        input: '#1e1a14',
        destructive: '#ef4444',
        destructiveHover: '#dc2626',
        success: '#22c55e',
        warning: '#fbbf24',
        error: '#ef4444',
        info: '#3b82f6',
      },
      light: {
        background: '#ffffff',
        backgroundSecondary: '#fdf9f0',
        backgroundTertiary: '#f8f2e5',
        foreground: '#2e1f08',
        foregroundSecondary: '#5e4a28',
        foregroundMuted: '#8a7654',
        accent: '#d97706',
        accentHover: '#b45309',
        accentMuted: 'rgba(217,119,6,0.1)',
        border: '#e8ddc8',
        borderHover: '#d0c0a0',
        card: '#ffffff',
        cardHover: '#fdf9f0',
        input: '#f8f2e5',
        destructive: '#dc2626',
        destructiveHover: '#b91c1c',
        success: '#16a34a',
        warning: '#ca8a04',
        error: '#dc2626',
        info: '#2563eb',
      },
    },
  },
  {
    id: 'rose',
    name: 'Rose',
    accent: '#ec4899',
    description: 'Vibrant and playful pink accent',
    colors: {
      dark: {
        background: '#0f0a0d',
        backgroundSecondary: '#181016',
        backgroundTertiary: '#22181e',
        foreground: '#f5e8ef',
        foregroundSecondary: '#b08e9e',
        foregroundMuted: '#7a5a6e',
        accent: '#ec4899',
        accentHover: '#db2777',
        accentMuted: 'rgba(236,72,153,0.15)',
        border: '#2e1e28',
        borderHover: '#3e2836',
        card: '#1a1018',
        cardHover: '#201420',
        input: '#1e1420',
        destructive: '#ef4444',
        destructiveHover: '#dc2626',
        success: '#22c55e',
        warning: '#f59e0b',
        error: '#ef4444',
        info: '#3b82f6',
      },
      light: {
        background: '#ffffff',
        backgroundSecondary: '#fdf2f7',
        backgroundTertiary: '#fce7f3',
        foreground: '#2e0818',
        foregroundSecondary: '#5e2844',
        foregroundMuted: '#8a546e',
        accent: '#db2777',
        accentHover: '#be185d',
        accentMuted: 'rgba(219,39,119,0.1)',
        border: '#f0d0e0',
        borderHover: '#e0aec8',
        card: '#ffffff',
        cardHover: '#fdf2f7',
        input: '#fce7f3',
        destructive: '#dc2626',
        destructiveHover: '#b91c1c',
        success: '#16a34a',
        warning: '#d97706',
        error: '#dc2626',
        info: '#2563eb',
      },
    },
  },
  {
    id: 'slate',
    name: 'Slate',
    accent: '#64748b',
    description: 'Minimal and neutral professional tones',
    colors: {
      dark: {
        background: '#0c0c10',
        backgroundSecondary: '#13131a',
        backgroundTertiary: '#1a1a24',
        foreground: '#e8e8f0',
        foregroundSecondary: '#9090a4',
        foregroundMuted: '#5c5c70',
        accent: '#64748b',
        accentHover: '#475569',
        accentMuted: 'rgba(100,116,139,0.15)',
        border: '#242430',
        borderHover: '#34343e',
        card: '#16161e',
        cardHover: '#1c1c26',
        input: '#1a1a24',
        destructive: '#ef4444',
        destructiveHover: '#dc2626',
        success: '#22c55e',
        warning: '#f59e0b',
        error: '#ef4444',
        info: '#3b82f6',
      },
      light: {
        background: '#ffffff',
        backgroundSecondary: '#f8fafc',
        backgroundTertiary: '#f1f5f9',
        foreground: '#0f172a',
        foregroundSecondary: '#334155',
        foregroundMuted: '#64748b',
        accent: '#475569',
        accentHover: '#334155',
        accentMuted: 'rgba(71,85,105,0.1)',
        border: '#e2e8f0',
        borderHover: '#cbd5e1',
        card: '#ffffff',
        cardHover: '#f8fafc',
        input: '#f1f5f9',
        destructive: '#dc2626',
        destructiveHover: '#b91c1c',
        success: '#16a34a',
        warning: '#d97706',
        error: '#dc2626',
        info: '#2563eb',
      },
    },
  },
];
