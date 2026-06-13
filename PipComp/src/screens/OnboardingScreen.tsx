// src/screens/OnboardingScreen.tsx
// One-time setup. The user can verify identity (eKYC) now to unlock credit & financing, or
// skip and use Pip as a plain money tracker — eKYC is required later only to borrow.
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { Pip } from '../components/Pip';
import { Card } from '../components/ui';
import { useAppData } from '../state/store';
import { colors, uiFont } from '../theme';
import { KycScreen } from './KycScreen';

export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { completeOnboarding } = useAppData();
  const [mode, setMode] = useState<'intro' | 'kyc'>('intro');

  if (mode === 'kyc') {
    // Verify identity inline; finishing (Done) completes onboarding straight to home.
    return <KycScreen onBack={() => setMode('intro')} onDone={() => void completeOnboarding()} />;
  }

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
            <Text style={styles.choiceTitle}>Verify identity — unlock credit & loans</Text>
          </View>
          <Text style={styles.choiceBody}>
            A quick identity check (demo) binds your Credit Passport to you, so lenders can trust
            it. Required to apply for financing.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => setMode('kyc')}>
            <Text style={styles.primaryBtnText}>Verify my identity</Text>
          </Pressable>
        </Card>

        <Pressable style={styles.skipBtn} onPress={() => void completeOnboarding()}>
          <Text style={styles.skipText}>Skip for now — just track my money</Text>
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
  primaryBtn: { alignItems: 'center', justifyContent: 'center', height: 50, borderRadius: 999, backgroundColor: colors.accent, marginTop: 16 },
  primaryBtnText: { fontFamily: uiFont(700), fontSize: 15, color: colors.onAccent },
  skipBtn: { alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, marginTop: 16 },
  skipText: { fontFamily: uiFont(600), fontSize: 14, color: colors.ink2 },
  skipHint: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink3, textAlign: 'center', marginTop: 10 },
});
