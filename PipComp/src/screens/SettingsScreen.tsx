import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../components/Icon';
import { Card, Eyebrow, TopBar } from '../components/ui';
import { clearMemory } from '../db/memoryRepo';
import { getProvider, llmErrorMessage } from '../llm';
import { confirmAction, notify } from '../lib/platformAlert';
import { configFor, loadSettings, type LLMSettings, type ProviderRole } from '../settings/settingsStore';
import { DEMO_PROFILES, type DemoProfileId } from '../data/demoProfile';
import { useAppData } from '../state/store';
import { colors, radius, uiFont } from '../theme';

type TestState = { status: 'idle' | 'busy' | 'ok' | 'fail'; message?: string };



export function SettingsScreen({ onBack, onMigrate, onAdvancedImport, onOpenLender = () => {}, onOpenAttacks = () => {}, onResetToOnboarding }: { onBack: () => void; onMigrate?: () => void; onAdvancedImport?: () => void; onOpenLender?: () => void; onOpenAttacks?: () => void; onResetToOnboarding?: () => void }) {
  const insets = useSafeAreaInsets();
  const { memory, refreshAll, expectedIncome, allocations, hasBudget, resetBudget, resetAllData, resetToOnboarding, loadDemoData, startTour } = useAppData();
  const [settings, setSettings] = useState<LLMSettings | null>(null);
  const [resettingDemo, setResettingDemo] = useState(false);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const learnedCount = Object.keys(memory).length;

  const resetLearned = () => {
    if (learnedCount === 0) return;
    confirmAction('Reset learning?', `Forget all ${learnedCount} learned merchants? This can’t be undone.`, 'Reset', async () => {
      await clearMemory();
      await refreshAll();
    });
  };

  const allocationCount = Object.keys(allocations).length;
  const resetBudgetConfirm = () => {
    if (!hasBudget) return;
    confirmAction('Reset budget?', 'Clear your expected income and all category allocations? This can’t be undone.', 'Reset', () => resetBudget());
  };

  const resetAllConfirm = () => {
    confirmAction(
      'Reset everything?',
      'This deletes all transactions, learned merchants, and your budget, and restores the default categories. This can’t be undone.',
      'Reset',
      () => resetAllData()
    );
  };

  const resetToOnboardingConfirm = () => {
    confirmAction(
      'Reset & go to setup?',
      'This deletes all transactions, learned merchants, your budget, and restores the default categories. You will be returned to the setup wizard. This can’t be undone.',
      'Reset & restart',
      async () => {
        await resetToOnboarding();
        onResetToOnboarding?.();
      }
    );
  };

  // One-tap judge-demo reset (Demo Data Task 8): wipe whatever the last judge did, then reload
  // the canonical seeded persona  so the next judge always starts from the same clean state.
  const resetDemoConfirm = () => {
    confirmAction(
      'Reset demo?',
      'This clears everything and reloads the seeded demo persona. Any scans or applications you made are discarded.',
      'Reset demo',
      async () => {
        setResettingDemo(true);
        try {
          await resetAllData();
          await loadDemoData();
        } finally {
          setResettingDemo(false);
        }
      }
    );
  };

  if (!settings) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar title="Settings" onBack={onBack} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 40 }}>
        <Pressable
          onPress={() =>
            notify(
              'Demo mode',
              'Bureau/registry checks (CTOS, EPF, SOCSO), issuer signing, and eKYC identity verification are mocked for this demo. Score, confidence, and loan decisions are computed live by the real deterministic engines.'
            )
          }
          style={({ pressed }) => [styles.demoChip, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={styles.demoChipText}>DEMO MODE</Text>
        </Pressable>

        {/* Provider/API-key rows are a dev-ops concern, not a judge-facing one (UI/UX
            P3.18): visible locally (__DEV__), stripped from the shipped judge build. */}
        {__DEV__ && (
          <>
            <Eyebrow style={{ marginBottom: 10 }}>AI providers</Eyebrow>

            <ProviderCard
              settings={settings}
              role="general"
              icon="sparkles"
              name="Groq · primary"
              sub="Primary for every task: screenshots, documents, and tips."
              model={settings.groqModel}
              apiKey={settings.groqKey}
            />

            <View style={{ height: 14 }} />

            <ProviderCard
              settings={settings}
              role="docs"
              icon="receipt"
              name="Gemini · fallback"
              sub="Used only if Groq fails — and for PDFs Groq can't read."
              model={settings.geminiModel}
              apiKey={settings.geminiKey}
            />

            <Text style={styles.help}>The provider keys and models are fixed by the app configuration.</Text>
          </>
        )}

        <Eyebrow style={{ marginTop: 26, marginBottom: 10 }}>Learning</Eyebrow>
        <Card style={{ padding: 16 }}>
          <View style={styles.providerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.providerName}>{learnedCount} learned merchant{learnedCount === 1 ? '' : 's'}</Text>
              <Text style={styles.providerSub}>Pip suggests these categories automatically.</Text>
            </View>
            <Pressable onPress={resetLearned} disabled={learnedCount === 0} style={styles.resetBtn}>
              <Icon name="trash" size={16} color={learnedCount === 0 ? colors.ink3 : '#b3261e'} />
              <Text style={[styles.resetText, { color: learnedCount === 0 ? colors.ink3 : '#b3261e' }]}>Reset</Text>
            </Pressable>
          </View>
        </Card>

        <Eyebrow style={{ marginTop: 26, marginBottom: 10 }}>Budget</Eyebrow>
        <Card style={{ padding: 16 }}>
          <View style={styles.providerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.providerName}>
                {hasBudget ? `RM ${expectedIncome.toFixed(2)} income · ${allocationCount} categor${allocationCount === 1 ? 'y' : 'ies'}` : 'No budget set'}
              </Text>
              <Text style={styles.providerSub}>Clear your monthly budget plan.</Text>
            </View>
            <Pressable onPress={resetBudgetConfirm} disabled={!hasBudget} style={styles.resetBtn}>
              <Icon name="trash" size={16} color={!hasBudget ? colors.ink3 : '#b3261e'} />
              <Text style={[styles.resetText, { color: !hasBudget ? colors.ink3 : '#b3261e' }]}>Reset</Text>
            </Pressable>
          </View>
        </Card>

        <Eyebrow style={{ marginTop: 26, marginBottom: 10 }}>Data</Eyebrow>
        {onMigrate && (
          <Pressable
            onPress={onMigrate}
            style={({ pressed }) => [styles.providerRow, styles.migrateRow, { opacity: pressed ? 0.9 : 1 }]}
          >
            <View style={styles.providerBadge}>
              <Icon name="receipt" size={16} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.providerName}>Import / migrate data</Text>
              <Text style={styles.providerSub}>Read past transactions from a PDF, image, CSV, Excel, or Word file.</Text>
            </View>
            <Icon name="chevronRight" size={18} color={colors.ink3} />
          </Pressable>
        )}

        {onAdvancedImport && (
          <Pressable
            onPress={onAdvancedImport}
            style={({ pressed }) => [styles.providerRow, styles.migrateRow, { marginTop: 12, opacity: pressed ? 0.9 : 1 }]}
          >
            <View style={styles.providerBadge}>
              <Icon name="sparkles" size={16} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.providerName}>Advanced import</Text>
              <Text style={styles.providerSub}>Copy a prompt, use any AI (Claude, ChatGPT, Gemini…) to extract your statements, then paste the JSON here.</Text>
            </View>
            <Icon name="chevronRight" size={18} color={colors.ink3} />
          </Pressable>
        )}

        <DemoProfilePicker onLoad={(id) => loadDemoData(id)} />

        <Eyebrow style={{ marginTop: 26, marginBottom: 10 }}>Lender tools</Eyebrow>
        <Pressable
          onPress={onOpenLender}
          style={({ pressed }) => [styles.providerRow, styles.migrateRow, { opacity: pressed ? 0.9 : 1 }]}
        >
          <View style={styles.providerBadge}>
            <Icon name="scale" size={16} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.providerName}>Lender Console</Text>
            <Text style={styles.providerSub}>Verify a Credit Passport and assess an applicant's credit profile.</Text>
          </View>
          <Icon name="chevronRight" size={18} color={colors.ink3} />
        </Pressable>

        <Pressable
          onPress={onOpenAttacks}
          style={({ pressed }) => [styles.providerRow, styles.migrateRow, { marginTop: 12, opacity: pressed ? 0.9 : 1 }]}
        >
          <View style={styles.providerBadge}>
            <Icon name="alert" size={16} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.providerName}>Attack Gallery</Text>
            <Text style={styles.providerSub}>Run known fraud techniques against our own integrity rings. A live self-test.</Text>
          </View>
          <Icon name="chevronRight" size={18} color={colors.ink3} />
        </Pressable>

        <Pressable
          onPress={() => void startTour({ fresh: true })}
          style={({ pressed }) => [styles.providerRow, styles.migrateRow, { marginTop: 12, opacity: pressed ? 0.9 : 1 }]}
        >
          <View style={styles.providerBadge}>
            <Icon name="sparkles" size={16} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.providerName}>Restart judge tour</Text>
            <Text style={styles.providerSub}>Replay the guided walkthrough from the start.</Text>
          </View>
          <Icon name="chevronRight" size={18} color={colors.ink3} />
        </Pressable>

        <Card style={{ padding: 16, marginTop: 14 }}>
          <View style={styles.providerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.providerName}>Reset demo</Text>
              <Text style={styles.providerSub}>One tap: clear whatever you've mutated and reload the seeded judge persona.</Text>
            </View>
            <Pressable onPress={resetDemoConfirm} style={styles.resetBtn} disabled={resettingDemo}>
              {resettingDemo ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <>
                  <Icon name="sparkles" size={16} color={colors.accent} />
                  <Text style={[styles.resetText, { color: colors.accent }]}>Reset demo</Text>
                </>
              )}
            </Pressable>
          </View>
        </Card>

        {/* Distinct "danger zone" treatment  this is the one irreversible action on this
            screen, so it shouldn't look like every other settings row. */}
        <Card style={[{ padding: 16, marginTop: 14 }, styles.dangerCard]}>
          <View style={styles.providerRow}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="alert" size={13} color="#b3261e" />
                <Text style={[styles.providerName, { color: '#b3261e' }]}>Reset all data</Text>
              </View>
              <Text style={styles.providerSub}>Delete every transaction, learned merchant, and your budget, then restore the default categories. This can't be undone.</Text>
            </View>
            <Pressable onPress={resetAllConfirm} style={styles.resetBtn}>
              <Icon name="trash" size={16} color="#b3261e" />
              <Text style={[styles.resetText, { color: '#b3261e' }]}>Reset</Text>
            </Pressable>
          </View>
        </Card>

        <Card style={[{ padding: 16, marginTop: 10 }, styles.dangerCard]}>
          <View style={styles.providerRow}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="alert" size={13} color="#b3261e" />
                <Text style={[styles.providerName, { color: '#b3261e' }]}>Reset & go to setup</Text>
              </View>
              <Text style={styles.providerSub}>Wipe all data and return to the setup wizard. Useful for a full fresh start. This can't be undone.</Text>
            </View>
            <Pressable onPress={resetToOnboardingConfirm} style={styles.resetBtn}>
              <Icon name="trash" size={16} color="#b3261e" />
              <Text style={[styles.resetText, { color: '#b3261e' }]}>Reset</Text>
            </Pressable>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

