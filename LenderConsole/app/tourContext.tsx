'use client';
// The single active anchor id for the running console tour, provided at the Console root and
// read by every <TourAnchor> in the tree. A context (rather than prop-threading through the
// deeply nested console) keeps the anchors enhancement-only: a component that isn't wrapped,
// or whose id isn't the active one, is entirely unaffected.
import { createContext, useContext } from 'react';

export const TourActiveAnchorContext = createContext<string | null>(null);

/** Anchor ids whose real controls the running tour has not handed over yet (see
 *  `isConsoleControlLocked`). Same reasoning as the anchor context: a context rather than props,
 *  so a control site opts in by asking about itself and everything else is untouched. Always
 *  empty when no tour is running, which is what keeps the console a normal console. */
export const TourLockedControlsContext = createContext<ReadonlySet<string>>(new Set());

/** True while the script has not reached the step that owns this control. Control sites use it
 *  for `disabled` — the tour never hides a control, it withholds it, so the officer can still
 *  see what the desk does before they are asked to do it. */
export function useTourLocked(anchorId: string): boolean {
  return useContext(TourLockedControlsContext).has(anchorId);
}

/** A script is mid-run on a real file. Distinct from `useTourLocked`, which is about controls
 *  the script WILL hand over: this one is for controls the script never asks for and that would
 *  derail it outright — declining the referred application it is about to have approved,
 *  selecting a neighbouring file the narration is not about. */
export const TourRunningContext = createContext(false);

export function useTourRunning(): boolean {
  return useContext(TourRunningContext);
}
