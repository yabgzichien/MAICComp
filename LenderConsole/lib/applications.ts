// Application queues store (Brief O)  the console's persistent pipeline. Pure
// array-in/array-out logic plus an injectable-Storage wrapper (same pattern as
// presentmentStore). No UI imports.
//
// The one inviolable rule  the override matrix  mirrors the orchestrator's
// escalation-only asymmetry documented in agents.ts: an officer can resolve a
// REFER either way and can DECLINE an engine approve (tighten), but can never
// APPROVE an engine decline (soften). resolveApplication throws on violations.

import type { Decision } from './loans';
import type { EarlyWarningFlag } from './earlyWarning';
import type { ServicingDefault } from './mergeServicing';

export type ApplicationStatus = 'new' | 'referred' | 'approved' | 'declined';

/** Declared loan purpose (spec 2026-07-07): officer-facing context, never a scoring input. */
export type PurposeCategory = 'stock' | 'equipment' | 'working-capital' | 'emergency' | 'education' | 'other';
export interface DeclaredPurpose {
  category: PurposeCategory;
  note?: string;
}

export interface AuditEntry {
  at: string;
  action: string;
  detail?: string;
}

/** One post-disbursement check-in (Brief S): a fresh, re-verified passport diffed against the
 *  loan's baseline, with the flags that diff produced (empty when the check-in was clean). */
export interface CheckIn {
  at: string;
  passportCode: string;
  flags: EarlyWarningFlag[];
}

/** One repayment event on a disbursed loan (portfolio performance): the console's own
 *  ledger of what was actually collected, independent of the passport's self-reported
 *  repaymentRecord. `amount` is what was actually collected (0 on a missed instalment). */
export type RepaymentOutcome = 'on-time' | 'late' | 'missed';
export interface RepaymentEvent {
  at: string;
  instalmentSeq: number;
  amount: number;
  outcome: RepaymentOutcome;
}

export interface ApplicationRecord {
  id: string;
  /** The full pasted code  the detail pane rehydrates by re-running evaluate on it. */
  passportCode: string;
  subject: string;
  applicantLabel: string;
  requestedAmount: number;
  purpose?: DeclaredPurpose;
  /** The engine's verdict at filing. Never rewritten  resolutions live in `resolution`. */
  engineDecision: Decision;
  /** Credit band / confidence at filing (wayfinding: P2.10 queue-card signal). Optional so
   *  older stored records without them stay valid. */
  band?: string;
  confidencePct?: number;
  /** Offer terms at filing  the portfolio/early-warning specs read these off approved rows. */
  offeredAmount: number;
  installment: number;
  tierLabel?: string;
  status: ApplicationStatus;
  filedAt: string;
  resolvedAt?: string;
  resolution?: { outcome: 'approved' | 'declined'; rationale: string; officer: string };
  notes: string[];
  /** Append-only. Entries are never edited or removed. */
  audit: AuditEntry[];
  /** Post-disbursement check-ins (Brief S), oldest first. Absent/empty on applications that
   *  predate monitoring or have never been re-verified. */
  checkIns?: CheckIn[];
  /** Repayment ledger (portfolio performance), oldest first. Absent/empty on applications
   *  that predate the feature or have not yet had an instalment come due. */
  repayments?: RepaymentEvent[];
  /** Loan-level terminal default flag (Bidirectional Servicing Sync, 2026-07-18 design),
   *  distinct from a missed instalment. A monotonic latch  once true, never unset locally
   *  (curing a default is roadmap, not this pass). `source` records which side first raised
   *  it: this console's officer, or the borrower app (synced in via mergeServicing). */
  defaulted?: ServicingDefault;
  source?: 'direct' | 'officer';
}

export interface FileApplicationInput {
  passportCode: string;
  subject: string;
  applicantLabel: string;
  requestedAmount: number;
  engineDecision: Decision;
  offeredAmount: number;
  installment: number;
  tierLabel?: string;
  purpose?: DeclaredPurpose;
  source?: 'direct' | 'officer';
  band?: string;
  confidencePct?: number;
}

