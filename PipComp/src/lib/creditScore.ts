// src/lib/creditScore.ts
// Pure, deterministic, explainable credit scoring over a CreditProfile.
// No UI/DB imports — unit-tested. The AI never computes these numbers.

export interface CreditProfile {
  months: number;               // months of transaction history (tenure)
  avgIncome: number;            // avg monthly income over the window
  incomeMonths: number;         // months that had any income
  avgSurplus: number;           // avg monthly net (income - expenses)
  positiveMonths: number;       // months with net > 0
  savingsRate: number;          // avgSurplus / avgIncome (0 if avgIncome <= 0)
  monthlyDebtService: number;   // expected loan/installment outflow per month
  adherenceWithinRatio: number; // budgeted categories on target / total (1 if none)
  netWorthSlope: number;        // net-worth change per month (RM/mo) over the window
  repaymentOnTime: number;      // count of on-time in-app loan repayments
  repaymentTotal: number;       // count of in-app loan repayments due
  confidence: number;           // 0..1 trust in the inputs (from dataConfidence)
}

export type CreditBand = 'Building' | 'Fair' | 'Good' | 'Strong' | 'Excellent';

export interface CreditFactor {
  key: string;
  label: string;
  subScore: number;     // 0..100
  weight: number;       // weights sum to 1
  contribution: number; // subScore * weight
  evidence: string;
  explanation: string;
}

