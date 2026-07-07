// Trust panel derivation (Brief G) — the officer's "can I trust this file?" answered
// in five rows: holder signature, issuer attestation, freshness, consent, stacking.
// Pure: verify outcome + consent state + presentment log in, row states out. The UI
// only renders what this function derives.

import type { CreditPassport } from './passport';
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
    return { key: 'freshness', label, state: 'fail', detail: `Expired — was valid until ${passport.validUntil.slice(0, 10)}` };
  }
  if (t < issued) {
    return { key: 'freshness', label, state: 'fail', detail: `Not yet valid — issued ${passport.issuedAt.slice(0, 10)}` };
  }
  const daysLeft = Math.floor((until - t) / DAY_MS);
  if (daysLeft <= FRESHNESS_WARN_DAYS) {
    return { key: 'freshness', label, state: 'warn', detail: `Inside the signed window but expires in ${daysLeft} day(s) — ask for a re-issued passport soon` };
  }
  return { key: 'freshness', label, state: 'pass', detail: `Inside the signed validity window — ${daysLeft} days left (until ${passport.validUntil.slice(0, 10)})` };
}

function stackingRow(priors: Presentment[], windowHours: number, now: Date): TrustRow {
  const label = 'Stacking check';
  if (priors.length === 0) {
    return { key: 'stacking', label, state: 'pass', detail: `First presentment at this console in the last ${windowHours}h` };
  }
  const lastAgo = formatAgo(priors[0].at, now);
  const detail = `Presented ${priors.length} time(s) before in the last ${windowHours}h — last ${lastAgo} · review before disbursing`;
  return { key: 'stacking', label, state: priors.length >= STACKING_FAIL_COUNT ? 'fail' : 'warn', detail };
}

/** Derive the five trust rows, in display order. */
export function deriveTrustRows(input: TrustPanelInput): TrustRow[] {
  const { passport, holderVerified, issuerVerified, priorPresentments } = input;
  const now = input.now ?? new Date();
  const windowHours = input.windowHours ?? 24;

  const holder: TrustRow = holderVerified
    ? { key: 'holder', label: 'Holder signature', state: 'pass', detail: 'Ed25519 signature verifies against the subject key — contents unaltered since signing' }
    : { key: 'holder', label: 'Holder signature', state: 'fail', detail: 'Holder signature does not verify — the passport was altered' };

  const issuer: TrustRow = issuerVerified
    ? { key: 'issuer', label: 'Issuer attestation', state: 'pass', detail: 'Signed by Pip’s pinned issuer key — issued by Pip, not self-minted' }
    : { key: 'issuer', label: 'Issuer attestation', state: 'fail', detail: 'No valid issuer signature — possible self-minted passport' };

  // Consent receipts arrive with the consent-tiers schema (Brief I stretch). Until a
  // passport carries them, the honest state is a soft warning, not a failure.
  const consent: TrustRow = { key: 'consent', label: 'Consent', state: 'warn', detail: 'Not shared — this passport version carries no consent receipts; presenting the code is itself the borrower’s consent act' };

  return [holder, issuer, freshnessRow(passport, now), consent, stackingRow(priorPresentments, windowHours, now)];
}
