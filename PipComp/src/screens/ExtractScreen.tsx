import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { Amount, B, BtnLabel, BubbleText, Card, Eyebrow, PipSays, PrimaryButton, TopBar } from '../components/ui';
import { fmt } from '../lib/format';
import { suggestForMerchant } from '../lib/recommend';
import type { ExtractedTxn } from '../lib/types';
import { getLLM, llmErrorMessage } from '../llm';
import { useAppData } from '../state/store';
import { colors, uiFont } from '../theme';
import type { PickedImage } from './AttachScreen';

type Phase = 'scanning' | 'result' | 'error';

const PREVIEW_H = 300;

export function ExtractScreen({
  image,
  cachedItems,
  onBack,
  onDone,
}: {
  image: PickedImage;
  cachedItems?: ExtractedTxn[];
  onBack: () => void;
  onDone: (items: ExtractedTxn[]) => void;
}) {
  const insets = useSafeAreaInsets();
  const { memory, catById } = useAppData();
  const [phase, setPhase] = useState<Phase>(cachedItems ? 'result' : 'scanning');
  const [items, setItems] = useState<ExtractedTxn[]>(cachedItems ?? []);
  const [error, setError] = useState('');

  const scan = useRef(new Animated.Value(0)).current;

  // scanline loop while reading
  useEffect(() => {
    if (phase !== 'scanning') return;
    const loop = Animated.loop(
      Animated.timing(scan, {
        toValue: 1,
        duration: 1500,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [phase, scan]);

  // run extraction once on mount (skip when reviewing cached results)
  useEffect(() => {
    if (cachedItems) return;
    let alive = true;
    (async () => {
      try {
        const llm = await getLLM();
        const rows = await llm.extract({
          imageBase64: image.base64,
          mimeType: image.mime,
        });
        if (!alive) return;
        setItems(rows);
        setPhase('result');
      } catch (e) {
        if (!alive) return;
        setError(llmErrorMessage(e));
        setPhase('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [image]);

  const withSuggestions = useMemo(
    () =>
      items.map((it) => ({
        ...it,
        suggestion: it.type === 'expense' ? suggestForMerchant(memory, it.merchant) : null,
      })),
    [items, memory]
  );
  const recognized = withSuggestions.filter((e) => e.suggestion).length;
  const total = items.reduce((s, it) => s + it.amount, 0);

  const translateY = scan.interpolate({ inputRange: [0, 1], outputRange: [0, PREVIEW_H - 28] });

  const removeAt = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 4, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <TopBar title={phase === 'scanning' ? 'Reading…' : phase === 'error' ? 'Hmm' : 'Found it'} onBack={onBack} />

        <View style={{ paddingHorizontal: 18, paddingTop: 6 }}>
          {phase === 'scanning' && (
            <PipSays expr="think">
              <BubbleText>Reading your screenshot…</BubbleText>
            </PipSays>
          )}
          {phase === 'error' && (
            <PipSays expr="curious">
              <BubbleText>{error}</BubbleText>
            </PipSays>
          )}
          {phase === 'result' && items.length > 0 && (
            <PipSays expr="happy">
              <BubbleText>
                Got it. <B>{items.length} transaction{items.length > 1 ? 's' : ''}</B>, RM {fmt(total)} total.
                {recognized > 0 ? (
                  <BubbleText>
                    {' '}I already recognise <B>{recognized}</B> of them.
                  </BubbleText>
                ) : null}
              </BubbleText>
            </PipSays>
          )}
          {phase === 'result' && items.length === 0 && (
            <PipSays expr="curious">
              <BubbleText>I couldn’t find any transactions in that image. Try a clearer screenshot.</BubbleText>
            </PipSays>
          )}
        </View>

        {/* picked image preview with scanline */}
        <View style={{ paddingHorizontal: 18, paddingTop: 18 }}>
          <Card style={styles.preview}>
            <Image source={{ uri: image.uri }} style={styles.previewImg} resizeMode="contain" />
            {phase === 'scanning' && (
              <Animated.View style={[styles.scanline, { transform: [{ translateY }] }]} />
            )}
          </Card>
        </View>

        {phase === 'result' && items.length > 0 && (
          <View style={{ paddingHorizontal: 18, paddingTop: 20 }}>
            <Eyebrow style={{ marginBottom: 10 }}>Extracted items</Eyebrow>
            <Card style={{ overflow: 'hidden' }}>
              {withSuggestions.map((e, i) => (
                <View key={i} style={[styles.itemRow, i > 0 && styles.divider]}>
                  <View style={styles.initialBox}>
                    <Text style={styles.initial}>{e.merchant.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.merchant} numberOfLines={1}>
                      {e.merchant}
                    </Text>
                    {e.suggestion && catById[e.suggestion] ? (
                      <View style={styles.likely}>
                        <Icon name="sparkles" size={11} color={colors.accentInk} />
                        <Text style={styles.likelyText}>likely {catById[e.suggestion].label}</Text>
                      </View>
                    ) : e.type === 'income' ? (
                      <Text style={styles.incomeTag}>received</Text>
                    ) : null}
                  </View>
                  <Amount value={e.amount} size={14} weight={600} color={e.type === 'income' ? colors.accent : colors.ink} />
                  <Pressable onPress={() => removeAt(i)} hitSlop={8} style={styles.removeBtn}>
                    <Icon name="x" size={15} color={colors.ink3} />
                  </Pressable>
                </View>
              ))}
            </Card>
            <Text style={styles.removeHint}>Tap ✕ to skip a row you don’t want to record.</Text>
          </View>
        )}
      </ScrollView>

      {/* sticky footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {phase === 'result' && items.length > 0 && (
          <PrimaryButton onPress={() => onDone(items)}>
            <BtnLabel>Sort {items.length} item{items.length > 1 ? 's' : ''}</BtnLabel>
            <Icon name="arrowRight" size={19} color="#fff" />
          </PrimaryButton>
        )}
        {(phase === 'error' || (phase === 'result' && items.length === 0)) && (
          <PrimaryButton onPress={onBack}>
            <Icon name="image" size={19} color="#fff" />
            <BtnLabel>Try another image</BtnLabel>
          </PrimaryButton>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  preview: { overflow: 'hidden', backgroundColor: colors.surface2, padding: 0 },
  previewImg: { width: '100%', height: PREVIEW_H, backgroundColor: colors.surface2 },
  scanline: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 28,
    backgroundColor: 'rgba(31,138,91,0.28)',
    borderTopWidth: 2,
    borderTopColor: colors.accent,
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 15, paddingVertical: 11 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line2 },
  removeBtn: { width: 26, height: 26, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  removeHint: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink2, marginTop: 10, marginLeft: 2 },
  initialBox: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontFamily: uiFont(700), fontSize: 13, color: colors.ink2 },
  merchant: { fontFamily: uiFont(600), fontSize: 14, color: colors.ink },
  likely: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  likelyText: { fontFamily: uiFont(600), fontSize: 11.5, color: colors.accentInk },
  incomeTag: { fontFamily: uiFont(600), fontSize: 11.5, color: colors.accent, marginTop: 1 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 12,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.line2,
  },
});