export interface CreditScore {
  score: number;        // 300..900 display score
  band: CreditBand;
  confidence: number;   // 0..1 (echoed from profile)
  factors: CreditFactor[];
  confidenceCapped: boolean; // true when low data confidence held the score below its raw value
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/** Linear ramp to a target: 0 at value<=0, 100 at value>=target. */
function ramp(value: number, target: number): number {
  if (target <= 0) return value > 0 ? 100 : 0;
  return clamp((value / target) * 100, 0, 100);
}

function rm(n: number): string {
  return `RM${Math.round(n).toLocaleString('en-MY')}`;
}

export function bandFor(score: number): CreditBand {
  if (score >= 820) return 'Excellent';
  if (score >= 740) return 'Strong';
  if (score >= 620) return 'Good';
  if (score >= 500) return 'Fair';
  return 'Building';
}

interface FactorDef {
  key: string;
  label: string;
  weight: number;
  compute: (p: CreditProfile) => { subScore: number; evidence: string; explanation: string };
}

const FACTORS: FactorDef[] = [
  {
    key: 'cashflow',
    label: 'Cash-flow surplus & consistency',
    weight: 0.25,
    compute: (p) => {
      const consistency = p.months > 0 ? p.positiveMonths / p.months : 0;
      const surplusRatio = p.avgIncome > 0 ? p.avgSurplus / p.avgIncome : 0;
      const subScore = clamp(consistency * 60 + (ramp(surplusRatio, 0.2) / 100) * 40, 0, 100);
      return {
        subScore,
        evidence: `avg surplus ${rm(p.avgSurplus)}/mo, ${p.positiveMonths}/${p.months} months positive`,
        explanation:
          surplusRatio >= 0.2 && consistency >= 0.8
            ? 'Consistently spends well within income.'
            : 'Surplus is thin or uneven; widening the gap between income and spending helps most here.',
      };
    },
  },
  {
    key: 'income',
    label: 'Income regularity & level',
    weight: 0.2,
    compute: (p) => {
      const regularity = p.months > 0 ? p.incomeMonths / p.months : 0;
      const level = clamp(p.avgIncome / 2000, 0, 1);
      const subScore = clamp(regularity * 60 + level * 40, 0, 100);
      return {
        subScore,
        evidence: `${rm(p.avgIncome)}/mo across ${p.incomeMonths}/${p.months} months`,
        explanation: regularity >= 0.8 ? 'Receives income regularly.' : 'Steadier monthly inflows would raise this.',
      };
    },
  },
  {
    key: 'savings',
    label: 'Savings rate',
    weight: 0.15,
    compute: (p) => {
      const subScore = ramp(p.savingsRate, 0.2);
      return {
        subScore,
        evidence: `${Math.round(p.savingsRate * 100)}% of income retained`,
        explanation: p.savingsRate >= 0.2 ? 'Saves a healthy share of income.' : 'Saving 10–20% of income would lift this.',
      };
    },
  },
  {
    key: 'debt',
    label: 'Debt burden (DSR)',
    weight: 0.15,
    compute: (p) => {
      const dsr = p.avgIncome > 0 ? p.monthlyDebtService / p.avgIncome : 1;
      const subScore = clamp((1 - dsr / 0.4) * 100, 0, 100);
      return {
        subScore,
        evidence: `debt service ${Math.round(dsr * 100)}% of income`,
        explanation: dsr <= 0.2 ? 'Comfortable debt load.' : 'Existing repayments take a large share of income.',
      };
    },
  },
  {
    key: 'discipline',
    label: 'Budgeting discipline',
    weight: 0.1,
    compute: (p) => {
      const subScore = clamp(p.adherenceWithinRatio * 100, 0, 100);
      return {
        subScore,
        evidence: `${Math.round(p.adherenceWithinRatio * 100)}% of budgeted categories on target`,
        explanation: p.adherenceWithinRatio >= 0.8 ? 'Sticks to planned budgets.' : 'Frequently overspends planned categories.',
      };
    },
  },
  {
    key: 'networth',
    label: 'Net-worth trajectory',
    weight: 0.05,
    compute: (p) => {
      const subScore = clamp(50 + p.netWorthSlope / 25, 0, 100);
      return {
        subScore,
        evidence: `net worth ${p.netWorthSlope >= 0 ? '+' : ''}${rm(p.netWorthSlope)}/mo trend`,
        explanation: p.netWorthSlope >= 0 ? 'Net worth is trending up.' : 'Net worth is trending down.',
      };
    },
  },
  {
    key: 'track_record',
    label: 'Track record',
    weight: 0.1,
    compute: (p) => {
      const tenure = clamp(p.months / 6, 0, 1) * 100;
      const subScore =
        p.repaymentTotal > 0 ? tenure * 0.4 + (p.repaymentOnTime / p.repaymentTotal) * 100 * 0.6 : tenure;
      return {
        subScore,
        evidence:
          p.repaymentTotal > 0
            ? `${p.repaymentOnTime}/${p.repaymentTotal} on-time repayments, ${p.months} mo history`
            : `${p.months} months of history, no loans yet`,
        explanation:
          p.repaymentTotal > 0 && p.repaymentOnTime === p.repaymentTotal
            ? 'Perfect repayment record so far.'
            : 'A longer history and on-time repayments build this over time.',
      };
    },
  },
];

/** Highest score the data confidence will let us *display* — trust scored, not assumed.
 * Below 0.30 → top of Building; 0.45 → top of Fair; 0.60 → top of Strong; otherwise uncapped. */
function confidenceScoreCeiling(confidence: number): number {
  if (confidence < 0.3) return 499; // Building ceiling
  if (confidence < 0.4) return 619; // Fair ceiling
  if (confidence < 0.6) return 819; // Strong ceiling
  return 900; // uncapped — Excellent reachable
}

/** Compute the explainable credit score from a profile. Deterministic and pure. */
export function computeCreditScore(profile: CreditProfile): CreditScore {
  const factors: CreditFactor[] = FACTORS.map((f) => {
    const { subScore, evidence, explanation } = f.compute(profile);
    return { key: f.key, label: f.label, subScore, weight: f.weight, contribution: subScore * f.weight, evidence, explanation };
  });
  const raw = factors.reduce((s, f) => s + f.contribution, 0); // 0..100
  const conf = clamp(profile.confidence, 0, 1);
  const dampened = raw * (0.5 + 0.5 * conf);
  const rawScore = Math.round(300 + (dampened / 100) * 600);

  // Hard ceiling by confidence: unverifiable data cannot *display* an investment-grade band.
  const ceiling = confidenceScoreCeiling(conf);
  const score = Math.min(rawScore, ceiling);
  const confidenceCapped = score < rawScore;

  return { score, band: bandFor(score), confidence: conf, factors, confidenceCapped };
}
