import { describe, expect, it } from 'vitest';
import { buildDecisionFile, decisionFileName } from './decisionFile';
import { parsePassportCode, verifyPassport, ISSUER_PUBLIC_KEY_HEX } from './passport';
import { decideLoan, DEFAULT_PRODUCTS } from './loans';
import { buildCreditMemo } from './creditMemo';
import { runAgentPanel } from './agents';
import { SAMPLE_CODE } from '../app/tokens';

// A date safely inside the sample passport's validity window.
const IN_WINDOW = new Date('2026-12-01T00:00:00.000Z');
const GENERATED_AT = '2026-12-01T10:30:00.000Z';

function sampleFixture() {
  const parsed = parsePassportCode(SAMPLE_CODE);
  const verification = verifyPassport(parsed.passport, parsed.signature, parsed.issuerSignature, IN_WINDOW);
  const a = parsed.passport.assessment!;
  const decision = decideLoan({
    score: parsed.passport.score,
    confidence: a.confidence,
    avgMonthlySurplus: a.avgMonthlySurplus,
    monthlyDebtService: a.monthlyDebtService,
    avgIncome: a.avgIncome,
    requestedAmount: 10000,
    products: DEFAULT_PRODUCTS,
    coverageRatio: a.coverageRatio,
    coverageDaysCovered: a.coverageDays,
  });
  const memo = buildCreditMemo(parsed.passport, decision, runAgentPanel(parsed.passport, decision), 10000);
  return { parsed, verification, decision, memo };
}

describe('buildDecisionFile', () => {
  it('assembles all four sections with the injected timestamp', () => {
    const { parsed, verification, decision, memo } = sampleFixture();
    const file = buildDecisionFile({
      passport: parsed.passport,
      signature: parsed.signature,
      issuerSignature: parsed.issuerSignature,
      verification,
      decision,
      requestedAmount: 10000,
      memo,
      generatedAt: GENERATED_AT,
    });
    expect(file.fileType).toBe('pip-credit-decision-file');
    expect(file.fileVersion).toBe(1);
    expect(file.generatedAt).toBe(GENERATED_AT);
    expect(file.verification.valid).toBe(true);
    expect(file.verification.issuerPublicKeyHex).toBe(ISSUER_PUBLIC_KEY_HEX);
    expect(file.decision.requestedAmount).toBe(10000);
    expect(file.decision.decision).toBe(decision.decision);
    expect(file.decision.reasons).toEqual(decision.reasons);
    expect(file.memo.compliance.length).toBeGreaterThan(0);
  });

  it('is self-contained: the embedded credential re-verifies on its own', () => {
    const { parsed, verification, decision, memo } = sampleFixture();
    const file = buildDecisionFile({
      passport: parsed.passport,
      signature: parsed.signature,
      issuerSignature: parsed.issuerSignature,
      verification,
      decision,
      requestedAmount: 10000,
      memo,
      generatedAt: GENERATED_AT,
    });
    // Simulate an auditor re-opening the file later (still inside the window).
    const rerun = verifyPassport(
      file.credential.passport,
      file.credential.signature,
      file.credential.issuerSignature,
      IN_WINDOW,
    );
    expect(rerun.valid).toBe(true);
  });

  it('names the file from the subject prefix and generation date', () => {
    const { parsed } = sampleFixture();
    const name = decisionFileName(parsed.passport, GENERATED_AT);
    expect(name).toBe(`decision-file-${parsed.passport.subject.slice(0, 8)}-2026-12-01.json`);
  });
});
