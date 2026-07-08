// Honest, traceable labels for the flagged-review demo (Brief A). No hardcoded
// version numbers, case ids, or timestamps: the case reference is derived
// deterministically from the loaded code, and the flag time is formatted at
// render from a real timestamp captured when the flag was raised.

/** Deterministic non-cryptographic hash → a stable short case reference for a
 *  loaded passport code/subject. Same input always yields the same id; no year. */
export function caseIdFor(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hex = (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return `FL-${hex.slice(0, 6)}`;
}

/** 24-hour clock label (HH:MM) from a real timestamp, formatted at render time. */
export function flagTimeLabel(at: Date): string {
  const hh = String(at.getHours()).padStart(2, '0');
  const mm = String(at.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
