// Pure seeding logic for the pre-signed 13-persona demo applicant mix (Demo Data plan
// Task 6, spec §C). Extracted out of Console.tsx's onSeed so the queue mix, the watchlist
// pairing (Brief S), and the stacking case (Brief G) are unit-testable against the real
// engines rather than only eyeballed live. No storage reads/writes  the caller (Console.tsx)
// persists `apps` and appends `presentments` to its own log.

import { DEMO_APPLICANTS } from '../app/demoApplicants';
import { SAMPLE_CODE } from '../app/tokens';
import { parsePassportCode, verifyPassport, type CreditPassport } from './passport';
import { decideLoan, type LenderPolicy, type LoanDecision, type LoanProduct } from './loans';
import {
  fileApplication,
  recordCheckIn,
  type ApplicationRecord,
  type DeclaredPurpose,
  type FileApplicationInput,
  type PurposeCategory,
} from './applications';
import { diffCheckIn } from './earlyWarning';
import { presentmentKey, type Presentment } from './presentment';

/** At least 4 distinct categories cycle across the mix (spec §C: "≥4 declared purposes"). */
const PURPOSE_CYCLE: PurposeCategory[] = ['stock', 'working-capital', 'equipment', 'emergency', 'education'];

function decisionFor(passport: CreditPassport, requestedAmount: number, products: LoanProduct[], policy: LenderPolicy): LoanDecision | null {
  const a = passport.assessment;
  if (!a) return null;
  return decideLoan({
    score: passport.score,
    confidence: a.confidence,
    avgMonthlySurplus: a.avgMonthlySurplus,
    monthlyDebtService: a.monthlyDebtService,
    avgIncome: a.avgIncome,
    requestedAmount,
    products,
    coverageRatio: a.coverageRatio,
    coverageDaysCovered: a.coverageDays,
    policy,
  });
}

function filingInputFor(code: string, passport: CreditPassport, decision: LoanDecision, amount: number, purpose: DeclaredPurpose): FileApplicationInput {
  return {
    passportCode: code,
    subject: passport.subject,
    applicantLabel: passport.holder?.name ?? 'Applicant',
    requestedAmount: amount,
    engineDecision: decision.decision,
    offeredAmount: decision.maxAmount,
    installment: decision.installment,
    ...(decision.breakdown?.tierLabel ? { tierLabel: decision.breakdown.tierLabel } : {}),
    purpose,
    band: passport.band,
    ...(passport.assessment ? { confidencePct: Math.round(passport.assessment.confidence * 100) } : {}),
  };
}

export interface SeedResult {
  apps: ApplicationRecord[];
  /** Presentment-log entries the caller should append (the stacking case's two events). */
  presentments: Presentment[];
}

/**
 * Seeds a fresh pipeline from the 13-persona demo mix + the sample passport. `checkin` and
 * `stacking-duplicate` roles are never filed as new applications  a check-in attaches to its
 * paired base application (Brief S), and the stacking duplicate would dedupe away anyway
 * (same subject+amount as its base); it instead yields two presentment-log entries.
 */
