import type { CreditScore } from '../lib/creditScore';

/** Build the compact user prompt for the credit coach. */
export function buildCreditPrompt(score: CreditScore): string {
  const rows = score.factors
    .map((f) => `- ${f.label}: score ${Math.round(f.subScore)}/100, ${f.evidence}`)
    .join('\n');
  return [
    `Credit band: ${score.band} (${score.score}/900).`,
    `Factor breakdown:`,
    rows,
    `Explain the score briefly and name the top one or two ways to improve it.`,
  ].join('\n');
}

export const CREDIT_COACH_SYSTEM_PROMPT =
  'You are Pip, a concise personal-credit coach. Reply in at most 3 short ' +
  'sentences, plain text, no preamble, no lists. Focus on the one or two biggest ' +
  'levers the user can pull to raise their credit score.';
