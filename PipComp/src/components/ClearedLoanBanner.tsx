// src/components/ClearedLoanBanner.tsx (data-consistency follow-up, 2026-07-20)
// A top-anchored, dismissible notice for a live event the borrower didn't cause: a lender
// reset their console and this app quietly removed the matching loan record to keep both
// sides honest about what actually exists. Global (mounted once in App.tsx, not per-screen)
// since `syncLenderResets` can fire while the borrower is on any screen  Home most often, per
// the poll hook  and the notice needs to reach them regardless of where they land.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FadeIn } from './Motion';
import { Icon } from './Icon';
import { colors, shadowCard, uiFont } from '../theme';

export function ClearedLoanBanner({ message, topInset, onDismiss }: { message: string; topInset: number; onDismiss: () => void }) {
  return (
    <FadeIn key={message} style={[styles.wrap, { top: topInset + 10 }]} offset={-8}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Icon name="alert" size={14} color={colors.amber} />
        </View>
        <Text style={styles.text}>{message}</Text>
        <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={8} style={styles.closeBtn}>
          <Icon name="x" size={13} color={colors.ink3} stroke={2.4} />
        </Pressable>
      </View>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 14, right: 14, zIndex: 60 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    ...shadowCard,
  },
  iconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.amber + '1a',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  text: { flex: 1, fontFamily: uiFont(600), fontSize: 12.5, color: colors.ink, lineHeight: 17.5 },
  closeBtn: { padding: 2, marginTop: 1 },
});
