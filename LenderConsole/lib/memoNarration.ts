// Pure prompt-building + response-parsing for the credit-memo narrator. Kept out of
// the API route so it can be unit-tested. The LLM is only ever asked to narrate the
// executive summary and rationale of an ALREADY-decided memo  never to compute a
// number, verdict, or compliance flag. See app/api/memo/route.ts for the wiring.

export interface MemoBrief {
  applicant: string;
  decisionLabel: string;
  offered: string;
  installment: string;
  reasons: string[];
  complianceMet: number;
  complianceTotal: number;
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export const MEMO_SYSTEM_PROMPT =
  'You are a loan-officer writing assistant. You are given a credit decision that has ' +
  'ALREADY been made by deterministic policy rules, plus the exact reasons behind it. ' +
  'Write two things: "summary"  a 2-3 sentence executive summary of the decision; and ' +
  '"rationale"  a short paragraph restating the given reasons in plain loan-officer ' +
  'prose. Use ONLY the supplied facts and reasons. Never invent a number, never change ' +
  'or hedge the verdict, never contradict a compliance finding. Return ONLY a JSON ' +
  'object: {"summary": "...", "rationale": "..."}.';

export function buildMemoMessages(brief: MemoBrief): ChatMessage[] {
  const user = [
    `Applicant: ${brief.applicant}`,
    `Decision: ${brief.decisionLabel}`,
    `Offered: ${brief.offered} at ${brief.installment}/mo`,
    `Compliance: ${brief.complianceMet} of ${brief.complianceTotal} affordability duties met`,
    'Reasons (verbatim, in order):',
    ...brief.reasons.map((r, i) => `${i + 1}. ${r}`),
    '',
    'Return JSON: {"summary": "<2-3 sentences>", "rationale": "<one paragraph>"}',
  ].join('\n');
  return [
    { role: 'system', content: MEMO_SYSTEM_PROMPT },
    { role: 'user', content: user },
  ];
}

export function parseMemoResponse(content: string): { summary: string; rationale: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  const summary = typeof o.summary === 'string' ? o.summary.trim() : '';
  const rationale = typeof o.rationale === 'string' ? o.rationale.trim() : '';
  if (!summary || !rationale) return null;
  return { summary, rationale };
}