/** One fixed provider: shows its pinned model and a connection test (key is never displayed). */
function ProviderCard({
  settings,
  role,
  icon,
  name,
  sub,
  model,
  apiKey,
}: {
  settings: LLMSettings;
  role: ProviderRole;
  icon: IconName;
  name: string;
  sub: string;
  model: string;
  apiKey: string;
}) {
  const [test, setTest] = useState<TestState>({ status: 'idle' });

  const runTest = async () => {
    const cfg = configFor(settings, role);
    if (!cfg.apiKey.trim()) {
      setTest({ status: 'fail', message: 'No API key is configured.' });
      return;
    }
    setTest({ status: 'busy' });
    try {
      await getProvider(cfg.provider).test({ apiKey: cfg.apiKey.trim(), model: cfg.model.trim() });
      setTest({ status: 'ok', message: `Connected to ${getProvider(cfg.provider).label}.` });
    } catch (e) {
      setTest({ status: 'fail', message: `${getProvider(cfg.provider).label}: ${llmErrorMessage(e)}` });
    }
  };

  return (
    <Card style={{ padding: 16, gap: 14 }}>
      <View style={styles.providerRow}>
        <View style={styles.providerBadge}>
          <Icon name={icon} size={16} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.providerName}>{name}</Text>
          <Text style={styles.providerSub}>{sub}</Text>
        </View>
      </View>

      <ReadonlyField label="Model">
        <Text style={styles.fieldValue}>{model}</Text>
      </ReadonlyField>

      <Pressable onPress={runTest} style={({ pressed }) => [styles.testBtn, pressed && { opacity: 0.9 }]}>
        {test.status === 'busy' ? (
          <ActivityIndicator color={colors.accent} size="small" />
        ) : (
          <>
            <Icon name="check" size={16} color={colors.accent} stroke={2.4} />
            <Text style={styles.testBtnText}>Test connection</Text>
          </>
        )}
      </Pressable>

      {test.status === 'ok' && <Text style={[styles.result, { color: colors.accentInk }]}>✓ {test.message}</Text>}
      {test.status === 'fail' && <Text style={[styles.result, { color: '#b3261e' }]}>{test.message}</Text>}
    </Card>
  );
}

