// src/llm/coachPrompt.ts
// Pure prompt builder + deterministic fallback for the Passport Builder Coach. The plan's numbers
// are all computed by src/lib/coachPlan.ts; the LLM only narrates them. When the LLM is
// unavailable, `coachPlanFallback` produces a scripted line from the same computed plan, so the
// feature degrades to real numbers without prose. No network/DB imports  unit-tested.
import type { CoachAction, CoachPlan } from '../lib/coachPlan';

function rm(n: number): string {
  return `RM${Math.round(n).toLocaleString('en-MY')}`;
}
function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export const COACH_SYSTEM_PROMPT =
  'You are Pip, a warm, encouraging personal-credit coach for a Malaysian micro-entrepreneur. ' +
  'Reply in at most 3 short sentences, plain text, no preamble, no lists. Explain the one or two ' +
  'highest-impact steps and exactly what each unlocks. Use ONLY the numbers provided  never invent ' +
  'or recompute a score, confidence, or loan amount.';

/** One line of the plan, phrased so the model can narrate it without changing any figure. */
function actionLine(a: CoachAction): string {
  const s = a.sim;
  return (
    `- ${a.label} (${a.magnitude}): ` +
    `score ${s.scoreFrom}→${s.scoreTo}, ` +
    `confidence ${pct(s.confidenceFrom)}→${pct(s.confidenceTo)}, ` +
    `loan ${s.decisionFrom} ${rm(s.maxAmountFrom)} → ${s.decisionTo} ${rm(s.maxAmountTo)}` +
    (a.survivesDipPct !== undefined
      ? ` (that offer survives a ${a.survivesDipPct}% income dip).`
      : '.')
  );
}

/** Build the compact user prompt for the coach from a computed plan. */
export function buildCoachPrompt(plan: CoachPlan): string {
  const b = plan.baseline;
  const header =
    `Borrower now: ${b.band} band, score ${b.score}, data confidence ${pct(b.confidence)}, ` +
    `current loan status ${b.decision} up to ${rm(b.maxAmount)}.`;

  if (plan.actions.length === 0) {
    return [
      header,
      'No further steps materially improve their standing right now.',
      'Warmly reassure them their profile is strong and encourage them to keep logging transactions.',
    ].join('\n');
  }

  const blocker =
    plan.diagnosis.constraint !== 'none'
      ? `The single biggest thing blocking a better offer right now: ${plan.diagnosis.label.toLowerCase()}.`
      : '';

  return [
    header,
    blocker,
    'Simulated next steps (numbers already computed  narrate them, do not change them):',
    ...plan.actions.map(actionLine),
    'Warmly explain the one or two highest-impact steps and what each unlocks, using these exact numbers.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Deterministic one-line summary used when the LLM is unavailable  never invents numbers. */
export function coachPlanFallback(plan: CoachPlan): string {
  const top = plan.actions[0];
  if (!top) {
    const b = plan.baseline;
    return b.decision === 'approve'
      ? `You already qualify for up to ${rm(b.maxAmount)}. Keep logging new transactions to hold your ${b.band} standing.`
      : `Keep logging new transactions to strengthen your ${b.band} profile.`;
  }
  const s = top.sim;
  const unlock = s.maxAmountTo > s.maxAmountFrom ? ` and unlock up to ${rm(s.maxAmountTo)}` : '';
  return `${top.label} to lift your score ${s.scoreFrom}→${s.scoreTo}${unlock}.`;
}
