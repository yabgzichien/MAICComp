import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../components/Icon';
import { Card, Eyebrow, TopBar } from '../components/ui';
import { clearMemory } from '../db/memoryRepo';
import { getProvider, llmErrorMessage } from '../llm';
import { confirmAction, notify } from '../lib/platformAlert';
import { configFor, loadSettings, type LLMSettings, type ProviderRole } from '../settings/settingsStore';
import { DEMO_PROFILES, type DemoProfileId } from '../data/demoProfile';
import { verdictStyle } from '../lib/verdictStyle';
import { cadenceLabel, REMINDER_CADENCES } from '../lib/reminders';
import { AGING_DAYS } from '../lib/split';
import { ensurePermission } from '../notifications';
import { useAccent, useAccentPreset } from '../state/accent';
import { useColorSchemeMode, useThemeColors, type ColorSchemeMode } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { radius, uiFont } from '../theme';

type TestState = { status: 'idle' | 'busy' | 'ok' | 'fail'; message?: string };



export function SettingsScreen({ onBack, onMigrate, onAdvancedImport, onOpenExport, onOpenAttacks = () => {}, onOpenCategories, onOpenCommitments, onResetToOnboarding }: { onBack: () => void; onMigrate?: () => void; onAdvancedImport?: () => void; onOpenExport?: () => void; onOpenAttacks?: () => void; onOpenCategories?: () => void; onOpenCommitments?: () => void; onResetToOnboarding?: () => void }) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { memory, refreshAll, expectedIncome, allocations, hasBudget, resetBudget, resetAllData, resetToOnboarding, loadDemoData, startTour, activeDemoProfile } = useAppData();
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
          // loadDemoData wipes and rotates the passport key itself now, so the explicit
          // resetAllData that used to precede it here would just be a second wipe.
          await loadDemoData();
        } finally {
          setResettingDemo(false);
        }
      }
    );
  };

  if (!settings) {
    return (
      <View style={[styles.root, { backgroundColor: colorTheme.bg, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
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
          style={({ pressed }) => [
            styles.demoChip,
            { borderColor: colorTheme.line, backgroundColor: colorTheme.surface2 },
            { opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.demoChipText, { color: colorTheme.ink2 }]}>DEMO MODE</Text>
        </Pressable>

        <Eyebrow style={{ marginBottom: 10 }}>Appearance</Eyebrow>
        <Card style={{ padding: 16 }}>
          <Text style={[styles.providerName, { color: colorTheme.ink }]}>Theme</Text>
          <Text style={[styles.providerSub, { color: colorTheme.ink2, marginBottom: 12 }]}>Light, dark, or match your device.</Text>
          <ThemeModePicker />
        </Card>
        <Card style={{ padding: 16, marginTop: 12 }}>
          <Text style={[styles.providerName, { color: colorTheme.ink }]}>Accent color</Text>
          <Text style={[styles.providerSub, { color: colorTheme.ink2, marginBottom: 12 }]}>Choose the color used for buttons, chips, and highlights.</Text>
          <AccentColorPicker />
        </Card>

        {/* Hidden on web rather than disabled: expo-notifications has no web support, and a
            control that silently does nothing is worse than one that is not offered. */}
        {Platform.OS !== 'web' && (
          <>
            <Eyebrow style={{ marginTop: 26, marginBottom: 10 }}>Reminders</Eyebrow>
            <Card style={{ padding: 16 }}>
              <Text style={[styles.providerName, { color: colorTheme.ink }]}>Log your spending</Text>
              <Text style={[styles.providerSub, { color: colorTheme.ink2, marginBottom: 12 }]}>
                A nudge at 10pm when you have not logged anything. Days you already logged are skipped.
              </Text>
              <LogReminderPicker />
            </Card>
            <Card style={{ padding: 16, marginTop: 12 }}>
              <Text style={[styles.providerName, { color: colorTheme.ink }]}>Chase what you’re owed</Text>
              <Text style={[styles.providerSub, { color: colorTheme.ink2, marginBottom: 12 }]}>
                A weekly nudge at 10pm once someone has owed you for {AGING_DAYS} days or more.
              </Text>
              <OwedReminderPicker />
            </Card>
            <Card style={{ padding: 16, marginTop: 12 }}>
              <Text style={[styles.providerName, { color: colorTheme.ink }]}>Recurring bills</Text>
              <Text style={[styles.providerSub, { color: colorTheme.ink2, marginBottom: 12 }]}>
                A monthly summary of what's due, plus a nudge for anything overdue.
              </Text>
              <CommitmentReminderPicker />
            </Card>
          </>
        )}

        {/* Provider/API-key rows are a dev-ops concern, not a judge-facing one (UI/UX
            P3.18): visible locally (__DEV__), stripped from the shipped judge build. */}
        {__DEV__ && (
          <>
            <Eyebrow style={{ marginTop: 26, marginBottom: 10 }}>AI providers</Eyebrow>

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
              sub="Used only if Groq fails, and for PDFs Groq can't read."
              model={settings.geminiModel}
              apiKey={settings.geminiKey}
            />

            <Text style={[styles.help, { color: colorTheme.ink2 }]}>The provider keys and models are fixed by the app configuration.</Text>
          </>
        )}

        <Eyebrow style={{ marginTop: 26, marginBottom: 10 }}>Learning</Eyebrow>
        <Card style={{ padding: 16 }}>
          <View style={styles.providerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.providerName, { color: colorTheme.ink }]}>{learnedCount} learned merchant{learnedCount === 1 ? '' : 's'}</Text>
              <Text style={[styles.providerSub, { color: colorTheme.ink2 }]}>Pip suggests these categories automatically.</Text>
            </View>
            <Pressable onPress={resetLearned} disabled={learnedCount === 0} style={styles.resetBtn}>
              <Icon name="trash" size={16} color={learnedCount === 0 ? colorTheme.ink3 : '#b3261e'} />
              <Text style={[styles.resetText, { color: learnedCount === 0 ? colorTheme.ink3 : '#b3261e' }]}>Reset</Text>
            </Pressable>
          </View>
        </Card>

        <Eyebrow style={{ marginTop: 26, marginBottom: 10 }}>Budget</Eyebrow>
        <Card style={{ padding: 16 }}>
          <View style={styles.providerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.providerName, { color: colorTheme.ink }]}>
                {hasBudget ? `RM ${expectedIncome.toFixed(2)} income · ${allocationCount} categor${allocationCount === 1 ? 'y' : 'ies'}` : 'No budget set'}
              </Text>
              <Text style={[styles.providerSub, { color: colorTheme.ink2 }]}>Clear your monthly budget plan.</Text>
            </View>
            <Pressable onPress={resetBudgetConfirm} disabled={!hasBudget} style={styles.resetBtn}>
              <Icon name="trash" size={16} color={!hasBudget ? colorTheme.ink3 : '#b3261e'} />
              <Text style={[styles.resetText, { color: !hasBudget ? colorTheme.ink3 : '#b3261e' }]}>Reset</Text>
            </Pressable>
          </View>
        </Card>

        <Eyebrow style={{ marginTop: 26, marginBottom: 10 }}>Data</Eyebrow>
        {onOpenCommitments && (
          <Pressable
            onPress={onOpenCommitments}
            style={({ pressed }) => [styles.providerRow, styles.migrateRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 }, { opacity: pressed ? 0.9 : 1 }]}
          >
            <View style={[styles.providerBadge, { backgroundColor: theme.accentTint }]}>
              <Icon name="clock" size={16} color={theme.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.providerName, { color: colorTheme.ink }]}>Recurring bills & investments</Text>
              <Text style={[styles.providerSub, { color: colorTheme.ink2 }]}>Set up monthly bills or a DCA investment, and tick them off each time they're paid.</Text>
            </View>
            <Icon name="chevronRight" size={18} color={colorTheme.ink3} />
          </Pressable>
        )}

        {onOpenCategories && (
          <Pressable
            onPress={onOpenCategories}
            style={({ pressed }) => [styles.providerRow, styles.migrateRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 }, { marginTop: 12, opacity: pressed ? 0.9 : 1 }]}
          >
            <View style={[styles.providerBadge, { backgroundColor: theme.accentTint }]}>
              <Icon name="sliders" size={16} color={theme.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.providerName, { color: colorTheme.ink }]}>Categories</Text>
              <Text style={[styles.providerSub, { color: colorTheme.ink2 }]}>Add, edit, and reorder your spending and income categories.</Text>
            </View>
            <Icon name="chevronRight" size={18} color={colorTheme.ink3} />
          </Pressable>
        )}

        {onMigrate && (
          <Pressable
            onPress={onMigrate}
            style={({ pressed }) => [styles.providerRow, styles.migrateRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 }, { marginTop: 12, opacity: pressed ? 0.9 : 1 }]}
          >
            <View style={[styles.providerBadge, { backgroundColor: theme.accentTint }]}>
              <Icon name="receipt" size={16} color={theme.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.providerName, { color: colorTheme.ink }]}>Import / migrate data</Text>
              <Text style={[styles.providerSub, { color: colorTheme.ink2 }]}>Read past transactions from a PDF, image, CSV, Excel, or Word file.</Text>
            </View>
            <Icon name="chevronRight" size={18} color={colorTheme.ink3} />
          </Pressable>
        )}

        {onAdvancedImport && (
          <Pressable
            onPress={onAdvancedImport}
            style={({ pressed }) => [styles.providerRow, styles.migrateRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 }, { marginTop: 12, opacity: pressed ? 0.9 : 1 }]}
          >
            <View style={[styles.providerBadge, { backgroundColor: theme.accentTint }]}>
              <Icon name="sparkles" size={16} color={theme.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.providerName, { color: colorTheme.ink }]}>Advanced import</Text>
              <Text style={[styles.providerSub, { color: colorTheme.ink2 }]}>Copy a prompt, use any AI (Claude, ChatGPT, Gemini…) to extract your statements, then paste the JSON here.</Text>
            </View>
            <Icon name="chevronRight" size={18} color={colorTheme.ink3} />
          </Pressable>
        )}

        {onOpenExport && (
          <Pressable
            onPress={onOpenExport}
            style={({ pressed }) => [styles.providerRow, styles.migrateRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 }, { marginTop: 12, opacity: pressed ? 0.9 : 1 }]}
          >
            <View style={[styles.providerBadge, { backgroundColor: theme.accentTint }]}>
              <Icon name="download" size={16} color={theme.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.providerName, { color: colorTheme.ink }]}>Financial reports & export</Text>
              <Text style={[styles.providerSub, { color: colorTheme.ink2 }]}>Export your Balance Sheet, Income Statement, Excel (.xlsx), CSV, PDF, or HTML statistics report.</Text>
            </View>
            <Icon name="chevronRight" size={18} color={colorTheme.ink3} />
          </Pressable>
        )}

        <Eyebrow style={{ marginTop: 26, marginBottom: 10 }}>Demo profiles</Eyebrow>
        <DemoProfilePicker activeId={activeDemoProfile} onLoad={(id) => loadDemoData(id)} />

        {/* The in-app Lender Console mirror was removed (2026-07-21): the real console is its
            own web app, and shipping a second, always-slightly-behind copy of it inside the
            BORROWER's settings blurred whose app this is. */}
        <Eyebrow style={{ marginTop: 26, marginBottom: 10 }}>Demo tools</Eyebrow>
        <Pressable
          onPress={onOpenAttacks}
          style={({ pressed }) => [styles.providerRow, styles.migrateRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 }, { opacity: pressed ? 0.9 : 1 }]}
        >
          <View style={[styles.providerBadge, { backgroundColor: theme.accentTint }]}>
            <Icon name="alert" size={16} color={theme.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.providerName, { color: colorTheme.ink }]}>Attack Gallery</Text>
            <Text style={[styles.providerSub, { color: colorTheme.ink2 }]}>Run known fraud techniques against our own integrity rings and watch what they catch.</Text>
          </View>
          <Icon name="chevronRight" size={18} color={colorTheme.ink3} />
        </Pressable>

        <Pressable
          onPress={() => void startTour({ fresh: true })}
          style={({ pressed }) => [styles.providerRow, styles.migrateRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 }, { marginTop: 12, opacity: pressed ? 0.9 : 1 }]}
        >
          <View style={[styles.providerBadge, { backgroundColor: theme.accentTint }]}>
            <Icon name="sparkles" size={16} color={theme.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.providerName, { color: colorTheme.ink }]}>Restart judge tour</Text>
            <Text style={[styles.providerSub, { color: colorTheme.ink2 }]}>Replay the guided walkthrough from the start.</Text>
          </View>
          <Icon name="chevronRight" size={18} color={colorTheme.ink3} />
        </Pressable>

        <Card style={{ padding: 16, marginTop: 12 }}>
          <View style={styles.providerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.providerName, { color: colorTheme.ink }]}>Reset demo</Text>
              <Text style={[styles.providerSub, { color: colorTheme.ink2 }]}>One tap: clear whatever you've mutated and reload the seeded judge persona.</Text>
            </View>
            <Pressable onPress={resetDemoConfirm} style={styles.resetBtn} disabled={resettingDemo}>
              {resettingDemo ? (
                <ActivityIndicator size="small" color={theme.accent} />
              ) : (
                <>
                  <Icon name="sparkles" size={16} color={theme.accent} />
                  <Text style={[styles.resetText, { color: theme.accent }]}>Reset demo</Text>
                </>
              )}
            </Pressable>
          </View>
        </Card>

        {/* Distinct "danger zone" treatment  this is the one irreversible action on this
            screen, so it shouldn't look like every other settings row. */}
        <Eyebrow style={{ marginTop: 26, marginBottom: 10, color: '#b3261e' }}>Danger zone</Eyebrow>
        <Card style={[{ padding: 16 }, styles.dangerCard]}>
          <View style={styles.providerRow}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="alert" size={13} color="#b3261e" />
                <Text style={[styles.providerName, { color: '#b3261e' }]}>Reset all data</Text>
              </View>
              <Text style={[styles.providerSub, { color: colorTheme.ink2 }]}>Delete every transaction, learned merchant, and your budget, then restore the default categories. This can't be undone.</Text>
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
              <Text style={[styles.providerSub, { color: colorTheme.ink2 }]}>Wipe all data and return to the setup wizard. Useful for a full fresh start. This can't be undone.</Text>
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

