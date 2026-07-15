// src/screens/OnboardingScreen.tsx
// One-time setup. The user can verify identity (eKYC) now to unlock credit & financing, or
// skip and use Pip as a plain money tracker  eKYC is required later only to borrow.
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { Pip } from '../components/Pip';
import { Card } from '../components/ui';
import { DEMO_PROFILES, type DemoProfileId } from '../data/demoProfile';
import { useAppData } from '../state/store';
import { colors, uiFont } from '../theme';
import { KycScreen } from './KycScreen';

const PROFILE_ACCENT: Record<DemoProfileId, string> = {
  aina: colors.accent,
  ravi: '#2e7d32',
  faizal: '#c0392b',
};

export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { completeOnboarding, loadDemoData, startTour } = useAppData();
  const [mode, setMode] = useState<'intro' | 'kyc'>('intro');
  const [startingTour, setStartingTour] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<DemoProfileId>('aina');

  async function takeTour() {
    setStartingTour(true);
    await loadDemoData(selectedProfile);
    await completeOnboarding();
    await startTour({ fresh: true });
  }

  if (mode === 'kyc') {
    // Verify identity inline; finishing (Done) completes onboarding straight to home.
    return <KycScreen onBack={() => setMode('intro')} onDone={() => void completeOnboarding()} />;
  }

  const activeMeta = DEMO_PROFILES.find((p) => p.id === selectedProfile);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ padding: 22, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }}>
        <View style={styles.hero}>
          <Pip size={88} expr="happy" float />
          <Text style={styles.title}>Welcome to Pip Credit</Text>
          <Text style={styles.subtitle}>
            Track your money, build a transparent credit profile, and unlock financing you can
            actually qualify for.
          </Text>
        </View>

        <Card style={styles.choiceCard}>
          <View style={styles.choiceHead}>
            <Icon name="check" size={16} color={colors.accentInk} stroke={2.5} />
            <Text style={styles.choiceTitle}>Verify identity, unlock credit & loans</Text>
          </View>
          <Text style={styles.choiceBody}>
            A quick identity check (demo) binds your Credit Passport to you, so lenders can trust
            it. Required to apply for financing.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => setMode('kyc')}>
            <Text style={styles.primaryBtnText}>Verify my identity</Text>
          </Pressable>
        </Card>

        <View style={styles.selectorContainer}>
          <Text style={styles.selectorLabel}>Tour starting profile:</Text>
          <View style={styles.segmentedControl}>
            {DEMO_PROFILES.map((p) => {
              const isSelected = selectedProfile === p.id;
              return (
                <Pressable
                  key={p.id}
                  style={[
                    styles.segmentButton,
                    isSelected && styles.segmentButtonActive,
                    isSelected && { borderColor: PROFILE_ACCENT[p.id] },
                  ]}
                  onPress={() => setSelectedProfile(p.id)}
                >
                  <Text style={[styles.segmentText, isSelected && { color: PROFILE_ACCENT[p.id] }]}>
                    {p.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {activeMeta && (
            <Text style={styles.profileStory}>
              {activeMeta.story}
            </Text>
          )}
        </View>

        <Pressable
          style={[styles.tourBtn, { borderColor: PROFILE_ACCENT[selectedProfile] }]}
          onPress={() => void takeTour()}
          disabled={startingTour}
        >
          {startingTour ? (
            <ActivityIndicator size="small" color={colors.accentInk} />
          ) : (
            <>
              <Icon name="sparkles" size={16} color={PROFILE_ACCENT[selectedProfile]} />
              <Text style={[styles.tourText, { color: PROFILE_ACCENT[selectedProfile] }]}>
                Take the 2-minute tour
              </Text>
            </>
          )}
        </Pressable>
        <Text style={styles.skipHint}>Loads the selected profile. Reset it any time in Settings.</Text>

        <Pressable style={styles.skipBtn} onPress={() => void completeOnboarding()}>
          <Text style={styles.skipText}>Skip for now, just track my money</Text>
        </Pressable>
        <Text style={styles.skipHint}>You can verify later from the Credit Passport screen.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: { alignItems: 'center', marginBottom: 28 },
  title: { fontFamily: uiFont(800), fontSize: 26, color: colors.ink, marginTop: 16, textAlign: 'center' },
  subtitle: { fontFamily: uiFont(500), fontSize: 14.5, color: colors.ink2, lineHeight: 21, textAlign: 'center', marginTop: 10, paddingHorizontal: 6 },
  choiceCard: { padding: 18, backgroundColor: colors.accentTint, borderColor: colors.accentSoft },
  choiceHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  choiceTitle: { fontFamily: uiFont(700), fontSize: 15, color: colors.accentInk, flex: 1 },
  choiceBody: { fontFamily: uiFont(500), fontSize: 13.5, color: colors.ink2, lineHeight: 19, marginTop: 10 },
  primaryBtn: { alignItems: 'center', justifyContent: 'center', height: 50, borderRadius: 999, backgroundColor: colors.accentInk, marginTop: 16 },
  primaryBtnText: { fontFamily: uiFont(700), fontSize: 15, color: colors.onAccent },
  skipBtn: { alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, marginTop: 16 },
  skipText: { fontFamily: uiFont(600), fontSize: 14, color: colors.ink2 },
  skipHint: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink2, textAlign: 'center', marginTop: 10 },
  tourBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 999, backgroundColor: colors.accentTint, borderWidth: 1, borderColor: colors.accentSoft, marginTop: 12 },
  tourText: { fontFamily: uiFont(700), fontSize: 14, color: colors.accentInk },
  selectorContainer: { marginTop: 20, gap: 8 },
  selectorLabel: { fontFamily: uiFont(600), fontSize: 12.5, color: colors.ink2, alignSelf: 'center' },
  segmentedControl: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: 999, padding: 3, borderWidth: 1, borderColor: colors.line },
  segmentButton: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 999, borderWidth: 1, borderColor: 'transparent' },
  segmentButtonActive: { backgroundColor: colors.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 1, elevation: 1 },
  segmentText: { fontFamily: uiFont(700), fontSize: 13, color: colors.ink2 },
  profileStory: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink2, textAlign: 'center', marginTop: 4, paddingHorizontal: 12, lineHeight: 17 },
});
