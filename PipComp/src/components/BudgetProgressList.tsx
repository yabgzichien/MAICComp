import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { categoryStatus } from '../lib/budget';
import { fmt } from '../lib/format';
import type { Category } from '../lib/types';
import { colors, uiFont } from '../theme';
import { Card, CatBadge } from './ui';
import { Icon } from './Icon';

const fallback: Category = { id: 'other', label: 'Other', icon: 'dots', hue: 220, kind: 'expense', isDefault: true };
export const STATUS_COLOR = { ok: '#1f8a5b', warn: '#d98a00', over: '#c5402f' } as const;

/**
 * The per-category budget-progress card: one row per budgeted category (spent /
 * allocated, a status-colored bar, remaining/over), plus an "Unbudgeted" row for
 * spending in categories with no allocation. Shared by the Budget screen and the
 * dashboard's "This month" section.
 */
export function BudgetProgressList({
  allocations,
  spentByCat,
  catById,
}: {
  allocations: Record<string, number>;
  spentByCat: Record<string, number>;
  catById: Record<string, Category>;
}) {
  const budgetedIds = useMemo(() => Object.keys(allocations), [allocations]);
  const unbudgetedSpent = useMemo(
    () => Object.entries(spentByCat).filter(([id]) => !budgetedIds.includes(id)).reduce((s, [, v]) => s + v, 0),
    [spentByCat, budgetedIds]
  );

  return (
    <Card style={{ overflow: 'hidden' }}>
      {budgetedIds.map((id, i) => {
        const cat = catById[id] ?? fallback;
        const alloc = allocations[id];
        const spent = spentByCat[id] ?? 0;
        const st = categoryStatus(spent, alloc);
        const remaining = alloc - spent;
        return (
          <View key={id} style={[styles.catRow, i > 0 && styles.divider]}>
            <CatBadge category={cat} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.rowBetween}>
                <Text style={styles.catLabel} numberOfLines={1}>{cat.label}</Text>
                <Text style={styles.catNums}>RM {fmt(spent)} / {fmt(alloc)}</Text>
              </View>
              <View style={styles.barTrack}>
                <View style={{ width: `${Math.min(100, alloc > 0 ? (spent / alloc) * 100 : 100)}%`, height: '100%', borderRadius: 999, backgroundColor: STATUS_COLOR[st] }} />
              </View>
              <Text style={[styles.remaining, { color: remaining < 0 ? STATUS_COLOR.over : colors.ink3 }]}>
                {remaining < 0 ? `RM ${fmt(-remaining)} over` : `RM ${fmt(remaining)} left`}
              </Text>
            </View>
          </View>
        );
      })}
      {unbudgetedSpent > 0 && (
        <View style={[styles.catRow, budgetedIds.length > 0 && styles.divider]}>
          <View style={styles.unbudgetedIcon}><Icon name="dots" size={18} color={colors.ink3} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.catLabel}>Unbudgeted</Text>
            <Text style={styles.remaining}>RM {fmt(unbudgetedSpent)} spent outside your budget</Text>
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line2 },
  catLabel: { fontFamily: uiFont(600), fontSize: 14.5, color: colors.ink, flex: 1 },
  catNums: { fontFamily: uiFont(600), fontSize: 12.5, color: colors.ink2 },
  barTrack: { height: 6, borderRadius: 999, backgroundColor: colors.line, overflow: 'hidden', marginTop: 7 },
  remaining: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink2, marginTop: 4 },
  unbudgetedIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
});
