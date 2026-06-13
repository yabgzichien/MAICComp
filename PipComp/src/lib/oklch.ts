/**
 * OKLCH -> sRGB hex conversion (Björn Ottosson's OKLab matrices).
 *
 * React Native's StyleSheet color parser does not understand `oklch(...)`,
 * but the approved design specifies category tints in OKLCH. We convert at
 * runtime to hex so the colors match the design exactly.
 */

function gammaEncode(x: number): number {
  // linear sRGB -> gamma-encoded sRGB
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function toHexByte(channel01: number): string {
  const v = Math.round(clamp01(channel01) * 255);
  return v.toString(16).padStart(2, '0');
}

/**
 * Convert an OKLCH color to an `#rrggbb` string.
 * @param L lightness 0..1
 * @param C chroma (~0..0.4)
 * @param H hue in degrees
 */
export function oklchToHex(L: number, C: number, H: number): string {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  // OKLab -> LMS (cube roots)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // LMS -> linear sRGB
  const rLin = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return (
    '#' +
    toHexByte(gammaEncode(rLin)) +
    toHexByte(gammaEncode(gLin)) +
    toHexByte(gammaEncode(bLin))
  );
}