const OFFICER = 'Hamdan Z.';

/** Status a filing lands in: approve/decline resolve as engine-decided; refer waits for a human. */
function statusFor(verdict: Decision): ApplicationStatus {
  return verdict === 'approve' ? 'approved' : verdict === 'decline' ? 'declined' : 'referred';
}

/**
 * File one verified+assessed passport as an application. Dedupe: the same subject
 * asking for the same amount is the same application  re-verifying it does not
 * file again (the presentment log already records repeat verifications).
 */
export function fileApplication(
  apps: ApplicationRecord[],
  input: FileApplicationInput,
  now: Date = new Date(),
): { apps: ApplicationRecord[]; filed: boolean; id?: string } {
  const exists = apps.some((a) => a.subject === input.subject && a.requestedAmount === input.requestedAmount);
  if (exists) return { apps, filed: false };

  const at = now.toISOString();
  const status = statusFor(input.engineDecision);
  const resolved = status !== 'referred' && status !== 'new';
  
  const auditDetail = input.source === 'direct'
    ? 'submitted by borrower via direct apply'
    : (resolved ? `engine ${input.engineDecision}. Resolved as filed` : 'engine refer. Awaiting officer decision');

  const record: ApplicationRecord = {
    id: `${input.subject.slice(0, 8)}-${now.getTime().toString(36)}-${input.requestedAmount}`,
    passportCode: input.passportCode,
    subject: input.subject,
    applicantLabel: input.applicantLabel,
    requestedAmount: input.requestedAmount,
    ...(input.purpose ? { purpose: input.purpose } : {}),
    engineDecision: input.engineDecision,
    offeredAmount: decisionOutcome(input.engineDecision, input.offeredAmount),
    installment: decisionOutcome(input.engineDecision, input.installment),
    ...(input.tierLabel ? { tierLabel: input.tierLabel } : {}),
    ...(input.band ? { band: input.band } : {}),
    ...(input.confidencePct !== undefined ? { confidencePct: input.confidencePct } : {}),
    status,
    filedAt: at,
    ...(resolved ? { resolvedAt: at } : {}),
    notes: [],
    audit: [
      {
        at,
        action: 'filed',
        detail: auditDetail,
      },
    ],
    ...(input.source ? { source: input.source } : {}),
  };
  return { apps: [...apps, record], filed: true, id: record.id };
}

/**
 * Merge direct-apply submissions from the per-lender server mailbox into the console's local
 * pipeline (multi-lender direct-apply, 2026-07-16). A server record is already a fully-formed
 * ApplicationRecord (filed by appendServerApplication), so it is adopted as-is  keeping its
 * id, its "submitted by borrower via direct apply" audit line, and its `source: 'direct'`
 * badge. Dedupe is on (subject + requestedAmount), the same identity fileApplication uses, so a
 * submission already in the local pipeline (adopted on an earlier load, or filed by the
 * officer) is never duplicated. Returns `changed` so the caller only re-persists when needed.
 */
export function mergeServerApplications(
  local: ApplicationRecord[],
  server: unknown[],
): { apps: ApplicationRecord[]; changed: boolean } {
  const keyOf = (a: ApplicationRecord) => `${a.subject} | ${a.requestedAmount}`;
  const seen = new Set(local.map(keyOf));
  const additions: ApplicationRecord[] = [];
  for (const rec of server) {
    if (!isRecord(rec)) continue;
    const key = keyOf(rec);
    if (seen.has(key)) continue;
    seen.add(key);
    additions.push(rec);
  }
  return additions.length > 0 ? { apps: [...local, ...additions], changed: true } : { apps: local, changed: false };
}

function decisionOutcome(verdict: Decision, value: number): number {
  return verdict === 'decline' ? 0 : value;
}

/**
 * Resolve an application. Enforces the override matrix:
 *   referred → approved | declined   (either way, rationale required)
 *   approved → declined              (an officer can always tighten)
 *   declined → approved              (NEVER  throws)
 */
