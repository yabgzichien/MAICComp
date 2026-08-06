'use client';
// Judge guided tour  runtime driver (Interactive Console Tour, 2026-07-17). Holds the tour's
// live state (visible / step index / paused / celebrating) and wires the pure pieces together:
// it drives the console's real tab from each step, publishes the active anchor id for the
// spotlight, subscribes to the semantic signal bus so an officer's own action advances a
// do-step, and pauses when the officer wanders to another tab. The console never has its
// actions performed for it  the driver only observes and advances. Persistence mirrors the
// old Brief-M card (dismissed flag + resumable step index in localStorage).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CONSOLE_TOUR_STEPS,
  TOUR_TOTAL_ACTS,
  actProgress,
  branchForDecision,
  clampConsoleTourStep,
  stepsForBranch,
  type ConsoleTourBranch,
  type ConsoleTourStep,
  type ConsoleTourTab,
} from '../lib/tourSteps';
import {
  classifyConsoleHandoffGate,
  classifyConsoleSignal,
  classifyConsoleTabChange,
  isConsoleControlLocked,
  tourControlledAnchors,
} from '../lib/tourDrive';
import { onTourSignal } from '../lib/tourSignals';
import type { ApplicationRecord } from '../lib/applications';
import { LENDER_REGISTRY } from '../lib/lenderRegistry';

const TOUR_DISMISSED_KEY = 'pip-console-tour-dismissed';
const TOUR_STEP_KEY = 'pip-console-tour-step';
/** Which direct-apply application the tour last ran for. A DIFFERENT one arriving means the
 *  judge has just been sent here by the borrower app's act-6 handoff, so the console half of
 *  the script should re-arm even if a previous run was dismissed. */
const TOUR_SEEN_APP_KEY = 'pip-console-tour-seen-application';
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
  /** No application has arrived from the borrower app yet, so the script cannot start. The
   *  console renders a hold card pointing back at the borrower app instead of a step. */
  awaitingBorrower: boolean;
  /** Set when the judge's application went to a DIFFERENT lender than the one on screen. The
   *  hold card then says which desk it is on rather than claiming nothing was ever sent. */
  directElsewhere: { id: string; name: string } | null;
  /** Which ending is running, or null while holding. */
  branch: ConsoleTourBranch | null;
  /** The applicant whose file the tour is following, for the copy's `{applicant}` token. */
  applicant: string | null;
  /** Handoff steps only: whether the borrower has answered the standing offer yet. */
  handoffReady: boolean;
  /** Handoff steps only: this step is watching the real loan and will advance by itself, so the
   *  card renders no Continue button. */
  handoffSelfAdvancing: boolean;
  /** Anchor ids whose real controls must not be usable yet — see `isConsoleControlLocked`. Read
   *  through `TourLockedControlsContext` by the control sites themselves. Empty whenever no
   *  script is running, so a console with no tour on it behaves exactly as it always did. */
  lockedControls: ReadonlySet<string>;
  /** A script is mid-run on a real file. Drives the off-script guards (see
   *  `TourRunningContext`) rather than any per-step lock. */
  running: boolean;
  /** The application the script is about. While `running`, the queue rail allows selecting only
   *  this file: picking a seeded neighbour mid-run would silently re-point assess, the memo and
   *  the decision at a file the narration is not about. */
  queueLockedToAppId: string | null;
  next: () => void;
  back: () => void;
  skip: () => void;
  exit: () => void;
  restart: () => void;
  pause: () => void;
  resume: () => void;
}

