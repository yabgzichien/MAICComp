import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getMeta, setMeta } from '../db/metaRepo';
import { useColorSchemeMode, useSetDarkSurfaces } from './colorScheme';
import { ACCENT_PRESETS, DEFAULT_ACCENT_PRESET_ID, type AccentPreset } from './accentPresets';
import { DARK_COLORS } from '../theme';

export interface AccentTheme {
  accent: string;
  accentInk: string;
  accentSoft: string;
  accentTint: string;
  /** Text color for copy drawn ON TOP OF accentSoft/accentTint (chips, badges, pills) — NOT a
   *  fill. Equals accentInk in light mode (already verified >=4.5:1 there). In dark mode
   *  accentSoft/accentTint are themselves dark washes, so accentInk-as-text would be dark-on-dark
   *  (~2:1, fails WCAG AA); this is the structural near-white ink instead (~10-12:1). */
  onTint: string;
}

/** Default green, light mode (matches theme.ts). */
export const GREEN_ACCENT: AccentTheme = ACCENT_PRESETS.find((p) => p.id === DEFAULT_ACCENT_PRESET_ID)!.theme.light;

/** Alert amber/yellow  used while a duplicate warning is showing. `accent`/`accentInk` are the
 *  same fill in both schemes (self-contained, same reasoning as the accent presets); only the
 *  tint/soft washes differ for dark mode. */
const ALERT_ACCENT: { light: AccentTheme; dark: AccentTheme } = {
  light: { accent: '#d98a00', accentInk: '#8a5a00', accentSoft: '#f6e3bf', accentTint: '#fdf4e3', onTint: '#8a5a00' },
  dark: { accent: '#d98a00', accentInk: '#8a5a00', accentSoft: '#46360e', accentTint: '#312814', onTint: DARK_COLORS.ink },
};

const ACCENT_PRESET_KEY = 'accent_preset_id';

interface AccentCtx {
  theme: AccentTheme;
  alert: boolean;
  setAlert: (on: boolean) => void;
  presetId: string;
  setPresetId: (id: string) => void;
  presets: AccentPreset[];
}

const Ctx = createContext<AccentCtx>({
  theme: GREEN_ACCENT,
  alert: false,
  setAlert: () => {},
  presetId: DEFAULT_ACCENT_PRESET_ID,
  setPresetId: () => {},
  presets: ACCENT_PRESETS,
});

/**
 * Holds the app's active accent: the user's chosen preset (persisted in app_meta), resolved
 * against the current light/dark scheme, unless `alert` is on, in which case the whole app's
 * accent flips to amber/yellow (buttons, chips, progress, Pip) to signal a duplicate-transaction
 * warning  that override always wins.
 */
export function AccentProvider({ children }: { children: React.ReactNode }) {
  const { resolvedScheme } = useColorSchemeMode();
  const setDarkSurfaces = useSetDarkSurfaces();
  const [alert, setAlert] = useState(false);
  const [presetId, setPresetIdState] = useState(DEFAULT_ACCENT_PRESET_ID);

  useEffect(() => {
    getMeta(ACCENT_PRESET_KEY).then((saved) => {
      if (saved && ACCENT_PRESETS.some((p) => p.id === saved)) setPresetIdState(saved);
    });
  }, []);

  useEffect(() => {
    if (resolvedScheme !== 'dark') {
      setDarkSurfaces(null);
      return;
    }
    const preset = ACCENT_PRESETS.find((p) => p.id === presetId) ?? ACCENT_PRESETS[0];
    setDarkSurfaces(preset.darkSurfaces);
  }, [resolvedScheme, presetId, setDarkSurfaces]);

  const setPresetId = (id: string) => {
    setPresetIdState(id);
    void setMeta(ACCENT_PRESET_KEY, id);
  };

  const value = useMemo<AccentCtx>(() => {
    const preset = ACCENT_PRESETS.find((p) => p.id === presetId) ?? ACCENT_PRESETS[0];
    return {
      theme: alert ? ALERT_ACCENT[resolvedScheme] : preset.theme[resolvedScheme],
      alert,
      setAlert,
      presetId,
      setPresetId,
      presets: ACCENT_PRESETS,
    };
  }, [alert, presetId, resolvedScheme]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The current accent palette (chosen preset, or alert-yellow while a warning is showing). */
export function useAccent(): AccentTheme {
  return useContext(Ctx).theme;
}

/** Control the alert state (flip the accent). */
export function useAccentAlert(): { alert: boolean; setAlert: (on: boolean) => void } {
  const { alert, setAlert } = useContext(Ctx);
  return { alert, setAlert };
}

/** Read/set the user's chosen accent preset (Settings screen). */
export function useAccentPreset(): { presetId: string; setPresetId: (id: string) => void; presets: AccentPreset[] } {
  const { presetId, setPresetId, presets } = useContext(Ctx);
  return { presetId, setPresetId, presets };
}
