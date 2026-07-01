// Deterministic "multi-agent" assessment panel. Verdicts, confidence, and cited
// signals are computed here — never by an LLM. An optional server call (see
// app/api/agents/route.ts) may replace `rationale` with LLM-generated prose that
// narrates the SAME verdict; if that call fails or is skipped, the fallback
// rationale computed here is what renders. The orchestrator (added in a later
// task) can only escalate an auto-approve toward manual review — it can never
// soften a decline or refer, and it never changes maxAmount/installment.

import type { CreditPassport, PassportAssessment } from './passport';
import { MAX_DSR, MIN_CONFIDENCE_TO_APPROVE, type LoanDecision } from './loans';

export type AgentId = 'fraud' | 'credit' | 'affordability' | 'risk' | 'decision';
export type VerdictTone = 'positive' | 'caution' | 'negative';

export interface AgentAssessment {
  id: AgentId;
  label: string;
  verdict: string;
  tone: VerdictTone;
  confidence: number; // 0-100
  signals: string[];
  rationale: string;
}

const HIGH_CONFIDENCE = 0.75;
const rm = (n: number): string => `RM${Math.round(n).toLocaleString('en-MY')}`;
const pct = (x: number): number => Math.round(x * 100);

const FALLBACK_RATIONALE: Record<AgentId, Record<VerdictTone, string>> = {
  fraud: {
    positive: 'Data confidence and provenance checks show no signs of fabrication ({cite}).',
    caution: 'Some provenance signals warrant a closer look before relying on this data ({cite}).',
    negative: "Data confidence is too low to trust this passport's aggregates without manual verification ({cite}).",
  },
  credit: {
    positive: 'Score and factor mix support a standard credit tier ({cite}).',
    caution: 'Score is workable but leans on a narrow set of strong factors ({cite}).',
    negative: "Score sits near the floor of the product ladder, limiting tier options ({cite}).",
  },
  affordability: {
    positive: 'Surplus comfortably covers the proposed installment with room to spare ({cite}).',
    caution: 'Surplus covers the installment but leaves thin headroom for shocks ({cite}).',
    negative: 'Existing debt service and low surplus leave little or no room for a new installment ({cite}).',
  },
  risk: {
    positive: 'Data coverage and repayment history are consistent and recent ({cite}).',
    caution: 'Coverage or repayment history is partial — treat the picture as incomplete ({cite}).',
    negative: "Thin data coverage makes this applicant's pattern hard to verify ({cite}).",
  },
  decision: {
    positive: 'All specialists clear their thresholds; the panel concurs with the policy engine ({cite}).',
    caution: "The panel concurs with the policy engine's verdict, flagging conditions for the file ({cite}).",
    negative: "A specialist raised a concern the auto-approval didn't weigh; recommend manual review ({cite}).",
  },
};

function fallbackRationale(id: AgentId, tone: VerdictTone, signals: string[]): string {
  return FALLBACK_RATIONALE[id][tone].replace('{cite}', signals.join('; '));
}

export function assessFraud(assessment: PassportAssessment, provenanceSummary: string): AgentAssessment {
  const confidencePct = pct(assessment.confidence);
  const tone: VerdictTone =
    assessment.confidence >= HIGH_CONFIDENCE ? 'positive' : assessment.confidence >= MIN_CONFIDENCE_TO_APPROVE ? 'caution' : 'negative';
  const verdict = tone === 'positive' ? 'Low risk' : tone === 'caution' ? 'Moderate risk' : 'High risk';
  const signals = [`Data confidence ${confidencePct}%`, provenanceSummary];
  return {
    id: 'fraud',
    label: 'Fraud & Integrity',
    verdict,
    tone,
    confidence: confidencePct,
    signals,
    rationale: fallbackRationale('fraud', tone, signals),
  };
}

