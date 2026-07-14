// Restored 2026-07-12 (CEO action plan P0.2) after a test-suite gutting incident.
// Adverse-action letter builder (Brief J stretch). Deterministic — the LLM only narrates
// prose atop these same facts; every number/reason/verdict here must trace back to the
// engine's own output, rewritten to second person via a matched template or passed
// through verbatim (never invented, never blank).
import { describe, expect, it } from 'vitest';
import { buildAdverseActionLetter, letterToText, LETTER_CAVEAT } from './adverseAction';
import type { CreditPassport } from './passport';
import type { DecisionReason, LoanDecision } from './loans';

function passport(over: Partial<CreditPassport> = {}): CreditPassport {
  return {
    subject: 'a'.repeat(64),
    score: 672,
    band: 'Good',
    factorSummary: [],
    provenanceSummary: '',
    evidenceHash: 'abc123def456abc123def456abc123def456abc123def456abc123def456ab',
    repaymentRecord: { onTime: 0, total: 0 },
    issuedAt: '2026-06-01T00:00:00.000Z',
    validUntil: '2027-06-01T00:00:00.000Z',
    holder: { name: 'Aisyah binti Rahman', nricMasked: '••••', verified: true, provider: 'mock' },
    ...over,
  };
}

function decision(over: Partial<LoanDecision> = {}): LoanDecision {
  return {
    decision: 'refer',
    maxAmount: 2769,
    installment: 180,
    reasons: [],
    ...over,
  };
}

const reason = (category: DecisionReason['category'], text: string): DecisionReason => ({ category, text });

// ── null case: nothing adverse to explain ─────────────────────────────────────

describe('buildAdverseActionLetter — the clean-approve null case', () => {
  it('returns null for a clean approve at or above the requested amount', () => {
    const d = decision({ decision: 'approve', maxAmount: 5000, reasons: ['Auto-approved.'] });
    expect(buildAdverseActionLetter(passport(), d, 5000)).toBeNull();
    expect(buildAdverseActionLetter(passport(), d, 3000)).toBeNull(); // approved MORE than requested
  });
});

// ── kind selection ─────────────────────────────────────────────────────────────

describe('buildAdverseActionLetter — kind selection', () => {
  it('is "decline" for a declined decision', () => {
    const letter = buildAdverseActionLetter(passport(), decision({ decision: 'decline', maxAmount: 0, installment: 0 }), 10000)!;
    expect(letter.kind).toBe('decline');
  });

  it('is "refer" for a refer decision with no counter-offer opportunity (offer >= request)', () => {
    const letter = buildAdverseActionLetter(passport(), decision({ decision: 'refer', maxAmount: 5000 }), 5000)!;
    expect(letter.kind).toBe('refer');
  });

  it('is "counter-offer" when the offer is positive but strictly below the request, regardless of the raw decision label', () => {
    const letter = buildAdverseActionLetter(passport(), decision({ decision: 'approve', maxAmount: 2769, installment: 180 }), 10000)!;
    expect(letter.kind).toBe('counter-offer');
    expect(letter.counterOffer).toMatchObject({ originalRequest: 10000, counteredAmount: 2769, installment: 180 });
  });
});

// ── decisionStatement wording per kind ─────────────────────────────────────────

describe('buildAdverseActionLetter — decisionStatement', () => {
  it('states the decline plainly with the requested amount', () => {
    const letter = buildAdverseActionLetter(passport(), decision({ decision: 'decline', maxAmount: 0, installment: 0 }), 10000)!;
    expect(letter.decisionStatement).toBe('Your application for RM10,000 has been declined.');
  });

  it('states a refer as requiring further review', () => {
    const letter = buildAdverseActionLetter(passport(), decision({ decision: 'refer', maxAmount: 5000 }), 5000)!;
    expect(letter.decisionStatement).toMatch(/requires further review/);
  });

  it('states a counter-offer with both the original and countered amounts', () => {
    const letter = buildAdverseActionLetter(passport(), decision({ decision: 'approve', maxAmount: 3445, installment: 332 }), 4000)!;
    expect(letter.decisionStatement).toContain('RM4,000');
    expect(letter.decisionStatement).toContain('RM3,445');
  });
});

// ── REASON_REWRITES — each known template, matched exactly and substituted correctly ──

