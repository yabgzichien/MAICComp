/**
 * Format a number as a 2-decimal amount with thousands separators,
 * e.g. 2000 -> "2,000.00". Implemented manually rather than via Intl to
 * avoid locale-data gaps in the Hermes engine.
 */
export function fmt(n: number): string {
  const value = Number.isFinite(n) ? n : 0;
  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (negative ? '-' : '') + grouped + '.' + decPart;
}
