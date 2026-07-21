// src/state/useLenderSyncPoll.ts (approval-notify follow-up 2026-07-20; renamed + broadened
// from useApprovedOfferPoll.ts for the reset-sync follow-up, same day)
// Keeps this borrower in sync with every lender console it has a loan or application with,
// while a screen is open: adopts any newly-approved offer, and clears any loan a lender's
// console reset has orphaned.
//
// The original wiring polled ONLY on mount, which meant a console approval reached the
// borrower solely if they happened to navigate away and back afterwards. In the normal demo
// the borrower is already sitting on Home or My Financing waiting for the officer's decision,
// so nothing ever re-polled and the approval appeared never to arrive. This adds the two
// signals a mount effect can't give: a foreground/focus signal (the borrower switched back to
// the app or the browser tab) and a modest interval while the screen stays open.
//
// Mirrors the Lender Console's own poll-on-focus pattern for direct-apply submissions. Both
// underlying actions are idempotent (adopt dedupes against the DB and coalesces concurrent
// runs; reset-sync deleting an already-deleted row/account is a harmless no-op), so an extra
// tick is always harmless. Reset-sync runs first each tick: a lender reset older loans away
// before any newly-approved offer (against the now-clean console) gets adopted.

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAppData } from './store';

/** How often to re-check while the screen is open. Slow enough to be invisible on a phone
 *  battery, fast enough that an officer's approval or reset lands during a live demo. */
const POLL_INTERVAL_MS = 8_000;

/**
 * Poll both lender-facing sync actions for as long as the calling screen is mounted: once on
 * mount, again whenever the app returns to the foreground, and every `POLL_INTERVAL_MS` in
 * between. `currentScore` is read through a ref so a score change never restarts the timer.
 * Best-effort throughout — an unreachable console degrades silently.
 */
export function useLenderSyncPoll(currentScore: number): void {
  const { adoptApprovedOffers, syncLenderResets } = useAppData();
  const scoreRef = useRef(currentScore);
  scoreRef.current = currentScore;

  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (!alive) return;
      syncLenderResets()
        .catch(() => {})
        .finally(() => {
          if (alive) adoptApprovedOffers(scoreRef.current).catch(() => {});
        });
    };

    tick();
    const timer = setInterval(tick, POLL_INTERVAL_MS);
    // Foreground signal: 'active' on native, and react-native-web maps this onto the browser's
    // own visibilitychange, so returning to the tab re-checks immediately rather than waiting
    // out the interval.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') tick();
    });

    return () => {
      alive = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [adoptApprovedOffers, syncLenderResets]);
}
