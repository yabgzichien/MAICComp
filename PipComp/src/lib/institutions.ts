// src/lib/institutions.ts
// Pure, deterministic lookup of Malaysian banks/e-wallets, used to recognize the
// institution in a scanned screenshot and to render a brand-toned badge for it.
// No UI/DB imports — unit-tested.
import { isHolding } from './prices';
import type { Account } from './types';

export type InstitutionKind = 'bank' | 'ewallet';

export interface Institution {
  id: string;
  name: string;
  aliases: string[];
  kind: InstitutionKind;
  monogram: string;
  color: string;
}

export const INSTITUTIONS: Institution[] = [
  // ── Traditional + Islamic banks ──────────────────────────────────────────
  { id: 'maybank', name: 'Maybank', aliases: ['MBB', 'Malayan Banking'], kind: 'bank', monogram: 'MBB', color: '#FFC726' },
  { id: 'cimb', name: 'CIMB Bank', aliases: ['CIMB'], kind: 'bank', monogram: 'CIMB', color: '#7A1E1E' },
  { id: 'public_bank', name: 'Public Bank', aliases: ['PBB', 'PBE'], kind: 'bank', monogram: 'PBB', color: '#C8102E' },
  { id: 'rhb', name: 'RHB Bank', aliases: ['RHB'], kind: 'bank', monogram: 'RHB', color: '#003DA5' },
  { id: 'hong_leong', name: 'Hong Leong Bank', aliases: ['HLB'], kind: 'bank', monogram: 'HLB', color: '#006341' },
  { id: 'ambank', name: 'AmBank', aliases: ['AMMB'], kind: 'bank', monogram: 'AmB', color: '#D71921' },
  { id: 'bank_islam', name: 'Bank Islam', aliases: ['BIMB'], kind: 'bank', monogram: 'BI', color: '#00592C' },
  { id: 'bank_rakyat', name: 'Bank Rakyat', aliases: ['Bank Kerjasama Rakyat'], kind: 'bank', monogram: 'BR', color: '#ED1C24' },
  { id: 'bsn', name: 'Bank Simpanan Nasional', aliases: ['BSN'], kind: 'bank', monogram: 'BSN', color: '#004B87' },
  { id: 'affin', name: 'Affin Bank', aliases: ['Affin'], kind: 'bank', monogram: 'AFB', color: '#F7941D' },
  { id: 'alliance', name: 'Alliance Bank', aliases: ['Alliance'], kind: 'bank', monogram: 'ALB', color: '#0072BC' },
  { id: 'mbsb', name: 'MBSB Bank', aliases: ['MBSB'], kind: 'bank', monogram: 'MBSB', color: '#6E2B62' },
  { id: 'agrobank', name: 'Agrobank', aliases: ['BPA'], kind: 'bank', monogram: 'AGB', color: '#4CAF50' },
  { id: 'bank_muamalat', name: 'Bank Muamalat', aliases: ['Muamalat'], kind: 'bank', monogram: 'BM', color: '#00457C' },

  // ── Foreign banks (Malaysia operations) ──────────────────────────────────
  { id: 'hsbc', name: 'HSBC Bank Malaysia', aliases: ['HSBC'], kind: 'bank', monogram: 'HSBC', color: '#DB0011' },
  { id: 'standard_chartered', name: 'Standard Chartered', aliases: ['SCB', 'StanChart'], kind: 'bank', monogram: 'SC', color: '#0473EA' },
  { id: 'uob', name: 'UOB Malaysia', aliases: ['UOB', 'United Overseas Bank'], kind: 'bank', monogram: 'UOB', color: '#003478' },
  { id: 'ocbc', name: 'OCBC Bank Malaysia', aliases: ['OCBC'], kind: 'bank', monogram: 'OCBC', color: '#E2231A' },
  { id: 'citibank', name: 'Citibank Malaysia', aliases: ['Citi'], kind: 'bank', monogram: 'Citi', color: '#003D79' },
  { id: 'al_rajhi', name: 'Al Rajhi Bank', aliases: ['Al Rajhi'], kind: 'bank', monogram: 'ARB', color: '#00633A' },
  { id: 'kfh', name: 'Kuwait Finance House', aliases: ['KFH'], kind: 'bank', monogram: 'KFH', color: '#6B1F2A' },
  { id: 'bank_of_china', name: 'Bank of China Malaysia', aliases: ['BOC'], kind: 'bank', monogram: 'BOC', color: '#C7000B' },
  { id: 'icbc', name: 'ICBC Malaysia', aliases: ['ICBC'], kind: 'bank', monogram: 'ICBC', color: '#A6111B' },
  { id: 'ccb', name: 'China Construction Bank Malaysia', aliases: ['CCB'], kind: 'bank', monogram: 'CCB', color: '#2F5C9C' },

  // ── New digital banks (2024 licensees) ───────────────────────────────────
  { id: 'gxbank', name: 'GXBank', aliases: ['GX'], kind: 'bank', monogram: 'GX', color: '#1B1B1B' },
  { id: 'aeon_bank', name: 'AEON Bank', aliases: ['AEON'], kind: 'bank', monogram: 'AEON', color: '#E60012' },
  { id: 'boost_bank', name: 'Boost Bank', aliases: [], kind: 'bank', monogram: 'BstB', color: '#FF5C39' },
  { id: 'kaf_digital', name: 'KAF Digital Bank', aliases: ['KAF'], kind: 'bank', monogram: 'KAF', color: '#1A1A1A' },
  { id: 'ryt_bank', name: 'Ryt Bank', aliases: ['YTL Digital Bank'], kind: 'bank', monogram: 'Ryt', color: '#ED1C24' },

  // ── E-wallets ─────────────────────────────────────────────────────────────
  { id: 'tng', name: "Touch 'n Go eWallet", aliases: ['TnG', 'TNG eWallet', 'Touch n Go'], kind: 'ewallet', monogram: 'TnG', color: '#00529C' },
  { id: 'boost', name: 'Boost', aliases: ['Boost eWallet'], kind: 'ewallet', monogram: 'Bst', color: '#FF5C39' },
  { id: 'grabpay', name: 'GrabPay', aliases: ['Grab'], kind: 'ewallet', monogram: 'Grab', color: '#00B14F' },
  { id: 'shopeepay', name: 'ShopeePay', aliases: ['Shopee'], kind: 'ewallet', monogram: 'ShP', color: '#EE4D2D' },
  { id: 'bigpay', name: 'BigPay', aliases: [], kind: 'ewallet', monogram: 'Big', color: '#1B1B1B' },
  { id: 'mae', name: 'MAE by Maybank2u', aliases: ['MAE'], kind: 'ewallet', monogram: 'MAE', color: '#FFC726' },
  { id: 'setel', name: 'Setel', aliases: ['Setel Petronas'], kind: 'ewallet', monogram: 'Setel', color: '#00A19A' },
];

