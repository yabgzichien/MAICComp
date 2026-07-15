import { Platform } from 'react-native';

/**
 * Design tokens for "Pip", ported from the approved design (styles.css :root).
 * `color-mix()` values were precomputed to static hex since RN can't evaluate them.
 */
export const colors = {
  bg: '#eef1ee',
  surface: '#ffffff',
  surface2: '#f6f8f6',
  ink: '#16201b',
  ink2: '#5d6b63',
  ink3: '#6a776f', // AA on white (4.69:1) — was #9aa7a0 (2.50:1, sub-AA)
  line: 'rgba(20,40,30,0.08)',
  line2: 'rgba(20,40,30,0.05)',

  accent: '#1f8a5b',
  accentInk: '#1c6b48', // color-mix(accent 70%, #14241c)
  accentSoft: '#dbece5', // color-mix(accent 16%, #fff)
  accentTint: '#eff7f4', // color-mix(accent 7%, #fff)
  onAccent: '#ffffff',

  // fake-screenshot header
  shotHead: '#11231a',
  shotInk: '#eaf3ee',

  // status / decision accents (from the redesign tokens)
  amber: '#9c6300', // AA on white (5.00:1) — was #d98a00 (2.77:1, sub-AA)
  red: '#c0392b',
  deltaUp: '#42e893', // "+8 pts" up-arrow green on dark surfaces
  passportDark: '#11231a',
} as const;

/**
 * Five score-band colors from the approved redesign  a warm→deep-green ramp.
 * Used by the credit gauge, the dashboard mini band-bar, and the lender band bar.
 */
export const bandColors = {
  Building: '#c0392b',
  Fair: '#d98a00',
  Good: '#3ab07a',
  Strong: '#1f8a5b',
  Excellent: '#145c3d',
} as const;

/** Ordered band list (low → high) for rendering the 5-segment band bar. */
export const BAND_ORDER = ['Building', 'Fair', 'Good', 'Strong', 'Excellent'] as const;

export const radius = {
  sm: 14,
  md: 22,
  lg: 28,
} as const;

/**
 * Font family names exported by @expo-google-fonts. Loaded in App via useFonts;
 * until loaded RN falls back to the system font, so these are safe to reference.
 */
export const fonts = {
  // UI  Hanken Grotesk
  regular: 'HankenGrotesk_400Regular',
  medium: 'HankenGrotesk_500Medium',
  semibold: 'HankenGrotesk_600SemiBold',
  bold: 'HankenGrotesk_700Bold',
  extrabold: 'HankenGrotesk_800ExtraBold',
  // Amounts / display  Space Grotesk (tabular figures)
  numMedium: 'SpaceGrotesk_500Medium',
  numSemibold: 'SpaceGrotesk_600SemiBold',
  numBold: 'SpaceGrotesk_700Bold',
} as const;

/** RN shadow approximations of --shadow-card / --shadow-pop. RN-web deprecates the
 *  shadow-prefixed/elevation style props in favor of the CSS `boxShadow` shorthand
 *  (console noise otherwise, UI/UX P3.19)  native keeps the real shadow/elevation
 *  props, since boxShadow isn't a thing there. */
export const shadowCard = Platform.select({
  web: { boxShadow: '0 8px 16px rgba(16,32,24,0.12)' },
  default: { shadowColor: '#102018', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
}) as { boxShadow?: string; shadowColor?: string; shadowOpacity?: number; shadowRadius?: number; shadowOffset?: { width: number; height: number }; elevation?: number };

export const shadowPop = Platform.select({
  web: { boxShadow: '0 16px 28px rgba(16,32,24,0.18)' },
  default: { shadowColor: '#102018', shadowOpacity: 0.18, shadowRadius: 28, shadowOffset: { width: 0, height: 16 }, elevation: 8 },
}) as { boxShadow?: string; shadowColor?: string; shadowOpacity?: number; shadowRadius?: number; shadowOffset?: { width: number; height: number }; elevation?: number };

type ShadowStyle = { boxShadow?: string; shadowColor?: string; shadowOpacity?: number; shadowRadius?: number; shadowOffset?: { width: number; height: number }; elevation?: number };

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** One-off colored/sized shadows (e.g. an accent-tinted glow), same web/native split as
 *  shadowCard/shadowPop above  keeps every shadow off the deprecated shadow-prefixed and
 *  elevation props on web (UI/UX P3.19) without hardcoding a boxShadow string at each call site. */
export function platformShadow(
  color: string,
  opacity: number,
  radius: number,
  offset: { width: number; height: number },
  elevation: number,
): ShadowStyle {
  return Platform.select({
    web: { boxShadow: `${offset.width}px ${offset.height}px ${radius}px ${hexToRgba(color, opacity)}` },
    default: { shadowColor: color, shadowOpacity: opacity, shadowRadius: radius, shadowOffset: offset, elevation },
  }) as ShadowStyle;
}

/** The repeated small "toggle button" shadow (7 call sites) that predates this helper. */
export const shadowToggle = platformShadow('#102018', 0.08, 6, { width: 0, height: 2 }, 2);

/** Map a desired numeric weight to the matching Space Grotesk family. */
export function numFont(weight: number): string {
  if (weight >= 700) return fonts.numBold;
  if (weight >= 600) return fonts.numSemibold;
  return fonts.numMedium;
}

/** Map a desired numeric weight to the matching Hanken Grotesk family. */
export function uiFont(weight: number): string {
  if (weight >= 800) return fonts.extrabold;
  if (weight >= 700) return fonts.bold;
  if (weight >= 600) return fonts.semibold;
  if (weight >= 500) return fonts.medium;
  return fonts.regular;
}

export const monoNumProps =
  Platform.OS === 'ios' ? { fontVariant: ['tabular-nums' as const] } : {};
