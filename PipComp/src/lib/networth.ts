// src/lib/networth.ts
// Pure, deterministic balance-sheet logic. No UI/DB imports  unit-tested.
import type { Account, AccountKind, BalanceEntry, TxnType } from './types';

export interface ClassMeta {
  id: string;
  label: string;
  kind: AccountKind;
  icon: string; // IconName
}

/** The fixed asset/liability classes, in display order. */
export const ACCOUNT_CLASSES: ClassMeta[] = [
  { id: 'cash', label: 'Cash', kind: 'asset', icon: 'wallet' },
  { id: 'investments', label: 'Investments', kind: 'asset', icon: 'trending' },
  { id: 'mortgage', label: 'Mortgage', kind: 'liability', icon: 'home' },
  { id: 'personal', label: 'Personal Loan', kind: 'liability', icon: 'wallet' },
  { id: 'credit_card', label: 'Credit Card', kind: 'liability', icon: 'receipt' },
  { id: 'pay_later', label: 'Pay Later', kind: 'liability', icon: 'clock' },
  { id: 'car', label: 'Car Loan', kind: 'liability', icon: 'car' },
];

export const CLASS_BY_ID: Record<string, ClassMeta> = Object.fromEntries(
  ACCOUNT_CLASSES.map((c) => [c.id, c])
);

export function classesFor(kind: AccountKind): ClassMeta[] {
  return ACCOUNT_CLASSES.filter((c) => c.kind === kind);
}

/** Order entries oldest→newest by asOf date, tie-broken by createdAt. */
function chronological(entries: BalanceEntry[]): BalanceEntry[] {
  return [...entries].sort((a, b) =>
    a.asOf < b.asOf ? -1 : a.asOf > b.asOf ? 1 : a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
  );
}

/** The most recent reading's value (0 if none). */
export function currentValue(entries: BalanceEntry[]): number {
  if (entries.length === 0) return 0;
  const sorted = chronological(entries);
  return sorted[sorted.length - 1].value;
}

/** The value as of a date: the latest reading on or before it (0 if none yet). */
export function accountValueAsOf(entries: BalanceEntry[], date: string): number {
  const eligible = chronological(entries.filter((e) => e.asOf <= date));
  return eligible.length ? eligible[eligible.length - 1].value : 0;
}

export interface NetWorth {
  assets: number;
  liabilities: number;
  net: number;
}

/** Total assets, total liabilities, and net (assets − liabilities). Skips archived. */
export function netWorth(accounts: Account[], valueById: Record<string, number>): NetWorth {
  let assets = 0;
  let liabilities = 0;
  for (const a of accounts) {
    if (a.archived) continue;
    const v = valueById[a.id] ?? 0;
    if (a.kind === 'asset') assets += v;
    else liabilities += v;
  }
  return { assets, liabilities, net: assets - liabilities };
}

export interface ClassGroup {
  cls: string;
  label: string;
  kind: AccountKind;
  total: number;
  accounts: { account: Account; value: number }[];
}

/** Group active accounts by class (in ACCOUNT_CLASSES order), split into assets and liabilities. */
export function groupByClass(
  accounts: Account[],
  valueById: Record<string, number>
): { assets: ClassGroup[]; liabilities: ClassGroup[] } {
  const groups = new Map<string, ClassGroup>();
  for (const a of accounts) {
    if (a.archived) continue;
    let g = groups.get(a.cls);
    if (!g) {
      const meta = CLASS_BY_ID[a.cls];
      g = { cls: a.cls, label: meta?.label ?? a.cls, kind: a.kind, total: 0, accounts: [] };
      groups.set(a.cls, g);
    }
    const value = valueById[a.id] ?? 0;
    g.total += value;
    g.accounts.push({ account: a, value });
  }
  const ordered = ACCOUNT_CLASSES.map((c) => groups.get(c.id)).filter((g): g is ClassGroup => !!g);
  // Sort accounts within each class by current value, high → low.
  for (const g of ordered) g.accounts.sort((a, b) => b.value - a.value);
  return {
    assets: ordered.filter((g) => g.kind === 'asset'),
    liabilities: ordered.filter((g) => g.kind === 'liability'),
  };
}

export interface NetWorthPoint extends NetWorth {
  monthKey: string;
}

/** Month-end net worth for each 'YYYY-MM' key (latest reading on or before month end). */
export function netWorthSeries(accounts: Account[], entries: BalanceEntry[], monthKeys: string[]): NetWorthPoint[] {
  const byAccount: Record<string, BalanceEntry[]> = {};
  for (const e of entries) (byAccount[e.accountId] ??= []).push(e);
  return monthKeys.map((mk) => {
    const upper = `${mk}-31`; // string upper bound for the month (safe for YYYY-MM-DD compare)
    const valueById: Record<string, number> = {};
    for (const a of accounts) valueById[a.id] = accountValueAsOf(byAccount[a.id] ?? [], upper);
    return { monthKey: mk, ...netWorth(accounts, valueById) };
  });
}

export type LinkEffect = 'add' | 'subtract';

/** Smart default for how a linked transaction moves an account's balance. */
export function defaultLinkEffect(kind: AccountKind, txnType: TxnType): LinkEffect {
  if (kind === 'liability') return txnType === 'expense' ? 'subtract' : 'add';
  return txnType === 'income' ? 'add' : 'subtract';
}

/** Apply a link to a current balance, rounded to cents. */
export function applyEffect(current: number, amount: number, effect: LinkEffect): number {
  const v = effect === 'add' ? current + amount : current - amount;
  return Math.round(v * 100) / 100;
}
