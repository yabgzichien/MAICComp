// Restored 2026-07-12 (CEO action plan P0.2) after a test-suite gutting incident.
// Trust panel derivation (Brief G) — the officer's "can I trust this file?" answered in
// five rows. Pure derivation over booleans + plain data; no crypto needed here (that's
// passport.test.ts's job) — this suite is about the pass/warn/fail matrix itself.
import { describe, expect, it } from 'vitest';
import { deriveTrustRows, type TrustPanelInput } from './trustPanel';
import type { CreditPassport } from './passport';
import type { Presentment } from './presentment';

function passport(over: Partial<CreditPassport> = {}): CreditPassport {
  return {
    subject: 'a'.repeat(64),
    score: 672,
    band: 'Good',
    factorSummary: [],
    provenanceSummary: '',
    evidenceHash: 'e'.repeat(64),
    repaymentRecord: { onTime: 0, total: 0 },
    issuedAt: '2026-06-01T00:00:00.000Z',
    validUntil: '2027-06-01T00:00:00.000Z',
    ...over,
  };
}

const NOW = new Date('2026-06-15T00:00:00.000Z');

const baseInput = (over: Partial<TrustPanelInput> = {}): TrustPanelInput => ({
  passport: passport(),
  holderVerified: true,
  issuerVerified: true,
  priorPresentments: [],
  now: NOW,
  ...over,
});

function rowsOf(over: Partial<TrustPanelInput> = {}) {
  return deriveTrustRows(baseInput(over));
}

function rowByKey(rows: ReturnType<typeof rowsOf>, key: string) {
  return rows.find((r) => r.key === key)!;
}

describe('deriveTrustRows — order and count', () => {
  it('always returns exactly five rows in the fixed display order', () => {
    const rows = rowsOf();
    expect(rows.map((r) => r.key)).toEqual(['holder', 'issuer', 'freshness', 'consent', 'stacking']);
  });
});

describe('holder signature row', () => {
  it('passes when the holder signature verified', () => {
    expect(rowByKey(rowsOf({ holderVerified: true }), 'holder').state).toBe('pass');
  });

  it('fails when the holder signature did not verify, with an "altered" detail', () => {
    const row = rowByKey(rowsOf({ holderVerified: false }), 'holder');
    expect(row.state).toBe('fail');
    expect(row.detail).toMatch(/altered/i);
  });
});

describe('issuer attestation row', () => {
  it('passes when the pinned issuer signature verified', () => {
    expect(rowByKey(rowsOf({ issuerVerified: true }), 'issuer').state).toBe('pass');
  });

  it('fails when there is no valid issuer signature, citing possible self-minting', () => {
    const row = rowByKey(rowsOf({ issuerVerified: false }), 'issuer');
    expect(row.state).toBe('fail');
    expect(row.detail).toMatch(/self-minted/i);
  });
});

describe('freshness row', () => {
  it('passes comfortably inside the validity window (more than 7 days left)', () => {
    const row = rowByKey(rowsOf({ passport: passport({ issuedAt: '2026-06-01T00:00:00.000Z', validUntil: '2026-07-01T00:00:00.000Z' }) }), 'freshness');
    expect(row.state).toBe('pass');
    expect(row.detail).toMatch(/days left/);
  });

  it('warns when 7 or fewer days remain before expiry', () => {
    const row = rowByKey(rowsOf({ passport: passport({ issuedAt: '2026-06-01T00:00:00.000Z', validUntil: '2026-06-20T00:00:00.000Z' }) }), 'freshness');
    expect(row.state).toBe('warn');
    expect(row.detail).toMatch(/expires in \d+ day/);
  });

  it('fails when past validUntil', () => {
    const row = rowByKey(rowsOf({ passport: passport({ issuedAt: '2026-01-01T00:00:00.000Z', validUntil: '2026-02-01T00:00:00.000Z' }) }), 'freshness');
    expect(row.state).toBe('fail');
    expect(row.detail).toMatch(/Expired/);
  });

  it('fails when issued in the future (not yet valid)', () => {
    const row = rowByKey(rowsOf({ passport: passport({ issuedAt: '2030-01-01T00:00:00.000Z', validUntil: '2031-01-01T00:00:00.000Z' }) }), 'freshness');
    expect(row.state).toBe('fail');
    expect(row.detail).toMatch(/Not yet valid/);
  });

  it('fails on malformed dates rather than throwing', () => {
    const row = rowByKey(rowsOf({ passport: passport({ issuedAt: 'not-a-date', validUntil: 'also-not-a-date' }) }), 'freshness');
    expect(row.state).toBe('fail');
    expect(row.detail).toMatch(/malformed/i);
  });
});

