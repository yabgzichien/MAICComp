import { oklchToHex } from '../src/lib/oklch';
import { catColorsForHue } from '../src/lib/catColors';

const HEX = /^#[0-9a-f]{6}$/;

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

describe('oklchToHex', () => {
  it('maps OKLab anchors to black and white', () => {
    expect(oklchToHex(0, 0, 0)).toBe('#000000');
    expect(oklchToHex(1, 0, 0)).toBe('#ffffff');
  });

  it('always returns a valid hex string', () => {
    for (const hue of [12, 42, 70, 162, 220, 248, 286, 305, 330]) {
      expect(oklchToHex(0.6, 0.13, hue)).toMatch(HEX);
    }
  });
});

describe('catColorsForHue', () => {
  it('produces bg/fg/solid all as hex', () => {
    const c = catColorsForHue(42);
    expect(c.bg).toMatch(HEX);
    expect(c.fg).toMatch(HEX);
    expect(c.solid).toMatch(HEX);
  });

  it('bg tint is lighter than the solid color', () => {
    const c = catColorsForHue(330);
    expect(luminance(c.bg)).toBeGreaterThan(luminance(c.solid));
  });

  it('memoizes (same reference for same hue)', () => {
    expect(catColorsForHue(162)).toBe(catColorsForHue(162));
  });
});
