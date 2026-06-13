// src/lib/ekyc.ts
// Pure Malaysian NRIC (MyKad) logic: validate structure, extract date-of-birth, gender,
// and state-of-birth, and mask for display. No UI/DB imports — unit-tested.
//
// NRIC format: YYMMDD-PB-###G (12 digits). YYMMDD = birth date; PB = birthplace/state code;
// ### = serial; G = final digit (odd = male, even = female). This is real, deterministic
// structure defined by JPN — the substantive core behind the (otherwise mock) eKYC flow.

export type Gender = 'M' | 'F';

export interface NricInfo {
  dob: string;          // ISO YYYY-MM-DD
  gender: Gender;
  stateOfBirth: string;
}

// Official birthplace (state) codes → name. Codes not present are unassigned/invalid.
const STATE_CODES: Record<string, string> = {
  '01': 'Johor', '21': 'Johor', '22': 'Johor', '23': 'Johor', '24': 'Johor',
  '02': 'Kedah', '25': 'Kedah', '26': 'Kedah', '27': 'Kedah',
  '03': 'Kelantan', '28': 'Kelantan', '29': 'Kelantan',
  '04': 'Melaka', '30': 'Melaka',
  '05': 'Negeri Sembilan', '31': 'Negeri Sembilan', '59': 'Negeri Sembilan',
  '06': 'Pahang', '32': 'Pahang', '33': 'Pahang',
  '07': 'Pulau Pinang', '34': 'Pulau Pinang', '35': 'Pulau Pinang',
  '08': 'Perak', '36': 'Perak', '37': 'Perak', '38': 'Perak', '39': 'Perak',
  '09': 'Perlis', '40': 'Perlis',
  '10': 'Selangor', '41': 'Selangor', '42': 'Selangor', '43': 'Selangor', '44': 'Selangor',
  '11': 'Terengganu', '45': 'Terengganu', '46': 'Terengganu',
  '12': 'Sabah', '47': 'Sabah', '48': 'Sabah', '49': 'Sabah',
  '13': 'Sarawak', '50': 'Sarawak', '51': 'Sarawak', '52': 'Sarawak', '53': 'Sarawak',
  '14': 'Wilayah Persekutuan Kuala Lumpur', '54': 'Wilayah Persekutuan Kuala Lumpur',
  '55': 'Wilayah Persekutuan Kuala Lumpur', '56': 'Wilayah Persekutuan Kuala Lumpur',
  '57': 'Wilayah Persekutuan Kuala Lumpur',
  '15': 'Wilayah Persekutuan Labuan', '58': 'Wilayah Persekutuan Labuan',
  '16': 'Wilayah Persekutuan Putrajaya',
};

/** Birthplace codes 60–85 indicate born outside Malaysia / foreign. */
function foreignState(code: string): boolean {
  const n = Number(code);
  return n >= 60 && n <= 85;
}

/** Strip dashes/spaces; return 12 digits or null. */
export function normalizeNric(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, '');
  return /^\d{12}$/.test(digits) ? digits : null;
}

/** Resolve a 2-digit year to a full year: <= current 2-digit year → 2000s, else 1900s. */
function resolveYear(yy: number, now: Date): number {
  const currentYY = now.getUTCFullYear() % 100;
  return yy <= currentYY ? 2000 + yy : 1900 + yy;
}

/** True if YYMMDD is a real calendar date (given the century resolution). */
function validBirthDate(digits: string, now: Date): { iso: string } | null {
  const yy = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const year = resolveYear(yy, now);
  const d = new Date(Date.UTC(year, mm - 1, dd));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return null;
  return { iso: `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}` };
}

export function validateNric(raw: string, now: Date = new Date()): { valid: boolean; reason?: string } {
  const digits = normalizeNric(raw);
  if (!digits) return { valid: false, reason: 'IC must be 12 digits.' };
  if (!validBirthDate(digits, now)) return { valid: false, reason: 'Birth date in the IC is not a real date.' };
  const code = digits.slice(6, 8);
  if (!STATE_CODES[code] && !foreignState(code)) return { valid: false, reason: 'Unrecognised birthplace code.' };
  return { valid: true };
}

export function parseNric(raw: string, now: Date = new Date()): NricInfo | null {
  const digits = normalizeNric(raw);
  if (!digits) return null;
  const date = validBirthDate(digits, now);
  if (!date) return null;
  const code = digits.slice(6, 8);
  const stateOfBirth = STATE_CODES[code] ?? (foreignState(code) ? 'Born outside Malaysia (foreign)' : null);
  if (!stateOfBirth) return null;
  const gender: Gender = Number(digits[11]) % 2 === 1 ? 'M' : 'F';
  return { dob: date.iso, gender, stateOfBirth };
}

/** Mask all but the last 4 digits, keeping the canonical dashed layout. */
export function maskNric(raw: string): string {
  const digits = normalizeNric(raw);
  if (!digits) return raw;
  return `••••••-••-${digits.slice(8)}`;
}
