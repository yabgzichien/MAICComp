// src/screens/OnboardingScreen.tsx
// The artifact's front door. Its job is to get someone into a working demo in one tap and to
// show, before they tap, that one engine produces three different lender answers.
//
// eKYC deliberately does NOT appear here: it's a mock provider, it asks for an NRIC, and as the
// loudest control on the first screen it read as a real identity wall. It stays reachable from
// the Credit Passport screen (App.tsx routes to 'kyc') and the guided tour still walks through
// it in act 5, so nothing is lost.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { Pip } from '../components/Pip';
import { canStartWith, DEMO_PROFILES, RECOMMENDED_DEMO_PROFILE, TOUR_PATH, type DemoPersona, type DemoProfileId } from '../data/demoPersonas';
import { VERDICT_STYLE } from '../lib/verdictStyle';
import { useAppData } from '../state/store';
import { colors, platformShadow, radius, shadowCard, uiFont } from '../theme';

export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { completeOnboarding, loadDemoData, startTour } = useAppData();
  const [busy, setBusy] = useState(false);
  // Opens on the ending that plays the whole script, derived rather than named  see
  // `RECOMMENDED_DEMO_PROFILE`. All three stay pickable: the three verdicts side by side are the
  // front door's proof that one engine produces three answers, and hiding two would turn that
  // proof back into a claim.
  const [selectedId, setSelectedId] = useState<DemoProfileId>(RECOMMENDED_DEMO_PROFILE);

  const selected = DEMO_PROFILES.find((p) => p.id === selectedId) ?? DEMO_PROFILES[0];

  /** Both demo entrances share one busy flag so neither can be double-fired mid-load. */
  async function enter(withTour: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      await loadDemoData(selectedId);
      await completeOnboarding();
      if (withTour) await startTour({ fresh: true });
    } finally {
      setBusy(false);
    }
  }

  // ── Front-door spotlight ────────────────────────────────────────────────────
  // The same dim-and-cutout language as the guided tour itself (TourSpotlight), applied one
  // screen early: before any tour step exists, the judge still needs to be pointed at exactly
  // one card and exactly one button. Two measured rects  the recommended persona's row and the
  // primary CTA  carve the only two lit holes; everything else (hero, thesis, the two withheld
  // rows, the secondary/skip buttons) sits under a uniform dim and cannot be tapped through it.
  //
  // Rects are window-relative (measureInWindow), the same technique `TourAnchor`/`TourSpotlight`
  // use for the real tour, rather than `onLayout`  RN-web's `onLayout` never fired for a plain
  // `View` in this build (confirmed live: a bare debug logger on the hero block never ran), so
  // this sticks to the measuring approach already proven to work elsewhere in this app. The
  // overlay is fixed over the whole viewport (outside the ScrollView) and re-measures on scroll,
  // exactly like the real spotlight.
  const rootRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const startRowRef = useRef<View>(null);
  const ctaRef = useRef<View>(null);
  const [spot, setSpot] = useState<{ start: SpotRect | null; cta: SpotRect | null }>({ start: null, cta: null });
  const rafRef = useRef<number | null>(null);
  const scrolledRef = useRef(false);

  const measure = useCallback(() => {
    rootRef.current?.measureInWindow((rx, ry) => {
      const capture = (ref: React.RefObject<View | null>, key: 'start' | 'cta') => {
        ref.current?.measureInWindow((x, y, w, h) => {
          if (w <= 0 || h <= 0) return;
          const rect = { top: y - ry, bottom: y - ry + h };
          setSpot((s) => (s[key] && s[key]!.top === rect.top && s[key]!.bottom === rect.bottom ? s : { ...s, [key]: rect }));
          // Below the fold at a typical laptop window height otherwise: the CTA sits well past
          // the picker, and a spotlight pointing at an off-screen button defeats the whole
          // point. `ScrollView`'s own imperative `scrollTo` proved unreliable here (found live:
          // it never moved the underlying web scroll container), so this scrolls the DOM node
          // directly  the same feature-detected technique `TourAnchor` already uses for the
          // real tour's spotlight targets, which IS proven to work in this app.
          if (key === 'start' && !scrolledRef.current) {
            scrolledRef.current = true;
            const node = ref.current as unknown as { scrollIntoView?: (opts: object) => void } | null;
            node?.scrollIntoView?.({ behavior: 'auto', block: 'start' });
          }
        });
      };
      capture(startRowRef, 'start');
      capture(ctaRef, 'cta');
    });
  }, []);

  const scheduleMeasure = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      measure();
    });
  }, [measure]);

  // Settle retries on mount (fonts/layout can still be resolving on the first paint), a resize
  // listener on web, and a scroll handler so the two holes track their targets  including the
  // scroll the effect above just triggered.
  useEffect(() => {
    const timers = [50, 150, 300, 450, 650, 900].map((ms) => setTimeout(measure, ms));
    return () => timers.forEach(clearTimeout);
  }, [measure]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    window.addEventListener('resize', scheduleMeasure);
    return () => window.removeEventListener('resize', scheduleMeasure);
  }, [scheduleMeasure]);

  const onScroll = useCallback((_e: NativeSyntheticEvent<NativeScrollEvent>) => scheduleMeasure(), [scheduleMeasure]);

  return (
    <View style={styles.root} ref={rootRef}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 22, paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.hero}>
          <Pip size={76} expr={selected.expr} float />
          <Text style={styles.title}>Pip Credit</Text>
          <Text style={styles.subtitle}>Credit for people the system can't see.</Text>
        </View>

        <Text style={styles.thesis}>One engine, three borrowers, three different answers.</Text>

        <View style={styles.rows}>
          {DEMO_PROFILES.map((persona) => {
            const row = (
              <PersonaRow
                persona={persona}
                selected={persona.id === selectedId}
                startable={canStartWith(persona)}
                onSelect={() => setSelectedId(persona.id)}
              />
            );
            // Only the recommended row gets a measuring wrapper  the same pattern
            // TourAnchor uses for the real tour's own spotlight targets.
            return persona.id === RECOMMENDED_DEMO_PROFILE ? (
              <View key={persona.id} ref={startRowRef} collapsable={false}>
                {row}
              </View>
            ) : (
              <View key={persona.id}>{row}</View>
            );
          })}
        </View>

        {/* The one instruction on the screen, pointing at the one button that matters. The rows
            above have already said WHO is loaded and why; this says what to do next. */}
        <TourNudge name={selected.name} />

        <View ref={ctaRef} collapsable={false}>
          <Pressable
            style={[styles.primaryBtn, busy && styles.btnBusy]}
            onPress={() => void enter(true)}
            disabled={busy}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.onAccent} />
            ) : (
              <>
                <Icon name="sparkles" size={16} color={colors.onAccent} />
                <Text style={styles.primaryBtnText}>Take the hands-on tour</Text>
              </>
            )}
          </Pressable>
        </View>

        <Pressable
          style={[styles.secondaryBtn, busy && styles.btnBusy]}
          onPress={() => void enter(false)}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryBtnText}>Just explore {selected.name}'s profile</Text>
        </Pressable>

        <Pressable
          style={styles.skipBtn}
          onPress={() => void completeOnboarding()}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={styles.skipText}>Start empty instead</Text>
        </Pressable>
      </ScrollView>

      {spot.start && spot.cta && <FrontDoorSpotlight start={spot.start} cta={spot.cta} />}
    </View>
  );
}

