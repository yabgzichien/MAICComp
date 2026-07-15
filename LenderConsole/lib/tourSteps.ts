// Judge guided tour  console (Judge Tour spec, 2026-07-12). Pure step registry, upgrading
// the Brief-M static tour card into the same step-card wizard pattern as the borrower app's
// `PipComp/src/lib/tourSteps.ts`. No UI here; Console.tsx drives the real tab state from it.

export type ConsoleTourTab = 'verify' | 'portfolio' | 'capital' | 'policy';

export interface ConsoleTourStep {
  id: string;
  tab: ConsoleTourTab;
  title: string;
  /** Kept to ~2 lines on screen (UI/UX C5: one idea, ~12 words, verdict first). */
  body: string;
}

export const CONSOLE_TOUR_STEPS: ConsoleTourStep[] = [
  {
    id: 'sample',
    tab: 'verify',
    title: 'A verified sample applicant',
    body: 'This passport is already verified. Meet the sample applicant. Switch lenders anytime from the header.',
  },
  {
    id: 'trust',
    tab: 'verify',
    title: 'Five trust checks',
    body: 'Signature, issuer, freshness, consent, and stacking. Before any score is shown.',
  },
  {
    id: 'decision',
    tab: 'verify',
    title: 'The decision engine',
    body: 'Assess an amount, see the waterfall, and any counter-offer. All deterministic.',
  },
  {
    id: 'memo',
    tab: 'verify',
    title: 'The credit memo',
    body: 'Open the credit memo: the audit-ready decision writeup.',
  },
  {
    id: 'flagged',
    tab: 'verify',
    title: 'Fraud mode',
    body: '"Load flagged" lets you watch fraud get caught in real time.',
  },
  {
    id: 'policy',
    tab: 'policy',
    title: 'The flywheel',
    body: 'These thresholds are what borrowers are coached toward on the other app.',
  },
  {
    id: 'capital',
    tab: 'capital',
    title: 'Capital Markets',
    body: 'A sample pool, tranches, and a glossary button for every figure.',
  },
];

/** Validates the registry's own invariants: unique, non-empty ids, and every `tab` present
 *  in the caller-supplied set of tabs the console actually renders. */
export function validateConsoleTourSteps(steps: ConsoleTourStep[], validTabs: readonly string[]): string[] {
  const problems: string[] = [];
  if (steps.length === 0) problems.push('tour has no steps');
  const seen = new Set<string>();
  for (const step of steps) {
    if (!step.id) problems.push('a step has an empty id');
    if (seen.has(step.id)) problems.push(`duplicate step id: ${step.id}`);
    seen.add(step.id);
    if (!validTabs.includes(step.tab)) problems.push(`step ${step.id} targets unknown tab: ${step.tab}`);
  }
  return problems;
}

export function clampConsoleTourStep(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}
