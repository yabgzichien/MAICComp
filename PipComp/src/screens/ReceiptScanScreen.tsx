// src/screens/ReceiptScanScreen.tsx
// Photograph the paper receipt, let the vision model read the lines, then tap each item onto
// whoever ate it. Service charge and tax are prefilled from what the receipt actually printed
// and ride on each person's own items; the amount the card was charged is the figure everything
// reconciles to, because that is what left the account.
import * as ImagePicker from 'expo-image-picker';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { B, BtnLabel, BubbleText, Card, PipSays, PrimaryButton, TopBar } from '../components/ui';
import { fmt } from '../lib/format';
import { llmErrorMessage } from '../llm';
import { derivedSurcharges, type ScannedReceipt } from '../lib/parseReceipt';
import { notify } from '../lib/platformAlert';
import { scanReceiptImage } from '../lib/scanReceipt';
import { computeItemized, SELF, type ReceiptLine, type Surcharges } from '../lib/split';
import type { SplitDraft } from '../lib/types';
import { useAppData } from '../state/store';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { colors, numFont, radius, uiFont } from '../theme';

export interface ReceiptSplitResult {
  merchant: string | null;
  /** What the card was actually charged, which the split reconciles to exactly. */
  charged: number;
  /** null when nobody was added — the receipt was the user's alone, so the whole charge is
   *  their own expense and there is no share for anyone to owe back. */
  draft: SplitDraft | null;
}

type Phase = 'capture' | 'reading' | 'assign';

