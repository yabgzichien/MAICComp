'use client';
// Judge guided tour  runtime driver (Interactive Console Tour, 2026-07-17). Holds the tour's
// live state (visible / step index / paused / celebrating) and wires the pure pieces together:
// it drives the console's real tab from each step, publishes the active anchor id for the
// spotlight, subscribes to the semantic signal bus so an officer's own action advances a
// do-step, and pauses when the officer wanders to another tab. The console never has its
// actions performed for it  the driver only observes and advances. Persistence mirrors the
// old Brief-M card (dismissed flag + resumable step index in localStorage).
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CONSOLE_TOUR_STEPS,
  actProgress,
  clampConsoleTourStep,
  type ConsoleTourStep,
  type ConsoleTourTab,
} from '../lib/tourSteps';
import { classifyConsoleSignal, classifyConsoleTabChange } from '../lib/tourDrive';
import { onTourSignal } from '../lib/tourSignals';

const TOUR_DISMISSED_KEY = 'pip-console-tour-dismissed';
const TOUR_STEP_KEY = 'pip-console-tour-step';
const CELEBRATE_MS = 950;

export interface ConsoleTourController {
  visible: boolean;
  paused: boolean;
  index: number;
  step: ConsoleTourStep | null;
  act: number;
  totalActs: number;
  actLabel: string;
  activeAnchorId: string | null;
  celebrating: string | null;
  /** True while the current step is the "seed the pipeline" do-step  the QueueRail keeps its
   *  seed button visible even on a non-empty pipeline so the step stays completable. */
  forceSeedButton: boolean;
  next: () => void;
  back: () => void;
  skip: () => void;
  exit: () => void;
  restart: () => void;
  pause: () => void;
  resume: () => void;
}

export function useConsoleTour({ tab, setTab }: { tab: ConsoleTourTab; setTab: (t: ConsoleTourTab) => void }): ConsoleTourController {
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [celebrating, setCelebrating] = useState<string | null>(null);

  const steps = CONSOLE_TOUR_STEPS;
  const step = visible ? steps[clampConsoleTourStep(index, steps.length)] ?? null : null;

  // Refs so the once-mounted signal subscription always reads current state (no stale closure).
  const stateRef = useRef({ visible, index, paused, celebrating: false });
  stateRef.current = { visible, index, paused, celebrating: celebrating !== null };
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const tourDrivenRef = useRef(false);

  const persist = useCallback((next: number) => {
    setIndex(next);
    try {
      window.localStorage.setItem(TOUR_STEP_KEY, String(next));
    } catch {
      // Best-effort persistence.
    }
  }, []);

  // Boot: resume where a prior session left off unless the tour was dismissed.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(TOUR_DISMISSED_KEY) !== 'true') setVisible(true);
      const saved = Number(window.localStorage.getItem(TOUR_STEP_KEY) ?? '0');
      setIndex(clampConsoleTourStep(Number.isFinite(saved) ? saved : 0, steps.length));
    } catch {
      // localStorage unavailable (private mode)  skip the tour rather than crash.
    }
  }, [steps.length]);

  // Drive the console's tab from the active step (only when it actually differs, so the
  // tourDrivenRef guard below is consumed exactly once per driven change).
  useEffect(() => {
    if (!visible || paused || !step) return;
    if (step.tab !== tabRef.current) {
      tourDrivenRef.current = true;
      setTab(step.tab);
    }
  }, [visible, paused, index, step, setTab]);

  // Observe tab changes: tour-driven ones are consumed silently; an officer wandering to a
  // different tab pauses the tour.
  useEffect(() => {
    if (!visible || paused) return;
    if (tourDrivenRef.current) {
      tourDrivenRef.current = false;
      return;
    }
    if (classifyConsoleTabChange(step, tab, false) === 'pause') setPaused(true);
  }, [tab, visible, paused, step]);

  const advance = useCallback(() => {
    const next = stateRef.current.index + 1;
    if (next >= steps.length) {
      setVisible(false);
      try {
        window.localStorage.setItem(TOUR_DISMISSED_KEY, 'true');
      } catch {
        // Best-effort.
      }
      return;
    }
    persist(next);
  }, [persist, steps.length]);

  // Subscribe once: an officer's own action fires a signal; if it completes the current
  // do-step, flash the celebration then advance.
  useEffect(() => {
    return onTourSignal((signal) => {
      const s = stateRef.current;
      if (!s.visible || s.paused || s.celebrating) return;
      const current = steps[clampConsoleTourStep(s.index, steps.length)] ?? null;
      if (classifyConsoleSignal(current, signal) !== 'advance') return;
      setCelebrating(current?.celebrate ?? null);
      window.setTimeout(() => {
        setCelebrating(null);
        advance();
      }, CELEBRATE_MS);
    });
  }, [advance, steps]);

  const next = useCallback(() => {
    if (step?.finale) {
      setVisible(false);
      try {
        window.localStorage.setItem(TOUR_DISMISSED_KEY, 'true');
      } catch {
        // Best-effort.
      }
      return;
    }
    advance();
  }, [advance, step]);

  const back = useCallback(() => {
    setPaused(false);
    persist(Math.max(0, stateRef.current.index - 1));
  }, [persist]);

  const skip = useCallback(() => advance(), [advance]);

  const exit = useCallback(() => {
    setVisible(false);
    try {
      window.localStorage.setItem(TOUR_DISMISSED_KEY, 'true');
    } catch {
      // Best-effort.
    }
  }, []);

  const restart = useCallback(() => {
    setPaused(false);
    setCelebrating(null);
    persist(0);
    setVisible(true);
    try {
      window.localStorage.setItem(TOUR_DISMISSED_KEY, 'false');
    } catch {
      // Best-effort.
    }
  }, [persist]);

  const pause = useCallback(() => setPaused(true), []);

  const resume = useCallback(() => {
    setPaused(false);
    if (step) {
      tourDrivenRef.current = true;
      setTab(step.tab);
    }
  }, [setTab, step]);

  const { act, totalActs, actLabel } = actProgress(steps, index);
  const activeAnchorId = visible && !paused && step ? step.anchorId ?? null : null;

  return {
    visible,
    paused,
    index,
    step,
    act,
    totalActs,
    actLabel,
    activeAnchorId,
    celebrating,
    forceSeedButton: visible && !paused && step?.id === 'seed',
    next,
    back,
    skip,
    exit,
    restart,
    pause,
    resume,
  };
}
