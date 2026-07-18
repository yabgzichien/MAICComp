// Judge guided tour  spotlight geometry (Interactive Console Tour, 2026-07-17). Ported
// from the borrower app's `PipComp/src/lib/spotlight.ts`. Pure: given the viewport and a
// measured target rect, tile the viewport into four dim rectangles around a rounded cutout.
// Four plain <div>s need no SVG masking; the cutout region has NO overlay at all, so the
// real control under it stays natively clickable  which is what makes the do-steps doable.

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
  viewport: { width: number; height: number },
  target: SpotlightRect | null,
  padding: number
): SpotlightFrames | null {
  if (!target || target.width <= 0 || target.height <= 0) return null;

  const x0 = Math.max(0, target.x - padding);
  const y0 = Math.max(0, target.y - padding);
  const x1 = Math.min(viewport.width, target.x + target.width + padding);
  const y1 = Math.min(viewport.height, target.y + target.height + padding);
  if (x1 <= x0 || y1 <= y0) return null;

  const cutout: SpotlightRect = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  return {
    cutout,
    top: { x: 0, y: 0, width: viewport.width, height: y0 },
    bottom: { x: 0, y: y1, width: viewport.width, height: viewport.height - y1 },
    left: { x: 0, y: y0, width: x0, height: cutout.height },
    right: { x: x1, y: y0, width: viewport.width - x1, height: cutout.height },
  };
}
