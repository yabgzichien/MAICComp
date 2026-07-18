'use client';
// The single active anchor id for the running console tour, provided at the Console root and
// read by every <TourAnchor> in the tree. A context (rather than prop-threading through the
// deeply nested console) keeps the anchors enhancement-only: a component that isn't wrapped,
// or whose id isn't the active one, is entirely unaffected.
import { createContext } from 'react';

export const TourActiveAnchorContext = createContext<string | null>(null);
