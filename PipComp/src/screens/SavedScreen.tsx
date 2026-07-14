import React, { useEffect, useRef } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { Pip } from '../components/Pip';
import { Amount, BtnLabel, Card, CatBadge, Eyebrow, PrimaryButton } from '../components/ui';
import { fmt } from '../lib/format';
import type { Category, Transaction } from '../lib/types';
import type { NewLearned } from '../state/store';
import { colors, uiFont } from '../theme';

const fallback: Category = { id: 'other', label: 'Other', icon: 'dots', hue: 220, kind: 'expense', isDefault: true };

export function SavedScreen({
  result,
  newLearned,
  catById,
  onDone,
}: {
  result: Transaction[];
  newLearned: NewLearned[];
  catById: Record<string, Category>;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
  }, [pop]);

  const total = result.reduce((s, t) => s + t.amount, 0);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 30, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', paddingHorizontal: 22 }}>
          <Animated.View style={{ transform: [{ scale: pop }] }}>
            <Pip size={104} expr="happy" />
          </Animated.View>
          <Text style={styles.title}>{result.length === 0 ? 'Nothing added' : 'All sorted!'}</Text>
          {result.length === 0 ? (
            <Text style={styles.sub}>You skipped every item in this scan.</Text>
          ) : (
            <Text style={styles.sub}>
              <Text style={styles.subStrong}>
                {result.length} transaction{result.length > 1 ? 's' : ''}
              </Text>{' '}
              · <Amount value={total} size={14.5} weight={700} /> added
            </Text>
          )}
        </View>

        {newLearned.length > 0 && (
          <View style={{ paddingHorizontal: 18, paddingTop: 22 }}>
            <Card style={styles.learnCard}>
              <View style={styles.learnHead}>
                <Icon name="sparkles" size={17} color={colors.accent} />
                <Text style={styles.learnTitle}>
                  Pip learned {newLearned.length} new merchant{newLearned.length > 1 ? 's' : ''}
                </Text>
              </View>
              <View style={{ gap: 8 }}>
                {newLearned.map((n, i) => {
                  const cat = catById[n.categoryId] ?? fallback;
                  return (
                    <View key={i} style={styles.learnRow}>
                      <CatBadge category={cat} size={28} rad={8} />
                      <Text style={styles.learnMerchant} numberOfLines={1}>
                        {n.merchant}
                      </Text>
                      <Icon name="arrowRight" size={14} color={colors.ink3} />
                      <Text style={styles.learnCat}>{cat.label}</Text>
                    </View>
                  );
                })}
              </View>
              <Text style={styles.learnFoot}>Next time I see these, I’ll suggest the category automatically.</Text>
            </Card>
          </View>
        )}

        {result.length > 0 && (
        <View style={{ paddingHorizontal: 18, paddingTop: 20 }}>
          <Eyebrow style={{ marginBottom: 10 }}>Added to your records</Eyebrow>
          <Card style={{ overflow: 'hidden' }}>
            {result.map((t, i) => {
              const cat = catById[t.categoryId ?? 'other'] ?? fallback;
              const income = t.type === 'income';
              return (
                <View key={t.id} style={[styles.row, i > 0 && styles.divider]}>
                  <CatBadge category={cat} size={36} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.merchant} numberOfLines={1}>
                      {t.merchantRaw}
                    </Text>
                    <Text style={styles.cat}>{cat.label}</Text>
                  </View>
                  <Amount value={t.amount} size={14} weight={600} color={income ? colors.accent : colors.ink} />
                </View>
              );
            })}
          </Card>
        </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <PrimaryButton onPress={onDone}>
          <BtnLabel>Done</BtnLabel>
        </PrimaryButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { fontFamily: uiFont(700), fontSize: 25, color: colors.ink, marginTop: 14 },
  sub: { marginTop: 6, fontFamily: uiFont(500), fontSize: 14.5, color: colors.ink2 },
  subStrong: { fontFamily: uiFont(700), color: colors.ink },
  learnCard: { padding: 16, backgroundColor: colors.accentTint, borderColor: colors.accentSoft },
  learnHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  learnTitle: { fontFamily: uiFont(700), fontSize: 14.5, color: colors.accentInk },
  learnRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  learnMerchant: { fontFamily: uiFont(700), fontSize: 13.5, color: colors.ink, flexShrink: 1 },
  learnCat: { fontFamily: uiFont(600), fontSize: 13.5, color: colors.accentInk },
  learnFoot: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, marginTop: 11 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, paddingVertical: 11 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line2 },
  merchant: { fontFamily: uiFont(600), fontSize: 14, color: colors.ink },
  cat: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink2, marginTop: 1 },
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