interface SpotRect {
  /** Window-relative, in the overlay's own local space (root offset already subtracted). */
  top: number;
  bottom: number;
}

/** Dims everything except the recommended persona's card and the primary CTA  three full-width
 *  panes (above, between, below the two holes) plus a pulsing halo ring on each hole, the same
 *  visual language as the real guided tour's `TourSpotlight`. Both targets share the picker's
 *  full content width, so a hole never needs left/right dimming of its own.
 *
 *  Absorbs taps on the dimmed panes (the two withheld rows are already disabled buttons, but the
 *  secondary/skip buttons underneath the bottom pane are real controls and must not fire through
 *  a screen that is supposed to read as "only these two things are available"). Tapping a dim
 *  pane does nothing  there is no tour yet to pause, so it simply reads as inert. */
function FrontDoorSpotlight({ start, cta }: { start: SpotRect; cta: SpotRect }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const useNative = Platform.OS !== 'web';
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.55, duration: 900, useNativeDriver: useNative }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: useNative }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const PAD = 8;
  const startHole = { top: start.top - PAD, bottom: start.bottom + PAD };
  const ctaHole = { top: cta.top - PAD, bottom: cta.bottom + PAD };
  const noop = () => {};

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable onPress={noop} accessible={false} focusable={false} style={[styles.dim, { top: 0, height: Math.max(0, startHole.top) }]} />
      <Pressable
        onPress={noop}
        accessible={false}
        focusable={false}
        style={[styles.dim, { top: startHole.bottom, height: Math.max(0, ctaHole.top - startHole.bottom) }]}
      />
      <Pressable onPress={noop} accessible={false} focusable={false} style={[styles.dim, { top: ctaHole.bottom, bottom: 0 }]} />
      <Animated.View pointerEvents="none" style={[styles.halo, styles.haloCard, { top: startHole.top, height: startHole.bottom - startHole.top, opacity: pulse }]} />
      <Animated.View pointerEvents="none" style={[styles.halo, styles.haloPill, { top: ctaHole.top, height: ctaHole.bottom - ctaHole.top, opacity: pulse }]} />
    </View>
  );
}

