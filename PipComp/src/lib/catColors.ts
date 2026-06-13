import { oklchToHex } from './oklch';

export interface CatColor {
  bg: string; // soft tint behind the icon
  fg: string; // icon stroke / accent text
  solid: string; // legend dot / segmented bar
}

/**
 * Per-category color trio, matching the design's:
 *   bg:    oklch(0.95 0.045 hue)
 *   fg:    oklch(0.52 0.13  hue)
 *   solid: oklch(0.60 0.13  hue)
 * Converted to hex (memoized by hue).
 */
const cache = new Map<number, CatColor>();

export function catColorsForHue(hue: number): CatColor {
  const hit = cache.get(hue);
  if (hit) return hit;
  const color: CatColor = {
    bg: oklchToHex(0.95, 0.045, hue),
    fg: oklchToHex(0.52, 0.13, hue),
    solid: oklchToHex(0.6, 0.13, hue),
  };
  cache.set(hue, color);
  return color;
}
