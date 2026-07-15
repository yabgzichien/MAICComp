// Demo Data plan Task 6: the console pipeline seeder (queues, watchlist, stacking, and the
// Portfolio/Capital-Markets assertions from spec §F4). `seedApplications` (lib/demoSeed.ts)
// is pure, so this drives it directly against the real applications/portfolio/securitization
// engines rather than through the UI.
import { describe, expect, it } from 'vitest';
import { seedApplications } from './demoSeed';
import { DEFAULT_POLICY, DEFAULT_PRODUCTS } from './loans';
import { orderQueue, watchlistApplications } from './applications';
import { findRecentPresentments, presentmentKey } from './presentment';
import { parsePassportCode } from './passport';
import { buildPortfolio, bookToPool } from './portfolio';
import { structurePool } from './securitization';
import { DEMO_APPLICANTS } from '../app/demoApplicants';

const NOW = new Date('2026-07-14T12:00:00.000Z');

function seed() {
  return seedApplications([], DEFAULT_PRODUCTS, DEFAULT_POLICY, 'TEKUN', NOW);
}

describe('seedApplications', () => {
  it('is idempotent-safe: re-seeding from empty always produces the same shape', () => {
    const a = seed();
    const b = seed();
    expect(a.apps.map((x) => x.id)).toEqual(b.apps.map((x) => x.id));
  });

  it('files one application per non-checkin, non-duplicate demo applicant, plus the sample', () => {
    const { apps } = seed();
    const expectedFiled = DEMO_APPLICANTS.filter((d) => d.role !== 'checkin' && d.role !== 'stacking-duplicate').length;
    expect(apps.length).toBe(expectedFiled + 1 + 2); // + sample + the 2 NEW-queue re-presentments
  });

  it('seeds two unresolved New entries so the entry-point queue is never empty (2026-07-15 review item 4)', () => {
    const { apps } = seed();
    const newQueue = orderQueue(apps, 'new');
    expect(newQueue).toHaveLength(2);
    for (const a of newQueue) {
      expect(a.engineDecision).toMatch(/^(approve|refer|decline)$/); // a real decision, just not yet triaged
    }
  });

  it('produces the spec §C queue-status mix', () => {
    const { apps } = seed();
    expect(orderQueue(apps, 'approved').length).toBeGreaterThanOrEqual(6); // 6 approvals + a possible counter-offer approve
    expect(orderQueue(apps, 'referred').length).toBe(2); // confidence-gated + coverage-gated
    expect(orderQueue(apps, 'declined').length).toBe(3); // affordability + policy + the sample (below the Growth tier minimum)
  });

  it('at least 4 distinct declared purposes appear across the seeded pipeline', () => {
    const { apps } = seed();
    const categories = new Set(apps.map((a) => a.purpose?.category).filter(Boolean));
    expect(categories.size).toBeGreaterThanOrEqual(4);
  });

  it('the watchlist pair produces exactly one flagged loan', () => {
    const { apps } = seed();
    const watchlist = watchlistApplications(apps);
    expect(watchlist).toHaveLength(1);
    expect(watchlist[0].applicantLabel).toBe('Siti Aminah binti Kassim');
    expect(watchlist[0].checkIns?.[0].flags.length).toBeGreaterThan(0);
  });

  it('the stacking case yields two presentments within 24h for the same subject', () => {
    const { presentments } = seed();
    expect(presentments).toHaveLength(2);
    const dup = DEMO_APPLICANTS.find((d) => d.role === 'stacking-duplicate')!;
    const subject = parsePassportCode(dup.code).passport.subject;
    const recent = findRecentPresentments(presentments, subject, NOW);
    expect(recent).toHaveLength(2);
  });

  it('the stacking subject matches its base applicant (Nurul Izzati)', () => {
    const { apps, presentments } = seed();
    const base = apps.find((a) => a.applicantLabel === 'Nurul Izzati binti Rashid')!;
    const baseSubject = parsePassportCode(base.passportCode).passport.subject;
    expect(presentments.every((p) => p.id === baseSubject)).toBe(true);
  });

  it('Portfolio: the approved book spans >=3 bands and >=4 purposes with no concentration warning', () => {
    const { apps } = seed();
    const portfolio = buildPortfolio(apps);
    const bandsWithExposure = portfolio.bandBreakdown.filter((b) => b.count > 0);
    expect(bandsWithExposure.length).toBeGreaterThanOrEqual(3);
    expect(portfolio.purposeBreakdown.filter((p) => p.count > 0).length).toBeGreaterThanOrEqual(4);
    expect(portfolio.concentrations).toHaveLength(0);
  });

  it('Capital Markets: every live-book tranche is at least RM5,000', () => {
    const { apps } = seed();
    const pool = bookToPool(apps);
    const { tranches } = structurePool(pool);
    expect(tranches.length).toBeGreaterThan(0);
    for (const t of tranches) {
      expect(t.thicknessRM).toBeGreaterThanOrEqual(5000);
    }
  });
});
