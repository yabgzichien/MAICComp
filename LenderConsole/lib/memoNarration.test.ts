import { describe, expect, it } from 'vitest';
import { buildMemoMessages, parseMemoResponse, type MemoBrief } from './memoNarration';

const brief: MemoBrief = {
  applicant: 'Aisyah',
  decisionLabel: 'Approved',
  offered: 'RM5,000',
  installment: 'RM300',
  reasons: ['Qualifies for Growth Capital tier.', 'Auto-approved: thresholds clear.'],
  complianceMet: 4,
  complianceTotal: 4,
};

describe('buildMemoMessages', () => {
  it('produces a system + user message and embeds the given reasons', () => {
    const msgs = buildMemoMessages(brief);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('system');
    expect(msgs[1].content).toContain('Growth Capital');
  });
});

describe('parseMemoResponse', () => {
  it('extracts summary and rationale strings', () => {
    const out = parseMemoResponse(JSON.stringify({ summary: 'A clean approve.', rationale: 'Because thresholds clear.' }));
    expect(out).toEqual({ summary: 'A clean approve.', rationale: 'Because thresholds clear.' });
  });

  it('returns null on malformed JSON', () => {
    expect(parseMemoResponse('not json')).toBeNull();
  });

  it('returns null when a field is missing or blank', () => {
    expect(parseMemoResponse(JSON.stringify({ summary: 'only summary' }))).toBeNull();
    expect(parseMemoResponse(JSON.stringify({ summary: '  ', rationale: 'x' }))).toBeNull();
  });
});
