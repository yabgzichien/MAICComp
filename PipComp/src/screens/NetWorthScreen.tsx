// src/screens/NetWorthScreen.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../components/Icon';
import { HoldingScanScreen } from './HoldingScanScreen';
import { ScanBalanceButton } from '../components/ScanBalanceButton';
import { TickerSearchModal } from '../components/TickerSearchModal';
import { Amount, BtnLabel, Card, Eyebrow, PrimaryButton, TopBar, ValueToggle, type ValueMode } from '../components/ui';
import { shortDate } from '../lib/dates';
import { fmt } from '../lib/format';
import {
  CLASS_BY_ID,
  classesFor,
  groupByClass,
  netWorth,
  netWorthSeries,
  type ClassGroup,
} from '../lib/networth';
import { groupHoldings, holdingProfit, isHolding, subFromType, typeFromSub, type TickerResult } from '../lib/prices';
import { todayISO } from '../lib/duplicates';
import { searchInvestments } from '../prices';
import type { Account, AccountKind, PriceQuote } from '../lib/types';
import { useAppData } from '../state/store';
import { colors, numFont, radius, uiFont } from '../theme';

const RED2 = '#c5402f';
function timeOf(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const RED = '#c5402f';

function lastMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export function NetWorthScreen({ onBack, onOpenSettings = () => {} }: { onBack: () => void; onOpenSettings?: () => void }) {
  const insets = useSafeAreaInsets();
  const { accounts, balanceEntries, accountValues, prices, pricesAsOf, refreshPrices } = useAppData();
  const [adding, setAdding] = useState(false);
  const [presetCoin, setPresetCoin] = useState<TickerResult | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [groupSymbol, setGroupSymbol] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [profitMode, setProfitMode] = useState<ValueMode>('amount');

  const hasHoldings = useMemo(() => accounts.some(isHolding), [accounts]);

  const doRefresh = async () => {
    if (!hasHoldings) return;
    setRefreshing(true);
    try {
      await refreshPrices();
    } finally {
      setRefreshing(false);
    }
  };

  // Refresh prices when the screen opens (if there are holdings to price).
  useEffect(() => {
    if (hasHoldings) refreshPrices().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHoldings]);

  const nw = useMemo(() => netWorth(accounts, accountValues), [accounts, accountValues]);
  const groups = useMemo(() => groupByClass(accounts, accountValues), [accounts, accountValues]);
  const series = useMemo(
    () => netWorthSeries(accounts, balanceEntries, lastMonths(6)).map((p) => p.net),
    [accounts, balanceEntries]
  );
  const editing = editingId ? accounts.find((a) => a.id === editingId) ?? null : null;
  const groupLots = useMemo(
    () => (groupSymbol ? accounts.filter((a) => isHolding(a) && a.symbol === groupSymbol) : []),
    [groupSymbol, accounts]
  );

  const empty = accounts.length === 0;

  // Safe to branch here — all hooks above have run unconditionally.
  if (scanning) {
    return <HoldingScanScreen onClose={() => setScanning(false)} onOpenSettings={onOpenSettings} />;
  }

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar
          title="Net worth"
          onBack={onBack}
          right={
            <Pressable onPress={() => setScanning(true)} hitSlop={8} style={styles.scanBtn}>
              <Icon name="scan" size={18} color={colors.accent} />
              <Text style={styles.scanText}>Scan</Text>
            </Pressable>
          }
        />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          hasHoldings ? <RefreshControl refreshing={refreshing} onRefresh={doRefresh} tintColor={colors.accent} /> : undefined
        }
      >
        {/* hero */}
        <Card style={styles.hero}>
          <View style={styles.heroHead}>
            <Eyebrow>Net worth</Eyebrow>
            {hasHoldings && (
              <View style={styles.profitToggle}>
                <Text style={styles.profitToggleLabel}>Profit</Text>
                <ValueToggle mode={profitMode} onChange={setProfitMode} />
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 8 }}>
            <Text style={[styles.heroSign, { color: nw.net >= 0 ? colors.accent : RED }]}>{nw.net < 0 ? '−' : ''}</Text>
            <Amount value={Math.abs(nw.net)} size={40} weight={700} color={nw.net >= 0 ? colors.accent : RED} />
          </View>
          {series.length >= 2 && (
            <View style={{ marginTop: 12 }}>
              <Sparkline values={series} color={nw.net >= 0 ? colors.accent : RED} />
              <Text style={styles.sparkLabel}>Last 6 months</Text>
            </View>
          )}
          <View style={styles.splitRow}>
            <View>
              <Text style={styles.splitLabel}>Assets</Text>
              <Text style={[styles.splitVal, { color: colors.accent }]}>RM {fmt(nw.assets)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.splitLabel}>Liabilities</Text>
              <Text style={[styles.splitVal, { color: RED }]}>RM {fmt(nw.liabilities)}</Text>
            </View>
          </View>
        </Card>

        {empty && (
          <Card style={{ padding: 22, alignItems: 'center', marginTop: 16 }}>
            <Icon name="scale" size={40} color={colors.accent} />
            <Text style={styles.emptyTitle}>Track what you own and owe</Text>
            <Text style={styles.emptySub}>Add cash, investments, and loans to see your net worth grow over time.</Text>
          </Card>
        )}

        <ClassSections title="Assets" groups={groups.assets} accountValues={accountValues} profitMode={profitMode} onTap={setEditingId} onTapGroup={setGroupSymbol} />
        <ClassSections title="Liabilities" groups={groups.liabilities} accountValues={accountValues} profitMode={profitMode} onTap={setEditingId} onTapGroup={setGroupSymbol} />

        {hasHoldings && pricesAsOf && (
          <Text style={styles.asOf}>Prices as of {timeOf(pricesAsOf)} · pull to refresh</Text>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <PrimaryButton onPress={() => { setPresetCoin(null); setAdding(true); }} height={54}>
          <Icon name="plus" size={20} color="#fff" stroke={2.4} />
          <BtnLabel>Add account</BtnLabel>
        </PrimaryButton>
      </View>

      <AddAccountModal visible={adding} preset={presetCoin} onClose={() => { setAdding(false); setPresetCoin(null); }} />
      <AccountSheet account={editing} onClose={() => setEditingId(null)} />
      <HoldingGroupSheet
        lots={groupLots}
        accountValues={accountValues}
        prices={prices}
        profitMode={profitMode}
        onClose={() => setGroupSymbol(null)}
        onEditLot={(id) => { setGroupSymbol(null); setEditingId(id); }}
        onAddMore={(coin) => { setGroupSymbol(null); setPresetCoin(coin); setAdding(true); }}
      />
    </View>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 34 - ((v - min) / span) * 28;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  return (
    <Svg width="100%" height={40} viewBox="0 0 100 38" preserveAspectRatio="none">
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

/** A row showing a name + optional meta on the left and value + optional profit on the right. */
function AccountRow({
  name,
  meta,
  value,
  profit,
  profitMode,
  onPress,
}: {
  name: string;
  meta?: string;
  value: number;
  profit: { profit: number; pct: number | null } | null;
  profitMode: ValueMode;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.acctRow, styles.divider]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.acctName} numberOfLines={1}>{name}</Text>
        {meta ? <Text style={styles.acctMeta} numberOfLines={1}>{meta}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.acctVal}>RM {fmt(value)}</Text>
        {profit && (
          <Text style={[styles.profit, { color: profit.profit >= 0 ? colors.accent : RED2 }]}>
            {profit.profit >= 0 ? '+' : '−'}
            {profitMode === 'percent' && profit.pct != null
              ? `${Math.abs(profit.pct).toFixed(1)}%`
              : `RM ${fmt(Math.abs(profit.profit))}`}
          </Text>
        )}
      </View>
      <Icon name="chevronRight" size={16} color={colors.ink3} />
    </Pressable>
  );
}

function ClassSections({
  title,
  groups,
  accountValues,
  profitMode,
  onTap,
  onTapGroup,
}: {
  title: string;
  groups: ClassGroup[];
  accountValues: Record<string, number>;
  profitMode: ValueMode;
  onTap: (id: string) => void;
  onTapGroup: (symbol: string) => void;
}) {
  if (groups.length === 0) return null;
  const total = groups.reduce((s, g) => s + g.total, 0);
  return (
    <>
      <View style={styles.sectionHead}>
        <Eyebrow>{title}</Eyebrow>
        <Text style={styles.sectionTotal}>RM {fmt(total)}</Text>
      </View>
      {groups.map((g) => {
        const holdings = g.accounts.filter((x) => isHolding(x.account)).map((x) => x.account);
        const manual = g.accounts.filter((x) => !isHolding(x.account));
        const hGroups = groupHoldings(holdings, accountValues);
        return (
          <Card key={g.cls} style={{ overflow: 'hidden', marginBottom: 12 }}>
            <View style={styles.classHead}>
              <View style={styles.classIcon}>
                <Icon name={(CLASS_BY_ID[g.cls]?.icon ?? 'wallet') as IconName} size={16} color={colors.accent} />
              </View>
              <Text style={styles.className}>{g.label}</Text>
              <Text style={styles.classTotal}>RM {fmt(g.total)}</Text>
            </View>
            {hGroups.map((grp) => {
              const lots = grp.accounts.length;
              const p = grp.cost != null && grp.cost > 0 ? holdingProfit(grp.value, grp.cost) : null;
              return (
                <AccountRow
                  key={grp.symbol}
                  name={grp.name}
                  meta={`${grp.quantity} ${grp.ticker}${lots > 1 ? ` · ${lots} lots` : ''}`}
                  value={grp.value}
                  profit={p}
                  profitMode={profitMode}
                  onPress={() => onTapGroup(grp.symbol)}
                />
              );
            })}
            {manual.map(({ account, value }) => (
              <AccountRow key={account.id} name={account.name} value={value} profit={null} profitMode={profitMode} onPress={() => onTap(account.id)} />
            ))}
          </Card>
        );
      })}
    </>
  );
}

/** Add a new account: kind → class → name → opening value, or a live holding (optionally preset to a ticker). */
function AddAccountModal({ visible, preset, onClose }: { visible: boolean; preset?: TickerResult | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { addAccount, addHolding } = useAppData();
  const [kind, setKind] = useState<AccountKind>('asset');
  const [cls, setCls] = useState('cash');
  const [name, setName] = useState('');
  const [valueText, setValueText] = useState('');
  const [holdingMode, setHoldingMode] = useState(false);
  const [coin, setCoin] = useState<TickerResult | null>(null);
  const [qtyText, setQtyText] = useState('');
  const [costText, setCostText] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const reset = () => {
    setKind('asset'); setCls('cash'); setName(''); setValueText('');
    setHoldingMode(false); setCoin(null); setQtyText(''); setCostText('');
  };
  const close = () => { reset(); onClose(); };

  // On open, either preset to a specific ticker ("add another lot") or start fresh.
  useEffect(() => {
    if (!visible) return;
    if (preset) {
      setKind('asset'); setCls('investments'); setHoldingMode(true);
      setCoin(preset); setName(''); setValueText(''); setQtyText(''); setCostText('');
    } else {
      reset();
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchKind = (k: AccountKind) => {
    setKind(k);
    setCls(classesFor(k)[0].id);
    setHoldingMode(false);
  };

  const isInvest = kind === 'asset' && cls === 'investments';
  const isHoldingType = isInvest && holdingMode;
  const pickedSub = coin ? subFromType(coin.type) : null;
  const qtyUnit = pickedSub === 'commodity' ? 'g' : coin?.ticker ?? '';
  const qtyLabel = pickedSub === 'commodity' ? 'Grams' : pickedSub === 'stock' ? 'Shares' : 'Quantity';
  const quantity = Math.max(0, parseFloat(qtyText.replace(/[^0-9.]/g, '')) || 0);
  const value = Math.max(0, parseFloat(valueText.replace(/[^0-9.]/g, '')) || 0);
  const canSave = isHoldingType ? !!coin && quantity > 0 : name.trim().length > 0;

  const pickCoin = (c: TickerResult) => {
    setCoin(c);
    if (!name.trim()) setName(c.name);
    setSearchOpen(false);
  };

  const save = async () => {
    if (!canSave) return;
    if (isHoldingType && coin) {
      const sub = subFromType(coin.type);
      const ticker = sub === 'commodity' ? 'g' : coin.ticker; // gold/silver measured in grams
      const cost = costText.trim() ? Math.round((parseFloat(costText.replace(/[^0-9.]/g, '')) || 0) * 100) / 100 : null;
      await addHolding(name.trim() || coin.name, sub, coin.id, ticker, Math.round(quantity * 1e8) / 1e8, cost);
    } else {
      await addAccount(name.trim(), kind, cls, Math.round(value * 100) / 100, todayISO());
    }
    close();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.handle} />
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>New account</Text>
          <Pressable onPress={close} hitSlop={8}><Icon name="x" size={20} color={colors.ink2} /></Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.toggle}>
            {(['asset', 'liability'] as AccountKind[]).map((k) => {
              const on = kind === k;
              return (
                <Pressable key={k} onPress={() => switchKind(k)} style={[styles.toggleBtn, on && styles.toggleBtnOn]}>
                  <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{k === 'asset' ? 'Asset' : 'Liability'}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>Type</Text>
          <View style={styles.classGrid}>
            {classesFor(kind).map((c) => {
              const on = cls === c.id;
              return (
                <Pressable key={c.id} onPress={() => setCls(c.id)} style={[styles.classChip, on && styles.classChipOn]}>
                  <Icon name={c.icon as IconName} size={15} color={on ? colors.accent : colors.ink3} />
                  <Text style={[styles.classChipText, on && { color: colors.accentInk }]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {isInvest && (
            <View style={[styles.toggle, { marginTop: 18, marginBottom: 0 }]}>
              {([[true, 'Live holding'], [false, 'Manual value']] as const).map(([m, label]) => {
                const on = holdingMode === m;
                return (
                  <Pressable key={label} onPress={() => { setHoldingMode(m); setCoin(null); }} style={[styles.toggleBtn, on && styles.toggleBtnOn]}>
                    <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {isHoldingType ? (
            <>
              <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Investment</Text>
              <Pressable onPress={() => setSearchOpen(true)} style={styles.pickerBtn}>
                <Icon name="search" size={16} color={colors.accent} />
                <Text style={[styles.pickerText, !coin && { color: colors.ink3 }]} numberOfLines={1}>
                  {coin ? `${coin.name} · ${qtyUnit}` : 'Search crypto, stocks, gold or silver…'}
                </Text>
              </Pressable>

              <Text style={[styles.fieldLabel, { marginTop: 18 }]}>{qtyLabel}</Text>
              <View style={styles.amountRow}>
                <TextInput value={qtyText} onChangeText={setQtyText} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.ink3} style={styles.amountInput} />
                {coin ? <Text style={styles.rm}>{qtyUnit}</Text> : null}
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Invested amount (optional)</Text>
              <View style={styles.amountRow}>
                <Text style={styles.rm}>RM</Text>
                <TextInput value={costText} onChangeText={setCostText} keyboardType="decimal-pad" placeholder="what you paid" placeholderTextColor={colors.ink3} style={styles.amountInput} />
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Name (optional)</Text>
              <TextInput value={name} onChangeText={setName} placeholder="e.g. My holding" placeholderTextColor={colors.ink3} style={styles.textInput} />
            </>
          ) : (
            <>
              <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={kind === 'asset' ? 'e.g. TnG eWallet, Maybank FD' : 'e.g. Car Loan'}
                placeholderTextColor={colors.ink3}
                style={styles.textInput}
              />

              <View style={[styles.labelRow, { marginTop: 18 }]}>
                <Text style={styles.fieldLabel}>{kind === 'asset' ? 'Current value' : 'Outstanding amount'}</Text>
                <ScanBalanceButton onResult={(n) => setValueText(String(n))} />
              </View>
              <View style={styles.amountRow}>
                <Text style={styles.rm}>RM</Text>
                <TextInput value={valueText} onChangeText={setValueText} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.ink3} style={styles.amountInput} />
              </View>
            </>
          )}

          <View style={{ marginTop: 22 }}>
            <PrimaryButton onPress={save} disabled={!canSave} height={52}>
              <Icon name="check" size={18} color="#fff" stroke={2.4} />
              <BtnLabel>{isHoldingType ? 'Add holding' : 'Add account'}</BtnLabel>
            </PrimaryButton>
          </View>
        </ScrollView>
      </View>

      <TickerSearchModal
        visible={searchOpen}
        title="Search investments"
        placeholder="BTC, AAPL, 1155.KL, Gold…"
        search={searchInvestments}
        onPick={pickCoin}
        onClose={() => setSearchOpen(false)}
      />
    </Modal>
  );
}

/** The combined view of one symbol's lots: totals + each lot (tap to modify) + add another. */
function HoldingGroupSheet({
  lots,
  accountValues,
  prices,
  profitMode,
  onClose,
  onEditLot,
  onAddMore,
}: {
  lots: Account[];
  accountValues: Record<string, number>;
  prices: Record<string, PriceQuote>;
  profitMode: ValueMode;
  onClose: () => void;
  onEditLot: (id: string) => void;
  onAddMore: (coin: TickerResult) => void;
}) {
  const insets = useSafeAreaInsets();
  if (lots.length === 0) return <Modal visible={false} transparent />;

  const grp = groupHoldings(lots, accountValues)[0];
  const price = prices[grp.symbol];
  const totalP = grp.cost != null && grp.cost > 0 ? holdingProfit(grp.value, grp.cost) : null;
  const coin: TickerResult = { id: grp.symbol, ticker: grp.ticker, name: grp.name, type: typeFromSub(grp.sub) };
  const ordered = [...lots].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.handle} />
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle} numberOfLines={1}>{grp.name}</Text>
          <Pressable onPress={onClose} hitSlop={8}><Icon name="x" size={20} color={colors.ink2} /></Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.holdingSummary}>
            <Text style={styles.holdingTicker}>{grp.ticker}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.holdingPrice}>
                {grp.quantity} {grp.ticker}{price ? ` · RM ${fmt(price.priceMYR)} each` : ''}
              </Text>
              <Text style={styles.holdingValue}>= RM {fmt(grp.value)}</Text>
            </View>
          </View>
          {totalP && (
            <Text style={[styles.profitLine, { color: totalP.profit >= 0 ? colors.accent : RED2 }]}>
              {totalP.profit >= 0 ? '▲ +' : '▼ −'}RM {fmt(Math.abs(totalP.profit))}
              {totalP.pct != null ? ` (${totalP.profit >= 0 ? '+' : '−'}${Math.abs(totalP.pct).toFixed(1)}%)` : ''} on RM {fmt(grp.cost as number)} invested
            </Text>
          )}

          <Eyebrow style={{ marginTop: 20, marginBottom: 10 }}>{ordered.length} lot{ordered.length === 1 ? '' : 's'}</Eyebrow>
          <Card style={{ overflow: 'hidden' }}>
            {ordered.map(({ id, quantity, createdAt, cost }) => {
              const value = accountValues[id] ?? 0;
              const p = cost != null && cost > 0 ? holdingProfit(value, cost) : null;
              return (
                <AccountRow
                  key={id}
                  name={`${quantity} ${grp.ticker}`}
                  meta={`added ${shortDate(createdAt)}`}
                  value={value}
                  profit={p}
                  profitMode={profitMode}
                  onPress={() => onEditLot(id)}
                />
              );
            })}
          </Card>

          <View style={{ marginTop: 20 }}>
            <PrimaryButton onPress={() => onAddMore(coin)} height={50}>
              <Icon name="plus" size={18} color="#fff" stroke={2.2} />
              <BtnLabel>Add another {grp.ticker}</BtnLabel>
            </PrimaryButton>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Manage one account: update balance, rename, reclassify, view history, delete. */
function AccountSheet({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { balanceEntries, accountValues, prices, setBalance, updateAccount, deleteAccount, updateHoldingQuantity, setHoldingCost } = useAppData();
  const [name, setName] = useState('');
  const [cls, setCls] = useState('cash');
  const [valueText, setValueText] = useState('');
  const [qtyText, setQtyText] = useState('');
  const [costText, setCostText] = useState('');

  const holding = account ? isHolding(account) : false;

  const openId = account?.id;
  React.useEffect(() => {
    if (account) {
      setName(account.name);
      setCls(account.cls);
      setValueText(String(accountValues[account.id] ?? 0));
      setQtyText(account.quantity != null ? String(account.quantity) : '');
      setCostText(account.cost != null ? String(account.cost) : '');
    }
  }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  const history = useMemo(
    () => (account ? balanceEntries.filter((e) => e.accountId === account.id).slice().reverse() : []),
    [account, balanceEntries]
  );

  if (!account) return <Modal visible={false} transparent />;

  const save = async () => {
    const newName = name.trim() || account.name;
    if (holding) {
      if (newName !== account.name) await updateAccount(account.id, { name: newName, cls: account.cls });
      const q = parseFloat(qtyText.replace(/[^0-9.]/g, ''));
      if (Number.isFinite(q) && q >= 0 && q !== account.quantity) {
        await updateHoldingQuantity(account.id, Math.round(q * 1e8) / 1e8);
      }
      const cost = costText.trim() ? Math.round((parseFloat(costText.replace(/[^0-9.]/g, '')) || 0) * 100) / 100 : null;
      if (cost !== account.cost) await setHoldingCost(account.id, cost);
      onClose();
      return;
    }
    if (newName !== account.name || cls !== account.cls) {
      await updateAccount(account.id, { name: newName, cls });
    }
    const v = parseFloat(valueText.replace(/[^0-9.]/g, ''));
    const value = Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
    if (value !== null && value !== (accountValues[account.id] ?? 0)) {
      await setBalance(account.id, value, todayISO());
    }
    onClose();
  };

  const confirmDelete = () => {
    Alert.alert('Delete account?', `Remove “${account.name}” and its history? This can’t be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteAccount(account.id); onClose(); } },
    ]);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.handle} />
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle} numberOfLines={1}>{account.name}</Text>
          <Pressable onPress={onClose} hitSlop={8}><Icon name="x" size={20} color={colors.ink2} /></Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {holding ? (
            <>
              <View style={styles.holdingSummary}>
                <Text style={styles.holdingTicker}>{account.ticker}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.holdingPrice}>
                    {prices[account.symbol as string] ? `RM ${fmt(prices[account.symbol as string].priceMYR)} each` : 'Price unavailable'}
                  </Text>
                  <Text style={styles.holdingValue}>= RM {fmt(accountValues[account.id] ?? 0)}</Text>
                </View>
              </View>

              {account.cost != null && account.cost > 0 && (() => {
                const p = holdingProfit(accountValues[account.id] ?? 0, account.cost);
                const up = p.profit >= 0;
                return (
                  <Text style={[styles.profitLine, { color: up ? colors.accent : RED2 }]}>
                    {up ? '▲' : '▼'} {up ? '+' : '−'}RM {fmt(Math.abs(p.profit))}
                    {p.pct != null ? ` (${up ? '+' : '−'}${Math.abs(p.pct).toFixed(1)}%)` : ''} on RM {fmt(account.cost)} invested
                  </Text>
                );
              })()}

              <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Quantity</Text>
              <View style={styles.amountRow}>
                <TextInput value={qtyText} onChangeText={setQtyText} keyboardType="decimal-pad" selectTextOnFocus style={styles.amountInput} />
                <Text style={styles.rm}>{account.ticker}</Text>
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Invested amount (cost)</Text>
              <View style={styles.amountRow}>
                <Text style={styles.rm}>RM</Text>
                <TextInput value={costText} onChangeText={setCostText} keyboardType="decimal-pad" placeholder="what you paid" placeholderTextColor={colors.ink3} style={styles.amountInput} />
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Name</Text>
              <TextInput value={name} onChangeText={setName} style={styles.textInput} />
            </>
          ) : (
            <>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>{account.kind === 'asset' ? 'Current value' : 'Outstanding amount'}</Text>
                <ScanBalanceButton onResult={(n) => setValueText(String(n))} />
              </View>
              <View style={styles.amountRow}>
                <Text style={styles.rm}>RM</Text>
                <TextInput value={valueText} onChangeText={setValueText} keyboardType="decimal-pad" selectTextOnFocus style={styles.amountInput} />
              </View>
              <Text style={styles.hint}>Saving a new value records it as of today.</Text>

              <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Name</Text>
              <TextInput value={name} onChangeText={setName} style={styles.textInput} />

              <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Type</Text>
              <View style={styles.classGrid}>
                {classesFor(account.kind).map((c) => {
                  const on = cls === c.id;
                  return (
                    <Pressable key={c.id} onPress={() => setCls(c.id)} style={[styles.classChip, on && styles.classChipOn]}>
                      <Icon name={c.icon as IconName} size={15} color={on ? colors.accent : colors.ink3} />
                      <Text style={[styles.classChipText, on && { color: colors.accentInk }]}>{c.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {history.length > 1 && (
            <>
              <Text style={[styles.fieldLabel, { marginTop: 18 }]}>History</Text>
              <Card style={{ overflow: 'hidden' }}>
                {history.map((e, i) => (
                  <View key={e.id} style={[styles.histRow, i > 0 && styles.divider]}>
                    <Text style={styles.histDate}>{shortDate(e.asOf)}</Text>
                    <Text style={styles.histVal}>RM {fmt(e.value)}</Text>
                  </View>
                ))}
              </Card>
            </>
          )}

          <View style={{ marginTop: 20 }}>
            <PrimaryButton onPress={save} height={52}>
              <Icon name="check" size={18} color="#fff" stroke={2.4} />
              <BtnLabel>Save</BtnLabel>
            </PrimaryButton>
          </View>
          <Pressable onPress={confirmDelete} style={styles.deleteBtn} hitSlop={6}>
            <Icon name="trash" size={17} color="#b3261e" />
            <Text style={styles.deleteText}>Delete account</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scanBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.accentTint },
  scanText: { fontFamily: uiFont(700), fontSize: 13, color: colors.accent },
  hero: { padding: 20 },
  heroHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  profitToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  profitToggleLabel: { fontFamily: uiFont(700), fontSize: 11.5, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.ink3 },
  profit: { fontFamily: numFont(700), fontSize: 12, marginTop: 2 },
  profitLine: { fontFamily: uiFont(600), fontSize: 13, marginTop: 12 },
  heroSign: { fontFamily: numFont(700), fontSize: 30, marginRight: 2 },
  sparkLabel: { fontFamily: uiFont(500), fontSize: 11, color: colors.ink3, marginTop: 4 },
  splitRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line2 },
  splitLabel: { fontFamily: uiFont(600), fontSize: 12, color: colors.ink3 },
  splitVal: { fontFamily: numFont(700), fontSize: 16, marginTop: 2 },
  emptyTitle: { fontFamily: uiFont(700), fontSize: 17, color: colors.ink, marginTop: 12 },
  emptySub: { fontFamily: uiFont(500), fontSize: 13.5, color: colors.ink2, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 10 },
  sectionTotal: { fontFamily: numFont(700), fontSize: 14, color: colors.ink2 },
  classHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, paddingTop: 13, paddingBottom: 4 },
  classIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  className: { flex: 1, fontFamily: uiFont(700), fontSize: 14.5, color: colors.ink },
  classTotal: { fontFamily: numFont(700), fontSize: 13.5, color: colors.ink2 },
  acctRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, paddingVertical: 12, marginTop: 2 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line2 },
  acctName: { fontFamily: uiFont(600), fontSize: 14, color: colors.ink },
  acctMeta: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink3, marginTop: 2 },
  acctVal: { fontFamily: numFont(600), fontSize: 13.5, color: colors.ink2 },
  asOf: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink3, textAlign: 'center', marginTop: 16 },
  subRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  subChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line2 },
  subChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  subChipText: { fontFamily: uiFont(700), fontSize: 13, color: colors.ink2 },
  subChipTextOn: { color: '#fff' },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 14 },
  pickerText: { flex: 1, fontFamily: uiFont(600), fontSize: 15, color: colors.ink },
  holdingSummary: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  holdingTicker: { fontFamily: uiFont(700), fontSize: 15, color: colors.accent, backgroundColor: colors.accentTint, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, overflow: 'hidden' },
  holdingPrice: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink3 },
  holdingValue: { fontFamily: numFont(700), fontSize: 18, color: colors.ink, marginTop: 2 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line2 },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,32,24,0.4)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: 18, paddingTop: 10, maxHeight: '88%' },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 999, backgroundColor: colors.line, marginBottom: 12 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sheetTitle: { flex: 1, fontFamily: uiFont(700), fontSize: 19, color: colors.ink, marginRight: 12 },
  toggle: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: 999, padding: 4, marginBottom: 18, borderWidth: 1, borderColor: colors.line2 },
  toggleBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 999 },
  toggleBtnOn: { backgroundColor: colors.surface, shadowColor: '#102018', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  toggleText: { fontFamily: uiFont(600), fontSize: 14, color: colors.ink3 },
  toggleTextOn: { color: colors.ink },
  fieldLabel: { fontFamily: uiFont(600), fontSize: 12.5, color: colors.ink2, marginBottom: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  classGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  classChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
  classChipOn: { borderColor: colors.accent, backgroundColor: colors.accentTint },
  classChipText: { fontFamily: uiFont(600), fontSize: 13, color: colors.ink2 },
  textInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 13, fontFamily: uiFont(600), fontSize: 16, color: colors.ink },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 14 },
  rm: { fontFamily: numFont(600), fontSize: 18, color: colors.ink3 },
  amountInput: { flex: 1, fontFamily: numFont(700), fontSize: 24, color: colors.ink, paddingVertical: 12 },
  hint: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink3, marginTop: 6 },
  histRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, paddingVertical: 11 },
  histDate: { fontFamily: uiFont(500), fontSize: 13, color: colors.ink2 },
  histVal: { fontFamily: numFont(600), fontSize: 13.5, color: colors.ink },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 16, marginTop: 4 },
  deleteText: { fontFamily: uiFont(700), fontSize: 14.5, color: '#b3261e' },
});
