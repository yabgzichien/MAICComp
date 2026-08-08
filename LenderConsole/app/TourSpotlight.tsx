'use client';
// Judge guided tour  dim + cutout spotlight overlay (Interactive Console Tour, 2026-07-17).
// DOM port of `PipComp/src/components/TourSpotlight.tsx`. Four fixed dim panes tile the
// viewport around the active anchor's measured rect; the cutout region has NO element at all,
// so the spotlit control stays natively clickable  that is what makes the "your turn" steps
// physically doable. Clicking a dim pane pauses the tour (the driver owns the semantics via
// onDimPress). The halo pulses via CSS (`.tour-halo`), which honours prefers-reduced-motion.
import React, { useEffect, useState } from 'react';
import { spotlightFrames, type SpotlightRect } from '../lib/spotlight';
import { getTourAnchor, onTourAnchor, type AnchorReport } from '../lib/tourAnchorRect';

const CUTOUT_PADDING = 8;

function paneStyle(r: SpotlightRect): React.CSSProperties {
  return { position: 'fixed', left: r.x, top: r.y, width: r.width, height: r.height };
}

/** Does this gesture belong to a scroller the spotlight is actually pointing at?
 *
 *  The scroll lock below is a blunt "the console does not move" — but a cutout can frame
 *  something that scrolls in its own right (the queue rail, the servicing list), and killing that
 *  would break the very control the step is asking the officer to use. So a scrollable ancestor
 *  of the event's target is honoured when it overlaps the cutout, and everything else is held
 *  still. Mirrors `scrollsInsideCutout` in `PipComp/src/components/TourSpotlight.tsx`. */
function scrollsInsideCutout(target: EventTarget | null, rect: SpotlightRect): boolean {
  let el = target as HTMLElement | null;
  while (el && el !== document.body && el !== document.documentElement) {
    const style = window.getComputedStyle(el);
    const scrollsY = /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
    const scrollsX = /(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1;
    if (scrollsY || scrollsX) {
      const r = el.getBoundingClientRect();
      return r.left < rect.x + rect.width && r.right > rect.x && r.top < rect.y + rect.height && r.bottom > rect.y;
    }
    el = el.parentElement;
  }
  return false;
}

export function TourSpotlight({ onDimPress }: { onDimPress: () => void }) {
  const [report, setReport] = useState<AnchorReport | null>(() => getTourAnchor());
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => onTourAnchor(setReport), []);
  useEffect(() => {
    const measure = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const frames = viewport ? spotlightFrames(viewport, report?.rect ?? null, CUTOUT_PADDING) : null;
  const cutout = frames?.cutout ?? null;

  // While a control is spotlit, the console underneath does not scroll. The cutout is pinned to a
  // measured rect, so a flick of the wheel used to slide the highlighted control clean out of the
  // lit hole and leave the instruction pointing at background. Programmatic scrolling (the
  // anchor's own `scrollIntoView`) is unaffected — only the officer's gestures are held, and only
  // outside the cutout (see `scrollsInsideCutout`).
  //
  // Only while there IS a cutout: a step with no anchor spotlights nothing and stays freely
  // scrollable.
  useEffect(() => {
    if (!cutout) return;
    const block = (e: Event) => {
      if (scrollsInsideCutout(e.target, cutout) || !e.cancelable) return;
      e.preventDefault();
    };
    const SCROLL_KEYS = new Set([' ', 'PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown']);
    const blockKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      // Never steal a key from a field the officer is typing in (the approval rationale).
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      if (SCROLL_KEYS.has(e.key) && e.cancelable) e.preventDefault();
    };
    const opts: AddEventListenerOptions = { passive: false, capture: true };
    window.addEventListener('wheel', block, opts);
    window.addEventListener('touchmove', block, opts);
    window.addEventListener('keydown', blockKey, { capture: true });
    return () => {
      window.removeEventListener('wheel', block, opts);
      window.removeEventListener('touchmove', block, opts);
      window.removeEventListener('keydown', blockKey, { capture: true });
    };
    // Rect identity changes on every anchor report; the values are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutout?.x, cutout?.y, cutout?.width, cutout?.height]);

  if (!frames) return null;

  return (
    <>
      {[frames.top, frames.bottom, frames.left, frames.right].map((r, i) => (
        <div
          key={i}
          aria-hidden
          onClick={onDimPress}
          style={{ ...paneStyle(r), background: 'rgba(16,32,24,0.46)', zIndex: 40, cursor: 'default' }}
        />
      ))}
      <div
        aria-hidden
        className="tour-halo"
        style={{
          ...paneStyle(frames.cutout),
          zIndex: 41,
          borderRadius: 12,
          border: '2.5px solid #1f8a5b',
          boxShadow: '0 0 0 3px rgba(31,138,91,0.22), 0 0 22px rgba(31,138,91,0.5)',
          pointerEvents: 'none',
        }}
      />
    </>
  );
}
