// Trust panel derivation (Brief G)  the officer's "can I trust this file?" answered
// in five rows: holder signature, issuer attestation, freshness, consent, stacking.
// Pure: verify outcome + consent state + presentment log in, row states out. The UI
// only renders what this function derives.

import type { ConsentTier, CreditPassport } from './passport';
import { formatAgo, type Presentment } from './presentment';

export type TrustRowState = 'pass' | 'warn' | 'fail';
export type TrustRowKey = 'holder' | 'issuer' | 'freshness' | 'consent' | 'stacking';

export interface TrustRow {
  key: TrustRowKey;
  label: string;
  state: TrustRowState;
  detail: string;
}

export interface TrustPanelInput {
  passport: CreditPassport;
  /** Whether the holder's Ed25519 signature verified against the subject key. */
  holderVerified: boolean;
  /** Whether a pinned-issuer signature was presented and verified. */
  issuerVerified: boolean;
  /** Prior presentments of this subject within the window (excluding the current one). */
  priorPresentments: Presentment[];
  /** Tiers whose consent grant has lapsed, from verifyPassport's result (Brief I stretch). */
  lapsedTiers?: ConsentTier[];
  windowHours?: number;
  now?: Date;
}

/** Inside this many days of expiry, freshness reads as a warning rather than a pass. */
const FRESHNESS_WARN_DAYS = 7;
/** Three or more prior presentments in the window stop being a caution and read as stacking. */
const STACKING_FAIL_COUNT = 3;
const DAY_MS = 86_400_000;

function freshnessRow(passport: CreditPassport, now: Date): TrustRow {
  const label = 'Freshness';
  const issued = Date.parse(passport.issuedAt);
  const until = Date.parse(passport.validUntil);
  if (Number.isNaN(issued) || Number.isNaN(until)) {
    return { key: 'freshness', label, state: 'fail', detail: 'Issued/valid-until dates are malformed' };
  }
  const t = now.getTime();
  if (t > until) {
    return { key: 'freshness', label, state: 'fail', detail: `Expired: was valid until ${passport.validUntil.slice(0, 10)}` };
  }
  if (t < issued) {
    return { key: 'freshness', label, state: 'fail', detail: `Not yet valid. Issued ${passport.issuedAt.slice(0, 10)}` };
  }
  const daysLeft = Math.floor((until - t) / DAY_MS);
  if (daysLeft <= FRESHNESS_WARN_DAYS) {
    return { key: 'freshness', label, state: 'warn', detail: `Inside the signed window but expires in ${daysLeft} day(s). Ask for a re-issued passport soon` };
  }
  return { key: 'freshness', label, state: 'pass', detail: `Inside the signed validity window  ${daysLeft} days left (until ${passport.validUntil.slice(0, 10)})` };
}

function stackingRow(priors: Presentment[], windowHours: number, now: Date): TrustRow {
  const label = 'Stacking check';
  if (priors.length === 0) {
    return { key: 'stacking', label, state: 'pass', detail: `First presentment at this console in the last ${windowHours}h` };
  }
  const lastAgo = formatAgo(priors[0].at, now);
  const detail = `Presented ${priors.length} time(s) before in the last ${windowHours}h. Last ${lastAgo} · review before disbursing`;
  return { key: 'stacking', label, state: priors.length >= STACKING_FAIL_COUNT ? 'fail' : 'warn', detail };
}

const TIER_NAME: Record<ConsentTier, string> = { 0: 'Tier 0 aggregates', 1: 'Tier 1 identity', 2: 'Tier 2 spending', 3: 'Tier 3 monitoring' };

/**
 * Consent receipts (Brief I stretch). A passport that carries them lets the officer prove
 * what the borrower granted, field-by-field. A lapsed tier degrades to a warning ("ask to
 * re-share"); a pre-consent passport keeps the honest "not shared" soft warning.
 */
function consentRow(passport: CreditPassport, lapsedTiers: ConsentTier[] | undefined, now: Date): TrustRow {
  const label = 'Consent';
  const receipts = passport.consent;
  if (!receipts || receipts.length === 0) {
    return { key: 'consent', label, state: 'warn', detail: 'Not shared. This passport carries no consent receipts; presenting the code is itself the borrower’s consent act' };
  }
  const lapsed = lapsedTiers ?? receipts.filter((r) => Date.parse(r.expiresAt) < now.getTime()).map((r) => r.tier);
  if (lapsed.length > 0) {
    const names = Array.from(new Set(lapsed)).map((t) => TIER_NAME[t]).join(', ');
    return { key: 'consent', label, state: 'warn', detail: `${names} consent lapsed. Ask the applicant to re-share the passport` };
  }
  const tiers = receipts.map((r) => r.tier).sort((a, b) => a - b).map((t) => TIER_NAME[t]);
  return { key: 'consent', label, state: 'pass', detail: `Signed consent receipts: ${tiers.join(' + ')}  granted ${receipts[0].grantedAt.slice(0, 10)}, provable field-by-field` };
}

/** Derive the five trust rows, in display order. */
export function deriveTrustRows(input: TrustPanelInput): TrustRow[] {
  const { passport, holderVerified, issuerVerified, priorPresentments } = input;
  const now = input.now ?? new Date();
  const windowHours = input.windowHours ?? 24;

  const holder: TrustRow = holderVerified
    ? { key: 'holder', label: 'Holder signature', state: 'pass', detail: 'Ed25519 signature verifies against the subject key, contents unaltered since signing' }
    : { key: 'holder', label: 'Holder signature', state: 'fail', detail: 'Holder signature does not verify. The passport was altered' };

  const issuer: TrustRow = issuerVerified
    ? { key: 'issuer', label: 'Issuer attestation', state: 'pass', detail: 'Signed by Pip’s pinned issuer key, issued by Pip, not self-minted' }
    : { key: 'issuer', label: 'Issuer attestation', state: 'fail', detail: 'No valid issuer signature, possible self-minted passport' };

  return [holder, issuer, freshnessRow(passport, now), consentRow(passport, input.lapsedTiers, now), stackingRow(priorPresentments, windowHours, now)];
}
