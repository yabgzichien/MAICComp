import React, { createContext, useContext, useMemo, useState } from 'react';

export interface AccentTheme {
  accent: string;
  accentInk: string;
  accentSoft: string;
  accentTint: string;
}

/** Default green (matches theme.ts). */
export const GREEN_ACCENT: AccentTheme = {
  accent: '#1f8a5b',
  accentInk: '#1c6b48',
  accentSoft: '#dbece5',
  accentTint: '#eff7f4',
};

/** Alert amber/yellow  used while a duplicate warning is showing. */
export const ALERT_ACCENT: AccentTheme = {
  accent: '#d98a00',
  accentInk: '#8a5a00',
  accentSoft: '#f6e3bf',
  accentTint: '#fdf4e3',
};

interface AccentCtx {
  theme: AccentTheme;
  alert: boolean;
  setAlert: (on: boolean) => void;
}

const Ctx = createContext<AccentCtx>({ theme: GREEN_ACCENT, alert: false, setAlert: () => {} });

/**
 * Holds the app's active accent. When `alert` is on, the whole app's accent
 * flips to amber/yellow (buttons, chips, progress, Pip) to signal a warning.
 */
export function AccentProvider({ children }: { children: React.ReactNode }) {
  const [alert, setAlert] = useState(false);
  const value = useMemo<AccentCtx>(
    () => ({ theme: alert ? ALERT_ACCENT : GREEN_ACCENT, alert, setAlert }),
    [alert]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The current accent palette (green or alert-yellow). */
export function useAccent(): AccentTheme {
  return useContext(Ctx).theme;
}

/** Control the alert state (flip the accent). */
export function useAccentAlert(): { alert: boolean; setAlert: (on: boolean) => void } {
  const { alert, setAlert } = useContext(Ctx);
  return { alert, setAlert };
}
