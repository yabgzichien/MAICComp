// src/screens/OnboardingScreen.tsx
// The artifact's front door. Its job is to get someone into a working demo in one tap and to
// show, before they tap, that one engine produces three different lender answers.
//
// eKYC deliberately does NOT appear here: it's a mock provider, it asks for an NRIC, and as the
// loudest control on the first screen it read as a real identity wall. It stays reachable from
// the Credit Passport screen (App.tsx routes to 'kyc') and the guided tour still walks through
// it in act 5, so nothing is lost.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { Pip } from '../components/Pip';
import { canStartWith, DEMO_PROFILES, RECOMMENDED_DEMO_PROFILE, TOUR_PATH, type DemoPersona, type DemoProfileId } from '../data/demoPersonas';
import { verdictStyle } from '../lib/verdictStyle';
import { useAccent } from '../state/accent';
import { useColorSchemeMode, useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { colors, radius, shadowCard, uiFont } from '../theme';

export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
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

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      <ScrollView contentContainerStyle={{ padding: 22, paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 }}>
        <View style={styles.hero}>
          <Pip size={76} expr={selected.expr} float />
          <Text style={[styles.title, { color: colorTheme.ink }]}>Pip Credit</Text>
          <Text style={[styles.subtitle, { color: colorTheme.ink2 }]}>Credit for people the system can't see.</Text>
        </View>

        <PipGreeting />

        <Text style={[styles.thesis, { color: colorTheme.ink }]}>Please proceed with the YanYan demo account walkthrough first.</Text>

        <View style={styles.rows}>
          {DEMO_PROFILES.map((persona) => (
            <PersonaRow
              key={persona.id}
              persona={persona}
              selected={persona.id === selectedId}
              startable={canStartWith(persona)}
              onSelect={() => setSelectedId(persona.id)}
            />
          ))}
        </View>

        {/* The one instruction on the screen, pointing at the one button that matters. The rows
            above have already said WHO is loaded and why; this says what to do next. */}
        <TourNudge name={selected.name} />

        <Pressable
          style={[styles.primaryBtn, { backgroundColor: theme.accentInk }, busy && styles.btnBusy]}
          onPress={() => void enter(true)}
          disabled={busy}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.onAccent} />
          ) : (
            <>
              <Icon name="sparkles" size={16} color={colors.onAccent} />
              <Text style={styles.primaryBtnText}>Take the tour</Text>
            </>
          )}
        </Pressable>

        <Pressable
          style={[styles.secondaryBtn, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }, busy && styles.btnBusy]}
          onPress={() => void enter(false)}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={[styles.secondaryBtnText, { color: colorTheme.ink2 }]}>Just explore {selected.name}'s profile</Text>
        </Pressable>

        <Pressable
          style={styles.skipBtn}
          onPress={() => void completeOnboarding()}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={[styles.skipText, { color: colorTheme.ink3 }]}>Start empty instead</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/** Pip's own hello, styled exactly like the guided tour's step card (`TourCard`)  Pip seated
 *  atop the left corner of a bordered speech card  so the mascot the judge is about to spend
 *  ten acts with says hi in its own voice before the picker below ever appears. Static (no act
 *  meter, no Next/Skip): the tour proper hasn't started yet, this is only the front door. */
function PipGreeting() {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  return (
    <View style={styles.greetingWrap}>
      <View style={styles.pipSeat} pointerEvents="none">
        <Pip size={46} expr="happy" />
      </View>
      <View style={[styles.greetingCard, { backgroundColor: colorTheme.surface, borderColor: theme.accentSoft }]}>
        <Text style={[styles.greetingTitle, { color: colorTheme.ink }]}>Hi, I'm Pip. Welcome, judge.</Text>
        <Text style={[styles.greetingBody, { color: colorTheme.ink2 }]}>
          I read the messy income proof formal lenders can't, so people with no paper trail can
          still get scored.
        </Text>
      </View>
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
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { resolvedScheme } = useColorSchemeMode();
  const v = verdictStyle(resolvedScheme)[persona.outcome.decision];
  const path = TOUR_PATH[persona.outcome.decision];

  return (
    <Pressable
      style={[
        styles.card,
        { backgroundColor: colorTheme.surface, borderColor: colorTheme.line },
        selected && shadowCard,
        selected && { borderColor: v.line, backgroundColor: v.fill },
        !startable && [styles.cardLocked, { backgroundColor: colorTheme.surface2 }],
      ]}
      onPress={onSelect}
      disabled={!startable}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !startable }}
      accessibilityLabel={`${persona.name}, ${persona.role}. ${persona.outcome.label}.${path.recommended ? ' Start here.' : ''} ${persona.outcome.note} ${path.line}${startable ? '' : ' Available after the tour, from Settings, Demo profiles.'}`}
    >
      <View style={styles.cardHead}>
        <View style={[styles.avatar, { backgroundColor: v.fill, borderColor: v.line }]}>
          <Text style={[styles.avatarLetter, { color: v.ink }]}>{persona.name.charAt(0)}</Text>
        </View>
        <View style={styles.nameCol}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colorTheme.ink }]}>{persona.name}</Text>
            {/* Sits beside the name rather than in the head's right slot, which the verdict pill
                already owns  the badge is about the tour, the pill about the lending answer. */}
            {path.recommended && (
              <View style={[styles.startBadge, { backgroundColor: theme.accentInk }]}>
                <Text style={styles.startBadgeText}>START HERE</Text>
              </View>
            )}
          </View>
          <Text style={[styles.role, { color: colorTheme.ink2 }]}>{persona.role}</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: v.fill, borderColor: v.line }]}>
          <Icon name={v.icon} size={11} color={v.ink} stroke={2.5} />
          <Text style={[styles.pillText, { color: v.ink }]}>{persona.outcome.label}</Text>
        </View>
      </View>
      <Text style={[styles.note, { color: colorTheme.ink2 }]}>{persona.outcome.note}</Text>
      {/* Why this ending, in tour terms. The recommended one earns full ink; the two short paths
          stay muted  they are a caveat on a choice, not a pitch for it. */}
      <Text style={[styles.path, { color: colorTheme.ink3 }, path.recommended && { fontFamily: uiFont(600), color: theme.accentInk }]}>{path.line}</Text>
      {/* A dead row with no explanation reads as a bug. Says when it opens and exactly where,
          so withholding it is a signposted route rather than a wall. */}
      {!startable && (
        <View style={styles.lockedRow}>
          <Icon name="clock" size={11} color={colorTheme.ink3} />
          <Text style={[styles.lockedText, { color: colorTheme.ink3 }]}>After the tour · Settings → Demo profiles</Text>
        </View>
      )}
    </Pressable>
  );
}

