import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme as useOSColorScheme } from 'react-native';
import { getMeta, setMeta } from '../db/metaRepo';
import { DARK_COLORS, LIGHT_COLORS, type StructuralColors } from '../theme';

export type ColorSchemeMode = 'light' | 'dark' | 'system';
export type ResolvedScheme = 'light' | 'dark';

const COLOR_SCHEME_MODE_KEY = 'color_scheme_mode';

type DarkSurfaces = { bg: string; surface: string; surface2: string };

interface ColorSchemeCtx {
  mode: ColorSchemeMode;
  setMode: (mode: ColorSchemeMode) => void;
  resolvedScheme: ResolvedScheme;
  colors: StructuralColors;
  /** Called by AccentProvider to inject accent-hued bg/surface/surface2 when dark mode is active. */
  setDarkSurfaces: (s: DarkSurfaces | null) => void;
}

const Ctx = createContext<ColorSchemeCtx>({
  mode: 'light',
  setMode: () => {},
  resolvedScheme: 'light',
  colors: LIGHT_COLORS,
  setDarkSurfaces: () => {},
});

/** Persisted light/dark/system preference, resolved against the OS scheme, exposing the
 *  matching structural palette. Mirrors src/state/accent.tsx's provider shape. Defaults to
 *  'light' (not 'system') until the user explicitly picks a mode in Settings, so a first
 *  launch on a dark-OS device doesn't surprise them with dark mode unasked. */
export function ColorSchemeProvider({ children }: { children: React.ReactNode }) {
  const osScheme = useOSColorScheme();
  const [mode, setModeState] = useState<ColorSchemeMode>('light');
  const [darkSurfaces, setDarkSurfaces] = useState<DarkSurfaces | null>(null);

  useEffect(() => {
    getMeta(COLOR_SCHEME_MODE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') setModeState(saved);
    });
  }, []);

  const setMode = (next: ColorSchemeMode) => {
    setModeState(next);
    void setMeta(COLOR_SCHEME_MODE_KEY, next);
  };

  const value = useMemo<ColorSchemeCtx>(() => {
    const resolvedScheme: ResolvedScheme = mode === 'system' ? (osScheme === 'dark' ? 'dark' : 'light') : mode;
    const baseDark = darkSurfaces ? { ...DARK_COLORS, ...darkSurfaces } : DARK_COLORS;
    return {
      mode,
      setMode,
      resolvedScheme,
      colors: resolvedScheme === 'dark' ? baseDark : LIGHT_COLORS,
      setDarkSurfaces,
    };
  }, [mode, osScheme, darkSurfaces]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The resolved structural palette (light or dark) for the current mode.
 *  In dark mode, bg/surface/surface2 are accent-hued (set by AccentProvider). */
export function useThemeColors(): StructuralColors {
  return useContext(Ctx).colors;
}

/** Just the resolved light/dark value, e.g. for StatusBar style or other non-color decisions. */
export function useResolvedScheme(): ResolvedScheme {
  return useContext(Ctx).resolvedScheme;
}

/** Read/set the user's mode preference (Settings screen). */
export function useColorSchemeMode(): { mode: ColorSchemeMode; setMode: (mode: ColorSchemeMode) => void; resolvedScheme: ResolvedScheme } {
  const { mode, setMode, resolvedScheme } = useContext(Ctx);
  return { mode, setMode, resolvedScheme };
}

/** Used by AccentProvider to inject accent-tinted dark surfaces into the structural palette. */
export function useSetDarkSurfaces(): (s: { bg: string; surface: string; surface2: string } | null) => void {
  return useContext(Ctx).setDarkSurfaces;
}
