import { describe, expect, it } from 'vitest';
import { spotlightFrames } from './spotlight';

const VIEWPORT = { width: 1000, height: 800 };

describe('spotlightFrames', () => {
  it('returns null when there is nothing to spotlight', () => {
    expect(spotlightFrames(VIEWPORT, null, 8)).toBeNull();
    expect(spotlightFrames(VIEWPORT, { x: 10, y: 10, width: 0, height: 20 }, 8)).toBeNull();
  });

  it('tiles the viewport into four dim panes around a padded cutout', () => {
    const frames = spotlightFrames(VIEWPORT, { x: 400, y: 300, width: 200, height: 100 }, 10)!;
    expect(frames).not.toBeNull();
    // Cutout is the target grown by the padding on every side.
    expect(frames.cutout).toEqual({ x: 390, y: 290, width: 220, height: 120 });
    // Panes cover everything outside the cutout, edge to edge.
    expect(frames.top).toEqual({ x: 0, y: 0, width: 1000, height: 290 });
    expect(frames.bottom).toEqual({ x: 0, y: 410, width: 1000, height: 390 });
    expect(frames.left).toEqual({ x: 0, y: 290, width: 390, height: 120 });
    expect(frames.right).toEqual({ x: 610, y: 290, width: 390, height: 120 });
  });

  it('clamps the cutout to the viewport edges', () => {
    const frames = spotlightFrames(VIEWPORT, { x: -20, y: -20, width: 60, height: 60 }, 8)!;
    expect(frames.cutout.x).toBe(0);
    expect(frames.cutout.y).toBe(0);
    expect(frames.top.height).toBe(0);
    expect(frames.left.width).toBe(0);
  });

  it('returns null when a clamped target has no visible area', () => {
    expect(spotlightFrames(VIEWPORT, { x: -100, y: 10, width: 50, height: 50 }, 8)).toBeNull();
  });
});