export function useConsoleTour({
  tab,
  setTab,
  apps,
  offerAnswered,
}: {
  tab: ConsoleTourTab;
  setTab: (t: ConsoleTourTab) => void;
  /** This lender's pipeline. The tour reads its own branch out of it rather than being told. */
  apps: ApplicationRecord[];
  /** Whether the borrower has answered the offer standing against the followed file. */
  offerAnswered: boolean;
}): ConsoleTourController {
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [celebrating, setCelebrating] = useState<string | null>(null);

  // The file the judge sent from the borrower app. `source: 'direct'` is what distinguishes it
  // from every seeded applicant; the most recently filed one wins if they ran the loop twice.
  const followed = useMemo(() => {
    const direct = apps.filter((a) => a.source === 'direct');
    if (direct.length === 0) return null;
    return direct.reduce((latest, a) => (a.filedAt > latest.filedAt ? a : latest));
  }, [apps]);

  // Derived from `engineDecision` — the verdict AT FILING, which is never rewritten — and not
  // from `status`, which flips referred → approved the moment the officer approves and would
  // otherwise reshape the step list underneath the persisted index mid-tour.
  const branch = followed ? branchForDecision(followed.engineDecision) : null;
  const awaitingBorrower = followed === null;

  const steps = useMemo(() => stepsForBranch(CONSOLE_TOUR_STEPS, branch), [branch]);
  const step = visible && !awaitingBorrower ? steps[clampConsoleTourStep(index, steps.length)] ?? null : null;

  // While holding, find out whether the application actually went to another lender's desk.
  // The borrower picks their lender in act 6, but the console opens on whichever tenancy was
  // last active — so "nothing has arrived" and "it arrived next door" are genuinely different
  // situations, and telling the judge to go start again when their file is one switch away
  // would be simply wrong. Reads the server mailboxes, not localStorage: a lender whose
  // console the judge has never opened has no local pipeline to inspect.
  const [directElsewhere, setDirectElsewhere] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    if (!awaitingBorrower) {
      setDirectElsewhere(null);
      return;
    }
    let alive = true;
    (async () => {
      for (const l of LENDER_REGISTRY) {
        try {
          const res = await fetch(`/api/apply?lender=${l.id}`);
          if (!res.ok) continue;
          const rows: unknown = await res.json();
          if (Array.isArray(rows) && rows.some((r) => (r as { source?: string })?.source === 'direct')) {
            if (alive) setDirectElsewhere({ id: l.id, name: l.name });
            return;
          }
        } catch {
          // Offline or malformed — fall through to the plain "start next door" hold.
        }
      }
      if (alive) setDirectElsewhere(null);
    })();
    return () => {
      alive = false;
    };
  }, [awaitingBorrower]);

  // Refs so the once-mounted signal subscription always reads current state (no stale closure).
  // `required` rides along so `skip` can refuse without re-creating its callback per step.
  const stateRef = useRef({ visible, index, paused, celebrating: false, required: false });
  stateRef.current = { visible, index, paused, celebrating: celebrating !== null, required: step?.required === true };
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

  // Boot: resume where a prior session left off unless the tour was dismissed. Runs exactly
  // once. It must NOT re-run when `steps` changes: the step list grows the moment the branch
  // resolves from the adopted file, and re-reading localStorage at that point would drag the
  // judge back to whatever index was last persisted, mid-act.
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    try {
      if (window.localStorage.getItem(TOUR_DISMISSED_KEY) !== 'true') setVisible(true);
      const saved = Number(window.localStorage.getItem(TOUR_STEP_KEY) ?? '0');
      setIndex(Math.max(0, Number.isFinite(saved) ? saved : 0));
    } catch {
      // localStorage unavailable (private mode)  skip the tour rather than crash.
    }
  }, []);

  // Re-arm on a NEW application from the borrower app.
  //
  // Without this, a dismissed flag from any earlier run suppresses the tour permanently, so a
  // judge who follows act 6's "Open the Lender Console" button lands on a console that does
  // nothing — which is exactly the break this fixes. Dismissal is meant to mean "I am done
  // with the tour I was on", not "never guide me again"; a fresh application is unambiguously
  // the start of a new run of the story.
  //
  // Keyed on the application id, so it fires once per application and never mid-run: within a
  // single pass `followed` is stable, so the id matches what was stored and nothing resets.
  useEffect(() => {
    if (!followed) return;
    let seen: string | null = null;
    try {
      seen = window.localStorage.getItem(TOUR_SEEN_APP_KEY);
    } catch {
      return; // No storage, no way to tell new from old — leave the tour as it is.
    }
    if (seen === followed.id) return;
    try {
      window.localStorage.setItem(TOUR_SEEN_APP_KEY, followed.id);
      window.localStorage.setItem(TOUR_DISMISSED_KEY, 'false');
      window.localStorage.setItem(TOUR_STEP_KEY, '0');
    } catch {
      // Best-effort persistence; the in-memory re-arm below still happens.
    }
    setIndex(0);
    setPaused(false);
    setCelebrating(null);
    setVisible(true);
  }, [followed]);

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

  /** Whether the current handoff's gate is open — the real loan has moved far enough for the
   *  script to continue. */
  const handoffReady = step?.kind !== 'handoff' ? false : step.handoff?.gate === 'none' ? true : offerAnswered;

  /** This handoff watches the real loan and moves on by itself the moment it is ready  no
   *  Continue button is ever rendered, only the live waiting line (see `classifyConsoleHandoffGate`,
   *  which is state-based: it does not matter whether the gate was already open when the step
   *  opened, only whether it is open now). Must agree with the effect below: a card that hides
   *  its button on a step that then refuses to advance is a dead end. */
  const handoffSelfAdvancing =
    step?.kind === 'handoff' && step.handoff?.gate !== 'none' && step.handoff?.onOpen === 'advance';

  // The borrower answering the standing offer clears the handoff on its own: the officer is in
  // the other tab when it happens, and coming back only to confirm what the console already
  // knows is a click that carries no decision.
  useEffect(() => {
    if (!visible || paused || celebrating !== null || !step) return;
    if (classifyConsoleHandoffGate(step, handoffReady) === 'advance') advance();
  }, [visible, paused, celebrating, step, handoffReady, advance]);

  // Which real controls are still off-limits. Recomputed only when the step (or the ending)
  // changes; a Set so the control sites do a hash lookup rather than re-deriving the script.
  //
  // Deliberately still locked while PAUSED: pausing is "I stepped away to look around", and the
  // whole point here is that looking around must not include filing decisions the script has
  // not reached. Exiting the tour is what hands the desk back.
  const running = visible && !awaitingBorrower;
  const lockedControls = useMemo(() => {
    if (!running) return new Set<string>();
    return new Set(tourControlledAnchors().filter((id) => isConsoleControlLocked(steps, index, id)));
  }, [running, steps, index]);

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

  // Required steps render no Skip and refuse one here too, so no other caller can route around
  // the beat the rest of the script reads back.
  const skip = useCallback(() => {
    if (stateRef.current.required) return;
    advance();
  }, [advance]);

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

  const { act, totalActs, actLabel } = actProgress(steps, index, TOUR_TOTAL_ACTS);
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
    awaitingBorrower: visible && awaitingBorrower,
    directElsewhere,
    branch,
    applicant: followed?.applicantLabel ?? null,
    handoffReady,
    handoffSelfAdvancing,
    lockedControls,
    running,
    queueLockedToAppId: running ? followed?.id ?? null : null,
    next,
    back,
    skip,
    exit,
    restart,
    pause,
    resume,
  };
}