describe('buildAdverseActionLetter — reason rewrites to second person', () => {
  // NOTE: the engine's own reason strings currently carry a double-space where an
  // em-dash was stripped in a repo-wide sweep (2026-07-12) — the fixtures below match
  // that CURRENT literal wording (double space), not the original em-dash prose, since
  // the regexes in adverseAction.ts were swept identically and now expect exactly this.
  it.each<[string, string, string]>([
    [
      'hard adverse record',
      'Serious adverse record on file. Application declined.',
      'You have a serious adverse record on file, and this application has been declined as a result.',
    ],
    [
      'soft adverse record',
      'Minor adverse record on file. Routed to manual review instead of auto-approval.',
      'You have a minor adverse record on file, so this application has been routed to manual review instead of being approved automatically.',
    ],
    [
      'integrity floor breach',
      'Data-integrity check: the income pattern could not be validated automatically. Declined pending manual verification with the lender.',
      'The income pattern on your application could not be validated automatically, so it has been declined pending manual verification with us.',
    ],
    [
      'below the lowest tier',
      'Score 350 is below the minimum tier threshold (500). Application declined.',
      'Your score of 350 is below our minimum threshold of 500 for any of our loan products, so this application has been declined.',
    ],
    [
      'low confidence',
      'We could not verify enough of the recorded data (confidence 28%, below the 50% auto-approval floor). Routed to manual review. More verified history would strengthen this application.',
      'We could not verify enough of your recorded financial data (confidence 28%, below our 50% auto-approval threshold), so this application has been routed to manual review.',
    ],
    [
      'coverage force-refer (Emergency-only)',
      'Coverage 11% (10 days of last 90) → Emergency Micro tier only; routed to manual review (REFER) regardless of affordability.',
      'With only 10 days of tracked activity in the last 90 (11% coverage), you currently qualify only for our smallest Emergency tier, and this application has been routed to manual review regardless of affordability.',
    ],
    [
      'coverage capped to Starter',
      'Coverage 67% (60 days of last 90) → eligibility capped to Starter Capital and below.',
      'With 60 days of tracked activity in the last 90 (67% coverage), your eligibility is currently capped to our Starter Capital tier and below.',
    ],
    [
      'full window but thin ratio',
      '90+ days of history but coverage is only 30%  eligibility capped to Starter Capital and below until coverage reaches 50%.',
      'You have 90+ days of history, but your data coverage is only 30%, so your eligibility is capped to our Starter Capital tier and below until coverage reaches 50%.',
    ],
    [
      'affordability no-headroom',
      'Affordability check failed: monthly surplus (RM0) and existing debt service (RM2,540) leave no room for any installment at all.',
      'Your monthly surplus (RM0) and existing debt service (RM2,540) leave no room for any installment at all, so we are unable to offer an installment on this application.',
    ],
    [
      'affordability below tier minimum',
      "Affordability check failed: monthly surplus (RM520) and existing debt service (RM120) leave only enough room for an installment below this tier's minimum amount (RM4,000).",
      "Your monthly surplus (RM520) and existing debt service (RM120) leave only enough room for an installment below this tier's minimum amount (RM4,000), so we are unable to offer an installment on this application.",
    ],
    [
      'approved amount capped',
      'Approved amount capped at RM2,769 so the installment (RM180/mo) stays within 35% of avg surplus and a 40% DSR cap.',
      'The approved amount has been capped at RM2,769 so that the installment (RM180/mo) stays within 35% of your average surplus and a 40% debt-service ratio.',
    ],
    [
      'requested exceeds affordability',
      'Requested RM10,000 exceeds what affordability supports; offering RM2,769 instead.',
      'You requested RM10,000, which exceeds what your affordability profile supports, so we can offer RM2,769 instead.',
    ],
    [
      'qualifies for tier',
      'Qualifies for the "Growth Capital" tier (requires score ≥ 620, scored 672).',
      'You qualify for our "Growth Capital" tier (which requires a score of 620 or higher; you scored 672).',
    ],
  ])('rewrites: %s', (_label, engineText, expectedSecondPerson) => {
    const d = decision({ decision: 'refer', categorizedReasons: [reason('policy', engineText)] });
    const letter = buildAdverseActionLetter(passport(), d, 10000)!;
    expect(letter.principalReasons[0].text).toBe(expectedSecondPerson);
  });

  it('passes an unrecognised reason through verbatim rather than dropping or garbling it', () => {
    const weird = 'A brand new reason string this template table has never seen before.';
    const d = decision({ decision: 'refer', categorizedReasons: [reason('policy', weird)] });
    const letter = buildAdverseActionLetter(passport(), d, 10000)!;
    expect(letter.principalReasons[0].text).toBe(weird);
  });

  it('falls back to the flat reasons list (as policy-category) when categorizedReasons is absent', () => {
    const d = decision({ decision: 'refer', categorizedReasons: undefined, reasons: ['Some flat legacy reason.'] });
    const letter = buildAdverseActionLetter(passport(), d, 10000)!;
    expect(letter.principalReasons).toEqual([{ category: 'policy', text: 'Some flat legacy reason.' }]);
  });
});

// ── dataRelied ─────────────────────────────────────────────────────────────────

