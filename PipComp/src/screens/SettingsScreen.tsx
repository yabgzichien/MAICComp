import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../components/Icon';
import { Card, Eyebrow, TopBar } from '../components/ui';
import { clearMemory } from '../db/memoryRepo';
import { getProvider, llmErrorMessage } from '../llm';
import { confirmAction } from '../lib/platformAlert';
import { configFor, loadSettings, type LLMSettings, type ProviderRole } from '../settings/settingsStore';
import { useAppData } from '../state/store';
import { colors, radius, uiFont } from '../theme';

type TestState = { status: 'idle' | 'busy' | 'ok' | 'fail'; message?: string };

/** Mask an API key for display, keeping a hint of the start and end. */
function maskKey(key: string): string {
  if (!key) return 'Not configured';
  if (key.length <= 10) return '•'.repeat(key.length);
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export function SettingsScreen({ onBack, onMigrate, onOpenLender = () => {}, onOpenAttacks = () => {} }: { onBack: () => void; onMigrate?: () => void; onOpenLender?: () => void; onOpenAttacks?: () => void }) {
  const insets = useSafeAreaInsets();
  const { memory, refreshAll, expectedIncome, allocations, hasBudget, resetBudget, resetAllData, loadDemoData } = useAppData();
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

  // One-tap judge-demo reset (Demo Data Task 8): wipe whatever the last judge did, then reload
  // the canonical seeded persona  so the next judge always starts from the same clean state.
  const resetDemoConfirm = () => {
    confirmAction(
      'Reset demo?',
      'This clears everything and reloads the seeded demo persona  any scans or applications you made are discarded.',
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
        <Eyebrow style={{ marginBottom: 10 }}>AI providers</Eyebrow>

        <ProviderCard
          settings={settings}
          role="general"
          icon="sparkles"
          name="Groq · general"
          sub="Reads screenshots and writes budget tips."
          model={settings.groqModel}
          apiKey={settings.groqKey}
        />

        <View style={{ height: 14 }} />

        <ProviderCard
          settings={settings}
          role="docs"
          icon="receipt"
          name="Gemini · documents"
          sub="Extracts transactions from imported PDFs, images, and files."
          model={settings.geminiModel}
          apiKey={settings.geminiKey}
        />

        <Text style={styles.help}>The provider keys and models are fixed by the app configuration.</Text>

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

        <Card style={{ padding: 16, marginTop: onMigrate ? 14 : 0 }}>
          <View style={styles.providerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.providerName}>Load demo profile</Text>
              <Text style={styles.providerSub}>Populate 6 months of credit-invisible gig-worker history (gig income, e-wallet spend, Pay-Later liability) for demos.</Text>
            </View>
            <Pressable onPress={() => loadDemoData()} style={styles.resetBtn}>
              <Icon name="sparkles" size={16} color={colors.accent} />
              <Text style={[styles.resetText, { color: colors.accent }]}>Load</Text>
            </Pressable>
          </View>
        </Card>

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
            <Text style={styles.providerSub}>Run known fraud techniques against our own integrity rings  a live self-test.</Text>
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

        <Card style={{ padding: 16, marginTop: 14 }}>
          <View style={styles.providerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.providerName}>Reset all data</Text>
              <Text style={styles.providerSub}>Delete every transaction, learned merchant, and your budget, then restore the default categories.</Text>
            </View>
            <Pressable onPress={resetAllConfirm} style={styles.resetBtn}>
              <Icon name="trash" size={16} color="#b3261e" />
              <Text style={[styles.resetText, { color: '#b3261e' }]}>Reset</Text>
            </Pressable>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

/** One fixed provider: shows its pinned model + masked key (read-only) and a connection test. */
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
  const [showKey, setShowKey] = useState(false);
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

      <ReadonlyField label="API key">
        <View style={styles.keyRow}>
          <Text style={[styles.fieldValue, { flex: 1 }]} numberOfLines={1}>
            {showKey ? apiKey || 'Not configured' : maskKey(apiKey)}
          </Text>
          {!!apiKey && (
            <Pressable onPress={() => setShowKey((s) => !s)} hitSlop={8} style={styles.eyeBtn}>
              <Icon name={showKey ? 'x' : 'search'} size={15} color={colors.ink2} />
            </Pressable>
          )}
        </View>
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
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
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
