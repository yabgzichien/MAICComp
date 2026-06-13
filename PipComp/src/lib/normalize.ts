/**
 * Normalize a merchant label into a stable lookup key for the learning store.
 *
 * This is the "case/space tolerant exact" match the user chose: lowercase,
 * drop anything after a `*` (card-network noise like "GRAB*RIDE 8F2K"),
 * collapse whitespace, and trim. Two labels that differ only in case or
 * spacing map to the same key; genuinely different merchants do not.
 *
 * Ported from the design's normMerchant (data.jsx) so behavior matches.
 */
export function merchantKey(raw: string): string {
  return String(raw)
    .toLowerCase()
    .replace(/\*.*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