function PersonaRow({
  persona,
  selected,
  startable,
  onSelect,
}: {
  persona: DemoPersona;
  selected: boolean;
  /** False on the two endings that are not the opening move: the row still shows its verdict and
   *  its story  that side-by-side comparison is the point of this screen  but it cannot be
   *  picked as the first run. See `canStartWith`. */
  startable: boolean;
  onSelect: () => void;
}) {
  const v = VERDICT_STYLE[persona.outcome.decision];
  const path = TOUR_PATH[persona.outcome.decision];

  return (
    <Pressable
      style={[
        styles.card,
        selected && shadowCard,
        selected && { borderColor: v.line, backgroundColor: v.fill },
        !startable && styles.cardLocked,
      ]}
      onPress={onSelect}
      disabled={!startable}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !startable }}
      accessibilityLabel={`${persona.name}, ${persona.role}. ${persona.outcome.label}.${path.recommended ? ' Start here.' : ''} ${persona.outcome.note} ${path.line}${startable ? '' : ' Available after the tour, from Profile, Demo profiles.'}`}
    >
      <View style={styles.cardHead}>
        <View style={[styles.avatar, { backgroundColor: v.fill, borderColor: v.line }]}>
          <Text style={[styles.avatarLetter, { color: v.ink }]}>{persona.name.charAt(0)}</Text>
        </View>
        <View style={styles.nameCol}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{persona.name}</Text>
            {/* Sits beside the name rather than in the head's right slot, which the verdict pill
                already owns  the badge is about the tour, the pill about the lending answer. */}
            {path.recommended && (
              <View style={styles.startBadge}>
                <Text style={styles.startBadgeText}>START HERE</Text>
              </View>
            )}
          </View>
          <Text style={styles.role}>{persona.role}</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: v.fill, borderColor: v.line }]}>
          <Icon name={v.icon} size={11} color={v.ink} stroke={2.5} />
          <Text style={[styles.pillText, { color: v.ink }]}>{persona.outcome.label}</Text>
        </View>
      </View>
      <Text style={styles.note}>{persona.outcome.note}</Text>
      {/* Why this ending, in tour terms. The recommended one earns full ink; the two short paths
          stay muted  they are a caveat on a choice, not a pitch for it. */}
      <Text style={[styles.path, path.recommended && styles.pathRecommended]}>{path.line}</Text>
      {/* A dead row with no explanation reads as a bug. Says when it opens and exactly where,
          so withholding it is a signposted route rather than a wall. */}
      {!startable && (
        <View style={styles.lockedRow}>
          <Icon name="clock" size={11} color={colors.ink3} />
          <Text style={styles.lockedText}>After the tour · Profile → Demo profiles</Text>
        </View>
      )}
    </Pressable>
  );
}

