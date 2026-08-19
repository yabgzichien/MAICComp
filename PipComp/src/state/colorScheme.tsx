import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme as useOSColorScheme } from 'react-native';
import { getMeta, setMeta } from '../db/metaRepo';
import { DARK_COLORS, LIGHT_COLORS, type StructuralColors } from '../theme';

export type ColorSchemeMode = 'light' | 'dark' | 'system';
export type ResolvedScheme = 'light' | 'dark';

const COLOR_SCHEME_MODE_KEY = 'color_scheme_mode';

interface ColorSchemeCtx {
  mode: ColorSchemeMode;
  setMode: (mode: ColorSchemeMode) => void;
  resolvedScheme: ResolvedScheme;
  colors: StructuralColors;
}

const Ctx = createContext<ColorSchemeCtx>({
  mode: 'system',
  setMode: () => {},
  resolvedScheme: 'light',
  colors: LIGHT_COLORS,
});

/** Persisted light/dark/system preference, resolved against the OS scheme, exposing the
 *  matching structural palette. Mirrors src/state/accent.tsx's provider shape. */
export function ColorSchemeProvider({ children }: { children: React.ReactNode }) {
  const osScheme = useOSColorScheme();
  const [mode, setModeState] = useState<ColorSchemeMode>('system');

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
    return {
      mode,
      setMode,
      resolvedScheme,
      colors: resolvedScheme === 'dark' ? DARK_COLORS : LIGHT_COLORS,
    };
  }, [mode, osScheme]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The resolved structural palette (light or dark) for the current mode. */
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