export function ReceiptScanScreen({
  onBack,
  onDone,
  onManualInstead,
}: {
  onBack: () => void;
  onDone: (result: ReceiptSplitResult) => void;
  /** Escape hatch: split a typed total instead of a photographed receipt. */
  onManualInstead: () => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { people, addPerson } = useAppData();

  const [phase, setPhase] = useState<Phase>('capture');
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<ScannedReceipt | null>(null);
  const [lines, setLines] = useState<ReceiptLine[]>([]);
  const [surcharges, setSurcharges] = useState<Surcharges>({ serviceChargePct: 0, taxPct: 0 });
  const [chargedText, setChargedText] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  // The payer is always at the table, and always last, so every rounding residue lands on them.
  const participants = useMemo(() => [...picked, SELF], [picked]);
  const nameById = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p.name])), [people]);
  const unpicked = useMemo(() => people.filter((p) => !picked.includes(p.id)), [people, picked]);

  const charged = Math.max(0, Math.round((parseFloat(chargedText.replace(/[^0-9.]/g, '')) || 0) * 100) / 100);
  const result = useMemo(
    () => computeItemized(lines, surcharges, charged, participants),
    [lines, surcharges, charged, participants]
  );
  const owedByPerson = useMemo(() => {
    const map: Record<string, number> = { [SELF]: result.ownShare };
    for (const s of result.shares) map[s.personId] = s.owed;
    return map;
  }, [result]);

  // A charged total below what people ordered can push a light eater's share negative, which is
  // not a bill anyone can settle. Better to say so than to save an incoherent split.
  const negative = result.shares.some((s) => s.owed < 0) || result.ownShare < 0;
  // Splitting is optional: a receipt you paid alone is still a receipt worth scanning, and the
  // total is all it needs. Only a split has shares that can go negative.
  const splitting = picked.length > 0;
  const canSave = charged > 0 && (!splitting || !negative);

  const read = async (base64: string, mime: string) => {
    setPhase('reading');
    setError('');
    try {
      const scanned = await scanReceiptImage(base64, mime);
      setReceipt(scanned);
      setLines(
        scanned.items.map((it, i) => ({
          id: `l${i}`,
          label: it.quantity && it.quantity > 1 ? `${it.quantity}× ${it.label}` : it.label,
          amount: it.amount,
          assignedTo: [],
        }))
      );
      setSurcharges(derivedSurcharges(scanned));
      const fallbackTotal = scanned.items.reduce((s, it) => s + it.amount, 0);
      setChargedText((scanned.total ?? fallbackTotal).toFixed(2));
      setPhase('assign');
    } catch (e) {
      setError(llmErrorMessage(e));
      setPhase('capture');
    }
  };

  const handleResult = (res: ImagePicker.ImagePickerResult) => {
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    if (!a.base64) {
      notify('Hmm', "That photo couldn't be read. Try another one.");
      return;
    }
    read(a.base64, a.mimeType ?? 'image/jpeg');
  };

  const takePhoto = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        notify('Permission needed', 'Allow camera access to photograph the receipt.');
        return;
      }
      handleResult(await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 }));
    } finally {
      setBusy(false);
    }
  };

  const pickFromLibrary = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        notify('Permission needed', 'Allow photo access to pick the receipt.');
        return;
      }
      handleResult(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 }));
    } finally {
      setBusy(false);
    }
  };

  const toggleAssign = (lineId: string, personId: string) =>
    setLines((prev) =>
      prev.map((l) =>
        l.id !== lineId
          ? l
          : {
              ...l,
              assignedTo: l.assignedTo.includes(personId)
                ? l.assignedTo.filter((x) => x !== personId)
                : [...l.assignedTo, personId],
            }
      )
    );

  const shareWholeTable = (lineId: string) =>
    setLines((prev) =>
      prev.map((l) =>
        l.id !== lineId ? l : { ...l, assignedTo: l.assignedTo.length === participants.length ? [] : [...participants] }
      )
    );

  const addNew = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const person = await addPerson(name);
      setPicked((prev) => (prev.includes(person.id) ? prev : [...prev, person.id]));
      setNewName('');
    } finally {
      setBusy(false);
    }
  };

  const removePerson = (id: string) => {
    setPicked((prev) => prev.filter((x) => x !== id));
    setLines((prev) => prev.map((l) => ({ ...l, assignedTo: l.assignedTo.filter((x) => x !== id) })));
  };

  const save = () => {
    if (!canSave) return;
    onDone({
      merchant: receipt?.merchant ?? null,
      charged,
      draft: splitting
        ? {
            gross: charged,
            ownShare: result.ownShare,
            method: 'itemized',
            shares: result.shares.filter((s) => s.owed > 0),
          }
        : null,
    });
  };

  if (phase === 'reading') {
    return (
      <View style={[styles.root, { backgroundColor: colorTheme.bg }, styles.center]}>
        <PipSays expr="think">
          <BubbleText>Reading the receipt line by line… this takes a few seconds.</BubbleText>
        </PipSays>
        <ActivityIndicator color={theme.accent} style={{ marginTop: 22 }} />
      </View>
    );
  }

  if (phase === 'capture') {
    return (
      <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
        <View style={{ paddingTop: insets.top + 4 }}>
          <TopBar title="Scan a receipt" onBack={onBack} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 30 }}>
          <PipSays expr="curious">
            <BubbleText>
              Photograph the <B>paper receipt</B> and I’ll read each item. Paid for other people too?
              Tap who ate what instead of doing mental arithmetic at the table.
            </BubbleText>
          </PipSays>

          {error !== '' && (
            <Card style={[styles.errorCard, { backgroundColor: colorTheme.redTint, borderColor: colorTheme.redSoft }]}>
              <Icon name="alert" size={17} color="#b3261e" />
              <Text style={styles.errorText}>{error}</Text>
            </Card>
          )}

          <View style={{ gap: 14, marginTop: 18 }}>
            <SourceRow icon="camera" title="Take a photo" sub="Point at the itemised receipt" onPress={takePhoto} disabled={busy} />
            <SourceRow icon="gallery" title="Choose from gallery" sub="Pick a photo you already took" onPress={pickFromLibrary} disabled={busy} />
            <SourceRow icon="pencil" title="No receipt? Split a total" sub="Type the amount and divide it by hand" onPress={onManualInstead} disabled={busy} />
          </View>

          <Text style={[styles.hint, { color: colorTheme.ink3 }]}>
            The photo is read once and never stored. If you split it, only your own share is recorded as
            spending.
          </Text>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar title={receipt?.merchant ?? 'Assign the items'} onBack={() => setPhase('capture')} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 130 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <PipSays expr={lines.length === 0 ? 'curious' : 'happy'}>
          <BubbleText>
            {lines.length === 0 ? (
              <>I couldn’t make out any items. Check the total below, and add anyone you split it with.</>
            ) : (
              <>
                I read <B>{lines.length} items</B>. Save it as yours, or add who was at the table and tap each
                item onto whoever ordered it.
              </>
            )}
          </BubbleText>
        </PipSays>

        <Text style={[styles.label, { color: colorTheme.ink2 }]}>Who was at the table (optional)</Text>
        {unpicked.length > 0 && (
          <View style={styles.chipWrap}>
            {unpicked.map((p) => (
              <Pressable key={p.id} onPress={() => setPicked((prev) => [...prev, p.id])} style={[styles.chip, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
                <Icon name="plus" size={13} color={theme.accent} stroke={2.4} />
                <Text style={[styles.chipText, { color: theme.onTint }]}>{p.name}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={styles.addRow}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="Add a name"
            placeholderTextColor={colorTheme.ink3}
            style={[styles.nameInput, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line, color: colorTheme.ink }]}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={addNew}
          />
          <Pressable
            onPress={addNew}
            style={[
              styles.addBtn,
              newName.trim() ? { backgroundColor: theme.accent } : [styles.addBtnOff, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }],
            ]}
            disabled={!newName.trim() || busy}
            accessibilityLabel="Add this person"
          >
            <Icon name="plus" size={18} color={newName.trim() ? colors.onAccent : colorTheme.ink3} stroke={2.4} />
          </Pressable>
        </View>

        {picked.length > 0 && (
          <View style={styles.tableRow}>
            {picked.map((id) => (
              <Pressable key={id} onPress={() => removePerson(id)} style={[styles.tableChip, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
                <Text style={[styles.tableChipText, { color: colorTheme.ink }]}>{nameById[id] ?? 'Someone'}</Text>
                <Icon name="x" size={12} color={colorTheme.ink3} />
              </Pressable>
            ))}
            <View style={[styles.tableChip, styles.tableChipSelf, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
              <Text style={[styles.tableChipText, { color: colorTheme.ink }]}>You</Text>
            </View>
          </View>
        )}

        {picked.length === 0 && (
          <Text style={[styles.empty, { color: colorTheme.ink3 }]}>Paid for it alone? Leave this empty and just check the total.</Text>
        )}

        {lines.length > 0 && (
            <>
              <Text style={[styles.label, { marginTop: 22, color: colorTheme.ink2 }]}>
                {splitting ? 'What they ordered' : 'What I read'}
              </Text>
              <Card style={{ overflow: 'hidden' }}>
                {lines.map((line, i) => {
                  const everyone = line.assignedTo.length === participants.length;
                  return (
                    <View key={line.id} style={[styles.itemRow, i > 0 && styles.divider, i > 0 && { borderTopColor: colorTheme.line2 }]}>
                      <View style={styles.itemHead}>
                        <Text style={[styles.itemLabel, { color: colorTheme.ink }]} numberOfLines={1}>
                          {line.label}
                        </Text>
                        <Text style={[styles.itemAmount, { color: colorTheme.ink }]}>{fmt(line.amount)}</Text>
                      </View>
                      {splitting && (
                      <View style={styles.avatarRow}>
                        {participants.map((id) => {
                          const on = line.assignedTo.includes(id);
                          const name = id === SELF ? 'You' : nameById[id] ?? '?';
                          return (
                            <Pressable
                              key={id}
                              onPress={() => toggleAssign(line.id, id)}
                              style={[
                                styles.avatar,
                                { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line },
                                on && styles.avatarOn,
                                on && { backgroundColor: theme.accent, borderColor: theme.accent },
                              ]}
                              accessibilityLabel={`${on ? 'Remove' : 'Add'} ${name} on ${line.label}`}
                              accessibilityState={{ selected: on }}
                            >
                              <Text style={[styles.avatarText, { color: colorTheme.ink2 }, on && styles.avatarTextOn]}>
                                {name.slice(0, id === SELF ? 3 : 1).toUpperCase()}
                              </Text>
                            </Pressable>
                          );
                        })}
                        <Pressable onPress={() => shareWholeTable(line.id)} style={styles.allBtn} hitSlop={4}>
                          <Text style={[styles.allText, { color: theme.accent }, everyone && { color: colorTheme.ink3 }]}>
                            {everyone ? 'Clear' : 'Shared'}
                          </Text>
                        </Pressable>
                      </View>
                      )}
                    </View>
                  );
                })}
              </Card>
              {splitting && result.unassigned.length > 0 && (
                <Text style={[styles.unassigned, { color: colorTheme.amber }]}>
                  {result.unassigned.length} item{result.unassigned.length === 1 ? '' : 's'} nobody has claimed
                  yet, shared across the table for now.
                </Text>
              )}
            </>
        )}

        {splitting && (
          <>
            <Text style={[styles.label, { marginTop: 22, color: colorTheme.ink2 }]}>On top of the items</Text>
            <Card style={{ padding: 4 }}>
              <PctRow
                label="Service charge"
                value={surcharges.serviceChargePct}
                onChange={(v) => setSurcharges((s) => ({ ...s, serviceChargePct: v }))}
                note="Applied to the items subtotal"
              />
              <View style={[styles.divider, { borderTopColor: colorTheme.line2 }]} />
              <PctRow
                label="Service tax"
                value={surcharges.taxPct}
                onChange={(v) => setSurcharges((s) => ({ ...s, taxPct: v }))}
                note="Applied after the service charge, the way the receipt does it"
              />
            </Card>
          </>
        )}

        {/* Always shown: the charge is the whole point of the scan, split or not. */}
        <Text style={[styles.label, { marginTop: 22, color: colorTheme.ink2 }]}>What your card was charged</Text>
        <View style={[styles.amountRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
          <Text style={[styles.rm, { color: colorTheme.ink2 }]}>RM</Text>
          <TextInput
            value={chargedText}
            onChangeText={setChargedText}
            keyboardType="decimal-pad"
            selectTextOnFocus
            style={[styles.amountInput, { color: colorTheme.ink }]}
          />
        </View>

        {splitting && (
          <>
            {Math.abs(result.difference) >= 0.01 && (
              <Text style={[styles.diffNote, { color: colorTheme.ink2 }]}>
                The receipt adds up to RM {fmt(result.computedTotal)}, so RM {fmt(Math.abs(result.difference))}{' '}
                {result.difference > 0 ? 'more was charged' : 'less was charged'}. That is shared across the
                table so the split matches your bank exactly.
              </Text>
            )}

            <Card style={styles.summary}>
              {participants.map((id) => (
                <View key={id} style={styles.summaryRow}>
                  <Text style={[styles.summaryName, { color: colorTheme.ink2 }, id === SELF && [styles.summaryNameSelf, { color: colorTheme.ink }]]}>
                    {id === SELF ? 'You (your expense)' : nameById[id] ?? 'Someone'}
                  </Text>
                  <Text style={[styles.summaryValue, { color: theme.accent }, id === SELF && [styles.summaryValueSelf, { color: colorTheme.ink }]]}>
                    RM {fmt(owedByPerson[id] ?? 0)}
                  </Text>
                </View>
              ))}
            </Card>

            {negative && (
              <Text style={styles.error}>
                That charge is lower than what people ordered, so someone ends up owing a negative amount.
                Check the total.
              </Text>
            )}
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16, backgroundColor: colorTheme.bg, borderTopColor: colorTheme.line2 }]}>
        <PrimaryButton onPress={save} disabled={!canSave}>
          <Icon name="check" size={19} color="#fff" stroke={2.4} />
          <BtnLabel>{splitting ? 'Use this split' : 'Use this receipt'}</BtnLabel>
        </PrimaryButton>
      </View>
    </View>
  );
}

/** An editable percentage with a quick on/off, since not every receipt charges these. */
function PctRow({
  label,
  value,
  onChange,
  note,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  note: string;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const [text, setText] = useState(String(value));
  // Keep the field in step when the scan prefills a rate the user has not touched.
  React.useEffect(() => setText(String(value)), [value]);
  const on = value > 0;

  return (
    <View style={styles.pctRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.pctLabel, { color: colorTheme.ink }]}>{label}</Text>
        <Text style={[styles.pctNote, { color: colorTheme.ink2 }]}>{note}</Text>
      </View>
      {on ? (
        <View style={[styles.pctField, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
          <TextInput
            value={text}
            onChangeText={(v) => {
              setText(v);
              const n = parseFloat(v.replace(/[^0-9.]/g, ''));
              onChange(Number.isFinite(n) && n >= 0 ? n : 0);
            }}
            keyboardType="decimal-pad"
            style={[styles.pctInput, { color: colorTheme.ink }]}
            selectTextOnFocus
          />
          <Text style={[styles.pctSign, { color: colorTheme.ink2 }]}>%</Text>
        </View>
      ) : (
        <Pressable onPress={() => onChange(label === 'Service tax' ? 6 : 10)} style={[styles.pctAdd, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]} hitSlop={4}>
          <Text style={[styles.pctAddText, { color: theme.onTint }]}>Add</Text>
        </Pressable>
      )}
      {on && (
        <Pressable onPress={() => onChange(0)} hitSlop={8} accessibilityLabel={`Remove ${label}`}>
          <Icon name="x" size={15} color={colorTheme.ink3} />
        </Pressable>
      )}
    </View>
  );
}

function SourceRow({
  icon,
  title,
  sub,
  onPress,
  disabled,
}: {
  icon: 'camera' | 'gallery' | 'pencil';
  title: string;
  sub: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.source, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }, pressed && { opacity: 0.9 }]}>
      <View style={[styles.sourceIcon, { backgroundColor: theme.accentTint }]}>
        <Icon name={icon} size={19} color={theme.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sourceTitle, { color: colorTheme.ink }]}>{title}</Text>
        <Text style={[styles.sourceSub, { color: colorTheme.ink2 }]}>{sub}</Text>
      </View>
      <Icon name="chevronRight" size={18} color={colorTheme.ink3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, marginTop: 16 },
  errorText: { flex: 1, fontFamily: uiFont(600), fontSize: 13, color: '#b3261e' },
  hint: { fontFamily: uiFont(500), fontSize: 12, textAlign: 'center', marginTop: 22, lineHeight: 17 },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 15,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  sourceIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sourceTitle: { fontFamily: uiFont(700), fontSize: 15 },
  sourceSub: { fontFamily: uiFont(500), fontSize: 12.5, marginTop: 2 },

  label: { fontFamily: uiFont(600), fontSize: 12.5, marginTop: 18, marginBottom: 9 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontFamily: uiFont(600), fontSize: 13 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontFamily: uiFont(600),
    fontSize: 14.5,
  },
  addBtn: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  addBtnOff: { borderWidth: 1 },
  tableRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  tableChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
  },
  tableChipSelf: {},
  tableChipText: { fontFamily: uiFont(600), fontSize: 13 },
  empty: { fontFamily: uiFont(500), fontSize: 13, marginTop: 18, textAlign: 'center' },

  itemRow: { paddingHorizontal: 14, paddingVertical: 12, gap: 9 },
  divider: { borderTopWidth: 1 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemLabel: { flex: 1, fontFamily: uiFont(600), fontSize: 14 },
  itemAmount: { fontFamily: numFont(700), fontSize: 14 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  avatar: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOn: {},
  avatarText: { fontFamily: uiFont(700), fontSize: 12 },
  avatarTextOn: { color: colors.onAccent },
  allBtn: { paddingHorizontal: 9, paddingVertical: 7 },
  allText: { fontFamily: uiFont(600), fontSize: 12 },
  unassigned: { fontFamily: uiFont(500), fontSize: 11.5, marginTop: 9, lineHeight: 16 },

  pctRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12 },
  pctLabel: { fontFamily: uiFont(700), fontSize: 13.5 },
  pctNote: { fontFamily: uiFont(500), fontSize: 11, marginTop: 2 },
  pctField: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: 8 },
  pctInput: { width: 42, textAlign: 'right', fontFamily: numFont(700), fontSize: 14, paddingVertical: 7 },
  pctSign: { fontFamily: numFont(600), fontSize: 13 },
  pctAdd: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  pctAddText: { fontFamily: uiFont(700), fontSize: 12 },

  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 14 },
  rm: { fontFamily: numFont(600), fontSize: 18 },
  amountInput: { flex: 1, fontFamily: numFont(700), fontSize: 24, paddingVertical: 12 },
  diffNote: { fontFamily: uiFont(500), fontSize: 11.5, marginTop: 8, lineHeight: 16 },

  summary: { padding: 14, gap: 9, marginTop: 18 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryName: { fontFamily: uiFont(600), fontSize: 13.5 },
  summaryNameSelf: { fontFamily: uiFont(700) },
  summaryValue: { fontFamily: numFont(600), fontSize: 14.5 },
  summaryValueSelf: { fontFamily: numFont(700), fontSize: 16 },
  error: { fontFamily: uiFont(600), fontSize: 12.5, color: '#b3261e', marginTop: 14, textAlign: 'center', lineHeight: 17 },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: 1,
  },
});