/** The screen's single instruction, sitting between the picker and the button it points at. The
 *  chevron bobs on the native thread (no per-frame JS) so the eye lands on the primary CTA
 *  without the page acquiring an idle animation of its own. */
function TourNudge({ name }: { name: string }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
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
      <Text style={[styles.nudgeText, { color: colorTheme.ink2 }]}>
        <Text style={[styles.nudgeName, { color: colorTheme.ink }]}>{name}</Text> is loaded. Take the tour to play it out,
        first as them and then as their lender.
      </Text>
      <Animated.View
        style={{ transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }) }] }}
      >
        <Icon name="chevronDown" size={18} color={theme.accentInk} stroke={2.6} />
      </Animated.View>
    </View>
  );
}

const AVATAR = 40;

const styles = StyleSheet.create({
  root: { flex: 1 },

  hero: { alignItems: 'center' },
  title: { fontFamily: uiFont(800), fontSize: 27, marginTop: 14 },
  subtitle: { fontFamily: uiFont(500), fontSize: 14.5, marginTop: 6 },

  // Mirrors TourCard's own pipSeat + card: the mascot perches on the card's top-left corner,
  // overlapping its border, exactly as it does throughout the guided tour.
  greetingWrap: { marginTop: 44, marginBottom: 8 },
  pipSeat: { position: 'absolute', top: -34, left: 22, zIndex: 1 },
  greetingCard: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: 16,
    paddingTop: 14,
    ...shadowCard,
  },
  greetingTitle: { fontFamily: uiFont(800), fontSize: 15, marginBottom: 4 },
  greetingBody: { fontFamily: uiFont(500), fontSize: 13.5, lineHeight: 19 },

  thesis: {
    fontFamily: uiFont(700),
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 26,
    marginBottom: 14,
    paddingHorizontal: 8,
  },

  rows: { marginBottom: 22 },

  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 13,
    marginVertical: 5,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontFamily: uiFont(800), fontSize: 17 },
  nameCol: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontFamily: uiFont(700), fontSize: 15.5 },
  role: { fontFamily: uiFont(500), fontSize: 12, marginTop: 1 },
  startBadge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  startBadgeText: { fontFamily: uiFont(800), fontSize: 9, letterSpacing: 0.5, color: colors.onAccent },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  pillText: { fontFamily: uiFont(700), fontSize: 11 },
  note: { fontFamily: uiFont(500), fontSize: 12.5, lineHeight: 17, marginTop: 9 },
  path: { fontFamily: uiFont(500), fontSize: 12, lineHeight: 16.5, marginTop: 5 },
  // Readable, not erased: the verdict pill and the story still have to carry the
  // three-answers-from-one-engine point even on a row that cannot be picked yet.
  cardLocked: { borderStyle: 'dashed' },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  lockedText: { fontFamily: uiFont(600), fontSize: 11.5 },

  nudge: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, paddingHorizontal: 2 },
  nudgeText: { flex: 1, fontFamily: uiFont(500), fontSize: 13, lineHeight: 18 },
  nudgeName: { fontFamily: uiFont(800) },

  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 999 },
  primaryBtnText: { fontFamily: uiFont(700), fontSize: 15.5, color: colors.onAccent },
  secondaryBtn: { alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 999, borderWidth: 1, marginTop: 10 },
  secondaryBtnText: { fontFamily: uiFont(600), fontSize: 14 },
  btnBusy: { opacity: 0.6 },
  skipBtn: { alignItems: 'center', justifyContent: 'center', height: 40, marginTop: 12 },
  skipText: { fontFamily: uiFont(500), fontSize: 13, textDecorationLine: 'underline' },
});
