import { describe, it, expect } from 'vitest';
import {
  ASSUMED_VIEWPORT_PX,
  DECISION_PANEL,
  DEFAULT_PANEL_WIDTHS,
  MIN_CENTER_PX,
  PIPELINE_PANEL,
  fitPanels,
  maxWidthFor,
  panelSpec,
  parsePanelWidths,
  resizePanel,
  serializePanelWidths,
} from './panelLayout';

const WIDE = 1920;
const LAPTOP = 1280;

describe('maxWidthFor', () => {
  it('is the panel\'s own max when the viewport has room to spare', () => {
    expect(maxWidthFor(PIPELINE_PANEL, DECISION_PANEL.defaultWidth, WIDE)).toBe(PIPELINE_PANEL.max);
  });

  it('is whatever the centre column can spare when the viewport binds first', () => {
    // 1000 − 340 decision − 360 centre = 300 left for the rail, under its 460 max.
    expect(maxWidthFor(PIPELINE_PANEL, 340, 1000)).toBe(300);
  });

  it('never drops below the panel floor, however narrow the window', () => {
    expect(maxWidthFor(PIPELINE_PANEL, 340, 500)).toBe(PIPELINE_PANEL.min);
    expect(maxWidthFor(DECISION_PANEL, 212, 400)).toBe(DECISION_PANEL.min);
  });
});

describe('resizePanel', () => {
  it('widens a start-pinned panel when its handle is dragged right', () => {
    expect(resizePanel(PIPELINE_PANEL, 212, 60, 340, WIDE)).toBe(272);
    expect(resizePanel(PIPELINE_PANEL, 212, -30, 340, WIDE)).toBe(182);
  });

  it('inverts for an end-pinned panel — dragging its handle right NARROWS it', () => {
    expect(resizePanel(DECISION_PANEL, 340, 60, 212, WIDE)).toBe(280);
    expect(resizePanel(DECISION_PANEL, 340, -60, 212, WIDE)).toBe(400);
  });

  it('clamps at the panel floor no matter how far the handle is dragged', () => {
    expect(resizePanel(PIPELINE_PANEL, 212, -9999, 340, WIDE)).toBe(PIPELINE_PANEL.min);
    expect(resizePanel(DECISION_PANEL, 340, 9999, 212, WIDE)).toBe(DECISION_PANEL.min);
  });

  it('clamps at the panel ceiling on a wide screen', () => {
    expect(resizePanel(PIPELINE_PANEL, 212, 9999, 340, WIDE)).toBe(PIPELINE_PANEL.max);
    expect(resizePanel(DECISION_PANEL, 340, -9999, 212, WIDE)).toBe(DECISION_PANEL.max);
  });

  it('never lets a drag squeeze the centre column below MIN_CENTER_PX', () => {
    for (const delta of [50, 200, 800, 5000]) {
      const pipeline = resizePanel(PIPELINE_PANEL, 212, delta, 340, LAPTOP);
      expect(LAPTOP - pipeline - 340).toBeGreaterThanOrEqual(MIN_CENTER_PX);
    }
    for (const delta of [-50, -200, -800, -5000]) {
      const decision = resizePanel(DECISION_PANEL, 340, delta, 212, LAPTOP);
      expect(LAPTOP - decision - 212).toBeGreaterThanOrEqual(MIN_CENTER_PX);
    }
  });

  it('returns whole pixels — a sub-pixel width would blur the panel hairline', () => {
    expect(Number.isInteger(resizePanel(PIPELINE_PANEL, 212, 33.7, 340, WIDE))).toBe(true);
  });
});

