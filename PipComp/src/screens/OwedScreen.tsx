import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { Amount, BtnLabel, BubbleText, Card, Eyebrow, PipSays, PrimaryButton, TopBar } from '../components/ui';
import { shortDate } from '../lib/dates';
import { todayISO } from '../lib/duplicates';
import { fmt } from '../lib/format';
import { RECEIVABLE_CLS } from '../lib/networth';
import { confirmAction } from '../lib/platformAlert';
import { daysBetween, type OpenShare } from '../lib/split';
import { useAppData } from '../state/store';
import { colors, numFont, radius, uiFont } from '../theme';

/** A debt this old is worth chasing, and worth Pip mentioning. */
const AGING_DAYS = 14;

interface PersonDebt {
  personId: string;
  name: string;
  total: number;
  shares: OpenShare[];
  oldestDays: number;
}

/**
 * Everyone who owes you, and the bills behind it.
 *
 * Nothing here writes an income row. Settling moves cash against the receivable, and a write-off
 * turns what never came back into the expense it always really was.
 */
export function OwedScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { openShares, accounts, settleShare, writeOffShare } = useAppData();
  const today = useMemo(() => todayISO(), []);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [settling, setSettling] = useState<OpenShare | null>(null);

  const byPerson = useMemo<PersonDebt[]>(() => {
    const map = new Map<string, PersonDebt>();
    for (const share of openShares) {
      let entry = map.get(share.personId);
      if (!entry) {
        entry = { personId: share.personId, name: share.personName, total: 0, shares: [], oldestDays: 0 };
        map.set(share.personId, entry);
      }
      entry.total = Math.round((entry.total + share.outstanding) * 100) / 100;
      entry.shares.push(share);
      entry.oldestDays = Math.max(entry.oldestDays, daysBetween(share.billDate, today) ?? 0);
    }
    for (const entry of map.values()) {
      entry.shares.sort((a, b) => (a.billDate ?? '').localeCompare(b.billDate ?? ''));
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [openShares, today]);

  const total = byPerson.reduce((s, p) => s + p.total, 0);
  const aging = byPerson.filter((p) => p.oldestDays >= AGING_DAYS);

  const confirmWriteOff = (share: OpenShare) => {
    confirmAction(
      'Write this off?',
      `Give up on the RM ${fmt(share.outstanding)} ${share.personName} owes you for “${share.merchant}”? It becomes your own expense, dated today.`,
      'Write off',
      () => writeOffShare(share.shareId)
    );
  };

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar title="Owed to you" onBack={onBack} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>
        {byPerson.length === 0 ? (
          <>
            <PipSays expr="idle">
              <BubbleText>Nobody owes you anything right now. Split a bill and I will keep track of it.</BubbleText>
            </PipSays>
            <Card style={{ padding: 26, alignItems: 'center', marginTop: 14 }}>
              <Text style={styles.emptyTitle}>All square</Text>
              <Text style={styles.emptySub}>
                When you pay for the table, split the bill and only your share counts as spending.
              </Text>
            </Card>
          </>
        ) : (
          <>
            {aging.length > 0 && (
              <PipSays expr="curious">
                <BubbleText>
                  {aging[0].name} has owed you RM {fmt(aging[0].total)} for {aging[0].oldestDays} days
                  {aging.length === 2
                    ? ', and 1 other is overdue too'
                    : aging.length > 2
                      ? `, and ${aging.length - 1} others are overdue too`
                      : ''}
                  .
                </BubbleText>
              </PipSays>
            )}

            <Card style={styles.totalCard}>
              <Eyebrow>Still owed to you</Eyebrow>
              <Amount value={total} size={30} weight={700} color={colors.accent} />
              <Text style={styles.totalSub}>
                Sitting in Net Worth as an asset, not as spending you never did.
              </Text>
            </Card>

            <Text style={styles.countLine}>
              {byPerson.length} {byPerson.length === 1 ? 'person' : 'people'} · tap to see the bills
            </Text>

            <Card style={{ overflow: 'hidden' }}>
              {byPerson.map((p, i) => {
                const open = expanded === p.personId;
                return (
                  <View key={p.personId} style={i > 0 ? styles.divider : undefined}>
                    <Pressable
                      onPress={() => setExpanded(open ? null : p.personId)}
                      style={({ pressed }) => [styles.personRow, pressed && { backgroundColor: colors.surface2 }]}
                    >
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{p.name.slice(0, 1).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.personName} numberOfLines={1}>
                          {p.name}
                        </Text>
                        <Text style={styles.personSub}>
                          {p.shares.length} {p.shares.length === 1 ? 'bill' : 'bills'}
                          {p.oldestDays > 0 ? ` · oldest ${p.oldestDays}d` : ''}
                        </Text>
                      </View>
                      {p.oldestDays >= AGING_DAYS && (
                        <View style={styles.agePill}>
                          <Text style={styles.ageText}>Overdue</Text>
                        </View>
                      )}
                      <Amount value={p.total} size={15} weight={700} color={colors.accent} />
                      <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
                        <Icon name="chevronDown" size={16} color={colors.ink3} />
                      </View>
                    </Pressable>

                    {open &&
                      p.shares.map((share) => (
                        <View key={share.shareId} style={styles.shareRow}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.shareMerchant} numberOfLines={1}>
                              {share.merchant}
                            </Text>
                            <Text style={styles.shareSub}>
                              {shortDate(share.billDate)} · RM {fmt(share.outstanding)} outstanding
                            </Text>
                          </View>
                          <Pressable onPress={() => setSettling(share)} style={styles.settleBtn} hitSlop={4}>
                            <Icon name="check" size={14} color={colors.onAccent} stroke={2.4} />
                            <Text style={styles.settleText}>Settle</Text>
                          </Pressable>
                          <Pressable onPress={() => confirmWriteOff(share)} hitSlop={8} accessibilityLabel="Write off">
                            <Icon name="trash" size={16} color={colors.ink3} />
                          </Pressable>
                        </View>
                      ))}
                  </View>
                );
              })}
            </Card>

            <Text style={styles.footnote}>
              When they pay you back through your bank, scan it as usual and Pip will offer to match it
              against the right debt. Settling here is for cash.
            </Text>
          </>
        )}
      </ScrollView>

      <SettleSheet
        share={settling}
        accounts={accounts}
        today={today}
        onClose={() => setSettling(null)}
        onSettle={async (amount, accountId) => {
          if (!settling) return;
          await settleShare(settling.shareId, amount, today, 'declared', null, accountId);
          setSettling(null);
        }}
      />
    </View>
  );
}

