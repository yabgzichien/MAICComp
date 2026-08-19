import React from 'react';
import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { computeCoverage } from '../lib/coverage';
import { computeStreak, compute7DayDots, type StreakInput } from '../lib/streak';
import type { Transaction } from '../lib/types';
import { listTransactions } from '../db/txnRepo';
import { StreakWidget } from './StreakWidget';

export { compute7DayDots };

export async function getStreakWidgetData(providedTxns?: Transaction[]) {
  let txns: Transaction[];
  if (providedTxns) {
    txns = providedTxns;
  } else {
    try {
      txns = await listTransactions();
    } catch {
      txns = [];
    }
  }

  const now = new Date();
  const streak = computeStreak(txns, now);
  const dots = compute7DayDots(txns, now);
  const coverage = computeCoverage(txns, now).daysCovered;

  return { streak, dots, coverage };
}

export async function syncStreakWidget(txns?: Transaction[]): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    const data = await getStreakWidgetData(txns);
    await requestWidgetUpdate({
      widgetName: 'StreakWidget',
      renderWidget: () => (
        <StreakWidget
          streak={data.streak}
          dots={data.dots}
          coverage={data.coverage}
        />
      ),
    });
  } catch {
    // Graceful fallback if widget is not placed, running in Expo Go, or native module is not ready
  }
}
