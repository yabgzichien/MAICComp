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
