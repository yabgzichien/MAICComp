// src/screens/OnboardingScreen.tsx
// The artifact's front door. Its job is to get someone into a working demo in one tap and to
// show, before they tap, that one engine produces three different lender answers.
//
// eKYC deliberately does NOT appear here: it's a mock provider, it asks for an NRIC, and as the
// loudest control on the first screen it read as a real identity wall. It stays reachable from
// the Credit Passport screen (App.tsx routes to 'kyc') and the guided tour still walks through
// it in act 5, so nothing is lost.
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { Pip } from '../components/Pip';
import { DEMO_PROFILES, type DemoPersona, type DemoProfileId } from '../data/demoPersonas';
import { VERDICT_STYLE } from '../lib/verdictStyle';
import { useAppData } from '../state/store';
import { colors, shadowCard, uiFont } from '../theme';

export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { completeOnboarding, loadDemoData, startTour } = useAppData();
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<DemoProfileId>('aina');

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
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ padding: 22, paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 }}
      >
        <View style={styles.hero}>
          <Pip size={76} expr={selected.expr} float />
          <Text style={styles.title}>Pip Credit</Text>
          <Text style={styles.subtitle}>Credit for people the system can't see.</Text>
        </View>

        <Text style={styles.thesis}>Same engine. Three borrowers. Three different answers.</Text>

        <View style={styles.rows}>
          {DEMO_PROFILES.map((persona) => (
            <PersonaRow
              key={persona.id}
              persona={persona}
              selected={persona.id === selectedId}
              onSelect={() => setSelectedId(persona.id)}
            />
          ))}
        </View>

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
    </View>
  );
}

function PersonaRow({
  persona,
  selected,
  onSelect,
}: {
  persona: DemoPersona;
  selected: boolean;
  onSelect: () => void;
}) {
  const v = VERDICT_STYLE[persona.outcome.decision];

  return (
    <Pressable
      style={[
        styles.card,
        selected && shadowCard,
        selected && { borderColor: v.line, backgroundColor: v.fill },
      ]}
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${persona.name}, ${persona.role}. ${persona.outcome.label}. ${persona.outcome.note}`}
    >
      <View style={styles.cardHead}>
        <View style={[styles.avatar, { backgroundColor: v.fill, borderColor: v.line }]}>
          <Text style={[styles.avatarLetter, { color: v.ink }]}>{persona.name.charAt(0)}</Text>
        </View>
        <View style={styles.nameCol}>
          <Text style={styles.name}>{persona.name}</Text>
          <Text style={styles.role}>{persona.role}</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: v.fill, borderColor: v.line }]}>
          <Icon name={v.icon} size={11} color={v.ink} stroke={2.5} />
          <Text style={[styles.pillText, { color: v.ink }]}>{persona.outcome.label}</Text>
        </View>
      </View>
      <Text style={styles.note}>{persona.outcome.note}</Text>
    </Pressable>
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
  name: { fontFamily: uiFont(700), fontSize: 15.5, color: colors.ink },
  role: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink2, marginTop: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  pillText: { fontFamily: uiFont(700), fontSize: 11 },
  note: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, lineHeight: 17, marginTop: 9 },

  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 999, backgroundColor: colors.accentInk },
  primaryBtnText: { fontFamily: uiFont(700), fontSize: 15.5, color: colors.onAccent },
  secondaryBtn: { alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, marginTop: 10 },
  secondaryBtnText: { fontFamily: uiFont(600), fontSize: 14, color: colors.ink2 },
  btnBusy: { opacity: 0.6 },
  skipBtn: { alignItems: 'center', justifyContent: 'center', height: 40, marginTop: 12 },
  skipText: { fontFamily: uiFont(500), fontSize: 13, color: colors.ink3, textDecorationLine: 'underline' },
});
