import type { AccentTheme } from './accent';
import { DARK_COLORS } from '../theme';

export interface AccentPreset {
  id: string;
  name: string;
  theme: { light: AccentTheme; dark: AccentTheme };
  /** Accent-hued bg/surface/surface2 injected into DARK_COLORS when this preset is active.
   *  Each value is oklch(~5-14%, ~0.025, accent-hue) — very dark, very low chroma, hue-matched. */
  darkSurfaces: { bg: string; surface: string; surface2: string };
}

/**
 * Curated accent swatches for the Settings "Appearance" picker. Each `light` theme's four hex
 * values were generated via oklchToHex (same OKLCH math as catColorsForHue) at fixed L/C per
 * role, calibrated so `green` reproduces the app's original launch color and every other hue
 * reuses the same lightness/chroma so contrast holds regardless of hue (OKLCH's L is perceptually
 * uniform, unlike HSL). All four light-mode pairs (white-on-accentInk, accentInk-on-surface/
 * Soft/Tint) were verified >=4.5:1 WCAG AA before being baked in here — see
 * tools/contrastAudit/audit.js, which re-checks these on every run.
 *
 * `dark.accent`/`dark.accentInk` are deliberately IDENTICAL to the light values: both are used
 * almost exclusively as solid fills with white (`onAccent`) text/icons on top (buttons, badges,
 * checkmarks — 25+ call sites), which is self-contained and reads fine against either an app-wide
 * light or dark background, so there's no need for (and real risk in inventing) a second value —
 * accentInk's own luminance is too low to ever pass 4.5:1 as *text* against anything darker than
 * itself (verified: even against pure black it only reaches ~3.25:1), so a "brighter dark-mode
 * accentInk" would have broken every one of those 25+ fills instead of fixing anything.
 *
 * Only `dark.accentSoft`/`dark.accentTint` differ: in light mode these are pale near-white washes
 * (calibrated against a white surface); in dark mode they're dark, hue-tinted washes calibrated
 * against the dark surface instead (see src/theme.ts's DARK_COLORS), so a chip/badge background
 * still blends toward the surrounding dark surface instead of rendering as a jarring pale patch.
 * Call sites that draw text *on top of* accentSoft/accentTint (chips, badges, pills — not a fill)
 * must use `theme.onTint`, never `accentInk`: `onTint` equals `accentInk` in light mode (same
 * verified >=4.5:1 pairing) but becomes the structural near-white ink in dark mode, since
 * accentInk's low luminance can't clear 4.5:1 against a dark wash no matter how dark the wash
 * gets (verified: even against pure black it only reaches ~3.25:1).
 *
 * Amber and red hues are deliberately excluded: those already carry meaning elsewhere (amber =
 * refer/alert, red = decline/danger), so an accent preset in that range would make normal UI
 * read as a warning.
 */
export const ACCENT_PRESETS: AccentPreset[] = [
  {
    id: 'green',
    name: 'Green',
    theme: {
      light: { accent: '#1f8a5b', accentInk: '#1c6b48', accentSoft: '#dbece5', accentTint: '#eff7f4', onTint: '#1c6b48' },
      dark: { accent: '#1f8a5b', accentInk: '#1c6b48', accentSoft: '#19422c', accentTint: '#1a2f23', onTint: DARK_COLORS.ink },
    },
    darkSurfaces: { bg: '#0a1810', surface: '#192419', surface2: '#111c14' },
  },
  {
    id: 'teal',
    name: 'Teal',
    theme: {
      light: { accent: '#008a84', accentInk: '#006d68', accentSoft: '#daeceb', accentTint: '#eef7f6', onTint: '#006d68' },
      dark: { accent: '#008a84', accentInk: '#006d68', accentSoft: '#00423f', accentTint: '#122f2d', onTint: DARK_COLORS.ink },
    },
    darkSurfaces: { bg: '#081919', surface: '#152727', surface2: '#0f2020' },
  },
  {
    id: 'blue',
    name: 'Blue',
    theme: {
      light: { accent: '#197cb3', accentInk: '#1c628c', accentSoft: '#dceaf4', accentTint: '#eff6fb', onTint: '#1c628c' },
      dark: { accent: '#197cb3', accentInk: '#1c628c', accentSoft: '#173c54', accentTint: '#192c39', onTint: DARK_COLORS.ink },
    },
    darkSurfaces: { bg: '#0c1422', surface: '#192232', surface2: '#121b2a' },
  },
  {
    id: 'indigo',
    name: 'Indigo',
    theme: {
      light: { accent: '#5670bb', accentInk: '#455992', accentSoft: '#e2e8f6', accentTint: '#f2f5fc', onTint: '#455992' },
      dark: { accent: '#5670bb', accentInk: '#455992', accentSoft: '#2b3758', accentTint: '#22293b', onTint: DARK_COLORS.ink },
    },
    darkSurfaces: { bg: '#0e1022', surface: '#1c1e36', surface2: '#141629' },
  },
  {
    id: 'violet',
    name: 'Violet',
    theme: {
      light: { accent: '#7e63b1', accentInk: '#634f8a', accentSoft: '#e9e5f4', accentTint: '#f6f4fb', onTint: '#634f8a' },
      dark: { accent: '#7e63b1', accentInk: '#634f8a', accentSoft: '#3c3154', accentTint: '#2b2639', onTint: DARK_COLORS.ink },
    },
    darkSurfaces: { bg: '#120f22', surface: '#1f1c35', surface2: '#17142a' },
  },
  {
    id: 'rose',
    name: 'Rose',
    theme: {
      light: { accent: '#9f5790', accentInk: '#7c4671', accentSoft: '#f1e3ed', accentTint: '#faf3f8', onTint: '#7c4671' },
      dark: { accent: '#9f5790', accentInk: '#7c4671', accentSoft: '#4c2c45', accentTint: '#342330', onTint: DARK_COLORS.ink },
    },
    darkSurfaces: { bg: '#180e1b', surface: '#27182e', surface2: '#1e1224' },
  },
  {
    id: 'slate',
    name: 'Slate',
    theme: {
      light: { accent: '#4f6774', accentInk: '#374b55', accentSoft: '#dde6eb', accentTint: '#eff4f7', onTint: '#374b55' },
      dark: { accent: '#4f6774', accentInk: '#374b55', accentSoft: '#0e3e52', accentTint: '#162d37', onTint: DARK_COLORS.ink },
    },
    darkSurfaces: { bg: '#0c1520', surface: '#192232', surface2: '#121a28' },
  },
];

export const DEFAULT_ACCENT_PRESET_ID = 'green';
