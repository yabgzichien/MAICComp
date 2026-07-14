// src/components/TickerSearchModal.tsx
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TickerResult } from '../lib/prices';
import { colors, radius, uiFont } from '../theme';
import { Icon } from './Icon';

/** Search-and-pick a ticker. `search` is injected so the same UI serves crypto, stocks, or commodities (all Yahoo). */
export function TickerSearchModal({
  visible,
  title,
  placeholder,
  search,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  placeholder: string;
  search: (query: string) => Promise<TickerResult[]>;
  onPick: (coin: TickerResult) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TickerResult[]>([]);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!visible) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setBusy(false);
      return;
    }
    const mine = ++seq.current;
    setBusy(true);
    const t = setTimeout(async () => {
      const r = await search(q);
      if (mine === seq.current) {
        setResults(r.slice(0, 25));
        setBusy(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query, visible, search]);

  useEffect(() => {
    if (!visible) { setQuery(''); setResults([]); }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.handle} />
        <View style={styles.head}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={8}><Icon name="x" size={20} color={colors.ink2} /></Pressable>
        </View>
        <View style={styles.searchRow}>
          <Icon name="search" size={17} color={colors.ink3} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={placeholder}
            placeholderTextColor={colors.ink3}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            style={styles.searchInput}
          />
          {busy && <ActivityIndicator size="small" color={colors.accent} />}
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 360 }}>
          {results.map((c) => (
            <Pressable key={c.id} onPress={() => onPick(c)} style={styles.row}>
              <View style={styles.tickerBox}><Text style={styles.tickerText}>{c.ticker.slice(0, 4)}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.sub}>{c.ticker}</Text>
              </View>
              <Icon name="chevronRight" size={16} color={colors.ink3} />
            </Pressable>
          ))}
          {!busy && query.trim().length >= 2 && results.length === 0 && (
            <Text style={styles.empty}>No matches for “{query.trim()}”.</Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,32,24,0.4)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: 18, paddingTop: 10, maxHeight: '88%' },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 999, backgroundColor: colors.line, marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { flex: 1, fontFamily: uiFont(700), fontSize: 18, color: colors.ink },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 13, marginBottom: 10 },
  searchInput: { flex: 1, fontFamily: uiFont(600), fontSize: 15, color: colors.ink, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.line2 },
  tickerBox: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  tickerText: { fontFamily: uiFont(700), fontSize: 12, color: colors.accent },
  name: { fontFamily: uiFont(600), fontSize: 14.5, color: colors.ink },
  sub: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink2, marginTop: 1 },
  empty: { fontFamily: uiFont(500), fontSize: 13.5, color: colors.ink2, textAlign: 'center', paddingVertical: 24 },
});
