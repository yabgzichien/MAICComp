// Judge guided tour  active-anchor rect bridge (Interactive Console Tour, 2026-07-17).
// Ported from `PipComp/src/lib/tourAnchorRect.ts`. The one live TourAnchor measures itself
// (getBoundingClientRect  viewport coordinates) and reports here; the TourSpotlight overlay
// subscribes and draws the dim cutout. Module-level like `tourSignals.ts`  no context
// provider, no re-render coupling between distant components and the console shell. Only ever
// one active anchor at a time (one step, one anchorId).
import type { SpotlightRect } from './spotlight';

export interface AnchorReport {
  id: string;
  rect: SpotlightRect;
}

type Listener = (report: AnchorReport | null) => void;

let current: AnchorReport | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  Array.from(listeners).forEach((listener) => listener(current));
}

/** Report (or refresh) the active anchor's measured viewport rect. No-ops on an unchanged
 *  rect so measurement retries can't cause render loops. */
export function reportTourAnchor(id: string, rect: SpotlightRect): void {
  const r = { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
  if (current && current.id === id && current.rect.x === r.x && current.rect.y === r.y && current.rect.width === r.width && current.rect.height === r.height) {
    return;
  }
  current = { id, rect: r };
  notify();
}

/** Clear the report, but only if `id` still owns it (a newly active anchor must not be
 *  wiped by the previous one's unmount racing in late). */
export function clearTourAnchor(id: string): void {
  if (current?.id !== id) return;
  current = null;
  notify();
}

export function getTourAnchor(): AnchorReport | null {
  return current;
}

export function onTourAnchor(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
