'use client';
// Judge guided tour  spotlight anchor (Interactive Console Tour, 2026-07-17). DOM port of
// `PipComp/src/components/TourAnchor.tsx`. Enhancement, never a dependency: a step whose
// anchorId doesn't match anything mounted still shows the card on its own. The active anchor
// measures its real child (getBoundingClientRect  viewport coordinates) and reports the rect
// through `lib/tourAnchorRect.ts`; the TourSpotlight overlay draws the dimmed cutout + halo.
// The wrapper uses `display: contents` so it adds no box of its own  layout is untouched
// whether or not a step is anchored here. Measurement retries briefly (post-navigation layout
// settles) and re-runs on scroll/resize so the cutout tracks the target.
import React, { useContext, useEffect, useRef } from 'react';
import { TourActiveAnchorContext } from './tourContext';
import { clearTourAnchor, reportTourAnchor } from '../lib/tourAnchorRect';

const SETTLE_RETRIES_MS = [50, 250, 600, 1100];

export function TourAnchor({ id, children }: { id: string; children: React.ReactNode }) {
  const activeId = useContext(TourActiveAnchorContext);
  const active = id === activeId;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const settle = () => {
      const host = ref.current?.firstElementChild as HTMLElement | null;
      if (!host) return;
      // Instant (not smooth) scroll: a smooth scroll is silently cancelled by any competing
      // render, leaving the target occluded. Pull it clear of the tour card, then measure.
      host.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
      const r = host.getBoundingClientRect();
      if (!cancelled && r.width > 0 && r.height > 0) {
        reportTourAnchor(id, { x: r.left, y: r.top, width: r.width, height: r.height });
      }
    };
    settle();
    for (const ms of SETTLE_RETRIES_MS) timers.push(setTimeout(settle, ms));
    const onMove = () => settle();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      cancelled = true;
      for (const t of timers) clearTimeout(t);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      clearTourAnchor(id);
    };
  }, [active, id]);

  return (
    <div ref={ref} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
