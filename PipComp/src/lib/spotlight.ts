// Judge guided tour  spotlight geometry (Interactive Judge Tour spec, 2026-07-16). Pure:
// given the window and a measured target rect, tile the window into four dim rectangles
// around a rounded cutout. Four plain Views need no SVG masking and behave identically on
// RN and RN-web; the cutout region has NO overlay view at all, so the real control under it
// stays natively tappable  which is what makes the do-steps physically doable.

export interface SpotlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpotlightFrames {
  cutout: SpotlightRect;
  top: SpotlightRect;
  bottom: SpotlightRect;
  left: SpotlightRect;
  right: SpotlightRect;
}

/** Returns the dim tiling for a target, or null when there is nothing measurable to
 *  spotlight (the caller degrades to card-only, exactly like the pre-v2 tour). */
export function spotlightFrames(
  window: { width: number; height: number },
  target: SpotlightRect | null,
  padding: number
): SpotlightFrames | null {
  if (!target || target.width <= 0 || target.height <= 0) return null;

  const x0 = Math.max(0, target.x - padding);
  const y0 = Math.max(0, target.y - padding);
  const x1 = Math.min(window.width, target.x + target.width + padding);
  const y1 = Math.min(window.height, target.y + target.height + padding);
  if (x1 <= x0 || y1 <= y0) return null;

  const cutout: SpotlightRect = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  return {
    cutout,
    top: { x: 0, y: 0, width: window.width, height: y0 },
    bottom: { x: 0, y: y1, width: window.width, height: window.height - y1 },
    left: { x: 0, y: y0, width: x0, height: cutout.height },
    right: { x: x1, y: y0, width: window.width - x1, height: cutout.height },
  };
}
