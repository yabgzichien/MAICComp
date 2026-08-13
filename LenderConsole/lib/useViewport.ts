// lib/useViewport.ts
// The console's layout math (panelLayout.ts) already treats viewport width as a first-class
// input for the desktop desk. Mobile needs the same thing one level up: whole sections of the
// UI (the three-panel desk, list+detail servicing view, multi-column grids) switch shape
// rather than just resize. This hook is the single source of truth for that switch so every
// component asks the same question the same way instead of each guessing its own breakpoint.
'use client';

import { useEffect, useState } from 'react';

/** Below this, the desk/list layouts stop trying to share a row and switch to a single
 *  focused panel at a time. Matches common phone/small-tablet width, comfortably under the
 *  desk's own MIN_CENTER_PX + panel-minimums floor (~810px) so there's no dead zone where
 *  neither the desktop nor the mobile layout actually fits. */
export const MOBILE_BREAKPOINT_PX = 760;

export interface Viewport {
  width: number;
  isMobile: boolean;
}

/** SSR/first-paint default. Wide so nothing mobile-only flashes before hydration measures
 *  the real window, mirroring ASSUMED_VIEWPORT_PX in panelLayout.ts. */
const ASSUMED_WIDTH_PX = 1280;

export function useViewport(): Viewport {
  const [width, setWidth] = useState(ASSUMED_WIDTH_PX);

  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return { width, isMobile: width < MOBILE_BREAKPOINT_PX };
}