export function assessCredit(passport: CreditPassport): AgentAssessment {
  const { score, band, factorSummary } = passport;
  const tone: VerdictTone = score >= 700 ? 'positive' : score >= 550 ? 'caution' : 'negative';
  const verdict = `${band} (${score})`;
  const weakest = factorSummary.reduce((min, f) => (f.subScore < min.subScore ? f : min), factorSummary[0]);
  const avg = factorSummary.length ? Math.round(factorSummary.reduce((s, f) => s + f.subScore, 0) / factorSummary.length) : 0;
  const signals = [`Score ${score}/900`, `Avg factor ${avg}/100`, weakest ? `Weakest: ${weakest.key} (${Math.round(weakest.subScore)}/100)` : ''].filter(
    Boolean,
  );
  const confidence = Math.max(0, Math.min(100, Math.round((score / 900) * 100)));
  return {
    id: 'credit',
    label: 'Credit',
    verdict,
    tone,
    confidence,
    signals,
    rationale: fallbackRationale('credit', tone, signals),
  };
}

export function assessAffordability(assessment: PassportAssessment, decision: LoanDecision): AgentAssessment {
  const { avgIncome, avgMonthlySurplus, monthlyDebtService } = assessment;
  const dsr = avgIncome > 0 ? monthlyDebtService / avgIncome : 1;
  const surplusRatio = avgIncome > 0 ? avgMonthlySurplus / avgIncome : 0;
  let tone: VerdictTone;
  let verdict: string;
  let confidence: number;
  if (decision.maxAmount <= 0 || avgIncome <= 0) {
    tone = 'negative';
    verdict = 'Weak';
    confidence = 0;
  } else {
    const dsrConfidence = 1 - dsr / MAX_DSR;
    const surplusConfidence = surplusRatio / 0.15;
    confidence = Math.max(0, Math.min(100, Math.round(Math.min(dsrConfidence, surplusConfidence) * 100)));
    if (dsr <= MAX_DSR * 0.5 && surplusRatio >= 0.15) {
      tone = 'positive';
      verdict = 'Strong';
    } else {
      tone = 'caution';
      verdict = 'Adequate';
    }
  }
  const signals = [`DSR ${pct(dsr)}%`, `Surplus ${rm(avgMonthlySurplus)}/mo`, `Approved ${rm(decision.maxAmount)}`];
  return {
    id: 'affordability',
    label: 'Affordability',
    verdict,
    tone,
    confidence,
    signals,
    rationale: fallbackRationale('affordability', tone, signals),
  };
}

export function assessRisk(assessment: PassportAssessment, repaymentRecord: { onTime: number; total: number }): AgentAssessment {
  const { coverageDays, coverageRatio } = assessment;
  let tone: VerdictTone = coverageDays < 30 ? 'negative' : coverageDays < 90 || coverageRatio < 0.5 ? 'caution' : 'positive';
  const { onTime, total } = repaymentRecord;
  const onTimeRatio = total > 0 ? onTime / total : null;
  if (onTimeRatio !== null && onTimeRatio < 0.8 && tone !== 'negative') {
    tone = tone === 'positive' ? 'caution' : 'negative';
  }
  const daysConfidence = coverageDays / 90;
  const ratioConfidence = coverageRatio / 0.5;
  const repaymentConfidence = onTimeRatio !== null ? onTimeRatio / 0.8 : 1;
  const confidence = Math.max(0, Math.min(100, Math.round(Math.min(daysConfidence, ratioConfidence, repaymentConfidence) * 100)));
  const verdict = tone === 'positive' ? 'Low volatility' : tone === 'caution' ? 'Moderate volatility' : 'High volatility';
  const signals = [
    `Coverage ${coverageDays}d, ${pct(coverageRatio)}%`,
    onTimeRatio !== null ? `Repayment ${onTime}/${total} on time` : 'No repayment history yet',
  ];
  return {
    id: 'risk',
    label: 'Risk & Stability',
    verdict,
    tone,
    confidence,
    signals,
    rationale: fallbackRationale('risk', tone, signals),
  };
}