export function resolveApplication(
  apps: ApplicationRecord[],
  id: string,
  outcome: 'approved' | 'declined',
  rationale: string,
  now: Date = new Date(),
  officer: string = OFFICER,
): ApplicationRecord[] {
  const app = apps.find((a) => a.id === id);
  if (!app) throw new Error(`No application with id ${id}.`);
  if (!rationale.trim()) throw new Error('A one-line rationale is required to resolve an application.');
  if (app.status === 'declined' && outcome === 'approved') {
    throw new Error('An engine or officer decline can never be overturned to an approval. Escalation only.');
  }
  if (app.status === 'approved' && outcome === 'approved') {
    throw new Error('Already approved.');
  }

  const at = now.toISOString();
  const resolvedApp: ApplicationRecord = {
    ...app,
    status: outcome,
    resolvedAt: at,
    resolution: { outcome, rationale: rationale.trim(), officer },
    audit: [...app.audit, { at, action: `resolved-${outcome}`, detail: `${officer}: ${rationale.trim()}` }],
  };
  return apps.map((a) => (a.id === id ? resolvedApp : a));
}

/** Append an officer note (audit-trailed). */
export function addNote(apps: ApplicationRecord[], id: string, note: string, now: Date = new Date()): ApplicationRecord[] {
  const at = now.toISOString();
  return apps.map((a) =>
    a.id === id ? { ...a, notes: [...a.notes, note], audit: [...a.audit, { at, action: 'note', detail: note }] } : a,
  );
}

/**
 * Record a post-disbursement check-in (Brief S): appends the re-verified passport code and its
 * flags to the application's check-in history, audit-trailed. Never changes `status` or
 * `resolution`  a check-in informs the officer, it never re-decides the loan.
 */
export function recordCheckIn(
  apps: ApplicationRecord[],
  id: string,
  passportCode: string,
  flags: EarlyWarningFlag[],
  now: Date = new Date(),
): ApplicationRecord[] {
  const at = now.toISOString();
  const checkIn: CheckIn = { at, passportCode, flags };
  const detail =
    flags.length === 0
      ? 'clean. No flags'
      : `${flags.length} flag(s): ${flags.map((f) => `${f.key} (${f.severity})`).join(', ')}`;
  return apps.map((a) =>
    a.id === id
      ? { ...a, checkIns: [...(a.checkIns ?? []), checkIn], audit: [...a.audit, { at, action: 'check-in', detail }] }
      : a,
  );
}

/**
 * Record one repayment event (portfolio performance): appends it to the application's
 * repayment ledger, audit-trailed. Never changes `status` or `resolution`  a repayment
 * informs performance reporting, it never re-decides the loan.
 */
export function recordRepayment(
  apps: ApplicationRecord[],
  id: string,
  event: { instalmentSeq: number; amount: number; outcome: RepaymentOutcome },
  now: Date = new Date(),
): ApplicationRecord[] {
  const at = now.toISOString();
  const repayment: RepaymentEvent = { at, ...event };
  const detail = `instalment ${event.instalmentSeq}: ${event.outcome}${event.amount > 0 ? ` (RM${Math.round(event.amount).toLocaleString('en-MY')})` : ''}`;
  return apps.map((a) =>
    a.id === id
      ? { ...a, repayments: [...(a.repayments ?? []), repayment], audit: [...a.audit, { at, action: 'repayment', detail }] }
      : a,
  );
}

/**
 * Mark a loan defaulted (Bidirectional Servicing Sync, 2026-07-18 design): a loan-level
 * terminal flag, audit-trailed. A monotonic latch  a loan already defaulted is left
 * untouched (no new audit line, no timestamp/source overwrite) rather than re-raised, so the
 * `at`/`source` always reflect who first raised it, matching mergeServicing's own latch rule.
 * Never changes `status`/`resolution`  a default informs performance reporting and
 * servicing, it never re-decides the loan. `source` defaults to 'lender' (an officer's own
 * action); the sync path passes 'borrower' when adopting a server-reported default.
 */