export function seedApplications(
  existing: ApplicationRecord[],
  products: LoanProduct[],
  policy: LenderPolicy,
  lenderName: string,
  now: Date = new Date(),
): SeedResult {
  const toFile = DEMO_APPLICANTS.filter((d) => d.role !== 'checkin' && d.role !== 'stacking-duplicate');
  const seeds: { code: string; amount: number; purpose: DeclaredPurpose; label: string }[] = [
    ...toFile.map((d, i) => ({
      code: d.code,
      amount: d.requestedAmount,
      purpose: { category: PURPOSE_CYCLE[i % PURPOSE_CYCLE.length] } as DeclaredPurpose,
      label: d.label,
    })),
    { code: SAMPLE_CODE, amount: 10000, purpose: { category: 'stock', note: 'Stock for the raya season' } as DeclaredPurpose, label: 'sample' },
  ];

  let apps = existing;
  const filedIdByLabel = new Map<string, string>();
  seeds.forEach((seed, i) => {
    let parsed;
    try {
      parsed = parsePassportCode(seed.code);
    } catch {
      return; // malformed  skip rather than break the whole seed
    }
    const verify = verifyPassport(parsed.passport, parsed.signature, parsed.issuerSignature, now);
    if (!verify.valid) return;
    const decision = decisionFor(parsed.passport, seed.amount, products, policy);
    if (!decision) return;
    const at = new Date(now.getTime() - (seeds.length - i) * 5_400_000); // 1.5h apart, oldest first
    const result = fileApplication(apps, filingInputFor(seed.code, parsed.passport, decision, seed.amount, seed.purpose), at);
    apps = result.apps;
    if (result.filed && result.id) filedIdByLabel.set(seed.label, result.id);
  });

  // Watchlist pair (Brief S): attach the check-in to its base application directly  a real
  // check-in never opens a second file.
  const checkin = DEMO_APPLICANTS.find((d) => d.role === 'checkin');
  if (checkin?.pairsWithLabel) {
    const baseId = filedIdByLabel.get(checkin.pairsWithLabel);
    const baseApp = baseId ? apps.find((a) => a.id === baseId) : undefined;
    if (baseApp) {
      try {
        const basePassport = parsePassportCode(baseApp.passportCode).passport;
        const checkinPassport = parsePassportCode(checkin.code).passport;
        const flags = diffCheckIn(basePassport, checkinPassport).flags;
        apps = recordCheckIn(apps, baseApp.id, checkin.code, flags, new Date(now.getTime() - 1_800_000));
      } catch {
        // Malformed stored code  skip the check-in rather than break seeding.
      }
    }
  }

  // NEW queue (2026-07-15 agent-work review item 4): no code path ever produces
  // status:'new'  fileApplication's statusFor() maps every engine decision straight to
  // approved/declined/referred, so the workbench's entry-point column was permanently
  // empty. Seeds two "just arrived, not yet triaged" entries: the same two applicants
  // re-presented at a different requested amount (a legitimately separate application,
  // not a duplicate of their primary filing above), filed normally so their decision is
  // real, then marked New so an officer has something to open first.
  const NEW_QUEUE_ENTRIES: { label: string; amount: number; purpose: DeclaredPurpose }[] = [
    { label: 'Nurul Izzati binti Rashid', amount: 3000, purpose: { category: 'working-capital' } },
    { label: 'Aisyah Putri Wijaya', amount: 5000, purpose: { category: 'equipment' } },
  ];
  for (const entry of NEW_QUEUE_ENTRIES) {
    const applicant = DEMO_APPLICANTS.find((d) => d.label === entry.label);
    if (!applicant) continue;
    let parsed;
    try {
      parsed = parsePassportCode(applicant.code);
    } catch {
      continue;
    }
    const verify = verifyPassport(parsed.passport, parsed.signature, parsed.issuerSignature, now);
    if (!verify.valid) continue;
    const decision = decisionFor(parsed.passport, entry.amount, products, policy);
    if (!decision) continue;
    const at = new Date(now.getTime() - 20 * 60_000); // arrived minutes ago
    const result = fileApplication(apps, filingInputFor(applicant.code, parsed.passport, decision, entry.amount, entry.purpose), at);
    if (result.filed && result.id) {
      apps = result.apps.map((a) => (a.id === result.id ? { ...a, status: 'new' as const } : a));
    }
  }

  // Stacking case (Brief G): two presentments of the same passport within 24h.
  const presentments: Presentment[] = [];
  const dup = DEMO_APPLICANTS.find((d) => d.role === 'stacking-duplicate');
  if (dup) {
    try {
      const id = presentmentKey(parsePassportCode(dup.code).passport);
      presentments.push({ id, at: new Date(now.getTime() - 20 * 3_600_000).toISOString(), lender: lenderName });
      presentments.push({ id, at: new Date(now.getTime() - 2 * 3_600_000).toISOString(), lender: lenderName });
    } catch {
      // Malformed stored code  skip the stacking demo rather than break seeding.
    }
  }

  return { apps, presentments };
}