describe('buildAdverseActionLetter — dataRelied', () => {
  it('shortens the evidence hash to a first6…last6 fingerprint', () => {
    const letter = buildAdverseActionLetter(passport({ evidenceHash: 'abc123def456abc123def456abc123def456abc123def456abc123def456ab' }), decision(), 10000)!;
    expect(letter.dataRelied.evidenceShort).toBe('abc123…f456ab');
  });

  it('states no consent receipts on file when the passport predates consent', () => {
    const letter = buildAdverseActionLetter(passport(), decision(), 10000)!;
    expect(letter.dataRelied.consentSummary).toMatch(/No signed consent receipts/);
  });

  it('lists granted tiers, deduplicated and sorted, when consent receipts are present', () => {
    const p = passport({
      consent: [
        { tier: 1, scope: ['x'], grantedAt: '2026-06-01T00:00:00.000Z', expiresAt: '2027-06-01T00:00:00.000Z' },
        { tier: 0, scope: ['x'], grantedAt: '2026-06-01T00:00:00.000Z', expiresAt: '2027-06-01T00:00:00.000Z' },
        { tier: 0, scope: ['y'], grantedAt: '2026-06-01T00:00:00.000Z', expiresAt: '2027-06-01T00:00:00.000Z' },
      ],
    });
    const letter = buildAdverseActionLetter(p, decision(), 10000)!;
    expect(letter.dataRelied.consentSummary).toBe('Tier 0 aggregates + Tier 1 identity');
  });

  it('dates come from the passport, truncated to YYYY-MM-DD', () => {
    const letter = buildAdverseActionLetter(passport({ issuedAt: '2026-06-01T08:00:00.000Z', validUntil: '2027-06-01T08:00:00.000Z' }), decision(), 10000)!;
    expect(letter.dataRelied.issuedAt).toBe('2026-06-01');
    expect(letter.dataRelied.validUntil).toBe('2027-06-01');
    expect(letter.date).toBe('2026-06-01');
  });
});

// ── improvementFrom — priority ordering ───────────────────────────────────────

describe('buildAdverseActionLetter — improvement note priority', () => {
  it('a record/integrity reason always wins, even alongside other categories', () => {
    const d = decision({
      categorizedReasons: [reason('record', 'Serious adverse record on file.'), reason('affordability', 'Some affordability text.')],
    });
    const letter = buildAdverseActionLetter(passport(), d, 10000)!;
    expect(letter.improvement.constraint).toBe('record');
  });

  it('confidence beats coverage and affordability when both data-quality flavors are present', () => {
    const d = decision({
      categorizedReasons: [
        reason('data-quality', 'We could not verify enough of the recorded data (confidence 20%).'),
        reason('data-quality', 'Coverage 50% capped to Starter.'),
        reason('affordability', 'Some affordability text.'),
      ],
    });
    const letter = buildAdverseActionLetter(passport(), d, 10000)!;
    expect(letter.improvement.constraint).toBe('confidence');
  });

  it('coverage beats affordability when confidence is not the issue', () => {
    const d = decision({
      categorizedReasons: [reason('data-quality', 'Coverage 50% capped to Starter.'), reason('affordability', 'Some affordability text.')],
    });
    const letter = buildAdverseActionLetter(passport(), d, 10000)!;
    expect(letter.improvement.constraint).toBe('coverage');
  });

  it('affordability is cited when it is the only concern', () => {
    const d = decision({ categorizedReasons: [reason('affordability', 'Some affordability text.')] });
    const letter = buildAdverseActionLetter(passport(), d, 10000)!;
    expect(letter.improvement.constraint).toBe('affordability');
  });

  it('falls back to "none" when nothing stands out (e.g. a pure counter-offer with no adverse category cited)', () => {
    const d = decision({ categorizedReasons: [reason('policy', 'Qualifies for the "Growth Capital" tier.')] });
    const letter = buildAdverseActionLetter(passport(), d, 10000)!;
    expect(letter.improvement.constraint).toBe('none');
  });
});

// ── letterToText — deterministic rendering ────────────────────────────────────

describe('letterToText', () => {
  it('includes the applicant, date, decision statement, reasons, data relied, improvement, and caveat', () => {
    const letter = buildAdverseActionLetter(passport(), decision({ decision: 'decline', maxAmount: 0, installment: 0, categorizedReasons: [reason('affordability', 'Some reason.')] }), 10000)!;
    const text = letterToText(letter);
    expect(text).toContain('Aisyah binti Rahman');
    expect(text).toContain('2026-06-01');
    expect(text).toContain('Your application for RM10,000 has been declined.');
    expect(text).toContain('PRINCIPAL REASONS');
    expect(text).toContain('Some reason.');
    expect(text).toContain('DATA RELIED UPON');
    expect(text).toContain('HOW TO STRENGTHEN A FUTURE APPLICATION');
    expect(text).toContain(LETTER_CAVEAT);
  });

  it('omits the COUNTER-OFFER section entirely when there is none', () => {
    const letter = buildAdverseActionLetter(passport(), decision({ decision: 'decline', maxAmount: 0, installment: 0 }), 10000)!;
    expect(letterToText(letter)).not.toContain('COUNTER-OFFER');
  });

  it('includes the COUNTER-OFFER section with both amounts and the driving constraint when present', () => {
    const letter = buildAdverseActionLetter(passport(), decision({ decision: 'approve', maxAmount: 2769, installment: 180 }), 10000)!;
    const text = letterToText(letter);
    expect(text).toContain('COUNTER-OFFER');
    expect(text).toContain('RM10,000');
    expect(text).toContain('RM2,769');
  });

  it('uses "Applicant" as a fallback name when the passport carries no holder block', () => {
    const letter = buildAdverseActionLetter(passport({ holder: undefined }), decision({ decision: 'decline', maxAmount: 0, installment: 0 }), 10000)!;
    expect(letterToText(letter)).toContain('Applicant');
  });
});