const norm = (s: string): string => s.trim().toLowerCase();

/** Whole-word, case-insensitive containment — avoids "BI" matching inside "BigPay". */
function containsWord(haystack: string, needle: string): boolean {
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${esc}\\b`, 'i').test(haystack);
}

/**
 * Match free text (typically a vision model's guess at the institution shown in
 * a screenshot) to a known institution. Ranked: exact name/alias match first,
 * then the text containing the canonical name, then a whole-word alias hit.
 * Returns null if nothing matches reasonably — callers fall back to the raw text.
 */
export function matchInstitution(text: string | null | undefined): Institution | null {
  if (!text) return null;
  const q = norm(text);
  if (!q) return null;

  for (const inst of INSTITUTIONS) {
    if (norm(inst.name) === q || inst.aliases.some((a) => norm(a) === q)) return inst;
  }
  for (const inst of INSTITUTIONS) {
    if (q.includes(norm(inst.name))) return inst;
  }
  for (const inst of INSTITUTIONS) {
    if (inst.aliases.some((a) => containsWord(q, norm(a)))) return inst;
  }
  return null;
}

/**
 * Ranked multi-result search for a typed-as-you-go autocomplete (vs. `matchInstitution`,
 * which resolves one best guess from a model's free-text provider field). Ranked:
 * name-starts-with, then alias-starts-with, then name-contains, then alias-contains.
 * Capped to 6 results; returns [] for an empty query or no matches.
 */
export function searchInstitutions(query: string): Institution[] {
  const q = norm(query);
  if (!q) return [];

  const out: Institution[] = [];
  const seen = new Set<string>();
  const add = (inst: Institution) => {
    if (!seen.has(inst.id)) { seen.add(inst.id); out.push(inst); }
  };

  for (const inst of INSTITUTIONS) if (norm(inst.name).startsWith(q)) add(inst);
  for (const inst of INSTITUTIONS) if (inst.aliases.some((a) => norm(a).startsWith(q))) add(inst);
  for (const inst of INSTITUTIONS) if (norm(inst.name).includes(q)) add(inst);
  for (const inst of INSTITUTIONS) if (inst.aliases.some((a) => norm(a).includes(q))) add(inst);

  return out.slice(0, 6);
}

/** True if `accountName` plausibly names `inst` — name match or whole-word alias match. */
function accountNamesInstitution(accountName: string, inst: Institution): boolean {
  const an = norm(accountName);
  const instName = norm(inst.name);
  if (an === instName || an.includes(instName)) return true;
  return inst.aliases.some((a) => an === norm(a) || containsWord(an, norm(a)));
}

/**
 * Find this user's existing (non-holding, non-archived) accounts that plausibly
 * belong to `institution` — or, when the screenshot's provider wasn't recognized
 * against the curated list, fall back to a loose match against the raw provider
 * text the model reported. Returns [] when neither is available.
 */
export function findMatchingAccounts(accounts: Account[], institution: Institution | null, rawProvider: string | null): Account[] {
  if (!institution && !rawProvider) return [];
  const candidates = accounts.filter((a) => !isHolding(a) && !a.archived);
  if (institution) return candidates.filter((a) => accountNamesInstitution(a.name, institution));
  const q = norm(rawProvider as string);
  if (!q) return [];
  return candidates.filter((a) => {
    const an = norm(a.name);
    return an === q || an.includes(q) || q.includes(an);
  });
}