describe('fitPanels', () => {
  it('leaves a layout that already fits completely alone', () => {
    expect(fitPanels(DEFAULT_PANEL_WIDTHS, WIDE)).toEqual(DEFAULT_PANEL_WIDTHS);
  });

  it('narrows a layout restored from a wider monitor until the centre fits', () => {
    const fromWideMonitor = { pipeline: 460, decision: 620 };
    const fitted = fitPanels(fromWideMonitor, LAPTOP);
    expect(fitted.decision).toBeLessThan(fromWideMonitor.decision); // the rail is settled first, so this absorbs it
    expect(LAPTOP - fitted.pipeline - fitted.decision).toBeGreaterThanOrEqual(MIN_CENTER_PX);
  });

  it('holds the centre at every viewport width, for every saved layout', () => {
    for (const viewport of [1920, 1440, 1280, 1024, 900, 768]) {
      for (const saved of [{ pipeline: 460, decision: 620 }, DEFAULT_PANEL_WIDTHS, { pipeline: 300, decision: 400 }]) {
        const fitted = fitPanels(saved, viewport);
        // Either the centre keeps its reading width, or both panels are already at their
        // floors and the window itself is simply too narrow for the three-column desk.
        const centre = viewport - fitted.pipeline - fitted.decision;
        const atFloors = fitted.pipeline === PIPELINE_PANEL.min && fitted.decision === DECISION_PANEL.min;
        expect(centre >= MIN_CENTER_PX || atFloors).toBe(true);
      }
    }
  });

  it('only ever narrows — fitting never silently grows a panel the officer shrank', () => {
    const narrow = { pipeline: PIPELINE_PANEL.min, decision: DECISION_PANEL.min };
    expect(fitPanels(narrow, WIDE)).toEqual(narrow);
  });

  it('holds both floors on a viewport too small for anyone rather than collapsing', () => {
    expect(fitPanels(DEFAULT_PANEL_WIDTHS, 320)).toEqual({ pipeline: PIPELINE_PANEL.min, decision: DECISION_PANEL.min });
  });
});

describe('parsePanelWidths', () => {
  it('round-trips a serialized layout', () => {
    const widths = { pipeline: 300, decision: 420 };
    expect(parsePanelWidths(serializePanelWidths(widths), WIDE)).toEqual(widths);
  });

  it('falls back to defaults on nothing saved', () => {
    expect(parsePanelWidths(null)).toEqual(DEFAULT_PANEL_WIDTHS);
  });

  it('falls back to defaults on junk rather than throwing', () => {
    for (const raw of ['', 'not json', '[]', 'null', '"212"', '{"pipeline":']) {
      expect(() => parsePanelWidths(raw)).not.toThrow();
      expect(parsePanelWidths(raw).pipeline).toBeGreaterThanOrEqual(PIPELINE_PANEL.min);
    }
  });

  it('defaults only the half that is missing or non-numeric', () => {
    const r = parsePanelWidths('{"pipeline":300,"decision":"wide"}', WIDE);
    expect(r).toEqual({ pipeline: 300, decision: DECISION_PANEL.defaultWidth });
  });

  it('clamps a hand-edited width outside the allowed range', () => {
    expect(parsePanelWidths('{"pipeline":9999,"decision":-40}', WIDE)).toEqual({
      pipeline: PIPELINE_PANEL.max,
      decision: DECISION_PANEL.min,
    });
  });

  it('rejects NaN and Infinity, which JSON.parse happily produces from bare numbers', () => {
    expect(parsePanelWidths('{"pipeline":1e999}', WIDE).pipeline).toBe(DEFAULT_PANEL_WIDTHS.pipeline);
  });

  it('assumes a workable viewport when none is given, so the defaults survive a boot read', () => {
    expect(parsePanelWidths(serializePanelWidths(DEFAULT_PANEL_WIDTHS))).toEqual(DEFAULT_PANEL_WIDTHS);
    expect(ASSUMED_VIEWPORT_PX).toBeGreaterThan(DEFAULT_PANEL_WIDTHS.pipeline + DEFAULT_PANEL_WIDTHS.decision + MIN_CENTER_PX);
  });
});

describe('panelSpec', () => {
  it('maps each key to its own spec', () => {
    expect(panelSpec('pipeline')).toBe(PIPELINE_PANEL);
    expect(panelSpec('decision')).toBe(DECISION_PANEL);
  });

  it('gives every panel a floor under its default under its ceiling', () => {
    for (const spec of [PIPELINE_PANEL, DECISION_PANEL]) {
      expect(spec.min).toBeLessThan(spec.defaultWidth);
      expect(spec.defaultWidth).toBeLessThan(spec.max);
    }
  });
});
