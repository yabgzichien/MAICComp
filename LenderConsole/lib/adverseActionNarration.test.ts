import { describe, expect, it } from 'vitest';
import { buildLetterMessages, parseLetterResponse, type LetterBrief } from './adverseActionNarration';

const brief: LetterBrief = {
  kind: 'decline',
  applicant: 'Aisyah',
  requestedAmount: 'RM5,000',
  offeredAmount: 'RM0',
  reasons: ['Your score of 100 is below our minimum threshold of 300.'],
  improvementText: 'Increasing your monthly surplus is the change most likely to help.',
};

describe('buildLetterMessages', () => {
  it('produces a system + user message and embeds the given reasons and improvement note', () => {
    const msgs = buildLetterMessages(brief);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('system');
    expect(msgs[1].content).toContain('below our minimum threshold');
    expect(msgs[1].content).toContain('Increasing your monthly surplus');
  });
});

describe('parseLetterResponse', () => {
  it('extracts opening and closing strings', () => {
    const out = parseLetterResponse(JSON.stringify({ opening: 'We are writing to inform you.', closing: 'We hope to see a stronger application soon.' }));
    expect(out).toEqual({ opening: 'We are writing to inform you.', closing: 'We hope to see a stronger application soon.' });
  });

  it('returns null on malformed JSON', () => {
    expect(parseLetterResponse('not json')).toBeNull();
  });

  it('returns null when a field is missing or blank', () => {
    expect(parseLetterResponse(JSON.stringify({ opening: 'only opening' }))).toBeNull();
    expect(parseLetterResponse(JSON.stringify({ opening: '  ', closing: 'x' }))).toBeNull();
  });
});
