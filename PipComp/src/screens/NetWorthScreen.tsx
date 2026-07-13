// src/screens/NetWorthScreen.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../components/Icon';
import { InstitutionBadge } from '../components/InstitutionBadge';
import { InstitutionField } from '../components/InstitutionField';
import { BalanceScanScreen } from './BalanceScanScreen';
import { ScanBalanceButton } from '../components/ScanBalanceButton';
import { TickerSearchModal } from '../components/TickerSearchModal';
import { BtnLabel, Card, Eyebrow, PrimaryButton, type ValueMode } from '../components/ui';
import { shortDate } from '../lib/dates';
import { fmt } from '../lib/format';
import { matchInstitution } from '../lib/institutions';
import { confirmAction } from '../lib/platformAlert';
import {
  CLASS_BY_ID,
  classesFor,
  groupByClass,
  netWorth,
  netWorthSeries,
  type ClassGroup,
} from '../lib/networth';
import { groupHoldings, holdingProfit, isHolding, subFromType, toQuantityUnitPrice, typeFromSub, type HoldingGroup, type TickerResult } from '../lib/prices';
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
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtPx = (n: number): string => (n >= 1000 ? fmt(n) : String(Math.round(n * 100) / 100));

/** Ticker badge style + label by holding sub-type (and Bursa vs US for stocks). */
function badgeFor(sub: string, symbol: string): { bg: string; clr: string; lbl: string } {
  if (sub === 'crypto') return { bg: '#f0f0ff', clr: '#4a4ad8', lbl: 'Crypto' };
  if (sub === 'commodity') return { bg: '#fdf6e8', clr: '#7a6200', lbl: 'Gold' };
  return symbol.endsWith('.KL') ? { bg: '#eff7f4', clr: '#1c6b48', lbl: 'BM' } : { bg: '#fff8ee', clr: '#b86a00', lbl: 'US' };
}

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
  const monthShorts = useMemo(() => lastMonths(6).map((k) => MONTHS_SHORT[parseInt(k.slice(5, 7), 10) - 1]), []);
  const delta = series.length >= 2 ? nw.net - series[series.length - 2] : null;
  const prevMonth = monthShorts[monthShorts.length - 2] ?? '';

  // Safe to branch here  all hooks above have run unconditionally.
  if (scanning) {
    return <BalanceScanScreen onClose={() => setScanning(false)} onOpenSettings={onOpenSettings} />;
  }

  return (
    <View style={styles.root}>
      {/* Nav */}
      <View style={[styles.nav, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={onBack} style={styles.navBtn} hitSlop={6}>
          <Icon name="chevronLeft" size={18} color={colors.ink2} />
        </Pressable>
        <Text style={styles.navTitle}>Net Worth</Text>
        <View style={styles.navBtn} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          hasHoldings ? <RefreshControl refreshing={refreshing} onRefresh={doRefresh} tintColor={colors.accent} /> : undefined
        }
      >
        <HeroCard nw={nw} series={series} months={monthShorts} delta={delta} prevMonth={prevMonth} mode={profitMode} setMode={setProfitMode} />
        <ScanRow onScan={() => setScanning(true)} onAdd={() => { setPresetCoin(null); setAdding(true); }} />

        {empty && (
          <Card style={{ padding: 22, alignItems: 'center', margin: 16 }}>
            <Icon name="scale" size={40} color={colors.accent} />
            <Text style={styles.emptyTitle}>Track what you own and owe</Text>
            <Text style={styles.emptySub}>Add cash, investments, and loans to see your net worth grow over time.</Text>
          </Card>
        )}

        {/* Assets */}
        {groups.assets.length > 0 && <GroupHeader label="Assets" total={nw.assets} color={colors.accent} />}
        {groups.assets.map((g) => (
          <AssetClassCard
            key={g.cls}
            g={g}
            accountValues={accountValues}
            prices={prices}
            pricesAsOf={pricesAsOf}
            profitMode={profitMode}
            refreshing={refreshing}
            onRefresh={doRefresh}
            onTapManual={setEditingId}
            onTapGroup={setGroupSymbol}
          />
        ))}

        {/* Liabilities */}
        {groups.liabilities.length > 0 && <GroupHeader label="Liabilities" total={nw.liabilities} color={colors.red} />}
        {groups.liabilities.length > 0 && (
          <View style={styles.classCard}>
            {flattenLiabs(groups.liabilities).map((row, i, arr) => (
              <LiabilityRowD
                key={row.account.id}
                name={row.account.name}
                cls={row.clsLabel}
                value={row.value}
                isLast={i === arr.length - 1}
                onPress={() => setEditingId(row.account.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>

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

// ── Gradient hero ───────────────────────────────────────────────────────────
function HeroCard({
  nw,
  series,
  months,
  delta,
  prevMonth,
  mode,
  setMode,
}: {
  nw: { net: number; assets: number; liabilities: number };
  series: number[];
  months: string[];
  delta: number | null;
  prevMonth: string;
  mode: ValueMode;
  setMode: (m: ValueMode) => void;
}) {
  const deltaUp = (delta ?? 0) >= 0;
  return (
    <View style={styles.hero}>
      {/* gradient fill */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="nwHero" x1="0" y1="0" x2="0.7" y2="1">
            <Stop offset="0" stopColor="#25845e" />
            <Stop offset="0.52" stopColor="#1b6b48" />
            <Stop offset="1" stopColor="#0e3d27" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#nwHero)" />
      </Svg>
      <View style={styles.heroCircle} pointerEvents="none" />

      <View style={styles.heroHead}>
        <Text style={styles.heroLabel}>Net Worth · 6-month</Text>
        <View style={styles.heroToggle}>
          {(['amount', 'percent'] as ValueMode[]).map((m) => {
            const on = mode === m;
            return (
              <Pressable key={m} onPress={() => setMode(m)} style={[styles.heroToggleBtn, on && styles.heroToggleBtnOn]}>
                <Text style={[styles.heroToggleText, on && styles.heroToggleTextOn]}>{m === 'amount' ? 'RM' : '%'}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 9 }}>
        <Text style={styles.heroSign}>{nw.net < 0 ? '−' : ''}</Text>
        <Text style={styles.heroNum}>RM {fmt(Math.abs(nw.net))}</Text>
      </View>

      {delta !== null && (
        <View style={styles.deltaChip}>
          <Svg width={10} height={10} viewBox="0 0 12 12" fill="none">
            <Path
              d={deltaUp ? 'M6 10V2M6 2L3 5M6 2L9 5' : 'M6 2v8M6 10L3 7M6 10L9 7'}
              stroke="#42e893"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
          <Text style={styles.deltaText}>
            {deltaUp ? '+' : '−'}RM {fmt(Math.abs(delta))} vs {prevMonth}
          </Text>
        </View>
      )}

      <View style={styles.heroTiles}>
        <View style={styles.heroTile}>
          <Text style={styles.heroTileLabel}>Total assets</Text>
          <Text style={[styles.heroTileVal, { color: '#42e893' }]}>RM {fmt(nw.assets)}</Text>
        </View>
        <View style={styles.heroTile}>
          <Text style={styles.heroTileLabel}>Total liabilities</Text>
          <Text style={[styles.heroTileVal, { color: '#ff8a80' }]}>RM {fmt(nw.liabilities)}</Text>
        </View>
      </View>

      {series.length >= 2 && (
        <>
          <HeroSparkline values={series} />
          <View style={{ flexDirection: 'row', marginTop: 5 }}>
            {months.map((m, i) => (
              <Text key={i} style={styles.heroMonth}>{m}</Text>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

function HeroSparkline({ values }: { values: number[] }) {
  const W = 320;
  const H = 50;
  const pd = 6;
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const rng = mx - mn || 1;
  const pts = values.map((v, i) => [pd + (i / (values.length - 1)) * (W - pd * 2), pd + (1 - (v - mn) / rng) * (H - pd * 2)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const area = `${line} L ${last[0].toFixed(1)} ${H} L ${pts[0][0].toFixed(1)} ${H} Z`;
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="nwSpk" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="rgba(255,255,255,0.30)" />
          <Stop offset="1" stopColor="rgba(255,255,255,0)" />
        </LinearGradient>
      </Defs>
      <Path d={area} fill="url(#nwSpk)" />
      <Path d={line} fill="none" stroke="rgba(255,255,255,0.82)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={last[0]} cy={last[1]} r={4} fill="white" />
    </Svg>
  );
}

// ── Scan / add row ──────────────────────────────────────────────────────────
function ScanRow({ onScan, onAdd }: { onScan: () => void; onAdd: () => void }) {
  return (
    <View style={styles.scanRow}>
      <Pressable onPress={onScan} style={styles.scanBanner}>
        <View style={styles.scanIcon}>
          <Icon name="scan" size={16} color="#fff" />
        </View>
        <View>
          <Text style={styles.scanTitle}>Scan Balance</Text>
          <Text style={styles.scanSub}>AI reads your bank screenshot</Text>
        </View>
      </Pressable>
      <Pressable onPress={onAdd} style={styles.addBtn}>
        <Icon name="plus" size={18} color={colors.accent} stroke={2.4} />
      </Pressable>
    </View>
  );
}

// ── Group / class labels ────────────────────────────────────────────────────
function GroupHeader({ label, total, color }: { label: string; total: number; color: string }) {
  return (
    <View style={styles.groupHead}>
      <Text style={styles.groupLabel}>{label}</Text>
      <Text style={[styles.groupTotal, { color }]}>RM {fmt(total)}</Text>
    </View>
  );
}

function ClassChip({ label, sub }: { label: string; sub: string }) {
  return (
    <View style={styles.classChipRow}>
      <Text style={styles.classChipLabel}>{label}</Text>
      <Text style={styles.classChipSub}>{sub}</Text>
    </View>
  );
}

function PriceStamp({ asOf, refreshing, onRefresh }: { asOf: string | null; refreshing: boolean; onRefresh: () => void }) {
  return (
    <View style={styles.priceStamp}>
      <View style={styles.liveDot} />
      <Text style={styles.priceStampText}>Prices as of {timeOf(asOf) || ''} today</Text>
      <Pressable onPress={onRefresh} style={styles.refreshBtn} hitSlop={6}>
        {refreshing ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <Text style={styles.refreshText}>↻ Refresh</Text>
        )}
      </Pressable>
    </View>
  );
}

// ── Asset class card (cash / investments / etc.) ────────────────────────────
function AssetClassCard({
  g,
  accountValues,
  prices,
  pricesAsOf,
  profitMode,
  refreshing,
  onRefresh,
  onTapManual,
  onTapGroup,
}: {
  g: ClassGroup;
  accountValues: Record<string, number>;
  prices: Record<string, PriceQuote>;
  pricesAsOf: string | null;
  profitMode: ValueMode;
  refreshing: boolean;
  onRefresh: () => void;
  onTapManual: (id: string) => void;
  onTapGroup: (symbol: string) => void;
}) {
  const holdings = g.accounts.filter((x) => isHolding(x.account)).map((x) => x.account);
  const manual = g.accounts.filter((x) => !isHolding(x.account));
  const hGroups = groupHoldings(holdings, accountValues);
  const hasH = hGroups.length > 0;
  const icon = (CLASS_BY_ID[g.cls]?.icon ?? 'wallet') as IconName;
  return (
    <>
      <ClassChip label={hasH ? `${g.label} · Live prices` : g.label} sub={`RM ${fmt(g.total)}`} />
      <View style={styles.classCard}>
        {hasH && <PriceStamp asOf={pricesAsOf} refreshing={refreshing} onRefresh={onRefresh} />}
        {hGroups.map((grp, i) => {
          const profit = grp.cost != null && grp.cost > 0 ? holdingProfit(grp.value, grp.cost) : null;
          const isLast = i === hGroups.length - 1 && manual.length === 0;
          return (
            <HoldingRowD key={grp.symbol} grp={grp} price={prices[grp.symbol]} profit={profit} profitMode={profitMode} isLast={isLast} onPress={() => onTapGroup(grp.symbol)} />
          );
        })}
        {manual.map(({ account, value }, i) => (
          <ManualRowD key={account.id} icon={icon} name={account.name} sub={g.label} value={value} isLast={i === manual.length - 1} onPress={() => onTapManual(account.id)} />
        ))}
      </View>
    </>
  );
}

function ManualRowD({ icon, name, sub, value, isLast, onPress }: { icon: IconName; name: string; sub: string; value: number; isLast: boolean; onPress: () => void }) {
  const inst = matchInstitution(name);
  return (
    <Pressable onPress={onPress} style={[styles.row, !isLast && styles.rowDivider]}>
      {inst ? (
        <InstitutionBadge inst={inst} size={36} />
      ) : (
        <View style={styles.rowTile}>
          <Icon name={icon} size={16} color={colors.accent} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text>
      </View>
      <Text style={styles.rowVal}>RM {fmt(value)}</Text>
    </Pressable>
  );
}

function HoldingRowD({
  grp,
  price,
  profit,
  profitMode,
  isLast,
  onPress,
}: {
  grp: HoldingGroup;
  price?: PriceQuote;
  profit: { profit: number; pct: number | null } | null;
  profitMode: ValueMode;
  isLast: boolean;
  onPress: () => void;
}) {
  const badge = badgeFor(grp.sub, grp.symbol);
  const unitPx = price ? toQuantityUnitPrice(grp.symbol, price.priceMYR) : null;
  const ch = price?.change24 ?? null;
  const chUp = (ch ?? 0) >= 0;
  const up = (profit?.profit ?? 0) >= 0;
  const tick = grp.sub === 'commodity' ? (grp.symbol.startsWith('SI') ? 'XAG' : 'XAU') : grp.ticker;
  return (
    <Pressable onPress={onPress} style={[styles.row, !isLast && styles.rowDivider]}>
      <View style={[styles.badge, { backgroundColor: badge.bg }]}>
        <Text style={[styles.badgeTick, { color: badge.clr }]} numberOfLines={1}>{tick}</Text>
        <Text style={[styles.badgeLbl, { color: badge.clr }]}>{badge.lbl}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowName} numberOfLines={1}>{grp.name}</Text>
        <View style={styles.holdMetaRow}>
          <Text style={styles.holdMeta} numberOfLines={1}>
            {grp.quantity} {unitPx != null ? `× RM ${fmtPx(unitPx)}` : grp.ticker}
          </Text>
          {ch != null && (
            <Text style={[styles.chChip, { color: chUp ? '#1a9962' : colors.red, backgroundColor: chUp ? colors.accentTint : '#fff0ef' }]}>
              {chUp ? '+' : ''}{ch.toFixed(2)}%
            </Text>
          )}
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.rowVal}>RM {fmt(grp.value)}</Text>
        {profit && (
          <Text style={[styles.rowProfit, { color: up ? colors.accent : colors.red }]}>
            {up ? '+' : '−'}
            {profitMode === 'percent' && profit.pct != null ? `${Math.abs(profit.pct).toFixed(1)}%` : `RM ${fmt(Math.abs(profit.profit))}`}
          </Text>
        )}
      </View>
      <Icon name="chevronRight" size={15} color={colors.ink3} />
    </Pressable>
  );
}

function LiabilityRowD({ name, cls, value, isLast, onPress }: { name: string; cls: string; value: number; isLast: boolean; onPress: () => void }) {
  const inst = matchInstitution(name);
  return (
    <Pressable onPress={onPress} style={[styles.row, !isLast && styles.rowDivider]}>
      {inst ? (
        <InstitutionBadge inst={inst} size={36} />
      ) : (
        <View style={[styles.rowTile, { backgroundColor: '#fff0ef' }]}>
          <Icon name="scale" size={16} color={colors.red} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.liabNameRow}>
          <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
          <Text style={styles.liabChip}>{cls}</Text>
        </View>
      </View>
      <Text style={[styles.rowVal, { color: colors.red }]}>-RM {fmt(value)}</Text>
    </Pressable>
  );
}

/** Flatten liability class groups into rows tagged with their class label. */
function flattenLiabs(groups: ClassGroup[]): { account: Account; value: number; clsLabel: string }[] {
  const out: { account: Account; value: number; clsLabel: string }[] = [];
  for (const g of groups) for (const { account, value } of g.accounts) out.push({ account, value, clsLabel: g.label });
  return out;
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
              <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Account</Text>
              <InstitutionField
                value={name}
                onChangeText={setName}
                placeholder={kind === 'asset' ? 'e.g. TnG eWallet, Maybank FD' : 'e.g. Car Loan'}
                onPick={() => { if (kind === 'asset') setCls('cash'); }}
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
    confirmAction('Delete account?', `Remove “${account.name}” and its history? This can’t be undone.`, 'Delete', async () => {
      await deleteAccount(account.id);
      onClose();
    });
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

              <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Account</Text>
              <InstitutionField
                value={name}
                onChangeText={setName}
                onPick={() => { if (account.kind === 'asset') setCls('cash'); }}
              />

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
  profit: { fontFamily: numFont(700), fontSize: 12, marginTop: 2 },
  profitLine: { fontFamily: uiFont(600), fontSize: 13, marginTop: 12 },

  /* nav */
  nav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 10 },
  navBtn: { width: 36, height: 36, borderRadius: 999, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...{ shadowColor: '#102018', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 3 } },
  navTitle: { flex: 1, textAlign: 'center', fontFamily: uiFont(700), fontSize: 16, color: colors.ink },

  /* hero */
  hero: { margin: 16, marginTop: 0, borderRadius: 26, padding: 20, overflow: 'hidden', backgroundColor: '#1b6b48', position: 'relative' },
  heroCircle: { position: 'absolute', top: -48, right: -48, width: 160, height: 160, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.05)' },
  heroHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  heroLabel: { fontFamily: uiFont(600), fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.52)' },
  heroToggle: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 20, padding: 2, gap: 2 },
  heroToggleBtn: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: 16 },
  heroToggleBtnOn: { backgroundColor: '#fff' },
  heroToggleText: { fontFamily: uiFont(700), fontSize: 11, color: 'rgba(255,255,255,0.6)' },
  heroToggleTextOn: { color: colors.accentInk },
  heroSign: { fontFamily: numFont(700), fontSize: 34, color: '#fff', marginRight: 2 },
  heroNum: { fontFamily: numFont(700), fontSize: 46, color: '#fff' },
  deltaChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 15 },
  deltaText: { fontFamily: numFont(700), fontSize: 11.5, color: '#42e893' },
  heroTiles: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  heroTile: { flex: 1, backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 13, paddingHorizontal: 12, paddingVertical: 9 },
  heroTileLabel: { fontFamily: uiFont(500), fontSize: 9.5, color: 'rgba(255,255,255,0.45)', marginBottom: 3 },
  heroTileVal: { fontFamily: numFont(700), fontSize: 16 },
  heroMonth: { flex: 1, textAlign: 'center', fontFamily: uiFont(500), fontSize: 9, color: 'rgba(255,255,255,0.3)' },

  /* scan row */
  scanRow: { flexDirection: 'row', gap: 9, marginHorizontal: 16, marginBottom: 4 },
  scanBanner: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.accent, borderRadius: 16, padding: 10, paddingRight: 14, shadowColor: colors.accent, shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  scanIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  scanTitle: { fontFamily: uiFont(700), fontSize: 13, color: '#fff' },
  scanSub: { fontFamily: uiFont(500), fontSize: 10, color: 'rgba(255,255,255,0.68)', marginTop: 1 },
  addBtn: { width: 50, height: 50, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },

  /* group + class labels */
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  groupLabel: { fontFamily: uiFont(700), fontSize: 12, color: colors.ink2, letterSpacing: 0.4 },
  groupTotal: { fontFamily: numFont(700), fontSize: 13 },
  classChipRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  classChipLabel: { fontFamily: uiFont(700), fontSize: 9.5, color: colors.ink3, letterSpacing: 1, textTransform: 'uppercase' },
  classChipSub: { fontFamily: numFont(600), fontSize: 11, color: colors.ink3 },
  classCard: { backgroundColor: colors.surface, borderRadius: 18, marginHorizontal: 16, marginTop: 4, overflow: 'hidden', shadowColor: '#102018', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 3 },

  /* price stamp */
  priceStamp: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.surface2 },
  liveDot: { width: 7, height: 7, borderRadius: 999, backgroundColor: '#42e893' },
  priceStampText: { flex: 1, fontFamily: uiFont(500), fontSize: 10, color: colors.ink3 },
  refreshBtn: { backgroundColor: colors.accentTint, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3, minWidth: 64, alignItems: 'center' },
  refreshText: { fontFamily: uiFont(700), fontSize: 10, color: colors.accent },

  /* rows */
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 18, paddingVertical: 11 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowTile: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  rowName: { fontFamily: uiFont(600), fontSize: 13, color: colors.ink },
  rowSub: { fontFamily: uiFont(500), fontSize: 10.5, color: colors.ink3, marginTop: 1 },
  rowVal: { fontFamily: numFont(700), fontSize: 14, color: colors.ink },
  rowProfit: { fontFamily: numFont(700), fontSize: 11.5, marginTop: 1 },
  badge: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  badgeTick: { fontFamily: numFont(700), fontSize: 11, lineHeight: 13 },
  badgeLbl: { fontFamily: uiFont(500), fontSize: 8, opacity: 0.75, lineHeight: 9 },
  holdMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  holdMeta: { fontFamily: numFont(500), fontSize: 10, color: colors.ink3, flexShrink: 1 },
  chChip: { fontFamily: numFont(700), fontSize: 10, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  liabNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liabChip: { fontFamily: uiFont(600), fontSize: 9.5, color: colors.red, backgroundColor: '#fff0ef', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
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
