// src/state/alertHost.tsx
// Global host for the app's custom alert/confirm UI (replaces the bare OS dialog  window.alert
// /window.confirm on web, the native Alert.alert elsewhere  with one on-brand modal that looks
// the same on every platform). Mirrors GlossaryProvider's shape (a Context holding what's
// currently open + an AppAlertModal render component mounted once near the app root), but adds
// a module-level bridge on top: `notify`/`confirmAction` in lib/platformAlert.ts are plain
// functions called from event handlers all over the app (deletion confirmations, scan-permission
// notices, etc.), not React components, so they can't call a hook. The bridge lets them dispatch
// into whichever AlertHostProvider is currently mounted without every call site needing to
// thread a hook through.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type AlertRequest =
  | { kind: 'notify'; title: string; message?: string }
  | { kind: 'confirm'; title: string; message: string; confirmLabel: string; onConfirm: () => void | Promise<void> };

interface AlertHostCtx {
  request: AlertRequest | null;
  dismiss: () => void;
}

const Ctx = createContext<AlertHostCtx>({ request: null, dismiss: () => {} });

/** The currently-mounted host's setter, if any. Set on mount, cleared on unmount  a call to
 *  `dispatchAlert` before any host has mounted (shouldn't happen; the host is mounted at the
 *  app root) silently drops the alert rather than throwing. */
let bridgeShow: ((req: AlertRequest) => void) | null = null;

/** Show a request through whichever AlertHostProvider is currently mounted. Used by
 *  lib/platformAlert.ts's `notify`/`confirmAction`  never called directly by screens. */
export function dispatchAlert(req: AlertRequest): void {
  bridgeShow?.(req);
}

export function AlertHostProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<AlertRequest | null>(null);
  const dismiss = useCallback(() => setRequest(null), []);

  useEffect(() => {
    bridgeShow = setRequest;
    return () => {
      if (bridgeShow === setRequest) bridgeShow = null;
    };
  }, []);

  const value = useMemo<AlertHostCtx>(() => ({ request, dismiss }), [request, dismiss]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAlertHost(): AlertHostCtx {
  return useContext(Ctx);
}
