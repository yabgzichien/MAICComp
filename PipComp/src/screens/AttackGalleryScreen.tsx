// src/screens/AttackGalleryScreen.tsx
// The Adversarial Attack Gallery: runs a curated corpus of fraud techniques through the real
// Phase-11 integrity rings and reports, per attack, exactly how the deterministic engine responded.
// The numbers are all computed (src/lib/attackGallery.ts); the LLM only narrates the incident report.
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeIn } from '../components/Motion';
import { Icon } from '../components/Icon';
import { Card, TopBar } from '../components/ui';
import { getProvider } from '../llm';
import { ATTACK_SYSTEM_PROMPT, attackFallback, buildAttackPrompt } from '../llm/attackPrompt';
import { runGallery, type AttackResult, type AttackVerdict } from '../lib/attackGallery';
import { configFor, loadSettings } from '../settings/settingsStore';
import { colors, numFont, uiFont } from '../theme';

const NARRATE_TIMEOUT_MS = 12_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

function verdictColor(v: AttackVerdict): string {
  return v === 'caught' ? colors.accent : v === 'flagged' ? colors.amber : colors.red;
}
function verdictLabel(v: AttackVerdict): string {
  return v === 'caught' ? 'Caught' : v === 'flagged' ? 'Flagged' : 'Missed';
}
function decisionLabel(d: AttackResult['decision']): string {
  return d === 'approve' ? 'would approve' : d === 'refer' ? 'routed to manual review' : 'declined';
}

function AttackCard({ result }: { result: AttackResult }) {
  const [report, setReport] = useState<{ text: string; ai: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const vColor = verdictColor(result.verdict);

  const narrate = async () => {
    setBusy(true);
    try {
      const c = configFor(await loadSettings(), 'general');
      const text = await withTimeout(
        getProvider(c.provider).coach({
          apiKey: c.apiKey,
          model: c.model,
          system: ATTACK_SYSTEM_PROMPT,
          prompt: buildAttackPrompt(result),
        }),
        NARRATE_TIMEOUT_MS
      );
      setReport({ text: text.trim(), ai: true });
    } catch {
      setReport({ text: attackFallback(result), ai: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardName}>{result.name}</Text>
        <View style={[styles.verdictPill, { backgroundColor: `${vColor}22` }]}>
          <Text style={[styles.verdictText, { color: vColor }]}>{verdictLabel(result.verdict)}</Text>
        </View>
      </View>
      <Text style={styles.technique}>{result.technique}</Text>

      <View style={styles.resultRow}>
        <Text style={styles.resultLabel}>Data confidence</Text>
        <Text style={[styles.resultValue, { color: vColor }]}>
          {Math.round(result.confidence * 100)}%
          {result.floorBreached ? ' · floor breached' : result.hardCapped ? ' · capped' : ''}
        </Text>
      </View>
      <View style={styles.resultRow}>
        <Text style={styles.resultLabel}>Loan engine</Text>
        <Text style={styles.resultValue}>{decisionLabel(result.decision)}</Text>
      </View>

      {result.firedSignals.length > 0 && (
        <View style={styles.signals}>
          {result.firedSignals.slice(0, 4).map((s, i) => (
            <View key={i} style={styles.signalRow}>
              <Icon name="alert" size={12} color={colors.amber} stroke={2} />
              <Text style={styles.signalText}>{s}</Text>
            </View>
          ))}
        </View>
      )}

      {report ? (
        <View style={styles.report}>
          <View style={styles.reportHead}>
            <Text style={styles.reportKicker}>INCIDENT REPORT</Text>
            <View style={[styles.provTag, report.ai ? styles.provAi : styles.provComputed]}>
              <Text style={[styles.provText, { color: report.ai ? colors.accent : colors.ink3 }]}>{report.ai ? 'AI' : 'Summary'}</Text>
            </View>
          </View>
          <Text style={styles.reportText}>{report.text}</Text>
        </View>
      ) : (
        <Pressable onPress={narrate} style={styles.narrateBtn} disabled={busy}>
          {busy ? <ActivityIndicator size="small" color={colors.accent} /> : <Text style={styles.narrateText}>Generate incident report</Text>}
        </Pressable>
      )}
    </Card>
  );
}

export function AttackGalleryScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const results = useMemo(() => runGallery(), []);
  const caught = results.filter((r) => r.verdict === 'caught').length;

  return (
    <FadeIn style={styles.root}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar title="Attack Gallery" onBack={onBack} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        <Card style={styles.hero}>
          <Text style={styles.heroKicker}>ADVERSARIAL SELF-TEST</Text>
          <Text style={styles.heroScore}>
            {caught}<Text style={styles.heroScoreDenom}>/{results.length} caught</Text>
          </Text>
          <Text style={styles.heroSub}>
            We run known fraud techniques against our own Phase-11 integrity rings. Every result below is
            computed by the deterministic engine — not claimed.
          </Text>
        </Card>

        {results.map((r) => (
          <AttackCard key={r.id} result={r} />
        ))}

        <Text style={styles.footer}>
          Known residual: a fully self-consistent fabricated ledger behind a verified-looking payer is
          only defeated by source-of-truth income (open banking / MyInvois) — on the roadmap.
        </Text>
      </ScrollView>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  hero: { padding: 18, borderRadius: 20 },
  heroKicker: { fontFamily: uiFont(600), fontSize: 10, letterSpacing: 1, color: colors.ink3, marginBottom: 8 },
  heroScore: { fontFamily: numFont(700), fontSize: 30, color: colors.accent },
  heroScoreDenom: { fontFamily: uiFont(600), fontSize: 15, color: colors.ink3 },
  heroSub: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, marginTop: 8, lineHeight: 18 },

  card: { padding: 16, borderRadius: 16, marginTop: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cardName: { fontFamily: uiFont(700), fontSize: 14.5, color: colors.ink, flex: 1 },
  verdictPill: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4 },
  verdictText: { fontFamily: uiFont(700), fontSize: 11.5 },
  technique: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, lineHeight: 18, marginTop: 8 },

  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  resultLabel: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink3 },
  resultValue: { fontFamily: numFont(700), fontSize: 12.5, color: colors.ink },

  signals: { marginTop: 10, gap: 5, backgroundColor: colors.surface2, borderRadius: 10, padding: 10 },
  signalRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  signalText: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink2, flex: 1, lineHeight: 15 },

  narrateBtn: { marginTop: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  narrateText: { fontFamily: uiFont(700), fontSize: 12.5, color: colors.accent },
  report: { marginTop: 12, backgroundColor: colors.accentSoft, borderRadius: 12, padding: 12 },
  reportHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reportKicker: { fontFamily: uiFont(600), fontSize: 9, letterSpacing: 1, color: colors.accentInk },
  provTag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  provAi: { backgroundColor: colors.accentTint },
  provComputed: { backgroundColor: colors.surface },
  provText: { fontFamily: uiFont(700), fontSize: 10, letterSpacing: 0.5 },
  reportText: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink, lineHeight: 18, marginTop: 8 },

  footer: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink3, lineHeight: 17, marginTop: 18, fontStyle: 'italic' },
});
