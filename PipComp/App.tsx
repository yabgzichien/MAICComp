import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  HankenGrotesk_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/hanken-grotesk';
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNav, type NavTab } from './src/components/BottomNav';
import { ClearedLoanBanner } from './src/components/ClearedLoanBanner';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { Pip } from './src/components/Pip';
import { MissionBanner, TourCard, TourResumeChip, type TourRecapItem } from './src/components/TourCard';
import { TourSpotlight } from './src/components/TourSpotlight';
import { actProgress, BORROWER_TOUR_STEPS, TOUR_TOTAL_ACTS, clampTourStep, fillPersona, stepsForBranch, type TourSignalName, type TourStep } from './src/lib/tourSteps';
import { classifyHandoffGate, classifyScreenChange, classifySignal } from './src/lib/tourDrive';
import { onTourSignal } from './src/lib/tourSignals';
import { AddFlow } from './src/screens/AddFlow';
import { AllTransactionsScreen } from './src/screens/AllTransactionsScreen';
import { BreakdownScreen } from './src/screens/BreakdownScreen';
import { CategoriesScreen } from './src/screens/CategoriesScreen';
import { BudgetScreen } from './src/screens/BudgetScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { CreditScreen } from './src/screens/CreditScreen';
import { LoansScreen } from './src/screens/LoansScreen';
import { AttackGalleryScreen } from './src/screens/AttackGalleryScreen';
import { PassportScreen } from './src/screens/PassportScreen';
import { PassportCoachScreen } from './src/screens/PassportCoachScreen';
import { KycScreen } from './src/screens/KycScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { NetWorthScreen } from './src/screens/NetWorthScreen';
import { RecapScreen } from './src/screens/RecapScreen';
import { CalendarScreen } from './src/screens/CalendarScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { AdvancedImportScreen } from './src/screens/AdvancedImportScreen';
import { GlossaryModal } from './src/components/InfoButton';
import { AppAlertModal } from './src/components/AppAlertModal';
import { AccentProvider } from './src/state/accent';
import { AlertHostProvider } from './src/state/alertHost';
import { GlossaryProvider } from './src/state/glossary';
import { DEMO_PROFILES } from './src/data/demoPersonas';
import { AppDataProvider, useAppData } from './src/state/store';
import { useNow } from './src/state/useNow';
import { colors, platformShadow, uiFont } from './src/theme';

type Screen = 'home' | 'add' | 'settings' | 'categories' | 'transactions' | 'breakdown' | 'budget' | 'recap' | 'networth' | 'credit' | 'loans' | 'passport' | 'coach' | 'attacks' | 'kyc' | 'calendar' | 'advancedImport';

/**
 * Web-only: a global :focus-visible outline so keyboard users get a visible focus indicator
 * on every Pressable/TextInput  RN-web renders these as real DOM elements but doesn't ship
 * any focus styling itself, and the browser's own default is easy to lose track of amid the
 * app's custom-styled surfaces. Injected once via a <style> tag rather than per-component,
 * since RN has no global stylesheet. No-op on native (there's no focus ring to add).
 */
function useWebFocusRing() {
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    const style = document.createElement('style');
    style.textContent = `:focus-visible { outline: 2px solid ${colors.accent} !important; outline-offset: 2px !important; }`;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);
}

