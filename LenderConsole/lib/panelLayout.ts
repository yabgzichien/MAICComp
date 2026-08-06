// lib/panelLayout.ts (draggable workbench panels, 2026-08-06)
// The Verify tab is a three-column desk: pipeline rail, evidence centre, decision engine.
// The two outer panels were fixed widths, which is wrong for a screen an officer lives in
// all day — a wide monitor wants a wider queue, a laptop wants the centre back. This owns
// the rules that make dragging them safe: per-panel min/max, and a centre column that can
// never be squeezed below reading width no matter how far a handle is dragged.
// Pure; no DOM, no React. The console owns the pointer events, this owns the arithmetic.

/** The evidence column between the two panels. Below this the factor breakdown and
 *  affordability charts stop being readable, so resizing yields to it rather than the
 *  other way round. Mirrors the `minWidth: 360` the centre columns in Console.tsx already
 *  declare — the drag arithmetic enforces what the CSS only asserted. */
export const MIN_CENTER_PX = 360;

/** Assumed viewport when the caller has no measurement yet (SSR, first paint). Wide
 *  enough that the defaults survive it untouched. */
export const ASSUMED_VIEWPORT_PX = 1280;

export interface PanelSpec {
  key: PanelKey;
  /** Announced on the drag handle. */
  label: string;
  min: number;
  max: number;
  defaultWidth: number;
  /** Which edge of the desk the panel is pinned to — i.e. which side its handle is on.
   *  'start': handle on the right, dragging right widens. 'end': the mirror image. */
  side: 'start' | 'end';
}

export type PanelKey = 'pipeline' | 'decision';

export const PIPELINE_PANEL: PanelSpec = {
  key: 'pipeline',
  label: 'Pipeline panel width',
  min: 170,
  max: 460,
  defaultWidth: 212,
  side: 'start',
};

export const DECISION_PANEL: PanelSpec = {
  key: 'decision',
  label: 'Loan decision engine panel width',
  min: 280,
  max: 620,
  defaultWidth: 340,
  side: 'end',
};

export interface PanelWidths {
  pipeline: number;
  decision: number;
}

export const DEFAULT_PANEL_WIDTHS: PanelWidths = {
  pipeline: PIPELINE_PANEL.defaultWidth,
  decision: DECISION_PANEL.defaultWidth,
};

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/** The widest this panel may get right now: its own max, or whatever the centre column
 *  can spare, whichever binds first. Never returns below `spec.min` — on a viewport too
 *  narrow for everyone, the panel holds its floor and the centre scrolls instead of the
 *  layout collapsing. */
export function maxWidthFor(spec: PanelSpec, otherPanelWidth: number, viewportPx: number): number {
  const spare = viewportPx - otherPanelWidth - MIN_CENTER_PX;
  return Math.max(spec.min, Math.min(spec.max, spare));
}

/**
 * Where a drag lands. `deltaPx` is handle movement in screen terms (positive = dragged
 * right); the panel's `side` decides whether that widens or narrows it, so callers never
 * have to remember which handle inverts.
 */
export function resizePanel(
  spec: PanelSpec,
  startWidth: number,
  deltaPx: number,
  otherPanelWidth: number,
  viewportPx: number,
): number {
  const signed = spec.side === 'start' ? deltaPx : -deltaPx;
  return Math.round(clamp(startWidth + signed, spec.min, maxWidthFor(spec, otherPanelWidth, viewportPx)));
}

/** Re-clamp both panels against a viewport that may have changed under them (window
 *  resize, a restored layout from a wider monitor). The centre keeps MIN_CENTER_PX where
 *  the arithmetic allows it, and each panel is only ever narrowed, never grown, so a
 *  resize can't silently undo a deliberate drag. The rail is settled first and the
 *  decision panel absorbs the shortfall: the queue is how an officer navigates, so it is
 *  the last thing worth taking pixels from. */
export function fitPanels(widths: PanelWidths, viewportPx: number): PanelWidths {
  const pipeline = clamp(widths.pipeline, PIPELINE_PANEL.min, maxWidthFor(PIPELINE_PANEL, DECISION_PANEL.min, viewportPx));
  const decision = clamp(widths.decision, DECISION_PANEL.min, maxWidthFor(DECISION_PANEL, pipeline, viewportPx));
  return { pipeline, decision };
}

export const panelSpec = (key: PanelKey): PanelSpec => (key === 'pipeline' ? PIPELINE_PANEL : DECISION_PANEL);

/** Tolerant of anything: a missing key, junk, a half-written object, or widths saved on a
 *  monitor this session doesn't have. Whatever survives is clamped; the rest defaults. */
export function parsePanelWidths(raw: string | null, viewportPx: number = ASSUMED_VIEWPORT_PX): PanelWidths {
  if (!raw) return fitPanels(DEFAULT_PANEL_WIDTHS, viewportPx);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return fitPanels(DEFAULT_PANEL_WIDTHS, viewportPx);
    const rec = parsed as Record<string, unknown>;
    const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
    return fitPanels(
      {
        pipeline: num(rec.pipeline, DEFAULT_PANEL_WIDTHS.pipeline),
        decision: num(rec.decision, DEFAULT_PANEL_WIDTHS.decision),
      },
      viewportPx,
    );
  } catch {
    return fitPanels(DEFAULT_PANEL_WIDTHS, viewportPx);
  }
}

export const serializePanelWidths = (widths: PanelWidths): string => JSON.stringify(widths);
