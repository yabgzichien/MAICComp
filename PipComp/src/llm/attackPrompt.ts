// src/llm/attackPrompt.ts
// Pure prompt builder + deterministic fallback for the Attack Gallery. The verdict, decision, and
// fired signals are all computed by src/lib/attackGallery.ts; the LLM only writes the plain-English
// incident report. Degrades to a scripted line when the LLM is unavailable. No network/DB imports.
import type { AttackResult } from '../lib/attackGallery';

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
function verdictWord(v: AttackResult['verdict']): string {
  return v === 'caught' ? 'CAUGHT' : v === 'flagged' ? 'FLAGGED' : 'MISSED';
}

export const ATTACK_SYSTEM_PROMPT =
  'You are a fraud-risk security analyst writing a terse incident report. In at most 3 short ' +
  'sentences, plain text, no preamble: state what the attack tried, how the deterministic integrity ' +
  'engine responded (which signals fired, the confidence and the loan outcome), and the verdict. ' +
  'Use ONLY the facts provided — never invent a signal or change the verdict.';

/** Build the compact incident-report prompt from a computed attack result. */
export function buildAttackPrompt(result: AttackResult): string {
  const signals = result.firedSignals.length
    ? result.firedSignals.map((s) => `- ${s}`).join('\n')
    : '- (no integrity signals fired)';
  return [
    `Attack: ${result.name}.`,
    `Technique: ${result.technique}`,
    `Engine response: data confidence ${pct(result.confidence)}` +
      `${result.floorBreached ? ' (integrity floor breached)' : result.hardCapped ? ' (hard-capped)' : ''}, ` +
      `loan outcome ${result.decision}. Verdict: ${verdictWord(result.verdict)}.`,
    `Signals that fired:`,
    signals,
    `Write the incident report using these exact facts.`,
  ].join('\n');
}

/** Deterministic incident line used when the LLM is unavailable — never invents facts. */
export function attackFallback(result: AttackResult): string {
  const outcome =
    result.verdict === 'caught'
      ? result.floorBreached
        ? `blocked — integrity floor breached, loan ${result.decision}`
        : `caught — confidence capped to ${pct(result.confidence)}, loan ${result.decision}`
      : result.verdict === 'flagged'
        ? `approved but flagged (confidence ${pct(result.confidence)})`
        : `slipped through (confidence ${pct(result.confidence)})`;
  return `${result.name}: ${outcome}. ${result.firedSignals.length} integrity signal(s) fired.`;
}
