import { describe, it, expect } from 'vitest';
import { generatePalette, hexToHsl, hslToHex, getContrastRatio, meetsWCAGAA } from '../../../src/components/Theme/palette-generator';

describe('Palette Generator', () => {
  it('should generate a palette from hex color', () => {
    const palette = generatePalette('#3b82f6', 'Test Blue');
    expect(palette.id).toBe('custom_3b82f6');
    expect(palette.name).toBe('Test Blue');
    expect(palette.colors.dark).toBeDefined();
    expect(palette.colors.light).toBeDefined();
    expect(palette.colors.dark.accent).toBe('#3b82f6');
  });

  it('should convert hex to HSL and back', () => {
    const hsl = hexToHsl('#3b82f6');
    expect(hsl.h).toBeGreaterThanOrEqual(0);
    expect(hsl.h).toBeLessThanOrEqual(360);
    const hex = hslToHex(hsl.h, hsl.s, hsl.l);
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('should calculate contrast ratio', () => {
    const ratio = getContrastRatio('#000000', '#ffffff');
    expect(ratio).toBeCloseTo(21, 0);
  });

  it('should check WCAG AA compliance', () => {
    expect(meetsWCAGAA('#000000', '#ffffff')).toBe(true);
    expect(meetsWCAGAA('#777777', '#888888')).toBe(false);
  });
});