/**
 * Ask for notification permission before persisting an "on" choice.
 *
 * Turning a reminder on while the OS has notifications blocked would leave the pill claiming
 * something the phone will never do, so a refusal leaves the setting where it was and says why.
 * Turning one off never asks: you can always opt out.
 */
async function withPermission(turningOn: boolean, apply: () => Promise<void>): Promise<void> {
  if (turningOn && !(await ensurePermission())) {
    notify(
      'Notifications are off',
      'Your phone is blocking notifications for Pip. Turn them on in your device settings and then try again.'
    );
    return;
  }
  await apply();
}

/** Off / Daily / Weekly, same pill shape as ThemeModePicker. */
function LogReminderPicker() {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { reminderCadence, setReminderCadence } = useAppData();
  return (
    <View style={[styles.modeToggle, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
      {REMINDER_CADENCES.map((cadence) => {
        const on = reminderCadence === cadence;
        return (
          <Pressable
            key={cadence}
            onPress={() => withPermission(cadence !== 'off', () => setReminderCadence(cadence))}
            style={[styles.modeBtn, on && { backgroundColor: theme.accentInk }]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.modeText, { color: colorTheme.ink2 }, on && styles.modeTextOn]}>
              {cadenceLabel(cadence)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Two-pill Off/On. The app has no Switch anywhere, so a boolean reads as a segmented pair. */
function OwedReminderPicker() {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { owedReminderEnabled, setOwedReminderEnabled } = useAppData();
  return (
    <View style={[styles.modeToggle, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
      {[false, true].map((value) => {
        const on = owedReminderEnabled === value;
        return (
          <Pressable
            key={String(value)}
            onPress={() => withPermission(value, () => setOwedReminderEnabled(value))}
            style={[styles.modeBtn, on && { backgroundColor: theme.accentInk }]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.modeText, { color: colorTheme.ink2 }, on && styles.modeTextOn]}>
              {value ? 'On' : 'Off'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Two-pill Off/On, same shape as OwedReminderPicker. */
function CommitmentReminderPicker() {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { commitmentReminderEnabled, setCommitmentReminderEnabled } = useAppData();
  return (
    <View style={[styles.modeToggle, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
      {[false, true].map((value) => {
        const on = commitmentReminderEnabled === value;
        return (
          <Pressable
            key={String(value)}
            onPress={() => withPermission(value, () => setCommitmentReminderEnabled(value))}
            style={[styles.modeBtn, on && { backgroundColor: theme.accentInk }]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.modeText, { color: colorTheme.ink2 }, on && styles.modeTextOn]}>
              {value ? 'On' : 'Off'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const THEME_MODE_OPTIONS: { mode: ColorSchemeMode; label: string }[] = [
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
  { mode: 'system', label: 'System' },
];

/** 3-way Light/Dark/System segmented control, same pill shape as ui.tsx's ValueToggle. */
function ThemeModePicker() {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { mode, setMode } = useColorSchemeMode();
  return (
    <View style={[styles.modeToggle, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
      {THEME_MODE_OPTIONS.map((opt) => {
        const on = mode === opt.mode;
        return (
          <Pressable key={opt.mode} onPress={() => setMode(opt.mode)} style={[styles.modeBtn, on && { backgroundColor: theme.accentInk }]}>
            <Text style={[styles.modeText, { color: colorTheme.ink2 }, on && styles.modeTextOn]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Row of preset swatches for picking the app's accent color, same visual pattern as the
 *  category-color picker in AddCategoryModal (tap a circle, checkmark on the active one). */
function AccentColorPicker() {
  const colorTheme = useThemeColors();
  const { presetId, setPresetId, presets } = useAccentPreset();
  return (
    <View style={styles.swatchWrap}>
      {presets.map((preset) => {
        const on = preset.id === presetId;
        return (
          <Pressable
            key={preset.id}
            onPress={() => setPresetId(preset.id)}
            style={[styles.swatch, { backgroundColor: preset.theme.light.accent }, on && { borderColor: colorTheme.ink, borderWidth: 2.5 }]}
            accessibilityRole="radio"
            accessibilityLabel={preset.name}
            accessibilityState={{ selected: on }}
          >
            {on && <Icon name="check" size={15} color="#fff" stroke={2.6} />}
          </Pressable>
        );
      })}
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
  const theme = useAccent();
  const colorTheme = useThemeColors();
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
        <View style={[styles.providerBadge, { backgroundColor: theme.accentTint }]}>
          <Icon name={icon} size={16} color={theme.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.providerName, { color: colorTheme.ink }]}>{name}</Text>
          <Text style={[styles.providerSub, { color: colorTheme.ink2 }]}>{sub}</Text>
        </View>
      </View>

      <ReadonlyField label="Model">
        <Text style={[styles.fieldValue, { color: colorTheme.ink }]}>{model}</Text>
      </ReadonlyField>

      <Pressable
        onPress={runTest}
        style={({ pressed }) => [styles.testBtn, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }, pressed && { opacity: 0.9 }]}
      >
        {test.status === 'busy' ? (
          <ActivityIndicator color={theme.accent} size="small" />
        ) : (
          <>
            <Icon name="check" size={16} color={theme.accent} stroke={2.4} />
            <Text style={[styles.testBtnText, { color: theme.accent }]}>Test connection</Text>
          </>
        )}
      </Pressable>

      {test.status === 'ok' && <Text style={[styles.result, { color: theme.accentInk }]}>✓ {test.message}</Text>}
      {test.status === 'fail' && <Text style={[styles.result, { color: '#b3261e' }]}>{test.message}</Text>}
    </Card>
  );
}

// ── Demo Profile Picker ───────────────────────────────────────────────────────

// Accent + icon come from the persona's own lender outcome (verdictStyle), so a persona reads
// the same colour here as on the onboarding front door. These used to be two hardcoded maps and
// they had drifted — Aina was plain green here while her outcome is a referral.

function DemoProfilePicker({ activeId, onLoad }: { activeId: DemoProfileId | null; onLoad: (id: DemoProfileId) => void }) {
  const colorTheme = useThemeColors();
  const { resolvedScheme } = useColorSchemeMode();
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

  // All three profiles render identically; the one currently loaded is tinted with
  // its accent and shows an "In use" pill in place of the Load button.
  return (
    <View style={{ gap: 12 }}>
      {DEMO_PROFILES.map((profile) => {
        const verdict = verdictStyle(resolvedScheme)[profile.outcome.decision];
        const accent = verdict.ink;
        const active = activeId === profile.id;
        const busy = loading === profile.id;
        return (
          <View
            key={profile.id}
            style={[
              styles.profileCard,
              { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 },
              active && { borderColor: accent, backgroundColor: `${accent}0d` },
            ]}
          >
            <View style={[styles.providerBadge, { backgroundColor: `${accent}18` }]}>
              {busy ? <ActivityIndicator size="small" color={accent} /> : <Icon name={verdict.icon} size={16} color={accent} />}
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.profileNameRow}>
                <Text style={[styles.providerName, { color: accent }]}>{profile.name}</Text>
                {active && (
                  <View style={[styles.activePill, { backgroundColor: `${accent}1f` }]}>
                    <Text style={[styles.activePillText, { color: accent }]}>In use</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.providerSub, { color: colorTheme.ink2 }]}>{profile.story}</Text>
            </View>
            {active ? (
              <View style={styles.activeDot}>
                <Icon name="check" size={15} color={accent} stroke={2.6} />
              </View>
            ) : (
              <Pressable
                onPress={() => handleLoad(profile.id)}
                disabled={loading !== null}
                style={({ pressed }) => [styles.loadBtn, { borderColor: `${accent}55` }, { opacity: pressed || (loading !== null && !busy) ? 0.6 : 1 }]}
              >
                <Text style={[styles.loadBtnText, { color: accent }]}>Load</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

function ReadonlyField({ label, children }: { label: string; children: React.ReactNode }) {
  const colorTheme = useThemeColors();
  return (
    <View style={{ gap: 7 }}>
      <Text style={[styles.fieldLabel, { color: colorTheme.ink2 }]}>{label}</Text>
      <View style={[styles.fieldBox, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  demoChip: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 9,
    marginBottom: 14,
  },
  demoChipText: { fontFamily: uiFont(700), fontSize: 11, letterSpacing: 0.5 },
  dangerCard: { borderColor: 'rgba(179,38,30,0.28)', backgroundColor: 'rgba(179,38,30,0.03)' },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  providerBadge: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerName: { fontFamily: uiFont(700), fontSize: 15 },
  providerSub: { fontFamily: uiFont(500), fontSize: 12.5, marginTop: 1 },
  fieldLabel: { fontFamily: uiFont(600), fontSize: 12.5 },
  fieldBox: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  fieldValue: { fontFamily: uiFont(500), fontSize: 14 },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 999,
    borderWidth: 1,
  },
  testBtnText: { fontFamily: uiFont(600), fontSize: 14.5 },
  result: { fontFamily: uiFont(600), fontSize: 13, lineHeight: 18 },
  help: { fontFamily: uiFont(500), fontSize: 12, lineHeight: 17, paddingHorizontal: 4, paddingTop: 12 },
  migrateRow: { padding: 16, borderRadius: radius.md, borderWidth: 1 },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 8 },
  resetText: { fontFamily: uiFont(600), fontSize: 13.5 },

  /* theme mode picker */
  modeToggle: { flexDirection: 'row', borderRadius: 999, padding: 3, borderWidth: 1 },
  modeBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999 },
  modeText: { fontFamily: uiFont(700), fontSize: 13 },
  modeTextOn: { color: '#fff' },

  /* accent color picker */
  swatchWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 38, height: 38, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },

  /* demo profile picker */
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  profileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activePill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  activePillText: { fontFamily: uiFont(700), fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase' },
  activeDot: { width: 30, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  loadBtn: { borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 7 },
  loadBtnText: { fontFamily: uiFont(700), fontSize: 13 },
});