/** Record a cash repayment: how much came back, and which account it landed in. */
function SettleSheet({
  share,
  accounts,
  today,
  onClose,
  onSettle,
}: {
  share: OpenShare | null;
  accounts: { id: string; name: string; kind: string; cls: string; archived: boolean }[];
  today: string;
  onClose: () => void;
  onSettle: (amount: number, accountId: string | null) => void;
}) {
  const insets = useSafeAreaInsets();
  // The receivable itself is never a destination: paying into it would be settling a debt with
  // the debt. It is also derived, so anything written there is overwritten on the next reconcile.
  const assets = useMemo(
    () => accounts.filter((a) => !a.archived && a.kind === 'asset' && a.cls !== RECEIVABLE_CLS),
    [accounts]
  );
  const [amountText, setAmountText] = useState('');
  const [acct, setAcct] = useState<string | null>(null);

  const openId = share?.shareId;
  React.useEffect(() => {
    if (share) {
      setAmountText(share.outstanding.toFixed(2));
      setAcct(assets[0]?.id ?? null);
    }
  }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!share) return <Modal visible={false} transparent />;

  const parsed = parseFloat(amountText.replace(/[^0-9.]/g, '')) || 0;
  const amount = Math.min(share.outstanding, Math.round(parsed * 100) / 100);
  const partial = amount > 0 && amount < share.outstanding;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.handle} />
        <View style={styles.sheetHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetTitle}>{share.personName} paid you back</Text>
            <Text style={styles.sheetSub} numberOfLines={1}>
              {share.merchant} · RM {fmt(share.outstanding)} outstanding
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
            <Icon name="x" size={20} color={colors.ink2} />
          </Pressable>
        </View>

        <Text style={styles.fieldLabel}>How much came back</Text>
        <View style={styles.amountRow}>
          <Text style={styles.rm}>RM</Text>
          <TextInput
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            selectTextOnFocus
            style={styles.amountInput}
          />
        </View>
        {partial && <Text style={styles.partialNote}>Partial payment. RM {fmt(share.outstanding - amount)} stays open.</Text>}

        <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Where it landed</Text>
        <View style={styles.acctWrap}>
          {assets.map((a) => {
            const on = acct === a.id;
            return (
              <Pressable key={a.id} onPress={() => setAcct(a.id)} style={[styles.acctChip, on && styles.acctChipOn]}>
                <Text style={[styles.acctText, on && styles.acctTextOn]} numberOfLines={1}>
                  {a.name}
                </Text>
              </Pressable>
            );
          })}
          <Pressable onPress={() => setAcct(null)} style={[styles.acctChip, acct === null && styles.acctChipOn]}>
            <Text style={[styles.acctText, acct === null && styles.acctTextOn]}>Not tracked</Text>
          </Pressable>
        </View>
        <Text style={styles.acctNote}>
          No income is recorded. The debt clears and the cash moves, which is what being paid back
          actually is.
        </Text>

        <View style={{ marginTop: 18 }}>
          <PrimaryButton onPress={() => onSettle(amount, acct)} height={52} disabled={amount <= 0}>
            <Icon name="check" size={18} color="#fff" stroke={2.4} />
            <BtnLabel>{partial ? `Record RM ${fmt(amount)}` : 'Mark settled'}</BtnLabel>
          </PrimaryButton>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  totalCard: { padding: 18, gap: 8, marginTop: 14 },
  totalSub: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink2, marginTop: 2 },
  countLine: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, marginTop: 18, marginBottom: 10, marginLeft: 2 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line2 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 15, paddingVertical: 13 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: uiFont(700), fontSize: 15, color: colors.accentInk },
  personName: { fontFamily: uiFont(700), fontSize: 15, color: colors.ink },
  personSub: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink2, marginTop: 1 },
  agePill: { backgroundColor: colors.amberSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  ageText: { fontFamily: uiFont(700), fontSize: 10.5, color: colors.amber },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 64,
    paddingRight: 15,
    paddingVertical: 10,
    backgroundColor: colors.surface2,
    borderTopWidth: 1,
    borderTopColor: colors.line2,
  },
  shareMerchant: { fontFamily: uiFont(600), fontSize: 13.5, color: colors.ink },
  shareSub: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink2, marginTop: 1 },
  settleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.accent,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
  },
  settleText: { fontFamily: uiFont(700), fontSize: 12, color: colors.onAccent },
  footnote: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink3, lineHeight: 17, marginTop: 16, textAlign: 'center' },
  emptyTitle: { fontFamily: uiFont(700), fontSize: 17, color: colors.ink },
  emptySub: { fontFamily: uiFont(500), fontSize: 13.5, color: colors.ink2, marginTop: 6, textAlign: 'center', lineHeight: 19 },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,32,24,0.4)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 999, backgroundColor: colors.line, marginBottom: 12 },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  sheetTitle: { fontFamily: uiFont(700), fontSize: 18, color: colors.ink },
  sheetSub: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, marginTop: 2 },
  fieldLabel: { fontFamily: uiFont(600), fontSize: 12.5, color: colors.ink2, marginBottom: 8 },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
  },
  rm: { fontFamily: numFont(600), fontSize: 18, color: colors.ink2 },
  amountInput: { flex: 1, fontFamily: numFont(700), fontSize: 24, color: colors.ink, paddingVertical: 12 },
  partialNote: { fontFamily: uiFont(600), fontSize: 12, color: colors.amber, marginTop: 8 },
  acctWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  acctChip: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  acctChipOn: { backgroundColor: colors.accentTint, borderColor: colors.accentSoft },
  acctText: { fontFamily: uiFont(600), fontSize: 13, color: colors.ink2, maxWidth: 160 },
  acctTextOn: { color: colors.accentInk },
  acctNote: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink3, lineHeight: 16, marginTop: 10 },
});
