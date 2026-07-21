import { addTransactions } from '../db/txnRepo';
import { addAccount, addBalanceEntry } from '../db/accountsRepo';
import { setAllocations, setExpectedIncome, upsertSnapshot } from '../db/budgetRepo';
import { clearKyc } from '../db/kycRepo';
import { clearOccupation, type EmploymentType } from '../db/occupationRepo';
import { buildAinaSeed, buildRaviSeed, buildFaizalSeed } from './demoSeed';

export { buildAinaSeed, buildRaviSeed, buildFaizalSeed, buildDemoSeed, type DemoAccountSeed, type DemoSeed } from './demoSeed';

// ── Profile registry ──────────────────────────────────────────────────────────

export type DemoProfileId = 'aina' | 'ravi' | 'faizal';

/** UI-facing metadata for each profile, used by Settings to render the picker and by the
 *  KYC screen to prefill identity + work & income for a zero-typing demo run. Names/ICs are
 *  clearly synthetic (format-valid MyKad structure, matching each persona's seeded story) —
 *  see `src/data/sampleIdentity.ts` for the same "clearly demo" convention. */
export const DEMO_PROFILES: ReadonlyArray<{
  id: DemoProfileId;
  name: string;
  story: string;
  identity: { fullName: string; nric: string };
  occupation: { occupation: string; sector: string; employmentType: EmploymentType; tenureMonths: number };
}> = [
  {
    id: 'aina',
    name: 'Aina',
    story: 'Online seller — real but uneven e-wallet income. The credit-invisible gig worker.',
    identity: { fullName: 'Aina Binti Rahman', nric: '980412-10-5566' },
    occupation: { occupation: 'Online seller', sector: 'E-commerce / Retail', employmentType: 'micro-business', tenureMonths: 14 },
  },
  {
    id: 'ravi',
    name: 'Ravi',
    story: 'Multi-platform delivery driver — steadier income, strong savings, no debt.',
    identity: { fullName: 'Ravindran A/L Suresh Kumar', nric: '920815-10-5271' },
    occupation: { occupation: 'Multi-platform delivery driver', sector: 'Transport / Gig economy', employmentType: 'gig', tenureMonths: 26 },
  },
  {
    id: 'faizal',
    name: 'Faizal',
    story: 'Working capital applicant — but his uploaded data triggers the fraud-confidence layer.',
    identity: { fullName: 'Mohd Faizal Bin Ismail', nric: '880203-14-5679' },
    occupation: { occupation: 'Small trader', sector: 'Retail', employmentType: 'self-employed', tenureMonths: 8 },
  },
] as const;

// ── Persister ─────────────────────────────────────────────────────────────────

/**
 * Seed a demo profile into the store. Replaces whatever is currently loaded —
 * same replace-on-load behaviour as the original single-profile version.
 *
 * Defaults to `'aina'` so all existing call sites (store.tsx `loadDemoData`,
 * `resetDemoConfirm`) continue to work unchanged with no argument.
 */
export async function loadDemoProfile(profile: DemoProfileId = 'aina'): Promise<void> {
  const seed =
    profile === 'ravi' ? buildRaviSeed(new Date())
    : profile === 'faizal' ? buildFaizalSeed(new Date())
    : buildAinaSeed(new Date());

  // Loading a persona is a fresh start for identity too — otherwise a KYC verified for an
  // earlier persona/session would carry over and bake the wrong holder name into the next
  // minted passport. The borrower re-verifies for this persona (the tour's own KYC beat).
  await clearKyc();
  await clearOccupation();

  await addTransactions(seed.transactions);

  for (const account of seed.accounts) {
    const [opening, ...rest] = account.entries;
    const created = await addAccount(account.name, account.kind, account.cls, opening.value, opening.asOf);
    for (const entry of rest) {
      await addBalanceEntry(created.id, entry.value, entry.asOf);
    }
  }

  await setExpectedIncome(seed.budget.expectedIncome);
  await setAllocations(seed.budget.allocations);

  // Backfill budget snapshots for all months in the demo seed that contain transactions
  // so the category spending breakdown shows up for every month in the Monthly Recap.
  const months = Array.from(
    new Set(
      seed.transactions
        .map((t) => t.date?.slice(0, 7))
        .filter((m): m is string => typeof m === 'string' && m.length === 7)
    )
  );
  for (const month of months) {
    await upsertSnapshot(month, seed.budget.expectedIncome, seed.budget.allocations);
  }
}