// ── Demo Profile Picker ───────────────────────────────────────────────────────

/** Accent color for each profile — distinct so judges visually parse the spectrum at a glance. */
const PROFILE_ACCENT: Record<DemoProfileId, string> = {
  aina: colors.accent,
  ravi: '#2e7d32',   // deep green — strong/Excellent
  faizal: '#c0392b', // red-amber  — fraud-flagged
};

const PROFILE_ICON: Record<DemoProfileId, IconName> = {
  aina: 'sparkles',
  ravi: 'check',
  faizal: 'alert',
};

function DemoProfilePicker({ onLoad }: { onLoad: (id: DemoProfileId) => void }) {
  const [loading, setLoading] = useState<DemoProfileId | null>(null);

  const handleLoad = (id: DemoProfileId) => {
    const meta = DEMO_PROFILES.find((p) => p.id === id)!;
    confirmAction(
      `Load ${meta.name}?`,
      `This replaces whatever is currently loaded with ${meta.name}'s demo data. This can't be undone.`,
      'Load',
      async () => {
        setLoading(id);
        try {
          await onLoad(id);
        } finally {
          setLoading(null);
        }
      }
    );
  };

  const [primary, ...secondary] = DEMO_PROFILES;

  return (
    <View style={{ gap: 10 }}>
      {/* Primary row — Aina, the default profile */}
      <Card style={{ padding: 16 }}>
        <View style={styles.providerRow}>
          <View style={[styles.providerBadge, { backgroundColor: `${PROFILE_ACCENT[primary.id]}18` }]}>
            <Icon name={PROFILE_ICON[primary.id]} size={16} color={PROFILE_ACCENT[primary.id]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.providerName}>{primary.name}</Text>
            <Text style={styles.providerSub}>{primary.story}</Text>
          </View>
          <Pressable onPress={() => handleLoad(primary.id)} style={styles.resetBtn} disabled={loading !== null}>
            {loading === primary.id
              ? <ActivityIndicator size="small" color={PROFILE_ACCENT[primary.id]} />
              : <>
                  <Icon name={PROFILE_ICON[primary.id]} size={16} color={PROFILE_ACCENT[primary.id]} />
                  <Text style={[styles.resetText, { color: PROFILE_ACCENT[primary.id] }]}>Load</Text>
                </>}
          </Pressable>
        </View>
      </Card>

      {/* Secondary rows — Ravi and Faizal */}
      {secondary.map((profile) => (
        <Pressable
          key={profile.id}
          onPress={() => handleLoad(profile.id)}
          disabled={loading !== null}
          style={({ pressed }) => [styles.providerRow, styles.migrateRow, { opacity: pressed ? 0.88 : 1 }]}
        >
          <View style={[styles.providerBadge, { backgroundColor: `${PROFILE_ACCENT[profile.id]}18` }]}>
            {loading === profile.id
              ? <ActivityIndicator size="small" color={PROFILE_ACCENT[profile.id]} />
              : <Icon name={PROFILE_ICON[profile.id]} size={16} color={PROFILE_ACCENT[profile.id]} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.providerName, { color: PROFILE_ACCENT[profile.id] }]}>{profile.name}</Text>
            <Text style={styles.providerSub}>{profile.story}</Text>
          </View>
          <Icon name="chevronRight" size={18} color={colors.ink3} />
        </Pressable>
      ))}
    </View>
  );
}

