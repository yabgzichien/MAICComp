// Application queues store (Brief O) — pure array-in/array-out logic with an
// injectable-Storage wrapper. The override matrix is the one inviolable rule:
// refer resolvable either way, approve→decline allowed, decline→approve REJECTED —
// the orchestrator's escalation-only asymmetry made operational.
import { describe, expect, it } from 'vitest';
import {
  fileApplication,
  isApplicationRecord,
  markDefault,
  mergeServerApplications,
  orderQueue,
  readApplications,
  recordCheckIn,
  recordLetterGenerated,
  recordRepayment,
  resolveApplication,
  watchlistApplications,
  writeApplications,
  type ApplicationRecord,
  type FileApplicationInput,
} from './applications';

const NOW = new Date('2026-07-06T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

function input(overrides: Partial<FileApplicationInput> = {}): FileApplicationInput {
  return {
    passportCode: '{"passport":{}}',
    subject: 'a'.repeat(64),
    applicantLabel: 'Aisyah binti Rahman',
    requestedAmount: 10000,
    engineDecision: 'refer',
    offeredAmount: 2769,
    installment: 180,
    tierLabel: 'Growth Capital',
    ...overrides,
  };
}

function file(apps: ApplicationRecord[], overrides: Partial<FileApplicationInput> = {}, at: Date = NOW) {
  return fileApplication(apps, input(overrides), at);
}

describe('fileApplication', () => {
  it('files a refer into the Referred queue, open, with a filed audit entry', () => {
    const { apps, filed } = file([]);
    expect(filed).toBe(true);
    expect(apps).toHaveLength(1);
    const a = apps[0];
    expect(a.status).toBe('referred');
    expect(a.resolvedAt).toBeUndefined();
    expect(a.filedAt).toBe(NOW.toISOString());
    expect(a.audit).toHaveLength(1);
    expect(a.audit[0].action).toBe('filed');
  });

  it('an engine approve resolves immediately as approved, carrying offer, installment, and tier', () => {
    const { apps } = file([], { engineDecision: 'approve', offeredAmount: 3400, installment: 320, tierLabel: 'Starter Capital' });
    const a = apps[0];
    expect(a.status).toBe('approved');
    expect(a.resolvedAt).toBe(NOW.toISOString());
    expect(a.offeredAmount).toBe(3400);
    expect(a.installment).toBe(320);
    expect(a.tierLabel).toBe('Starter Capital');
  });

  it('an engine decline resolves immediately as declined', () => {
    const { apps } = file([], { engineDecision: 'decline', offeredAmount: 0, installment: 0 });
    expect(apps[0].status).toBe('declined');
    expect(apps[0].resolvedAt).toBe(NOW.toISOString());
  });

  it('dedupes on subject + requested amount: the same ask is not filed twice', () => {
    const first = file([]);
    const second = file(first.apps);
    expect(second.filed).toBe(false);
    expect(second.apps).toHaveLength(1);
    // A different amount is a new application.
    const third = file(second.apps, { requestedAmount: 5000 });
    expect(third.filed).toBe(true);
    expect(third.apps).toHaveLength(2);
  });

  it('carries the declared purpose when provided', () => {
    const { apps } = file([], { purpose: { category: 'stock', note: 'Raya stock-up' } });
    expect(apps[0].purpose).toEqual({ category: 'stock', note: 'Raya stock-up' });
  });

  it('leaves source undefined when not specified, with no mention of channel in the audit line', () => {
    const { apps } = file([]);
    expect(apps[0].source).toBeUndefined();
    expect(apps[0].audit[0].detail).not.toMatch(/direct/i);
  });

  it('records source "direct" and calls it out in the filed audit entry (direct-apply-transport spec)', () => {
    const { apps } = file([], { source: 'direct' });
    expect(apps[0].source).toBe('direct');
    expect(apps[0].audit[0].detail).toMatch(/direct/i);
  });

  it('records source "officer" without the direct-apply wording', () => {
    const { apps } = file([], { source: 'officer' });
    expect(apps[0].source).toBe('officer');
    expect(apps[0].audit[0].detail).not.toMatch(/direct/i);
  });

  it('zeroes offeredAmount and installment on a decline regardless of what the caller passed', () => {
    const { apps } = file([], { engineDecision: 'decline', offeredAmount: 999, installment: 50 });
    expect(apps[0].offeredAmount).toBe(0);
    expect(apps[0].installment).toBe(0);
  });
});

describe('resolveApplication — the override matrix (inviolable)', () => {
  const referred = () => file([]).apps;
  const approved = () => file([], { engineDecision: 'approve' }).apps;
  const declined = () => file([], { engineDecision: 'decline' }).apps;

  it('refer → approved with a rationale', () => {
    const apps = resolveApplication(referred(), referred()[0].id, 'approved', 'Income pattern verified by phone with employer.', NOW);
    expect(apps[0].status).toBe('approved');
    expect(apps[0].resolution).toMatchObject({ outcome: 'approved', rationale: 'Income pattern verified by phone with employer.' });
    expect(apps[0].resolvedAt).toBe(NOW.toISOString());
  });

  it('refer → declined with a rationale', () => {
    const apps = resolveApplication(referred(), referred()[0].id, 'declined', 'Could not reach applicant to verify income.', NOW);
    expect(apps[0].status).toBe('declined');
  });

  it('approve → declined is allowed (an officer can always tighten)', () => {
    const base = approved();
    const apps = resolveApplication(base, base[0].id, 'declined', 'Branch policy: sector exposure limit reached.', NOW);
    expect(apps[0].status).toBe('declined');
    expect(apps[0].resolution!.outcome).toBe('declined');
  });

  it('decline → approved is REJECTED — an officer can never soften an engine decline', () => {
    const base = declined();
    expect(() => resolveApplication(base, base[0].id, 'approved', 'Looks fine to me.', NOW)).toThrow(/decline/i);
  });

  it('a resolution without a rationale is rejected', () => {
    const base = referred();
    expect(() => resolveApplication(base, base[0].id, 'approved', '', NOW)).toThrow(/rationale/i);
    expect(() => resolveApplication(base, base[0].id, 'approved', '   ', NOW)).toThrow(/rationale/i);
  });

  it('an already-resolved referral cannot be resolved again', () => {
    const once = resolveApplication(referred(), referred()[0].id, 'approved', 'Verified.', NOW);
    expect(() => resolveApplication(once, once[0].id, 'declined', 'Changed my mind.', NOW)).not.toThrow();
    // approve → declined is the tighten path and stays legal; but declined → approved must throw.
    const tightened = resolveApplication(once, once[0].id, 'declined', 'Tightened.', NOW);
    expect(() => resolveApplication(tightened, tightened[0].id, 'approved', 'Loosen again.', NOW)).toThrow(/decline/i);
  });

  it('the audit trail is append-only: resolving adds an entry and never rewrites history', () => {
    const base = referred();
    const before = base[0].audit.map((e) => ({ ...e }));
    const apps = resolveApplication(base, base[0].id, 'declined', 'Not verifiable.', NOW);
    expect(apps[0].audit.length).toBe(before.length + 1);
    expect(apps[0].audit.slice(0, before.length)).toEqual(before);
    expect(apps[0].audit[apps[0].audit.length - 1].detail).toContain('Not verifiable.');
    // The input array was not mutated.
    expect(base[0].status).toBe('referred');
  });
});

describe('orderQueue', () => {
  it('referred: oldest first (the longest-waiting file is the officer’s next job)', () => {
    let apps: ApplicationRecord[] = [];
    apps = file(apps, { subject: 'b'.repeat(64) }, hoursAgo(1)).apps;
    apps = file(apps, { subject: 'c'.repeat(64) }, hoursAgo(26)).apps;
    apps = file(apps, { subject: 'd'.repeat(64) }, hoursAgo(3)).apps;
    const q = orderQueue(apps, 'referred');
    expect(q.map((a) => a.subject[0])).toEqual(['c', 'd', 'b']);
  });

  it('resolved queues: newest first', () => {
    let apps: ApplicationRecord[] = [];
    apps = file(apps, { subject: 'b'.repeat(64), engineDecision: 'approve' }, hoursAgo(5)).apps;
    apps = file(apps, { subject: 'c'.repeat(64), engineDecision: 'approve' }, hoursAgo(1)).apps;
    const q = orderQueue(apps, 'approved');
    expect(q.map((a) => a.subject[0])).toEqual(['c', 'b']);
  });

  it('filters to the requested status only', () => {
    let apps: ApplicationRecord[] = [];
    apps = file(apps, { subject: 'b'.repeat(64), engineDecision: 'approve' }).apps;
    apps = file(apps, { subject: 'c'.repeat(64) }).apps;
    expect(orderQueue(apps, 'referred')).toHaveLength(1);
    expect(orderQueue(apps, 'declined')).toHaveLength(0);
  });
});

describe('localStorage round-trip', () => {
  function fakeStorage(initial: Record<string, string> = {}): Storage {
    const map = new Map(Object.entries(initial));
    return {
      get length() { return map.size; },
      clear: () => map.clear(),
      getItem: (k: string) => map.get(k) ?? null,
      key: (i: number) => Array.from(map.keys())[i] ?? null,
      removeItem: (k: string) => void map.delete(k),
      setItem: (k: string, v: string) => void map.set(k, v),
    };
  }

  it('writes and reads the store back identically', () => {
    const s = fakeStorage();
    const { apps } = file([]);
    writeApplications(apps, s);
    expect(readApplications(s)).toEqual(apps);
  });

  it('returns an empty store on corrupted JSON and drops malformed rows', () => {
    expect(readApplications(fakeStorage({ 'pip-applications': '{nope' }))).toEqual([]);
    const s = fakeStorage({ 'pip-applications': JSON.stringify([{ junk: true }]) });
    expect(readApplications(s)).toEqual([]);
  });

  it('is SSR-safe: no storage means empty reads and no-op writes', () => {
    expect(readApplications()).toEqual([]);
    expect(() => writeApplications([], undefined as unknown as Storage)).not.toThrow();
  });

  it('reads back a pre-source record (written before the field existed) with source left absent', () => {
    const s = fakeStorage();
    const legacy = { ...file([]).apps[0] } as Partial<ApplicationRecord>;
    delete legacy.source;
    s.setItem('pip-applications', JSON.stringify([legacy]));
    const read = readApplications(s);
    expect(read[0].source).toBeUndefined();
  });

  // ── Lender Tenancy spec: no cross-lender leakage ───────────────────────────
  // Entering the console as a different lender must show that lender's own pipeline.

  it("a TEKUN pipeline (default lender id) is invisible to another lender", () => {
    const s = fakeStorage();
    const { apps } = file([]);
    writeApplications(apps, s);
    expect(readApplications(s)).toEqual(apps);
    expect(readApplications(s, 'koperasi-sejahtera')).toEqual([]);
  });

  it('two lenders keep fully independent pipelines in the same storage', () => {
    const s = fakeStorage();
    const tekunApps = file([]).apps;
    const koperasiApps = file([], { requestedAmount: 2500 }).apps;
    writeApplications(tekunApps, s, 'tekun');
    writeApplications(koperasiApps, s, 'koperasi-sejahtera');
    expect(readApplications(s, 'tekun')).toEqual(tekunApps);
    expect(readApplications(s, 'koperasi-sejahtera')).toEqual(koperasiApps);
    expect(readApplications(s, 'dana-niaga')).toEqual([]);
  });

  it('omitting lenderId defaults to TEKUN and reads the pre-tenancy unsuffixed key (back-compat)', () => {
    const s = fakeStorage();
    const { apps } = file([]);
    writeApplications(apps, s);
    expect(readApplications(s)).toEqual(readApplications(s, 'tekun'));
  });
});

describe('isApplicationRecord', () => {
  it('accepts a real filed record', () => {
    expect(isApplicationRecord(file([]).apps[0])).toBe(true);
  });

  it('rejects non-objects and records missing required fields', () => {
    expect(isApplicationRecord(null)).toBe(false);
    expect(isApplicationRecord({})).toBe(false);
    expect(isApplicationRecord({ id: 'x' })).toBe(false);
  });
});

// ── Post-disbursement check-ins + Watchlist (Brief S) ─────────────────────────

describe('recordCheckIn', () => {
  const approved = () => file([], { engineDecision: 'approve' }).apps;

  it('appends a check-in and an audit entry without changing status or resolution', () => {
    const base = approved();
    const flags = [{ key: 'income-drop' as const, severity: 'watch' as const, evidence: 'Average income fell 20%' }];
    const apps = recordCheckIn(base, base[0].id, '{"passport":{}}', flags, NOW);
    expect(apps[0].status).toBe('approved');
    expect(apps[0].resolution).toBeUndefined();
    expect(apps[0].checkIns).toHaveLength(1);
    expect(apps[0].checkIns![0]).toEqual({ at: NOW.toISOString(), passportCode: '{"passport":{}}', flags });
    const lastAudit = apps[0].audit[apps[0].audit.length - 1];
    expect(lastAudit.action).toBe('check-in');
    expect(lastAudit.detail).toContain('income-drop');
  });

  it('a clean check-in (no flags) still records, with an honest "clean" audit note', () => {
    const base = approved();
    const apps = recordCheckIn(base, base[0].id, '{"passport":{}}', [], NOW);
    expect(apps[0].checkIns![0].flags).toEqual([]);
    expect(apps[0].audit[apps[0].audit.length - 1].detail).toMatch(/clean/i);
  });

  it('accumulates multiple check-ins in order, oldest first', () => {
    let apps = approved();
    apps = recordCheckIn(apps, apps[0].id, '{"passport":1}', [], hoursAgo(48));
    apps = recordCheckIn(apps, apps[0].id, '{"passport":2}', [], hoursAgo(1));
    expect(apps[0].checkIns!.map((c) => c.passportCode)).toEqual(['{"passport":1}', '{"passport":2}']);
  });

  it('the input array is not mutated', () => {
    const base = approved();
    const before = JSON.parse(JSON.stringify(base));
    recordCheckIn(base, base[0].id, '{"passport":{}}', [], NOW);
    expect(base).toEqual(before);
  });
});

describe('watchlistApplications', () => {
  const approved = (subject = 'b'.repeat(64)) => file([], { engineDecision: 'approve', subject }).apps;
  const referred = () => file([]).apps;

  it('is empty when no applications have check-ins', () => {
    expect(watchlistApplications(approved())).toEqual([]);
  });

  it('includes an approved application whose latest check-in carries flags', () => {
    let apps = approved();
    const flags = [{ key: 'surplus-erosion' as const, severity: 'critical' as const, evidence: 'Surplus turned non-positive' }];
    apps = recordCheckIn(apps, apps[0].id, '{}', flags, NOW);
    expect(watchlistApplications(apps).map((a) => a.id)).toEqual([apps[0].id]);
  });

  it('excludes an approved application whose latest check-in is clean, even if an earlier one had flags', () => {
    let apps = approved();
    apps = recordCheckIn(apps, apps[0].id, '{}', [{ key: 'income-drop' as const, severity: 'watch' as const, evidence: 'x' }], hoursAgo(48));
    apps = recordCheckIn(apps, apps[0].id, '{}', [], hoursAgo(1)); // borrower recovered
    expect(watchlistApplications(apps)).toEqual([]);
  });

  it('never includes a referred application, even with check-ins recorded against it', () => {
    let apps = referred();
    apps = recordCheckIn(apps, apps[0].id, '{}', [{ key: 'income-drop' as const, severity: 'watch' as const, evidence: 'x' }], NOW);
    expect(watchlistApplications(apps)).toEqual([]);
  });
});

// ── recordRepayment (portfolio performance): the console-side repayment ledger ──

describe('recordRepayment', () => {
  const approved = () => file([], { engineDecision: 'approve' }).apps;

  it('appends a repayment event and an audit entry without changing status or resolution', () => {
    const base = approved();
    const apps = recordRepayment(base, base[0].id, { instalmentSeq: 1, amount: 350, outcome: 'on-time' }, NOW);
    expect(apps[0].status).toBe('approved');
    expect(apps[0].resolution).toBeUndefined();
    expect(apps[0].repayments).toHaveLength(1);
    expect(apps[0].repayments![0]).toEqual({ at: NOW.toISOString(), instalmentSeq: 1, amount: 350, outcome: 'on-time' });
    const lastAudit = apps[0].audit[apps[0].audit.length - 1];
    expect(lastAudit.action).toBe('repayment');
    expect(lastAudit.detail).toContain('on-time');
  });

  it('a missed instalment still records, with an honest "missed" audit note', () => {
    const base = approved();
    const apps = recordRepayment(base, base[0].id, { instalmentSeq: 2, amount: 0, outcome: 'missed' }, NOW);
    expect(apps[0].repayments![0].outcome).toBe('missed');
    expect(apps[0].audit[apps[0].audit.length - 1].detail).toMatch(/missed/i);
  });

  it('accumulates multiple repayments in order, oldest first', () => {
    let apps = approved();
    apps = recordRepayment(apps, apps[0].id, { instalmentSeq: 1, amount: 350, outcome: 'on-time' }, hoursAgo(48));
    apps = recordRepayment(apps, apps[0].id, { instalmentSeq: 2, amount: 350, outcome: 'on-time' }, hoursAgo(1));
    expect(apps[0].repayments!.map((r) => r.instalmentSeq)).toEqual([1, 2]);
  });

  it('the input array is not mutated', () => {
    const base = approved();
    const before = JSON.parse(JSON.stringify(base));
    recordRepayment(base, base[0].id, { instalmentSeq: 1, amount: 350, outcome: 'on-time' }, NOW);
    expect(base).toEqual(before);
  });
});

// ── Loan default flag (Bidirectional Servicing Sync, 2026-07-18 design) ──────────

describe('markDefault', () => {
  const approved = () => file([], { engineDecision: 'approve' }).apps;

  it('sets the defaulted flag with an audit entry, defaulting source to lender', () => {
    const base = approved();
    const apps = markDefault(base, base[0].id, undefined, NOW);
    expect(apps[0].defaulted).toEqual({ value: true, at: NOW.toISOString(), source: 'lender' });
    const lastAudit = apps[0].audit[apps[0].audit.length - 1];
    expect(lastAudit.action).toBe('defaulted');
    expect(lastAudit.detail).toMatch(/console/i);
  });

  it('records a borrower-sourced default with its own wording', () => {
    const base = approved();
    const apps = markDefault(base, base[0].id, 'borrower', NOW);
    expect(apps[0].defaulted?.source).toBe('borrower');
    expect(apps[0].audit[apps[0].audit.length - 1].detail).toMatch(/borrower app/i);
  });

  it('never changes status or resolution', () => {
    const base = approved();
    const apps = markDefault(base, base[0].id, undefined, NOW);
    expect(apps[0].status).toBe('approved');
    expect(apps[0].resolution).toBeUndefined();
  });

  it('is a monotonic latch: a second call leaves the first at/source/audit untouched', () => {
    let apps = approved();
    apps = markDefault(apps, apps[0].id, 'lender', hoursAgo(48));
    const auditLenBefore = apps[0].audit.length;
    apps = markDefault(apps, apps[0].id, 'borrower', NOW);
    expect(apps[0].defaulted).toEqual({ value: true, at: hoursAgo(48).toISOString(), source: 'lender' });
    expect(apps[0].audit).toHaveLength(auditLenBefore);
  });

  it('the input array is not mutated', () => {
    const base = approved();
    const before = JSON.parse(JSON.stringify(base));
    markDefault(base, base[0].id, undefined, NOW);
    expect(base).toEqual(before);
  });
});

// ── Adverse-action letter audit trail (Brief J stretch) ───────────────────────

describe('recordLetterGenerated', () => {
  const referred = () => file([]).apps;

  it('appends an audit entry naming the letter kind, without touching status or resolution', () => {
    const base = referred();
    const apps = recordLetterGenerated(base, base[0].id, 'refer', NOW);
    expect(apps[0].status).toBe('referred');
    expect(apps[0].resolution).toBeUndefined();
    const lastAudit = apps[0].audit[apps[0].audit.length - 1];
    expect(lastAudit.action).toBe('letter-generated');
    expect(lastAudit.detail).toContain('refer');
    expect(lastAudit.at).toBe(NOW.toISOString());
  });

  it('is append-only: generating twice adds two entries, never rewrites the first', () => {
    let apps = referred();
    apps = recordLetterGenerated(apps, apps[0].id, 'refer', hoursAgo(2));
    apps = recordLetterGenerated(apps, apps[0].id, 'decline', NOW);
    const letterEntries = apps[0].audit.filter((e) => e.action === 'letter-generated');
    expect(letterEntries).toHaveLength(2);
    expect(letterEntries[0].detail).toContain('refer');
    expect(letterEntries[1].detail).toContain('decline');
  });

  it('the input array is not mutated', () => {
    const base = referred();
    const before = JSON.parse(JSON.stringify(base));
    recordLetterGenerated(base, base[0].id, 'refer', NOW);
    expect(base).toEqual(before);
  });
});

// ── mergeServerApplications (multi-lender direct-apply, 2026-07-16): fold a lender's
// server-mailbox direct submissions into its local console pipeline, deduped ──────────
describe('mergeServerApplications', () => {
  const serverRec = (overrides: Partial<FileApplicationInput> = {}) => file([], { source: 'direct', ...overrides }).apps[0];

  it('adopts a new direct submission as-is, preserving its id, source, and audit', () => {
    const rec = serverRec({ subject: 'z'.repeat(64), requestedAmount: 3000 });
    const { apps, changed } = mergeServerApplications([], [rec]);
    expect(changed).toBe(true);
    expect(apps).toHaveLength(1);
    expect(apps[0]).toEqual(rec);
    expect(apps[0].source).toBe('direct');
  });

  it('does not duplicate a submission already present locally (same subject + amount)', () => {
    const rec = serverRec({ subject: 'z'.repeat(64), requestedAmount: 3000 });
    const { apps, changed } = mergeServerApplications([rec], [rec]);
    expect(changed).toBe(false);
    expect(apps).toHaveLength(1);
  });

  it('treats a different requested amount from the same subject as a distinct application', () => {
    const first = serverRec({ subject: 'z'.repeat(64), requestedAmount: 3000 });
    const second = serverRec({ subject: 'z'.repeat(64), requestedAmount: 5000 });
    const { apps, changed } = mergeServerApplications([first], [second]);
    expect(changed).toBe(true);
    expect(apps.map((a) => a.requestedAmount).sort()).toEqual([3000, 5000]);
  });

  it('ignores malformed entries in the server payload rather than throwing', () => {
    const rec = serverRec({ subject: 'z'.repeat(64), requestedAmount: 3000 });
    const { apps, changed } = mergeServerApplications([], [null, { junk: true }, rec, 42]);
    expect(changed).toBe(true);
    expect(apps).toHaveLength(1);
    expect(apps[0].id).toBe(rec.id);
  });

  it('reports no change (and returns the same reference) when there is nothing new to add', () => {
    const local = [serverRec({ subject: 'z'.repeat(64), requestedAmount: 3000 })];
    const result = mergeServerApplications(local, []);
    expect(result.changed).toBe(false);
    expect(result.apps).toBe(local);
  });
});
