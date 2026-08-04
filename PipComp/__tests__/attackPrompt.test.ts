import { ATTACK_SYSTEM_PROMPT, attackFallback, buildAttackPrompt } from '../src/llm/attackPrompt';
import type { AttackResult } from '../src/lib/attackGallery';

const caught: AttackResult = {
  id: 'injected-salary',
  name: 'Injected salary spike',
  technique: 'Keep 90% genuine rows, inject two fake P2P salary deposits.',
  txnCount: 68,
  confidence: 0.39,
  hardCapped: true,
  floorBreached: true,
  decision: 'decline',
  signals: [
    { key: 'integrity_income_outlier', detail: 'isolated high income from a weak/undocumented source' },
    { key: 'integrity_source_isolation', detail: 'income relies on much weaker pipelines than expenses' },
  ],
  verdict: 'caught',
  payload: {
    rule: 'hand-typed',
    count: 2,
    rows: [
      { label: 'DUITNOW TRANSFER', amount: 9000, source: 'manual', type: 'income', date: '2026-01-15', balanceBreak: false },
      { label: 'DUITNOW TRANSFER', amount: 9500, source: 'manual', type: 'income', date: '2026-02-15', balanceBreak: false },
    ],
    caption: '2 hand-typed rows among 68',
  },
};

describe('buildAttackPrompt', () => {
  it('grounds the prompt in the attack, the fired signals, and the verdict', () => {
    const prompt = buildAttackPrompt(caught);
    expect(prompt).toContain(caught.name);
    expect(prompt).toContain(caught.signals[0].detail);
    expect(prompt).toMatch(/decline/i);
  });
});

describe('attackFallback', () => {
  it('deterministically states the verdict and decision', () => {
    const text = attackFallback(caught);
    expect(text.length).toBeGreaterThan(0);
    expect(text).toMatch(/caught|blocked|decline/i);
  });
});

describe('ATTACK_SYSTEM_PROMPT', () => {
  it('sets a grounded security-analyst persona', () => {
    expect(ATTACK_SYSTEM_PROMPT).toMatch(/analyst|security|fraud/i);
    expect(ATTACK_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });
});
