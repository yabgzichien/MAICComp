import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GUIDE_CITIES, HOUSEHOLD_PROFILES, type GuideCityId, type HouseholdProfileId } from '../data/belanjawanku';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { radius, uiFont } from '../theme';
import { Icon } from './Icon';
import { BtnLabel, PrimaryButton } from './ui';

/**
 * Picks which Belanjawanku household category and city a borrower's budget is measured against.
 * The guide publishes a different figure for each combination, so getting this wrong is the one
 * way a benchmark hint could be unfair, and it stays two taps from anywhere it is quoted.
 */
export function BenchmarkPicker({
  visible,
  profile,
  city,
  onClose,
  onSave,
}: {
  visible: boolean;
  profile: HouseholdProfileId;
  city: GuideCityId;
  onClose: () => void;
  onSave: (profile: HouseholdProfileId, city: GuideCityId) => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const [pickedProfile, setPickedProfile] = useState(profile);
  const [pickedCity, setPickedCity] = useState(city);

  // Re-sync whenever the sheet is reopened, so a cancelled edit does not linger.
  React.useEffect(() => {
    if (visible) {
      setPickedProfile(profile);
      setPickedCity(city);
    }
  }, [visible, profile, city]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 18, backgroundColor: colorTheme.bg }]}>
          <View style={styles.head}>
            <Text style={[styles.title, { color: colorTheme.ink }]}>Your household</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Icon name="x" size={20} color={colorTheme.ink2} />
            </Pressable>
          </View>
          <Text style={[styles.sub, { color: colorTheme.ink2 }]}>
            Belanjawanku publishes a different monthly figure for each household and city. Pick
            yours so the comparison is fair.
          </Text>

          <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
            <Text style={[styles.group, { color: colorTheme.ink2 }]}>Who is in your household</Text>
            {HOUSEHOLD_PROFILES.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => setPickedProfile(p.id)}
                style={[
                  styles.row,
                  { borderColor: colorTheme.line2, backgroundColor: colorTheme.surface },
                  pickedProfile === p.id && { borderColor: theme.accentSoft, backgroundColor: theme.accentTint },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: pickedProfile === p.id }}
              >
                <Text style={[styles.rowLabel, { color: colorTheme.ink }, pickedProfile === p.id && { color: theme.accentInk }]}>{p.label}</Text>
                {pickedProfile === p.id && <Icon name="check" size={17} color={theme.accent} stroke={2.4} />}
              </Pressable>
            ))}

            <Text style={[styles.group, { marginTop: 16, color: colorTheme.ink2 }]}>Where you live</Text>
            {GUIDE_CITIES.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setPickedCity(c.id)}
                style={[
                  styles.row,
                  { borderColor: colorTheme.line2, backgroundColor: colorTheme.surface },
                  pickedCity === c.id && { borderColor: theme.accentSoft, backgroundColor: theme.accentTint },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: pickedCity === c.id }}
              >
                <Text style={[styles.rowLabel, { color: colorTheme.ink }, pickedCity === c.id && { color: theme.accentInk }]}>{c.label}</Text>
                {pickedCity === c.id && <Icon name="check" size={17} color={theme.accent} stroke={2.4} />}
              </Pressable>
            ))}
          </ScrollView>

          <View style={{ marginTop: 14 }}>
            <PrimaryButton onPress={() => onSave(pickedProfile, pickedCity)}>
              <BtnLabel>Use this</BtnLabel>
            </PrimaryButton>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,18,22,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: uiFont(700), fontSize: 18 },
  sub: { fontFamily: uiFont(500), fontSize: 12.5, lineHeight: 18, marginTop: 6, marginBottom: 12 },
  group: { fontFamily: uiFont(700), fontSize: 11.5, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginBottom: 8,
  },
  rowLabel: { fontFamily: uiFont(600), fontSize: 14 },
});
