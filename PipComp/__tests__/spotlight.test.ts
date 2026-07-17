import { spotlightFrames, type SpotlightRect } from '../src/lib/spotlight';

const WINDOW = { width: 400, height: 800 };
const rect = (x: number, y: number, width: number, height: number): SpotlightRect => ({ x, y, width, height });

describe('spotlightFrames', () => {
  it('returns null for a missing or zero-sized target (card-only degradation)', () => {
    expect(spotlightFrames(WINDOW, null, 8)).toBeNull();
    expect(spotlightFrames(WINDOW, rect(10, 10, 0, 0), 8)).toBeNull();
  });

  it('tiles the window into four dim rects around a padded cutout', () => {
    const frames = spotlightFrames(WINDOW, rect(100, 200, 200, 100), 10)!;
    expect(frames.cutout).toEqual({ x: 90, y: 190, width: 220, height: 120 });
    expect(frames.top).toEqual({ x: 0, y: 0, width: 400, height: 190 });
    expect(frames.left).toEqual({ x: 0, y: 190, width: 90, height: 120 });
    expect(frames.right).toEqual({ x: 310, y: 190, width: 90, height: 120 });
    expect(frames.bottom).toEqual({ x: 0, y: 310, width: 400, height: 490 });
  });

  it('the four dims plus the cutout exactly cover the window', () => {
    const f = spotlightFrames(WINDOW, rect(50, 60, 120, 40), 6)!;
    const area = (r: SpotlightRect) => r.width * r.height;
    const total = area(f.top) + area(f.bottom) + area(f.left) + area(f.right) + area(f.cutout);
    expect(total).toBe(WINDOW.width * WINDOW.height);
  });

  it('clamps a target that bleeds past the window edges', () => {
    const f = spotlightFrames(WINDOW, rect(-20, -30, 100, 100), 8)!;
    expect(f.cutout.x).toBe(0);
    expect(f.cutout.y).toBe(0);
    expect(f.top.height).toBe(0);
    expect(f.left.width).toBe(0);
    const g = spotlightFrames(WINDOW, rect(350, 750, 100, 100), 8)!;
    expect(g.cutout.x + g.cutout.width).toBe(WINDOW.width);
    expect(g.cutout.y + g.cutout.height).toBe(WINDOW.height);
  });

  it('padding grows the cutout symmetrically', () => {
    const tight = spotlightFrames(WINDOW, rect(100, 100, 50, 50), 0)!;
    const padded = spotlightFrames(WINDOW, rect(100, 100, 50, 50), 12)!;
    expect(padded.cutout.x).toBe(tight.cutout.x - 12);
    expect(padded.cutout.width).toBe(tight.cutout.width + 24);
  });
});
