import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import { Image as RNImage, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../components/Icon';
import { B, BubbleText, Card, PipSays, TopBar } from '../components/ui';
import { notify } from '../lib/platformAlert';
import { SAMPLE_STATEMENTS } from '../data/sampleStatements';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { radius, uiFont } from '../theme';

export interface PickedImage {
  uri: string;
  base64: string;
  mime: string;
}

/**
 * The add hub. Two jobs live behind this screen and they are NOT the same shape, which is why
 * they are now separated instead of listed as five sibling buttons:
 *
 *   · one purchase   — a paper receipt is a single transaction at a single moment, whose value is
 *                      in its LINE ITEMS (burger 20, pizza 37), so it reads into one row plus an
 *                      optional per-item split.
 *   · many at once   — a bank statement or e-wallet screenshot is a LIST of transactions from
 *                      different days, so it reads into many rows that each need a category.
 *
 * Mixing them under a button called "Scan a receipt" (which then offered statement scanning,
 * file import and manual entry) meant the label promised one job and the screen delivered four.
 */
export function AttachScreen({
  hasKey,
  onClose,
  onPicked,
  onManual,
  onImport,
  onReceipt,
  showSamples = false,
}: {
  hasKey: boolean;
  onClose: () => void;
  onPicked: (img: PickedImage) => void;
  onManual: () => void;
  onImport: () => void;
  /** Open the itemised-receipt scanner (one purchase, many lines). */
  onReceipt: () => void;
  /** Offer the bundled demo statements as one-tap samples (used during the judge tour)
   *  alongside the real upload options, so the app never injects an image on its own. */
  showSamples?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const [busy, setBusy] = useState(false);
  // Camera-vs-gallery is a detail of HOW you hand over a statement, not a separate thing to add,
  // so it stays folded away until the statement row is chosen. Open from the start during the
  // tour, where the sample statements underneath are the point of the step.
  const [statementOpen, setStatementOpen] = useState(showSamples);
  // The tour's scan step asks the judge to tap a sample statement, so the samples must never be
  // behind a fold — reopen the row if the tour starts while this screen is already mounted.
  useEffect(() => {
    if (showSamples) setStatementOpen(true);
  }, [showSamples]);

  const handleResult = (res: ImagePicker.ImagePickerResult) => {
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    if (!a.base64) {
      notify('Hmm', "That image couldn't be read. Try another one.");
      return;
    }
    onPicked({ uri: a.uri, base64: a.base64, mime: a.mimeType ?? 'image/jpeg' });
  };

  const pickFromLibrary = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        notify('Permission needed', 'Allow photo access to attach a screenshot.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.7,
      });
      handleResult(res);
    } finally {
      setBusy(false);
    }
  };

  const takePhoto = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        notify('Permission needed', 'Allow camera access to snap a receipt.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
      handleResult(res);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 4, paddingBottom: insets.bottom + 30 }}
        showsVerticalScrollIndicator={false}
      >
        <TopBar title="Add transactions" onBack={onClose} />

        <View style={{ paddingHorizontal: 18, paddingTop: 8 }}>
          <PipSays expr="curious">
            <BubbleText>
              Adding <B>one purchase</B>, or <B>a batch</B> from a statement? Pick the row that matches and
              I’ll do the reading.
            </BubbleText>
          </PipSays>
        </View>

        {!hasKey && (
          <Pressable onPress={onManual} style={[styles.keyNotice, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
            <Icon name="sparkles" size={18} color={theme.accentInk} />
            <Text style={[styles.keyNoticeText, { color: theme.onTint }]}>
              Scanning isn't available right now. Enter a transaction manually instead.
            </Text>
            <Icon name="chevronRight" size={16} color={theme.accentInk} />
          </Pressable>
        )}

        {/* ── One purchase ── */}
        <View style={styles.group}>
          <Text style={[styles.groupLabel, { color: colorTheme.ink2 }]}>ONE PURCHASE</Text>
          <Text style={[styles.groupSub, { color: colorTheme.ink3 }]}>A single shop, on a single day.</Text>
          <View style={{ gap: 12, marginTop: 12 }}>
            <SourceButton
              icon="receipt"
              title="Scan a receipt"
              sub="Reads every line item. Split it with friends if you shared."
              onPress={onReceipt}
              disabled={busy}
            />
            <SourceButton
              icon="pencil"
              title="Enter it manually"
              sub="Type one expense or income yourself"
              onPress={onManual}
              disabled={busy}
            />
          </View>
        </View>

        {/* ── Many transactions ── */}
        <View style={styles.group}>
          <Text style={[styles.groupLabel, { color: colorTheme.ink2 }]}>MANY TRANSACTIONS AT ONCE</Text>
          <Text style={[styles.groupSub, { color: colorTheme.ink3 }]}>A statement or wallet history, covering several days.</Text>
          <View style={{ gap: 12, marginTop: 12 }}>
            <SourceButton
              icon="scan"
              title="Scan a statement or e-wallet"
              sub="A screenshot listing several transactions"
              onPress={() => setStatementOpen((v) => !v)}
              disabled={busy}
              expanded={statementOpen}
            />

            {statementOpen && (
              <View style={[styles.nested, { borderLeftColor: theme.accentSoft }]}>
                {showSamples && (
                  <>
                    <Text style={[styles.sampleLabel, { color: colorTheme.ink3 }]}>NO SCREENSHOT HANDY? TAP A SAMPLE</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 12, paddingVertical: 4, paddingRight: 4 }}
                    >
                      {SAMPLE_STATEMENTS.map((s) => (
                        <Pressable
                          key={s.id}
                          onPress={() => onPicked(s.image)}
                          style={[styles.sampleCard, { backgroundColor: colorTheme.surface, borderColor: theme.accentSoft }]}
                          disabled={busy}
                        >
                          <RNImage source={{ uri: s.image.uri }} style={[styles.sampleThumb, { backgroundColor: theme.accentTint }]} resizeMode="cover" />
                          <View style={{ padding: 10 }}>
                            <Text style={[styles.sampleTitle, { color: colorTheme.ink }]} numberOfLines={1}>{s.label}</Text>
                            <Text style={[styles.sampleSub, { color: colorTheme.ink2 }]} numberOfLines={1}>{s.provider}</Text>
                          </View>
                        </Pressable>
                      ))}
                    </ScrollView>
                    <Text style={[styles.sampleOr, { color: colorTheme.ink3 }]}>or use your own</Text>
                  </>
                )}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: showSamples ? 12 : 0 }}>
                  <MiniButton icon="camera" label="Take a photo" onPress={takePhoto} disabled={busy} />
                  <MiniButton icon="gallery" label="From gallery" onPress={pickFromLibrary} disabled={busy} />
                </View>
              </View>
            )}

            <SourceButton
              icon="wallet"
              title="Import a file"
              sub="PDF, image, CSV, Excel, or Word statement"
              onPress={onImport}
              disabled={busy}
            />
          </View>
        </View>

        <Text style={[styles.hint, { color: colorTheme.ink2 }]}>
          Screenshots are sent to your chosen AI provider only to read the transactions. Manual entries stay on your device.
        </Text>
      </ScrollView>
    </View>
  );
}