/** The screen's single instruction, sitting between the picker and the button it points at. The
 *  chevron bobs on the native thread (no per-frame JS) so the eye lands on the primary CTA
 *  without the page acquiring an idle animation of its own. */
function TourNudge({ name }: { name: string }) {
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 620, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 760, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);

  return (
    <View style={styles.nudge}>
      <Text style={styles.nudgeText}>
        <Text style={styles.nudgeName}>{name}</Text> is loaded. Take the hands-on tour to play it
        out, first as them and then as their lender.
      </Text>
      <Animated.View
        style={{ transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }) }] }}
      >
        <Icon name="chevronDown" size={18} color={colors.accentInk} stroke={2.6} />
      </Animated.View>
    </View>
  );
}

const AVATAR = 40;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  hero: { alignItems: 'center' },
  title: { fontFamily: uiFont(800), fontSize: 27, color: colors.ink, marginTop: 14 },
  subtitle: { fontFamily: uiFont(500), fontSize: 14.5, color: colors.ink2, marginTop: 6 },

  thesis: {
    fontFamily: uiFont(700),
    fontSize: 14,
    color: colors.ink,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 26,
    marginBottom: 14,
    paddingHorizontal: 8,
  },

  rows: { marginBottom: 22 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 13,
    marginVertical: 5,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontFamily: uiFont(800), fontSize: 17 },
  nameCol: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontFamily: uiFont(700), fontSize: 15.5, color: colors.ink },
  role: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink2, marginTop: 1 },
  startBadge: { backgroundColor: colors.accentInk, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  startBadgeText: { fontFamily: uiFont(800), fontSize: 9, letterSpacing: 0.5, color: colors.onAccent },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  pillText: { fontFamily: uiFont(700), fontSize: 11 },
  note: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, lineHeight: 17, marginTop: 9 },
  path: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink3, lineHeight: 16.5, marginTop: 5 },
  pathRecommended: { fontFamily: uiFont(600), color: colors.accentInk },
  // Readable, not erased: the verdict pill and the story still have to carry the
  // three-answers-from-one-engine point even on a row that cannot be picked yet.
  cardLocked: { backgroundColor: colors.surface2, borderStyle: 'dashed' },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  lockedText: { fontFamily: uiFont(600), fontSize: 11.5, color: colors.ink3 },

  nudge: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, paddingHorizontal: 2 },
  nudgeText: { flex: 1, fontFamily: uiFont(500), fontSize: 13, color: colors.ink2, lineHeight: 18 },
  nudgeName: { fontFamily: uiFont(800), color: colors.ink },

  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 999, backgroundColor: colors.accentInk },
  primaryBtnText: { fontFamily: uiFont(700), fontSize: 15.5, color: colors.onAccent },
  secondaryBtn: { alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, marginTop: 10 },
  secondaryBtnText: { fontFamily: uiFont(600), fontSize: 14, color: colors.ink2 },
  btnBusy: { opacity: 0.6 },
  skipBtn: { alignItems: 'center', justifyContent: 'center', height: 40, marginTop: 12 },
  skipText: { fontFamily: uiFont(500), fontSize: 13, color: colors.ink3, textDecorationLine: 'underline' },

  dim: { position: 'absolute', left: 0, right: 0, backgroundColor: colors.ink, opacity: 0.45 },
  halo: {
    position: 'absolute',
    // Matches the ScrollView's own horizontal padding (22): the overlay is fixed over the whole
    // viewport (outside that ScrollView), so it has to restate the inset rather than inherit it
    // — otherwise the ring would float past the card's actual left/right edges.
    left: 22,
    right: 22,
    borderWidth: 2.5,
    borderColor: colors.accent,
    ...platformShadow(colors.accent, 0.5, 10, { width: 0, height: 0 }, 0),
  },
  haloCard: { borderRadius: radius.lg },
  haloPill: { borderRadius: 999 },
});
