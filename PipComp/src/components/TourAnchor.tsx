// Judge guided tour  spotlight anchor, v2 (Interactive Judge Tour spec, 2026-07-16).
// Enhancement, never a dependency: a step whose anchorId doesn't match anything currently
// mounted still shows the card on its own. v2 upgrade: instead of drawing its own thin
// ring, the active anchor measures itself (measureInWindow, identical on RN and RN-web)
// and reports the rect through `lib/tourAnchorRect.ts`; the TourSpotlight overlay draws
// the dimmed cutout + halo. Measurement retries briefly so post-navigation layout settles;
// an anchor that never measures simply reports nothing  card-only degradation.
import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { clearTourAnchor, reportTourAnchor } from '../lib/tourAnchorRect';

const SETTLE_RETRIES_MS = [50, 250, 600, 1100];

/** `remeasureKey`: pass any value that changes when the wrapped content resizes (e.g. the
 *  selected what-if, which swaps in a taller/shorter result card). The cutout is re-measured
 *  whenever it changes, so the spotlight can't keep framing the old layout. */
export function TourAnchor({
  id,
  activeId,
  children,
  remeasureKey,
}: {
  id: string;
  activeId: string | null;
  children: React.ReactNode;
  remeasureKey?: string | number | null;
}) {
  const ref = useRef<View>(null);
  const active = id === activeId;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Pull the target into the middle of the viewport, clear of the tour card, then measure
    // for the spotlight cutout. Instant (not smooth) scroll: a smooth scroll is silently
    // cancelled by any competing render or focus scroll, leaving the target occluded. Both
    // the scroll and the measure retry over ~1.1s because the screen has just navigated and
    // its scroll view may not be laid out on the first tick. Web-only by feature detection;
    // no-op on native (where nothing occludes and the card sits below).
    const settle = () => {
      const node = ref.current as unknown as { scrollIntoView?: (opts: object) => void } | null;
      node?.scrollIntoView?.({ behavior: 'auto', block: 'center' });
      ref.current?.measureInWindow((x, y, width, height) => {
        if (!cancelled && width > 0 && height > 0) reportTourAnchor(id, { x, y, width, height });
      });
    };
    settle();
    for (const ms of SETTLE_RETRIES_MS) timers.push(setTimeout(settle, ms));
    return () => {
      cancelled = true;
      for (const t of timers) clearTimeout(t);
      clearTourAnchor(id);
    };
  }, [active, id, remeasureKey]);

  if (!active) return <>{children}</>;
  return (
    <View ref={ref} collapsable={false}>
      {children}
    </View>
  );
}
