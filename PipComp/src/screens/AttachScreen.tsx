import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Image as RNImage, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../components/Icon';
import { B, BubbleText, Card, PipSays, TopBar } from '../components/ui';
import { notify } from '../lib/platformAlert';
import { SAMPLE_STATEMENTS } from '../data/sampleStatements';
import { colors, radius, uiFont } from '../theme';

export interface PickedImage {
  uri: string;
  base64: string;
  mime: string;
}

export function AttachScreen({
  hasKey,
  onClose,
  onPicked,
  onManual,
  onImport,
  showSamples = false,
}: {
  hasKey: boolean;
  onClose: () => void;
  onPicked: (img: PickedImage) => void;
  onManual: () => void;
  onImport: () => void;
  /** Offer the bundled demo statements as one-tap samples (used during the judge tour)
   *  alongside the real upload options, so the app never injects an image on its own. */
  showSamples?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

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
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 4, paddingBottom: insets.bottom + 30 }}
        showsVerticalScrollIndicator={false}
      >
        <TopBar title="Add a receipt" onBack={onClose} />

        <View style={{ paddingHorizontal: 18, paddingTop: 8 }}>
          <PipSays expr="curious">
            <BubbleText>
              Snap or pick a <B>transaction screenshot</B>  I’ll pull out each line and help you file it.
            </BubbleText>
          </PipSays>
        </View>

        {!hasKey && (
          <Pressable onPress={onManual} style={styles.keyNotice}>
            <Icon name="sparkles" size={18} color={colors.accentInk} />
            <Text style={styles.keyNoticeText}>
              Scanning isn't available right now. Enter a transaction manually instead.
            </Text>
            <Icon name="chevronRight" size={16} color={colors.accentInk} />
          </Pressable>
        )}

        {showSamples && (
          <View style={{ paddingHorizontal: 18, paddingTop: 18 }}>
            <Text style={styles.sampleLabel}>NO SCREENSHOT HANDY? TAP A SAMPLE</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingVertical: 4, paddingRight: 4 }}
            >
              {SAMPLE_STATEMENTS.map((s) => (
                <Pressable key={s.id} onPress={() => onPicked(s.image)} style={styles.sampleCard} disabled={busy}>
                  <RNImage source={{ uri: s.image.uri }} style={styles.sampleThumb} resizeMode="cover" />
                  <View style={{ padding: 10 }}>
                    <Text style={styles.sampleTitle} numberOfLines={1}>{s.label}</Text>
                    <Text style={styles.sampleSub} numberOfLines={1}>{s.provider}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.sampleOr}>or use your own below</Text>
          </View>
        )}

        <View style={{ paddingHorizontal: 18, paddingTop: 22, gap: 14 }}>
          <SourceButton
            icon="camera"
            title="Take a photo"
            sub="Point at a receipt or statement"
            onPress={takePhoto}
            disabled={busy}
          />
          <SourceButton
            icon="gallery"
            title="Choose from gallery"
            sub="Pick an existing screenshot"
            onPress={pickFromLibrary}
            disabled={busy}
          />
          <SourceButton
            icon="pencil"
            title="Enter manually"
            sub="Type an expense or income yourself"
            onPress={onManual}
            disabled={busy}
          />
          <SourceButton
            icon="receipt"
            title="Import a file"
            sub="Migrate from a PDF, image, CSV, Excel, or Word file"
            onPress={onImport}
            disabled={busy}
          />
        </View>

        <Text style={styles.hint}>
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
}: {
  icon: IconName;
  title: string;
  sub: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.source, { opacity: disabled ? 0.6 : pressed ? 0.9 : 1 }]}
    >
      <View style={styles.sourceIcon}>
        <Icon name={icon} size={24} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sourceTitle}>{title}</Text>
        <Text style={styles.sourceSub}>{sub}</Text>
      </View>
      <Icon name="chevronRight" size={18} color={colors.ink3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  keyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 18,
    marginTop: 16,
    padding: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.accentTint,
    borderWidth: 1,
    borderColor: colors.accentSoft,
  },
  keyNoticeText: { flex: 1, fontFamily: uiFont(600), fontSize: 13.5, color: colors.accentInk },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderStyle: 'dashed',
  },
  sourceIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceTitle: { fontFamily: uiFont(700), fontSize: 15.5, color: colors.ink },
  sourceSub: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, marginTop: 1 },
  sampleLabel: { fontFamily: uiFont(700), fontSize: 11, letterSpacing: 0.5, color: colors.ink3, marginBottom: 10 },
  sampleCard: {
    width: 150,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.accentSoft,
    overflow: 'hidden',
  },
  sampleThumb: { width: '100%', height: 96, backgroundColor: colors.accentTint },
  sampleTitle: { fontFamily: uiFont(700), fontSize: 13.5, color: colors.ink },
  sampleSub: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink2, marginTop: 1 },
  sampleOr: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink3, marginTop: 12 },
  hint: {
    paddingHorizontal: 24,
    paddingTop: 26,
    textAlign: 'center',
    fontFamily: uiFont(500),
    fontSize: 12.5,
    color: colors.ink2,
    lineHeight: 18,
  },
});