describe('consent row', () => {
  it('warns "not shared" when there is no consent block at all (pre-consent passport)', () => {
    const row = rowByKey(rowsOf({ passport: passport() }), 'consent');
    expect(row.state).toBe('warn');
    expect(row.detail).toMatch(/Not shared/);
  });

  it('passes and lists granted tiers, sorted, when consent is present and unexpired', () => {
    const p = passport({
      consent: [
        { tier: 1, scope: ['x'], grantedAt: '2026-06-01T00:00:00.000Z', expiresAt: '2027-06-01T00:00:00.000Z' },
        { tier: 0, scope: ['x'], grantedAt: '2026-06-01T00:00:00.000Z', expiresAt: '2027-06-01T00:00:00.000Z' },
      ],
    });
    const row = rowByKey(rowsOf({ passport: p }), 'consent');
    expect(row.state).toBe('pass');
    expect(row.detail).toMatch(/Tier 0 aggregates \+ Tier 1 identity/);
  });

  it('warns and names the lapsed tier(s) when lapsedTiers is supplied by the verifier', () => {
    const p = passport({ consent: [{ tier: 2, scope: ['x'], grantedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-02-01T00:00:00.000Z' }] });
    const row = rowByKey(rowsOf({ passport: p, lapsedTiers: [2] }), 'consent');
    expect(row.state).toBe('warn');
    expect(row.detail).toMatch(/Tier 2 spending consent lapsed/);
  });

  it('derives lapsed tiers itself from expiry when the verifier did not supply lapsedTiers', () => {
    const p = passport({ consent: [{ tier: 0, scope: ['x'], grantedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-02-01T00:00:00.000Z' }] });
    const row = rowByKey(rowsOf({ passport: p, lapsedTiers: undefined }), 'consent');
    expect(row.state).toBe('warn');
  });

  it('lists a lapsed tier only once even if duplicated in the receipts', () => {
    const p = passport({
      consent: [
        { tier: 0, scope: ['a'], grantedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-02-01T00:00:00.000Z' },
      ],
    });
    const row = rowByKey(rowsOf({ passport: p, lapsedTiers: [0, 0] }), 'consent');
    const occurrences = row.detail.match(/Tier 0 aggregates/g) ?? [];
    expect(occurrences).toHaveLength(1);
  });
});

describe('stacking row', () => {
  it('passes as "first presentment" when there is no prior history', () => {
    const row = rowByKey(rowsOf({ priorPresentments: [] }), 'stacking');
    expect(row.state).toBe('pass');
    expect(row.detail).toMatch(/First presentment/);
  });

  it('warns at 1-2 prior presentments', () => {
    const priors: Presentment[] = [{ id: 'x', at: '2026-06-14T12:00:00.000Z' }];
    const row = rowByKey(rowsOf({ priorPresentments: priors }), 'stacking');
    expect(row.state).toBe('warn');
    expect(row.detail).toMatch(/Presented 1 time\(s\)/);
  });

  it('fails at 3 or more prior presentments (the stacking threshold)', () => {
    const priors: Presentment[] = [
      { id: 'x', at: '2026-06-14T12:00:00.000Z' },
      { id: 'x', at: '2026-06-13T12:00:00.000Z' },
      { id: 'x', at: '2026-06-12T12:00:00.000Z' },
    ];
    const row = rowByKey(rowsOf({ priorPresentments: priors }), 'stacking');
    expect(row.state).toBe('fail');
  });

  it('cites the custom window hours and the most recent presentment\'s recency', () => {
    const priors: Presentment[] = [{ id: 'x', at: '2026-06-14T23:00:00.000Z' }];
    const row = rowByKey(rowsOf({ priorPresentments: priors, windowHours: 48 }), 'stacking');
    expect(row.detail).toContain('48h');
    expect(row.detail).toMatch(/last \d+ h ago/i);
  });

  it('defaults to a 24h window when not specified', () => {
    const row = rowByKey(rowsOf({ priorPresentments: [] }), 'stacking');
    expect(row.detail).toContain('24h');
  });
});