export default function App() {
  useWebFocusRing();
  const [fontsLoaded] = useFonts({
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    HankenGrotesk_800ExtraBold,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  return (
    <PhoneFrame>
      <SafeAreaProvider>
        <AppDataProvider>
          <AccentProvider>
            <GlossaryProvider>
              <AlertHostProvider>
                <ErrorBoundary>
                  <Root fontsLoaded={fontsLoaded} />
                </ErrorBoundary>
              </AlertHostProvider>
            </GlossaryProvider>
          </AccentProvider>
        </AppDataProvider>
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </PhoneFrame>
  );
}

/**
 * On web, render the app inside a centred iPhone-17-Pro-Max-sized window (440 × 956 pt) so the
 * exported web build looks like a phone instead of stretching to the browser. No-op on native.
 *
 * On a genuinely phone-narrow browser window (real mobile phones, not a small desktop window),
 * that mock-phone chrome is counter-productive: the fake status bar/notch and hand-tuned
 * 440×956 frame just waste space and clip content inside a real phone screen that already has
 * its own chrome. Below `NARROW_BROWSER_MAX` we skip the mock frame entirely and render full-bleed.
 */
const NARROW_BROWSER_MAX = 500;

function PhoneFrame({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- Platform.OS is constant for the life
  // of the app, so this early return never toggles hook order between renders.
  const { width } = useWindowDimensions();
  const isNarrowBrowser = width < NARROW_BROWSER_MAX;
  if (isNarrowBrowser) {
    return <View style={webStyles.fullBleed}>{children}</View>;
  }
  return (
    <View style={webStyles.backdrop}>
      <View style={webStyles.phone}>
        <View style={[webStyles.statusBar, { pointerEvents: 'none' }]}>
          <View style={webStyles.statusRow}>
            <StatusClock />
            <View style={webStyles.rightIcons}>
              {/* cellular signal */}
              <View style={webStyles.signal}>
                {[4, 6, 8, 11].map((h) => (
                  <View key={h} style={[webStyles.bar, { height: h }]} />
                ))}
              </View>
              {/* wifi */}
              <Svg width={17} height={12} viewBox="0 0 16 12">
                <Path
                  d="M8 9.4a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6zM8 5.2c1.7 0 3.3.66 4.5 1.85l-1.35 1.5A4.6 4.6 0 0 0 8 8.2c-1.2 0-2.3.45-3.15 1.35L3.5 7.05A6.4 6.4 0 0 1 8 5.2zM8 1.2c2.8 0 5.4 1.1 7.3 3l-1.35 1.5A8.4 8.4 0 0 0 8 3.2 8.4 8.4 0 0 0 2.05 5.7L.7 4.2A10.3 10.3 0 0 1 8 1.2z"
                  fill="#000"
                />
              </Svg>
              {/* battery */}
              <Svg width={27} height={13} viewBox="0 0 27 13">
                <Rect x="0.6" y="0.6" width="22" height="11.8" rx="3" fill="none" stroke="#000" strokeOpacity={0.35} />
                <Rect x="2" y="2" width="17" height="9" rx="1.5" fill="#000" />
                <Rect x="24" y="4" width="2.2" height="5" rx="1" fill="#000" fillOpacity={0.4} />
              </Svg>
            </View>
          </View>
          <View style={webStyles.island} />
        </View>
        <View style={styles.fill}>{children}</View>
      </View>
    </View>
  );
}

/** Live status-bar clock for the web phone-frame (24h H:MM, ticks each minute). */
function StatusClock() {
  const now = useNow(30_000);
  const hh = now.getHours();
  const mm = String(now.getMinutes()).padStart(2, '0');
  return <Text style={webStyles.clock}>{`${hh}:${mm}`}</Text>;
}

/** Judge-readable labels for the finale recap, one per interactive step. Persona-neutral: the
 *  tour now runs on any of the three demo borrowers. */
const TOUR_RECAP_LABELS: Record<string, string> = {
  'open-credit': 'Opened the score',
  'scan-mission': 'Scanned a real statement',
  whatif: 'Tested a what-if lever',
  'kyc-verify': 'Verified the identity',
  'mint-passport': 'Minted the passport',
  'send-request': 'Sent a real application',
  'accept-offer': 'Accepted the offer',
};

function Root({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { ready, onboardingComplete, tourActive, tourPaused, tourStepIndex, tourBranch, setTourStep, pauseTour, exitTour, startTour, coverage, pendingOffers, activeDemoProfile, clearedByLenderNotice, dismissClearedByLenderNotice } = useAppData();
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Screen>('home');
  /** Where the Attack Gallery's back button returns to. It has two entrances  the Settings row
   *  and the tour's passport-step deep link  and each should go back where it came from. */
  const [attacksOrigin, setAttacksOrigin] = useState<Screen>('settings');
  const [txnFilter, setTxnFilter] = useState<string | null>(null);
  const [addInitial, setAddInitial] = useState<'attach' | 'import'>('attach');
  const [calendarMonth, setCalendarMonth] = useState<string | undefined>(undefined);
  // Where to land after eKYC (Brief-level UI/UX P2.8): verifying from the Loans gate must
  // return to Loans, not always to the Passport ceremony  whichever screen opened KYC wins.
  const [kycReturnTo, setKycReturnTo] = useState<Screen>('passport');
  const openKyc = (from: Screen) => {
    setKycReturnTo(from);
    setScreen('kyc');
  };

  // Judge guided tour v2 (Interactive Judge Tour spec, 2026-07-16). `tourDrivenRef`
  // distinguishes a screen change the tour itself made from one the judge made by tapping
  // the real app; the pure classifiers in lib/tourDrive.ts decide what a judge-made change
  // means for the active step (advance a do-step, step a mission phase, or pause). The
  // tour never fights the user for control: stray taps pause it, and the Resume chip
  // brings it back to the same step. Mission phase, recap facts, and the coverage delta
  // are in-memory only  a resume across an app kill restarts the step cleanly.
  // `tourPaused` lives in the store rather than here: the real screens gate their off-script
  // controls on a run being in progress (`tourRunning`), and a pause they could not see would
  // make pausing a way to walk around the script. pauseTour/startTour/exitTour own the flag, so
  // there is nothing to set alongside them here.
  const tourDrivenRef = useRef(false);
  const advancingRef = useRef(false);
  const [missionPhase, setMissionPhase] = useState<number | null>(null);
  const [celebrateText, setCelebrateText] = useState<string | null>(null);
  const [coverageBefore, setCoverageBefore] = useState<number | null>(null);
  // The furthest step this run has reached. Anything behind it is a beat the judge has already
  // played, so pressing Back onto it should offer a plain Next rather than re-asking for work
  // that is already done (and rather than a Skip, which would be a control with no meaning).
  // In-memory on purpose: a resume after an app kill has no idea what was done before, and
  // claiming otherwise would hand out a Next the judge never earned.
  const [tourMaxIndex, setTourMaxIndex] = useState(0);
  const recapRef = useRef(new Map<string, boolean>());
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The script the judge is actually on. Before the application is sent there is no ending yet,
  // so this is the unbranched prefix; once the lender's verdict lands, `tourBranch` selects one
  // of the three endings and the run grows at the tail. Every index in the driver below is an
  // index into THIS list, never into the raw registry.
  const tourRun = useMemo(() => stepsForBranch(BORROWER_TOUR_STEPS, tourBranch), [tourBranch]);
  const currentTourStep = tourActive ? tourRun[clampTourStep(tourStepIndex, tourRun.length)] ?? null : null;
  // Earliest index Back is allowed to land on: one past the last required step the judge has
  // already completed (`i < tourMaxIndex` on a required step only holds once it is done  a
  // required step has no Skip, so passing it means it was actually played). A required step
  // builds an artefact the rest of the script reads (the scan, eKYC, the mint, the send); once
  // built, re-entering that step reads as an invitation to redo or skip it, neither of which
  // should be on offer. Back still works freely among the non-required steps above this floor.
  const requiredFloor = useMemo(
    () => tourRun.reduce((floor, step, i) => (step.required && i < tourMaxIndex ? i + 1 : floor), 0),
    [tourRun, tourMaxIndex]
  );
  // Mirrors `tourRun`, updated unconditionally every render (not just when effects
  // re-subscribe). Sending the application latches the branch and emits 'application-sent' in
  // the SAME synchronous tick, before React has re-run the signal-listener effect below (whose
  // dependency array can't include tourBranch without reintroducing this exact race one level
  // up). Without this ref, `completeStep`'s stale closure over `tourRun` still measured the
  // 15-step unbranched-only length at the moment the send-request step completed, read
  // `next(15) >= 15` as true, and called exitTour() instead of landing on the new handoff step
  // — found live, the tour vanished the instant the application was sent.
  const tourRunRef = useRef(tourRun);
  tourRunRef.current = tourRun;
  // Mirrors `tourStepIndex` the same way, for the same reason: `completeStep`'s celebration
  // delay (below) needs the index a signal actually belongs to, and a plain state closure goes
  // stale the moment a second signal lands before the first celebration's setTimeout has fired.
  const tourStepIndexRef = useRef(tourStepIndex);
  tourStepIndexRef.current = tourStepIndex;
  // A signal that arrives while `advancingRef` is set (the previous step's ~1.4s celebration is
  // still playing) would otherwise be dropped silently and forever  found live by minting the
  // passport fast enough after KYC's "Done" that `passport-minted` fired before "Identity
  // verified" finished its flash. The KYC screen navigates to the passport screen the instant
  // Done is pressed (not gated on the tour's own celebration timer), so a quick judge can reach
  // and press Mint before the tour driver has advanced off the KYC step and re-subscribed its
  // listener for the mint step  the real passport gets minted, but the tour never hears it.
  const pendingSignalRef = useRef<TourSignalName | null>(null);

  /** Persona the copy's `{name}` / `{role}` tokens fill from. */
  const tourPersona = useMemo(() => {
    const p = DEMO_PROFILES.find((x) => x.id === activeDemoProfile);
    return { name: p?.name, role: p?.role?.toLowerCase() };
  }, [activeDemoProfile]);

  /** Whether the current handoff's gate is open  the real loan has moved far enough for the
   *  script to continue. */
  const handoffReady =
    currentTourStep?.kind !== 'handoff'
      ? false
      : currentTourStep.handoff?.gate === 'none'
        ? true
        : pendingOffers.length > 0;

  /** This handoff watches the real loan and moves on by itself the moment it is ready  no
   *  Continue button is ever rendered, only the live waiting line (see `classifyHandoffGate`,
   *  which is state-based: it does not matter whether the gate was already open when the step
   *  opened, only whether it is open now). Must agree with the effect below: a card that hides
   *  its button on a step that then refuses to advance is a dead end. */
  const handoffSelfAdvancing =
    currentTourStep?.kind === 'handoff' &&
    currentTourStep.handoff?.gate !== 'none' &&
    currentTourStep.handoff?.onOpen === 'advance';

  const resetMission = () => {
    setMissionPhase(null);
  };

  /** Wrap up a do/mission step: record it for the recap, flash the celebration on the
   *  current card so the judge sees their action land, then move on. Skips advance
   *  immediately and are honestly recorded as skipped.
   *
   *  `fromIndex` lets the replay below (see `pendingSignalRef`) chain a second completion off
   *  the index it computed a moment ago, rather than re-reading `tourStepIndex`  the state
   *  closure is still the PRE-advance value at that point (React hasn't re-rendered yet), so
   *  reading it here would repeat the same step instead of moving past it. */
  const completeStep = (step: TourStep, skipped: boolean, fromIndex?: number) => {
    if (advancingRef.current) return;
    recapRef.current.set(step.id, !skipped);
    if (step.kind === 'mission') resetMission();
    const startIndex = fromIndex ?? tourStepIndexRef.current;
    const advance = () => {
      advancingRef.current = false;
      setCelebrateText(null);
      const next = startIndex + 1;
      if (next >= tourRunRef.current.length) {
        void exitTour();
        return;
      }
      void setTourStep(next);
      tourStepIndexRef.current = next;
      // Replay a signal that landed while this step's celebration was still playing (the
      // listener effect below queues it into `pendingSignalRef` instead of matching it, since
      // `currentTourStep` still pointed at the step that just finished). The real action already
      // happened  check it against the step we just landed on rather than losing it.
      const pending = pendingSignalRef.current;
      pendingSignalRef.current = null;
      if (pending) {
        const nextStep = tourRunRef.current[next];
        if (nextStep) {
          const outcome = classifySignal(nextStep, missionPhase ?? 0, pending);
          if (outcome === 'advance') completeStep(nextStep, false, next);
          else if (outcome === 'phase') setMissionPhase((p) => (p ?? 0) + 1);
        }
      }
    };
    if (skipped || !step.celebrate) {
      advance();
      return;
    }
    advancingRef.current = true;
    setCelebrateText(step.celebrate);
    celebrateTimer.current = setTimeout(advance, 1400);
  };

  useEffect(() => () => {
    if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
  }, []);

  useEffect(() => {
    setTourMaxIndex((m) => Math.max(m, tourStepIndex));
  }, [tourStepIndex]);

  // Tour-driven navigation: every step opens on its own screen. The ref is only set when
  // the screen really changes  setScreen to the same value never fires the change effect,
  // and a stale ref would swallow the judge's next real tap.
  useEffect(() => {
    if (!tourActive || !currentTourStep) return;
    setScreen((prev) => {
      if (prev === currentTourStep.screen) return prev;
      tourDrivenRef.current = true;
      return currentTourStep.screen;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourActive, tourStepIndex]);

  useEffect(() => {
    if (!tourActive || !currentTourStep) return;
    const wasTourDriven = tourDrivenRef.current;
    tourDrivenRef.current = false;
    if (advancingRef.current) return;
    const outcome = classifyScreenChange(currentTourStep, missionPhase ?? 0, screen, wasTourDriven);
    if (outcome === 'advance') completeStep(currentTourStep, false);
    else if (outcome === 'phase') setMissionPhase((p) => (p ?? 0) + 1);
    else if (outcome === 'pause') {
      resetMission();
      void pauseTour();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // Semantic signals (chip taps, scan milestones, eKYC, minting) drive the steps a screen
  // change can't observe.
  useEffect(() => {
    if (!tourActive || !currentTourStep) return;
    return onTourSignal((name) => {
      // Mid-celebration for the PREVIOUS step: `currentTourStep` hasn't moved on yet, so this
      // signal cannot be matched against the step it actually belongs to. Queue it rather than
      // drop it  `completeStep`'s `advance()` replays it against the step once it lands.
      if (advancingRef.current) {
        pendingSignalRef.current = name;
        return;
      }
      const outcome = classifySignal(currentTourStep, missionPhase ?? 0, name);
      if (outcome === 'advance') completeStep(currentTourStep, false);
      else if (outcome === 'phase') setMissionPhase((p) => (p ?? 0) + 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourActive, tourStepIndex, missionPhase]);

  const tourNext = () => {
    if (!currentTourStep) return;
    const next = tourStepIndex + 1;
    if (next >= tourRunRef.current.length) {
      void exitTour();
      return;
    }
    void setTourStep(next);
  };
  // The other half of the script running: an offer landing (or being published) clears the
  // handoff the judge is parked on, without them having to confirm what the app can already
  // see. `pendingOffers` is fed by useLenderSyncPoll, which is why every gated handoff sits on
  // a screen that polls. State-based, not transition-based  see `classifyHandoffGate`.
  useEffect(() => {
    if (!tourActive || !currentTourStep || advancingRef.current) return;
    if (classifyHandoffGate(currentTourStep, handoffReady) === 'advance') tourNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourActive, tourStepIndex, handoffReady]);

  const tourBack = () => void setTourStep(Math.max(requiredFloor, tourStepIndex - 1));
  // Required steps have no Skip control, and refuse one here too: the card is not the only
  // thing that can reach this (the mission banner calls it as well), and a step whose artefact
  // the rest of the script reads must not be skippable by any route.
  const tourSkip = () => {
    if (currentTourStep && !currentTourStep.required) completeStep(currentTourStep, true);
  };
  // "Exit" reads as leaving for good, but the judge should be able to walk back in later at the
  // same step rather than face a full restart  so this pauses (same as tapping the dimmed
  // spotlight) rather than calling `exitTour`, which wipes the step index and branch. The Resume
  // chip picks it back up. `exitTour` itself is reserved for the tour actually finishing
  // (`completeStep`'s advance() at the end of the script) and the explicit "Restart judge tour"
  // action, both of which mean the run is genuinely over.
  const tourExit = () => {
    resetMission();
    setCelebrateText(null);
    advancingRef.current = false;
    void pauseTour();
  };
  const tourResume = () => {
    void startTour();
  };
  /** Deep-link off the current step's optional action (UI/UX P3.18: surface the Attack
   *  Gallery from the tour, not only Settings).
   *
   *  PAUSES the tour rather than exiting it (2026-08-06): this used to call `tourExit`, which
   *  wiped the step index and the branch, so a judge who took the "See the fraud defences work"
   *  detour in act 5 had no way back into the script at all. Pausing leaves the Resume chip on
   *  screen, and resuming re-opens the same step. */
  const tourAction = () => {
    if (!currentTourStep?.actionScreen) return;
    // Back out of the gallery to the step the judge left, not to Settings  on the guided path
    // they never opened Settings, so landing there reads as being dumped somewhere strange.
    const from = currentTourStep.screen as Screen;
    resetMission();
    setCelebrateText(null);
    advancingRef.current = false;
    setAttacksOrigin(from);
    void pauseTour();
    tourDrivenRef.current = true;
    setScreen(currentTourStep.actionScreen as Screen);
  };
  /** The mission CTA: remember today's coverage for the delta beat, then open the REAL add
   *  flow at its attach screen. The judge chooses  upload their own screenshot or tap a
   *  provided sample; the app never injects an image on its own. */
  const tourMissionStart = () => {
    setCoverageBefore(coverage.daysCovered);
    setMissionPhase(0);
    tourDrivenRef.current = true;
    setScreen('add');
  };

  /** Runtime line for the coverage-delta step: the honest before→after, or the honest
   *  flat-line fallback  never a fake delta. */
  const tourDetail =
    currentTourStep?.id === 'coverage-delta' && coverageBefore != null
      ? coverage.daysCovered > coverageBefore
        ? `${coverageBefore} → ${coverage.daysCovered} days recorded in the last 90`
        : 'Statement recorded. These days were already covered.'
      : null;

  const tourRecap: TourRecapItem[] | null =
    currentTourStep?.id === 'finale' && recapRef.current.size > 0
      ? Object.keys(TOUR_RECAP_LABELS)
          .filter((id) => recapRef.current.has(id))
          .map((id) => ({ label: TOUR_RECAP_LABELS[id], done: recapRef.current.get(id) === true }))
      : null;

  const tourProgress = actProgress(tourRun, tourStepIndex, TOUR_TOTAL_ACTS);

  // Card placement, deterministic (a measurement-driven flip proved unreliable  it left the
  // card covering the very button it was pointing at). A do-step whose target sits in the
  // scrollable body (all our anchored do-steps: the credit card, Build-my-score, the what-if
  // chips) puts the card at the TOP so the bottom stays clear; the anchor scrolls itself into
  // view below it. 'coach-plan' and 'whatif-explore' are the two EXPLAIN steps that need the
  // same treatment: both anchor the same below-the-fold "next steps"/what-if result card the
  // 'whatif' do-step also anchors, right before and right after it on the same screen (found
  // live: the bottom card covered the bottom of that card, including its resilience line;
  // 'whatif-explore' specifically exists so the judge can see the simulation result and try
  // more chips, which a bottom card sitting over the result would defeat). Everything else
  // keeps the card at its home at the bottom  explain-step anchors are otherwise upper-content,
  // and the no-anchor do-steps (KYC, mint) put their action at the foot of a scroll that gains
  // tour-time bottom padding so it clears the card.
  const tourCardPlacement: 'bottom' | 'top' =
    currentTourStep &&
    currentTourStep.anchorId &&
    (currentTourStep.kind === 'do' || currentTourStep.id === 'coach-plan' || currentTourStep.id === 'whatif-explore')
      ? 'top'
      : 'bottom';

  // Persistent bottom nav appears only on the four primary destinations.
  const navTab: NavTab | null =
    screen === 'home' ? 'home'
    : screen === 'transactions' ? 'activity'
    : screen === 'loans' ? 'loan'
    : screen === 'settings' ? 'profile'
    : null;
  const goTab = (t: NavTab) => {
    if (t === 'home') setScreen('home');
    else if (t === 'activity') {
      setTxnFilter(null);
      setScreen('transactions');
    } else if (t === 'loan') setScreen('loans');
    else setScreen('settings');
  };

  if (!fontsLoaded || !ready) {
    return (
      <View style={[styles.fill, styles.center]}>
        <Pip size={96} expr="idle" float />
      </View>
    );
  }

  // One-time setup before the main app.
  if (!onboardingComplete) {
    return (
      <View style={styles.fill}>
        <OnboardingScreen />
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <View style={styles.fill}>
      {screen === 'home' && (
        <DashboardScreen
          onScan={() => {
            setAddInitial('attach');
            setScreen('add');
          }}
          onOpenCategories={() => setScreen('categories')}
          onOpenAll={() => {
            setTxnFilter(null);
            setScreen('transactions');
          }}
          onOpenBreakdown={() => setScreen('breakdown')}
          onOpenBudget={() => setScreen('budget')}
          onOpenRecap={() => setScreen('recap')}
          onOpenNetWorth={() => setScreen('networth')}
          onOpenCredit={() => setScreen('credit')}
          onOpenPassport={() => setScreen('passport')}
          onOpenCoach={() => setScreen('coach')}
        />
      )}
      {screen === 'add' && (
        <AddFlow
          initialPhase={addInitial}
          onClose={() => setScreen('home')}
        />
      )}
      {screen === 'settings' && (
        <SettingsScreen
          onBack={() => setScreen('home')}
          onMigrate={() => {
            setAddInitial('import');
            setScreen('add');
          }}
          onAdvancedImport={() => setScreen('advancedImport')}
          onOpenAttacks={() => {
            setAttacksOrigin('settings');
            setScreen('attacks');
          }}
          onResetToOnboarding={() => setScreen('home')}
        />
      )}
      {screen === 'attacks' && <AttackGalleryScreen onBack={() => setScreen(attacksOrigin)} />}
      {screen === 'advancedImport' && <AdvancedImportScreen onClose={() => setScreen('settings')} />}
      {screen === 'categories' && <CategoriesScreen onBack={() => setScreen('home')} />}
      {screen === 'transactions' && (
        <AllTransactionsScreen
          filterCategoryId={txnFilter}
          onClearFilter={() => setTxnFilter(null)}
          onBack={() => {
            setTxnFilter(null);
            setScreen('home');
          }}
        />
      )}
      {screen === 'budget' && <BudgetScreen onBack={() => setScreen('home')} onOpenRecap={() => setScreen('recap')} />}
      {screen === 'recap' && (
        <RecapScreen
          onBack={() => setScreen('home')}
          onOpenCalendar={(month) => {
            setCalendarMonth(month);
            setScreen('calendar');
          }}
        />
      )}
      {screen === 'calendar' && (
        <CalendarScreen
          onBack={() => setScreen('recap')}
          initialMonth={calendarMonth}
        />
      )}
      {screen === 'networth' && <NetWorthScreen onBack={() => setScreen('home')} />}
      {screen === 'credit' && (
        <CreditScreen
          onBack={() => setScreen('home')}
          onOpenLoans={() => setScreen('loans')}
          onOpenPassport={() => setScreen('passport')}
          onOpenCoach={() => setScreen('coach')}
        />
      )}
      {screen === 'loans' && (
        <LoansScreen
          onBack={() => setScreen('credit')}
          onOpenKyc={() => openKyc('loans')}
          onOpenPassport={() => setScreen('passport')}
          onOpenCoach={() => setScreen('coach')}
        />
      )}
      {screen === 'passport' && (
        <PassportScreen onBack={() => setScreen('credit')} onOpenKyc={() => openKyc('passport')} onOpenLoans={() => setScreen('loans')} />
      )}
      {screen === 'coach' && (
        <PassportCoachScreen
          onBack={() => setScreen('credit')}
          onStart={(lever) =>
            setScreen(lever === 'coverage' ? 'add' : lever === 'track' ? 'loans' : 'budget')
          }
        />
      )}
      {screen === 'kyc' && <KycScreen onBack={() => setScreen(kycReturnTo)} />}
      {screen === 'breakdown' && (
        <BreakdownScreen
          onBack={() => setScreen('home')}
          onOpenCategory={(id) => {
            setTxnFilter(id);
            setScreen('transactions');
          }}
        />
      )}
      </View>
      {navTab && <BottomNav active={navTab} onNavigate={goTab} badges={{ loan: pendingOffers.length }} />}
      {tourActive && currentTourStep && !tourPaused && (
        <TourSpotlight
          onDimPress={() => {
            resetMission();
            void pauseTour();
          }}
        />
      )}
      {tourActive && currentTourStep && currentTourStep.kind === 'mission' && missionPhase !== null ? (
        <MissionBanner
          instruction={currentTourStep.mission?.phases[missionPhase]?.instruction ?? ''}
          phaseIndex={missionPhase}
          phaseCount={currentTourStep.mission?.phases.length ?? 0}
          topInset={insets.top}
          required={currentTourStep.required}
          onSkip={tourSkip}
          onExit={tourExit}
        />
      ) : tourActive && currentTourStep ? (
        <TourCard
          step={currentTourStep}
          index={tourStepIndex}
          total={tourRun.length}
          progress={tourProgress}
          detail={tourDetail}
          celebrate={celebrateText}
          recap={tourRecap}
          bottomInset={navTab ? 0 : insets.bottom}
          topInset={insets.top}
          placement={tourCardPlacement}
          persona={tourPersona}
          completed={tourStepIndex < tourMaxIndex}
          backFloor={requiredFloor}
          handoffReady={handoffReady}
          handoffSelfAdvancing={handoffSelfAdvancing}
          onNext={tourNext}
          onBack={tourBack}
          onExit={tourExit}
          onSkip={tourSkip}
          onAction={tourAction}
          onMissionStart={tourMissionStart}
        />
      ) : null}
      {tourPaused && !tourActive && (
        <TourResumeChip bottomInset={navTab ? 0 : insets.bottom} progress={tourProgress} onResume={tourResume} />
      )}
      {clearedByLenderNotice && (
        <ClearedLoanBanner message={clearedByLenderNotice} topInset={insets.top} onDismiss={dismissClearedByLenderNotice} />
      )}
      <GlossaryModal />
      <AppAlertModal />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
});

// Web-only: a centred iPhone-17-Pro-Max-sized window so the web build looks like a phone.
const webStyles = StyleSheet.create({
  // Real mobile browsers (< NARROW_BROWSER_MAX wide): no mock chrome, no fake status bar  the
  // device's own browser already provides both, so this is just a full-height, full-width host.
  fullBleed: {
    flex: 1,
    minHeight: '100vh' as unknown as number,
    backgroundColor: colors.bg,
  },
  backdrop: {
    flex: 1,
    minHeight: '100vh' as unknown as number,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d2d8d2',
    padding: 16,
  },
  phone: {
    width: 440,
    height: 956,
    maxHeight: '100vh' as unknown as number,
    maxWidth: '100%' as unknown as number,
    borderRadius: 44,
    overflow: 'hidden',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    ...platformShadow('#000000', 0.18, 40, { width: 0, height: 18 }, 0),
  },
  statusBar: {
    height: 50,
    justifyContent: 'center',
    backgroundColor: colors.bg,
    zIndex: 10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 26,
  },
  clock: {
    fontFamily: uiFont(700),
    fontSize: 16,
    color: '#000',
    letterSpacing: 0.3,
  },
  rightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  signal: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  bar: {
    width: 3,
    borderRadius: 1,
    backgroundColor: '#000',
  },
  island: {
    position: 'absolute',
    top: 11,
    left: '50%',
    marginLeft: -63, // half of width (126) to centre
    width: 126,
    height: 35,
    borderRadius: 999,
    backgroundColor: '#000',
  },
});
