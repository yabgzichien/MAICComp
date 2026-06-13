export interface CoachLine {
  label: string;
  allocated: number;
  recentAverage: number;
}

/** Build the compact user prompt for the budget coach. */
export function buildBudgetPrompt(income: number, leftover: number, lines: CoachLine[]): string {
  const rows = lines
    .map((l) => `- ${l.label}: budget RM${l.allocated}, recent avg RM${l.recentAverage}`)
    .join('\n');
  return [
    `Expected monthly income: RM${income}.`,
    `Unallocated after budgets: RM${leftover}.`,
    `Category budgets vs recent average spend:`,
    rows,
    `Give the user concise budget advice.`,
  ].join('\n');
}

export const COACH_SYSTEM_PROMPT =
  'You are Pip, a concise personal-budget coach. Reply in at most 3 short ' +
  'sentences, plain text, no preamble, no lists. Focus on the one or two most ' +
  'useful observations (over-allocation, thin savings margin, biggest category).';