export function markDefault(
  apps: ApplicationRecord[],
  id: string,
  source: 'lender' | 'borrower' = 'lender',
  now: Date = new Date(),
): ApplicationRecord[] {
  const at = now.toISOString();
  return apps.map((a) => {
    if (a.id !== id || a.defaulted?.value) return a;
    const detail = source === 'lender' ? 'Marked defaulted by this console. Loan written off.' : 'Reported defaulted by the borrower app. Loan written off.';
    return { ...a, defaulted: { value: true, at, source }, audit: [...a.audit, { at, action: 'defaulted', detail }] };
  });
}

/** Record that an adverse-action letter was generated for this application (Brief J stretch),
 *  audit-trailed. Never changes status/resolution  the letter restates the decision, it
 *  never remakes it. Kind is recorded so the trail shows what TYPE of letter was drafted. */
export function recordLetterGenerated(
  apps: ApplicationRecord[],
  id: string,
  kind: 'decline' | 'refer' | 'counter-offer',
  now: Date = new Date(),
): ApplicationRecord[] {
  const at = now.toISOString();
  return apps.map((a) =>
    a.id === id ? { ...a, audit: [...a.audit, { at, action: 'letter-generated', detail: `${kind} letter drafted` }] } : a,
  );
}

/** Approved applications whose most recent check-in still carries active flags  the Watchlist
 *  queue (Brief S), a filtered view of Approved rather than a fifth status value. */
export function watchlistApplications(apps: ApplicationRecord[]): ApplicationRecord[] {
  return apps.filter((a) => {
    if (a.status !== 'approved' || !a.checkIns || a.checkIns.length === 0) return false;
    const latest = a.checkIns[a.checkIns.length - 1];
    return latest.flags.length > 0;
  });
}

/**
 * One queue, in officer-work order: Referred shows the OLDEST first (the file that
 * has waited longest is the next job); resolved queues show the newest first.
 */
export function orderQueue(apps: ApplicationRecord[], status: ApplicationStatus): ApplicationRecord[] {
  const inQueue = apps.filter((a) => a.status === status);
  const asc = status === 'referred' || status === 'new';
  return [...inQueue].sort((a, b) => (asc ? a.filedAt.localeCompare(b.filedAt) : b.filedAt.localeCompare(a.filedAt)));
}

// ── localStorage wrapper (injectable, SSR-safe  presentmentStore pattern) ────
// Keyed by lender id (Lender Tenancy spec, 2026-07-12): entering the console as a
// different lender shows THAT lender's own pipeline, not TEKUN's. `lenderId` defaults
// to 'tekun', which keeps the original, unsuffixed key  so a pipeline seeded before
// multi-tenancy shipped is still TEKUN's.

const STORE_KEY = 'pip-applications';
const DEFAULT_LENDER_ID = 'tekun';

function keyFor(lenderId: string): string {
  return lenderId === DEFAULT_LENDER_ID ? STORE_KEY : `${STORE_KEY}:${lenderId}`;
}

function defaultStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

function isRecord(x: unknown): x is ApplicationRecord {
  if (!x || typeof x !== 'object') return false;
  const a = x as Record<string, unknown>;
  return (
    typeof a.id === 'string' &&
    typeof a.passportCode === 'string' &&
    typeof a.subject === 'string' &&
    typeof a.requestedAmount === 'number' &&
    typeof a.status === 'string' &&
    typeof a.filedAt === 'string' &&
    Array.isArray(a.audit)
  );
}

export function readApplications(storage: Storage | null = defaultStorage(), lenderId: string = DEFAULT_LENDER_ID): ApplicationRecord[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(keyFor(lenderId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch {
    return [];
  }
}

export function writeApplications(apps: ApplicationRecord[], storage: Storage | null = defaultStorage(), lenderId: string = DEFAULT_LENDER_ID): void {
  if (!storage) return;
  try {
    storage.setItem(keyFor(lenderId), JSON.stringify(apps));
  } catch {
    // Quota/security failures degrade to an in-memory-only session  never break the console.
  }
}

export { isRecord as isApplicationRecord };