function SourceButton({
  icon,
  title,
  sub,
  onPress,
  disabled,
  expanded,
}: {
  icon: IconName;
  title: string;
  sub: string;
  onPress: () => void;
  disabled?: boolean;
  /** Set on a row that opens options in place — the chevron then points down/up rather than
   *  right, so it never promises a screen change it does not make. */
  expanded?: boolean;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      style={({ pressed }) => [
        styles.source,
        { backgroundColor: colorTheme.surface, borderColor: colorTheme.line },
        expanded && styles.sourceOn,
        expanded && { borderColor: theme.accentSoft, backgroundColor: theme.accentTint },
        { opacity: disabled ? 0.6 : pressed ? 0.9 : 1 },
      ]}
    >
      <View style={[styles.sourceIcon, { backgroundColor: theme.accentTint }]}>
        <Icon name={icon} size={24} color={theme.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sourceTitle, { color: colorTheme.ink }]}>{title}</Text>
        <Text style={[styles.sourceSub, { color: colorTheme.ink2 }]}>{sub}</Text>
      </View>
      <Icon
        name={expanded === undefined ? 'chevronRight' : expanded ? 'chevronDown' : 'chevronRight'}
        size={18}
        color={colorTheme.ink3}
      />
    </Pressable>
  );
}

/** A compact secondary choice inside an expanded row — how to hand a file over, not what to add. */
function MiniButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useAccent();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.mini,
        { backgroundColor: theme.accentTint, borderColor: theme.accentSoft },
        { opacity: disabled ? 0.6 : pressed ? 0.9 : 1 },
      ]}
    >
      <Icon name={icon} size={19} color={theme.accent} />
      <Text style={[styles.miniText, { color: theme.accentInk }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  keyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 18,
    marginTop: 16,
    padding: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  keyNoticeText: { flex: 1, fontFamily: uiFont(600), fontSize: 13.5 },
  group: { paddingHorizontal: 18, paddingTop: 22 },
  groupLabel: { fontFamily: uiFont(700), fontSize: 11, letterSpacing: 0.6 },
  groupSub: { fontFamily: uiFont(500), fontSize: 12.5, marginTop: 3 },
  nested: { marginLeft: 14, paddingLeft: 14, borderLeftWidth: 2 },
  mini: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  miniText: { fontFamily: uiFont(700), fontSize: 13.5 },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  sourceOn: { borderStyle: 'solid' },
  sourceIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceTitle: { fontFamily: uiFont(700), fontSize: 15.5 },
  sourceSub: { fontFamily: uiFont(500), fontSize: 12.5, marginTop: 1 },
  sampleLabel: { fontFamily: uiFont(700), fontSize: 11, letterSpacing: 0.5, marginBottom: 10 },
  sampleCard: {
    width: 150,
    borderRadius: radius.md,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  sampleThumb: { width: '100%', height: 96 },
  sampleTitle: { fontFamily: uiFont(700), fontSize: 13.5 },
  sampleSub: { fontFamily: uiFont(500), fontSize: 11.5, marginTop: 1 },
  sampleOr: { fontFamily: uiFont(500), fontSize: 12.5, marginTop: 12 },
  hint: {
    paddingHorizontal: 24,
    paddingTop: 26,
    textAlign: 'center',
    fontFamily: uiFont(500),
    fontSize: 12.5,
    lineHeight: 18,
  },
});