function ReadonlyField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldBox}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  demoChip: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    paddingVertical: 4,
    paddingHorizontal: 9,
    marginBottom: 14,
  },
  demoChipText: { fontFamily: uiFont(700), fontSize: 11, letterSpacing: 0.5, color: colors.ink2 },
  dangerCard: { borderColor: 'rgba(179,38,30,0.28)', backgroundColor: 'rgba(179,38,30,0.03)' },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  providerBadge: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: colors.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerName: { fontFamily: uiFont(700), fontSize: 15, color: colors.ink },
  providerSub: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, marginTop: 1 },
  fieldLabel: { fontFamily: uiFont(600), fontSize: 12.5, color: colors.ink2 },
  fieldBox: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  fieldValue: { fontFamily: uiFont(500), fontSize: 14, color: colors.ink },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 999,
    backgroundColor: colors.accentTint,
    borderWidth: 1,
    borderColor: colors.accentSoft,
  },
  testBtnText: { fontFamily: uiFont(600), fontSize: 14.5, color: colors.accent },
  result: { fontFamily: uiFont(600), fontSize: 13, lineHeight: 18 },
  help: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink2, lineHeight: 17, paddingHorizontal: 4, paddingTop: 12 },
  migrateRow: { padding: 16, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2 },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 8 },
  resetText: { fontFamily: uiFont(600), fontSize: 13.5 },
});
