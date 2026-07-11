// Pure prompt-building + response-parsing for the adverse-action letter narrator. Kept out
// of the API route so it can be unit-tested. The LLM is only ever asked to smooth the prose
// of an ALREADY-assembled letter — never to invent a reason, change a figure, or soften a
// verdict. See app/api/adverseAction/route.ts for the wiring.

export interface LetterBrief {
  kind: 'decline' | 'refer' | 'counter-offer';
  applicant: string;
  requestedAmount: string;
  offeredAmount: string;
  reasons: string[];
  improvementText: string;
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export const LETTER_SYSTEM_PROMPT =
  'You are a loan-officer writing assistant drafting a borrower-facing adverse-action letter. ' +
  'A deterministic policy engine has ALREADY decided the outcome and the reasons behind it. ' +
  'Write two things: "opening" — a warm, honest 2-3 sentence paragraph explaining the decision ' +
  'and its reasons in plain language; and "closing" — a short, encouraging paragraph presenting ' +
  'the given improvement note. Use ONLY the supplied facts and reasons. Never invent a number, ' +
  'never soften or change the verdict, never add a reason that was not given. Return ONLY a ' +
  'JSON object: {"opening": "...", "closing": "..."}.';

export function buildLetterMessages(brief: LetterBrief): ChatMessage[] {
  const user = [
    `Letter type: ${brief.kind}`,
    `Applicant: ${brief.applicant}`,
    `Requested: ${brief.requestedAmount}`,
    `Offered: ${brief.offeredAmount}`,
    'Reasons (verbatim, in order):',
    ...brief.reasons.map((r, i) => `${i + 1}. ${r}`),
    `Improvement note: ${brief.improvementText}`,
    '',
    'Return JSON: {"opening": "<2-3 sentences>", "closing": "<one short paragraph>"}',
  ].join('\n');
  return [
    { role: 'system', content: LETTER_SYSTEM_PROMPT },
    { role: 'user', content: user },
  ];
}

export function parseLetterResponse(content: string): { opening: string; closing: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  const opening = typeof o.opening === 'string' ? o.opening.trim() : '';
  const closing = typeof o.closing === 'string' ? o.closing.trim() : '';
  if (!opening || !closing) return null;
  return { opening, closing };
}
